import { Filter } from "nostr-tools";
import {
  addChatMessageToCache,
  addProductToCache,
  addProfilesToCache,
  fetchAllProductsFromCache,
  fetchChatMessagesFromCache,
  fetchProfileDataFromCache,
  removeProductFromCache,
} from "./cache-service";
import {
  NostrEvent,
  NostrMessageEvent,
  ShopProfile,
} from "@/utils/types/types";
import { CashuMint, CashuWallet, Proof } from "@cashu/cashu-ts";
import { ChatsMap } from "@/utils/context/context";
import {
  getLocalStorageData,
  deleteEvent,
  verifyNip05Identifier,
} from "@/utils/nostr/nostr-helper-functions";
import {
  ProductData,
  parseTags,
} from "@/utils/parsers/product-parser-functions";
import { calculateWeightedScore } from "@/utils/parsers/review-parser-functions";
import { hashToCurve } from "@cashu/crypto/modules/common";
import { NostrManager } from "@/utils/nostr/nostr-manager";
import { NostrSigner } from "@/utils/nostr/signers/nostr-signer";

function getUniqueProofs(proofs: Proof[]): Proof[] {
  const uniqueProofs = new Set<string>();
  return proofs.filter((proof) => {
    const serializedProof = JSON.stringify(proof);
    if (!uniqueProofs.has(serializedProof)) {
      uniqueProofs.add(serializedProof);
      return true;
    }
    return false;
  });
}

function isHexString(value: string): boolean {
  return /^[0-9a-fA-F]{64}$/.test(value);
}

export const fetchAllPosts = async (
  nostr: NostrManager,
  relays: string[],
  editProductContext: (productEvents: NostrEvent[], isLoading: boolean) => void
): Promise<{
  productEvents: NostrEvent[];
  profileSetFromProducts: Set<string>;
}> => {
  return new Promise(async function (resolve, reject) {
    try {
      let deletedProductsInCacheSet: Set<any> = new Set(); // used to remove deleted items from cache
      try {
        const productArrayFromCache = await fetchAllProductsFromCache();
        deletedProductsInCacheSet = new Set(
          productArrayFromCache.map((product: NostrEvent) => product.id)
        );
        editProductContext(productArrayFromCache, false);
      } catch (error) {
        console.error("Failed to fetch all listings from cache: ", error);
      }

      const filter: Filter = {
        kinds: [30402],
      };

      const productArrayFromRelay: NostrEvent[] = [];
      const profileSetFromProducts: Set<string> = new Set();

      const fetchedEvents = await nostr.fetch([filter], {}, relays);
      if (!fetchedEvents.length) {
        console.error("No products found with filter: ", filter);
      }

      for (const event of fetchedEvents) {
        if (!event || !event.id) continue;

        productArrayFromRelay.push(event);
        try {
          if (
            deletedProductsInCacheSet &&
            event.id in deletedProductsInCacheSet
          ) {
            deletedProductsInCacheSet.delete(event.id);
          }
          await addProductToCache(event);
          profileSetFromProducts.add(event.pubkey);
        } catch (error) {
          console.error("Failed to process product:", event.id, error);
        }
      }

      editProductContext(productArrayFromRelay, false);
      removeProductFromCache(Array.from(deletedProductsInCacheSet));

      resolve({
        productEvents: productArrayFromRelay,
        profileSetFromProducts,
      });
    } catch (error) {
      reject(error);
    }
  });
};

export const fetchCart = async (
  nostr: NostrManager,
  signer: NostrSigner | undefined,
  relays: string[],
  editCartContext: (cartAddresses: string[][], isLoading: boolean) => void,
  products: NostrEvent[]
): Promise<{
  cartList: ProductData[];
}> => {
  return new Promise(async function (resolve, reject) {
    try {
      if (!signer) {
        resolve({
          cartList: [],
        });
        return;
      }
      const userPubkey = await signer.getPubKey();

      const filter: Filter = {
        kinds: [30405],
        authors: [userPubkey],
      };

      const cartArrayFromRelay: ProductData[] = [];
      let cartAddressesArray: string[][] = [];

      const fetchedEvents: Array<NostrEvent> = await nostr.fetch(
        [filter],
        {},
        relays
      );

      for (const event of fetchedEvents) {
        try {
          const eventContent = await signer.decrypt(userPubkey, event.content);
          if (eventContent) {
            const addressArray = JSON.parse(eventContent);
            cartAddressesArray = addressArray;
            for (const addressElement of addressArray) {
              const address = addressElement[1];
              const [kind, _, dTag] = address;
              if (kind === "30402") {
                const foundEvent = products.find((event) =>
                  event.tags.some((tag) => tag[0] === "d" && tag[1] === dTag)
                );
                if (foundEvent) {
                  cartArrayFromRelay.push(parseTags(foundEvent) as ProductData);
                }
              }
            }
          }
        } catch (error) {
          console.error("Failed to parse cart: ", error);
        }
      }

      const uniqueProducts = new Map<
        string,
        ProductData & { selectedQuantity: number }
      >();
      for (const product of cartArrayFromRelay) {
        if (uniqueProducts.has(product.id)) {
          // If product exists, increment quantity
          const existing = uniqueProducts.get(product.id)!;
          existing.selectedQuantity += 1;
        } else {
          // If new product, add it with quantity 1
          uniqueProducts.set(product.id, {
            ...product,
            selectedQuantity: 1,
          });
        }
      }
      const updatedCartList = Array.from(uniqueProducts.values());
      editCartContext(cartAddressesArray, false);
      resolve({
        cartList: updatedCartList,
      });
    } catch (error) {
      reject(error);
    }
  });
};

export const fetchShopProfile = async (
  nostr: NostrManager,
  relays: string[],
  pubkeyShopProfileToFetch: string[],
  editShopContext: (
    shopEvents: Map<string, ShopProfile>,
    isLoading: boolean
  ) => void
): Promise<{
  shopProfileMap: Map<string, ShopProfile>;
}> => {
  return new Promise(async function (resolve, reject) {
    try {
      const shopEvents: NostrEvent[] = [];

      const shopProfile: Map<string, ShopProfile | any> = new Map(
        pubkeyShopProfileToFetch.map((pubkey) => [pubkey, null])
      );

      if (pubkeyShopProfileToFetch.length === 0) {
        editShopContext(new Map(), false);
        resolve({ shopProfileMap: new Map() });
        return;
      }

      const shopFilter: Filter = {
        kinds: [30019],
        authors: pubkeyShopProfileToFetch,
      };

      shopEvents.push(...(await nostr.fetch([shopFilter], {}, relays)));

      if (shopEvents.length > 0) {
        shopEvents.sort((a, b) => b.created_at - a.created_at);

        const latestEventsMap: Map<string, NostrEvent> = new Map();
        shopEvents.forEach((event) => {
          if (!latestEventsMap.has(event.pubkey)) {
            latestEventsMap.set(event.pubkey, event);
          }
        });

        latestEventsMap.forEach((event, pubkey) => {
          try {
            const shopProfileSetting = {
              pubkey: event.pubkey,
              content: JSON.parse(event.content),
              created_at: event.created_at,
            };
            shopProfile.set(pubkey, shopProfileSetting);
          } catch (error) {
            console.error(
              `Failed to parse shop profile for pubkey: ${pubkey}`,
              error
            );
          }
        });

        editShopContext(shopProfile, false);
        resolve({ shopProfileMap: shopProfile });
      } else {
        reject();
      }
    } catch (error) {
      reject(error);
    }
  });
};

export const fetchProfile = async (
  nostr: NostrManager,
  relays: string[],
  pubkeyProfilesToFetch: string[],
  editProfileContext: (productEvents: Map<any, any>, isLoading: boolean) => void
): Promise<{
  profileMap: Map<string, any>;
}> => {
  return new Promise(async function (resolve, reject) {
    try {
      if (!pubkeyProfilesToFetch.length) {
        editProfileContext(new Map(), false);
        resolve({ profileMap: new Map() });
        return;
      }

      try {
        const profileData = await fetchProfileDataFromCache();
        editProfileContext(profileData, false);
      } catch (error) {
        console.error("Failed to fetch profiles from cache: ", error);
      }
      const subParams: { kinds: number[]; authors?: string[] } = {
        kinds: [0],
        authors: Array.from(pubkeyProfilesToFetch),
      };
      const profileMap: Map<string, any> = new Map(
        Array.from(pubkeyProfilesToFetch).map((pubkey) => [pubkey, null])
      );

      const fetchedEvents = await nostr.fetch([subParams], {}, relays);

      for (const event of fetchedEvents) {
        if (
          profileMap.get(event.pubkey) === null ||
          profileMap.get(event.pubkey).created_at > event.created_at
        ) {
          // update only if the profile is not already set or the new event is newer
          try {
            const content = JSON.parse(event.content);
            const profile = {
              pubkey: event.pubkey,
              created_at: event.created_at,
              content: content,
              nip05Verified: false,
            };
            if (content.nip05) {
              profile.nip05Verified = await verifyNip05Identifier(
                content.nip05,
                event.pubkey
              );
            }

            profileMap.set(event.pubkey, profile);
          } catch (error) {
            console.error(
              `Failed parse profile for pubkey: ${event.pubkey}, ${event.content}`,
              error
            );
          }
        }
      }
      await addProfilesToCache(profileMap);
      resolve({ profileMap });
    } catch (error) {
      reject(error);
    }
  });
};

export const fetchGiftWrappedChatsAndMessages = async (
  nostr: NostrManager,
  signer: NostrSigner | undefined,
  relays: string[],
  editChatContext: (chatsMap: ChatsMap, isLoading: boolean) => void,
  userPubkey?: string
): Promise<{
  profileSetFromChats: Set<string>;
}> => {
  return new Promise(async function (resolve, reject) {
    // if no userPubkey, user is not signed in
    if (!userPubkey) {
      editChatContext(new Map(), false);
      resolve({ profileSetFromChats: new Set() });
      return;
    } else {
      const chatMessagesFromCache: Map<string, NostrMessageEvent> =
        await fetchChatMessagesFromCache();
      try {
        const chatsMap = new Map();

        const addToChatsMap = (
          pubkeyOfChat: string,
          event: NostrMessageEvent
        ) => {
          // pubkeyOfChat is the person you are chatting with if incoming, or the person you are sending to if outgoing
          if (!chatsMap.has(pubkeyOfChat)) {
            chatsMap.set(pubkeyOfChat, [event]);
          } else {
            chatsMap.get(pubkeyOfChat).push(event);
          }
        };

        const fetchedEvents = await nostr.fetch(
          [
            {
              kinds: [1059],
              "#p": [userPubkey],
            },
          ],
          {},
          relays
        );

        for (const event of fetchedEvents) {
          let messageEvent;

          const sealEventString = await signer!.decrypt(
            event.pubkey,
            event.content
          );
          if (sealEventString) {
            const sealEvent = JSON.parse(sealEventString);
            if (sealEvent?.kind === 13) {
              const messageEventString = await signer!.decrypt(
                sealEvent.pubkey,
                sealEvent.content
              );
              if (messageEventString) {
                const messageEventCheck = JSON.parse(messageEventString);
                if (messageEventCheck?.pubkey === sealEvent.pubkey) {
                  messageEvent = messageEventCheck;
                }
              } else {
                continue;
              }
            }
          } else {
            continue;
          }
          const senderPubkey = messageEvent.pubkey;

          const tagsMap: Map<string, string> = new Map(
            messageEvent.tags.map(([k, v]: [string, string]) => [k, v])
          );
          const subject = tagsMap.has("subject")
            ? tagsMap.get("subject")
            : null;
          if (
            subject !== "listing-inquiry" &&
            subject !== "order-payment" &&
            subject !== "order-info" &&
            subject !== "payment-change" &&
            subject !== "order-receipt" &&
            subject !== "shipping-info"
          ) {
            continue;
          }
          const recipientPubkey = tagsMap.get("p") ? tagsMap.get("p") : null; // pubkey you sent the message to
          if (typeof recipientPubkey !== "string") {
            console.error(
              `fetchAllOutgoingChats: Failed to get recipientPubkey from tagsMap",
                ${tagsMap},
                ${event}`
            );
            alert(
              `fetchAllOutgoingChats: Failed to get recipientPubkey from tagsMap`
            );
            return;
          }
          let chatMessage = chatMessagesFromCache.get(messageEvent.id);
          if (!chatMessage) {
            chatMessage = { ...messageEvent, sig: "", read: false }; // false because the user received it and it wasn't in the cache
            if (chatMessage) {
              await addChatMessageToCache(chatMessage);
            }
          }
          if (senderPubkey === userPubkey && chatMessage) {
            addToChatsMap(recipientPubkey, chatMessage);
          } else if (chatMessage) {
            addToChatsMap(senderPubkey, chatMessage);
          }
        }

        chatsMap.forEach((value) => {
          value.sort(
            (a: NostrMessageEvent, b: NostrMessageEvent) =>
              a.created_at - b.created_at
          );
        });
        editChatContext(chatsMap, false);
        resolve({ profileSetFromChats: new Set(chatsMap.keys()) });
      } catch (error) {
        reject(error);
      }
    }
  });
};

export const fetchReviews = async (
  nostr: NostrManager,
  relays: string[],
  products: NostrEvent[],
  editReviewsContext: (
    merchantReviewsMap: Map<string, number[]>,
    productReviewsMap: Map<string, Map<string, Map<string, string[][]>>>,
    isLoading: boolean
  ) => void
): Promise<{
  merchantScoresMap: Map<string, number[]>;
  productReviewsMap: Map<string, Map<string, Map<string, string[][]>>>;
}> => {
  return new Promise(async function (resolve, reject) {
    try {
      const addresses = products
        .map((product) => {
          const dTag = product.tags.find(
            (tag: string[]) => tag[0] === "d"
          )?.[1];
          if (!dTag) return null;
          return `a:${product.kind}:${product.pubkey}:${dTag}`;
        })
        .filter((address): address is string => address !== null);

      const reviewsFilter: Filter = {
        kinds: [31555],
        "#d": addresses,
      };

      const merchantScoresMap = new Map<string, number[]>();
      const productReviewsMap = new Map<
        string,
        Map<string, Map<string, string[][]>>
      >();

      const fetchedEvents = await nostr.fetch([reviewsFilter], {}, relays);

      for (const event of fetchedEvents) {
        const addressTag = event.tags.find((tag) => tag[0] === "d")?.[1];
        if (!addressTag) continue;

        const [_, _kind, merchantPubkey, productDTag] = addressTag.split(":");
        if (!merchantPubkey || !productDTag) continue;

        const ratingTags = event.tags.filter((tag) => tag[0] === "rating");
        const commentArray = ["comment", event.content];
        ratingTags.unshift(commentArray);

        // Add score to merchant's scores (all reviews)
        if (!merchantScoresMap.has(merchantPubkey)) {
          merchantScoresMap.set(merchantPubkey, []);
        }
        merchantScoresMap
          .get(merchantPubkey)!
          .push(calculateWeightedScore(event.tags));

        // Initialize merchant map if doesn't exist
        if (!productReviewsMap.has(merchantPubkey)) {
          productReviewsMap.set(merchantPubkey, new Map());
        }

        // Initialize product map if doesn't exist
        const merchantProducts = productReviewsMap.get(merchantPubkey)!;
        if (!merchantProducts.has(productDTag)) {
          merchantProducts.set(productDTag, new Map());
        }

        // Add or update review
        const productReviews = merchantProducts.get(productDTag)!;

        const createdAt = event.created_at;

        // Only update if this is a newer review from this pubkey
        const existingReview = productReviews.get(event.pubkey);
        if (
          !existingReview ||
          createdAt >
            Number(existingReview.find((item) => item[0] === "created_at")?.[1])
        ) {
          // Replace the existing created_at or set a new entry
          const updatedReview = existingReview
            ? existingReview.map((item) => {
                if (item[0] === "created_at") {
                  return ["created_at", createdAt.toString()]; // Replace the created_at entry
                }
                return item; // Keep existing items
              })
            : [...ratingTags, ["created_at", createdAt.toString()]]; // Initialize if it's a new review

          productReviews.set(event.pubkey, updatedReview);
        }
      }

      productReviewsMap.forEach((merchantProducts, _) => {
        merchantProducts.forEach((productReviews, _) => {
          productReviews.forEach((review, reviewerPubkey) => {
            // Filter out the created_at entries
            const cleanedReview = review.filter(
              (item) => item[0] !== "created_at"
            );
            if (cleanedReview.length > 0) {
              productReviews.set(reviewerPubkey, cleanedReview);
            }
          });
        });
      });

      editReviewsContext(merchantScoresMap, productReviewsMap, false);
      resolve({ merchantScoresMap, productReviewsMap });
    } catch (error) {
      reject(error);
    }
  });
};

export const fetchAllFollows = async (
  nostr: NostrManager,
  relays: string[],
  editFollowsContext: (
    followList: string[],
    firstDegreeFollowsLength: number,
    isLoading: boolean
  ) => void,
  userPubkey?: string
): Promise<{
  followList: string[];
}> => {
  const wot = getLocalStorageData().wot;
  const defaultAuthor =
    "d36e8083fa7b36daee646cb8b3f99feaa3d89e5a396508741f003e21ac0b6bec";

  const fetchFollows = async (userPubkey: string) => {
    let secondDegreeFollowsArrayFromRelay: string[] = [];
    let firstDegreeFollowsLength = 0;
    let followsArrayFromRelay: string[] = [];
    const followsSet: Set<string> = new Set();

    // fetch first-degree follows
    let fetchedEvents = await nostr.fetch(
      [
        {
          kinds: [3],
          authors: [userPubkey],
        },
      ],
      {},
      relays
    );
    const authors: string[] = [];
    for (const event of fetchedEvents) {
      const validTags = event.tags
        .map((tag) => tag[1])
        .filter((pubkey) => isHexString(pubkey!) && !followsSet.has(pubkey!));
      validTags.forEach((pubkey) => followsSet.add(pubkey!));
      followsArrayFromRelay.push(...(validTags as string[]));
      firstDegreeFollowsLength = followsArrayFromRelay.length;
      authors.push(...followsArrayFromRelay);
    }

    // Fetch second-degree follows
    fetchedEvents = await nostr.fetch(
      [
        {
          kinds: [3],
          authors,
        },
      ],
      {},
      relays
    );

    for (const followEvent of fetchedEvents) {
      const validFollowTags = followEvent.tags
        .map((tag) => tag[1])
        .filter((pubkey) => isHexString(pubkey!) && !followsSet.has(pubkey!));
      secondDegreeFollowsArrayFromRelay.push(...(validFollowTags as string[]));
    }

    const pubkeyCount: Map<string, number> = new Map();
    secondDegreeFollowsArrayFromRelay.forEach((pubkey) => {
      pubkeyCount.set(pubkey, (pubkeyCount.get(pubkey) || 0) + 1);
    });
    secondDegreeFollowsArrayFromRelay =
      secondDegreeFollowsArrayFromRelay.filter(
        (pubkey) => (pubkeyCount.get(pubkey) || 0) >= wot
      );
    // Concatenate arrays ensuring uniqueness
    followsArrayFromRelay = Array.from(
      new Set(followsArrayFromRelay.concat(secondDegreeFollowsArrayFromRelay))
    );
    return {
      followsArrayFromRelay,
      firstDegreeFollowsLength,
    };
  };

  let { followsArrayFromRelay, firstDegreeFollowsLength } = await fetchFollows(
    userPubkey || defaultAuthor
  );

  if (!followsArrayFromRelay?.length) {
    // If followsArrayFromRelay is still empty, add the default value
    ({ followsArrayFromRelay, firstDegreeFollowsLength } =
      await fetchFollows(defaultAuthor));
  }
  editFollowsContext(followsArrayFromRelay, firstDegreeFollowsLength, false);
  return {
    followList: followsArrayFromRelay,
  };
};

export const fetchAllRelays = async (
  nostr: NostrManager,
  signer: NostrSigner | undefined,
  relays: string[],
  editRelaysContext: (
    relayList: string[],
    readRelayList: string[],
    writeRelayList: string[],
    isLoading: boolean
  ) => void
): Promise<{
  relayList: string[];
  readRelayList: string[];
  writeRelayList: string[];
}> => {
  return new Promise(async function (resolve, reject) {
    try {
      const relayList: string[] = [];
      const relaySet: Set<string> = new Set();
      const readRelayList: string[] = [];
      const readRelaySet: Set<string> = new Set();
      const writeRelayList: string[] = [];
      const writeRelaySet: Set<string> = new Set();

      const userPubkey = await signer?.getPubKey?.();
      if (!userPubkey) {
        resolve({
          relayList: [],
          readRelayList: [],
          writeRelayList: [],
        });
        return;
      }

      const relayfilter: Filter = {
        kinds: [10002],
        authors: [userPubkey],
      };

      const fetchedEvents = await nostr.fetch([relayfilter], {}, relays);
      for (const event of fetchedEvents) {
        const validRelays = event.tags.filter(
          (tag) => tag[0] === "r" && !tag[2]
        );

        const validReadRelays = event.tags.filter(
          (tag) => tag[0] === "r" && tag[2] === "read"
        );

        const validWriteRelays = event.tags.filter(
          (tag) => tag[0] === "r" && tag[2] === "write"
        );

        validRelays.forEach((tag) => relaySet.add(tag[1]!));
        relayList.push(
          ...validRelays
            .map((tag) => tag[1]!)
            .filter((tag) => tag !== undefined)
        );

        validReadRelays.forEach((tag) => readRelaySet.add(tag[1]!));
        readRelayList.push(
          ...validReadRelays
            .map((tag) => tag[1]!)
            .filter((tag) => tag !== undefined)
        );

        validWriteRelays.forEach((tag) => writeRelaySet.add(tag[1]!));
        writeRelayList.push(
          ...validWriteRelays
            .map((tag) => tag[1]!)
            .filter((tag) => tag !== undefined)
        );
      }
      editRelaysContext(relayList, readRelayList, writeRelayList, false);
      resolve({
        relayList: relayList,
        readRelayList: readRelayList,
        writeRelayList: writeRelayList,
      });
    } catch (error) {
      reject(error);
    }
  });
};

export const fetchAllBlossomServers = async (
  nostr: NostrManager,
  signer: NostrSigner | undefined,
  relays: string[],
  editBlossomContext: (blossomServers: string[], isLoading: boolean) => void
): Promise<{
  blossomServers: string[];
}> => {
  return new Promise(async function (resolve, reject) {
    try {
      const blossomServers: string[] = [];
      const blossomSet: Set<string> = new Set();

      const userPubkey = await signer?.getPubKey?.();
      if (!userPubkey) {
        resolve({
          blossomServers: [],
        });
        return;
      }

      const blossomServerfilter: Filter = {
        kinds: [10063],
        authors: [userPubkey],
      };

      const fetchedEvents = await nostr.fetch(
        [blossomServerfilter],
        {},
        relays
      );
      for (const event of fetchedEvents) {
        const validBlossomServers = event.tags.filter(
          (tag) => tag[0] === "server"
        );

        validBlossomServers.forEach((tag) => blossomSet.add(tag[1]!));
        blossomServers.push(
          ...validBlossomServers
            .map((tag) => tag[1]!)
            .filter((tag) => tag !== undefined)
        );
      }
      editBlossomContext(blossomServers, false);
      resolve({
        blossomServers: blossomServers,
      });
    } catch (error) {
      reject(error);
    }
  });
};

export const fetchCashuWallet = async (
  nostr: NostrManager,
  signer: NostrSigner | undefined,
  relays: string[],
  editCashuWalletContext: (
    proofEvents: any[],
    cashuMints: string[],
    cashuProofs: Proof[],
    isLoading: boolean
  ) => void
): Promise<{
  proofEvents: any[];
  cashuMints: string[];
  cashuProofs: Proof[];
}> => {
  return new Promise(async function (resolve, reject) {
    const { tokens } = getLocalStorageData();
    const userPubkey = await signer?.getPubKey?.();
    if (!userPubkey) {
      editCashuWalletContext([], [], [], false);
      resolve({
        proofEvents: [],
        cashuMints: [],
        cashuProofs: [],
      });
      return;
    }

    try {
      const enc = new TextEncoder();
      let mostRecentWalletEvent: NostrEvent | null = null;
      const proofEvents: any[] = [];
      const cashuRelays: string[] = [];
      const cashuMints: string[] = [];
      const cashuMintSet: Set<string> = new Set();
      let cashuProofs: Proof[] = [...tokens]; // Start with existing tokens
      const incomingSpendingHistory: [][] = [];

      // Fetch wallet configuration events (17375) and wallet state events (37375)
      const walletConfigFilter: Filter = {
        kinds: [17375, 37375],
        authors: [userPubkey],
      };

      const hEvents: NostrEvent[] = await nostr.fetch(
        [walletConfigFilter],
        {},
        relays
      );

      // Process wallet configuration events
      for (const event of hEvents) {
        try {
          if (event.kind === 17375) {
            // Extract mints from configuration events
            const mints = event.tags.filter(
              (tag: string[]) => tag[0] === "mint"
            );
            mints.forEach((tag) => {
              if (tag[1] && !cashuMintSet.has(tag[1])) {
                cashuMintSet.add(tag[1]);
                cashuMints.push(tag[1]);
              }
            });
          } else if (event.kind === 37375) {
            // Find the most recent wallet state event
            if (
              !mostRecentWalletEvent ||
              event.created_at > mostRecentWalletEvent.created_at
            ) {
              mostRecentWalletEvent = event;
            }
          }
        } catch (error) {
          console.error(
            `Failed to process wallet config event ${event.id}:`,
            error
          );
        }
      }

      // Extract relay and mint information from most recent wallet event
      if (mostRecentWalletEvent) {
        try {
          const relayTags = mostRecentWalletEvent.tags.filter(
            (tag: string[]) => tag[0] === "relay"
          );
          relayTags.forEach((tag) => {
            if (tag[1] && !cashuRelays.includes(tag[1])) {
              cashuRelays.push(tag[1]);
            }
          });

          const mintTags = mostRecentWalletEvent.tags.filter(
            (tag: string[]) => tag[0] === "mint"
          );
          mintTags.forEach((tag) => {
            if (tag[1] && !cashuMintSet.has(tag[1])) {
              cashuMintSet.add(tag[1]);
              cashuMints.push(tag[1]);
            }
          });
        } catch (error) {
          console.error("Failed to process most recent wallet event:", error);
        }
      }

      // Use cashu-specific relays if available, otherwise use default relays
      const effectiveRelays = cashuRelays.length > 0 ? cashuRelays : relays;

      // Fetch proof events (7375) and spending history events (7376)
      const proofFilter: Filter = {
        kinds: [7375, 7376],
        authors: [userPubkey],
      };

      const proofEvents_raw: NostrEvent[] = await nostr.fetch(
        [proofFilter],
        {},
        effectiveRelays
      );

      // Process proof and spending history events
      for (const event of proofEvents_raw) {
        try {
          const eventContent = await signer!.decrypt(userPubkey, event.content);
          if (!eventContent) {
            console.warn(`Failed to decrypt event content for ${event.id}`);
            continue;
          }

          const cashuWalletEventContent = JSON.parse(eventContent);

          if (event.kind === 7375) {
            // Process proof events
            if (
              cashuWalletEventContent?.mint &&
              cashuWalletEventContent?.proofs
            ) {
              proofEvents.push({
                id: event.id,
                mint: cashuWalletEventContent.mint,
                proofs: cashuWalletEventContent.proofs,
                created_at: event.created_at,
              });

              // Add mint to our set if not already present
              if (!cashuMintSet.has(cashuWalletEventContent.mint)) {
                cashuMintSet.add(cashuWalletEventContent.mint);
                cashuMints.push(cashuWalletEventContent.mint);
              }

              // Add proofs to our collection (will be filtered later)
              cashuProofs = getUniqueProofs([
                ...cashuProofs,
                ...cashuWalletEventContent.proofs,
              ]);
            }
          } else if (event.kind === 7376 && cashuWalletEventContent) {
            // Process spending history events
            incomingSpendingHistory.push(cashuWalletEventContent);
          }
        } catch (error) {
          console.error(`Failed to process wallet event ${event.id}:`, error);
        }
      }

      // Remove spent proofs and handle spending history
      const eventsToDelete: string[] = [];

      for (const mint of cashuMints) {
        try {
          const wallet = new CashuWallet(new CashuMint(mint));

          // Filter proofs for this specific mint
          const mintProofs = cashuProofs.filter((proof) => {
            // Check if this proof belongs to this mint by checking keyset compatibility
            return proofEvents.some(
              (pe) =>
                pe.mint === mint &&
                pe.proofs.some((p: Proof) => p.id === proof.id)
            );
          });

          if (mintProofs.length > 0) {
            // Check proof states for this mint
            const Ys = mintProofs.map((p: Proof) =>
              hashToCurve(enc.encode(p.secret)).toHex(true)
            );

            const proofsStates = await wallet.checkProofsStates(mintProofs);
            const spentYs = new Set(
              proofsStates
                .filter((state) => state.state === "SPENT")
                .map((state) => state.Y)
            );

            // Remove spent proofs
            cashuProofs = cashuProofs.filter((proof, _index) => {
              if (mintProofs.includes(proof)) {
                const proofIndex = mintProofs.indexOf(proof);
                return proofIndex === -1 || !spentYs.has(Ys[proofIndex]!);
              }
              return true;
            });

            // Mark fully spent proof events for deletion
            for (const proofEvent of proofEvents) {
              if (proofEvent.mint === mint) {
                const eventYs = proofEvent.proofs.map((p: Proof) =>
                  hashToCurve(enc.encode(p.secret)).toHex(true)
                );
                const allSpent = eventYs.every((y: string) => spentYs.has(y));
                if (allSpent && eventYs.length > 0) {
                  eventsToDelete.push(proofEvent.id);
                }
              }
            }
          }
        } catch (error) {
          console.error(`Failed to check proofs for mint ${mint}:`, error);
        }
      }

      // Process spending history to determine which proofs to add/remove
      try {
        const outProofIds = incomingSpendingHistory
          .filter((eventTags) =>
            eventTags.some((tag) => tag[0] === "direction" && tag[1] === "out")
          )
          .map((eventTags) => {
            const destroyedTag = eventTags.find(
              (tag) => tag[0] === "e" && tag[3] === "destroyed"
            );
            return destroyedTag ? destroyedTag[1] : "";
          })
          .filter((eventId) => eventId !== "");

        const inProofIds = incomingSpendingHistory
          .filter((eventTags) =>
            eventTags.some(
              (tag) =>
                tag[0] === "direction" && (tag[1] === "in" || tag[1] === "out")
            )
          )
          .map((eventTags) => {
            const createdTag = eventTags.find(
              (tag) => tag[0] === "e" && tag[3] === "created"
            );
            return createdTag ? createdTag[1] : "";
          })
          .filter((eventId) => eventId !== "");

        // Remove proofs from events that were spent (out direction)
        const destroyedProofs = proofEvents
          .filter((event) => outProofIds.includes(event.id))
          .flatMap((event) => event.proofs);

        cashuProofs = cashuProofs.filter(
          (proof) =>
            !destroyedProofs.some(
              (destroyed: Proof) =>
                JSON.stringify(proof) === JSON.stringify(destroyed)
            )
        );

        // Add back proofs that were created but not spent
        const proofIdsToAddBack = inProofIds.filter(
          (id) => !outProofIds.includes(id)
        );

        const proofsToAddBack = proofEvents
          .filter((event) => proofIdsToAddBack.includes(event.id))
          .flatMap((event) => event.proofs);

        cashuProofs = getUniqueProofs([...cashuProofs, ...proofsToAddBack]);

        // Add spent event IDs to deletion list
        eventsToDelete.push(...outProofIds);
      } catch (error) {
        console.error("Failed to process spending history:", error);
      }

      // Delete spent events
      if (eventsToDelete.length > 0) {
        try {
          await deleteEvent(
            nostr,
            signer!,
            Array.from(new Set(eventsToDelete))
          );
        } catch (error) {
          console.error("Failed to delete spent events:", error);
        }
      }

      // Final deduplication
      cashuProofs = getUniqueProofs(cashuProofs);

      editCashuWalletContext(proofEvents, cashuMints, cashuProofs, false);

      resolve({
        proofEvents: proofEvents,
        cashuMints: cashuMints,
        cashuProofs: cashuProofs,
      });
    } catch (error) {
      console.error("Fatal error in fetchCashuWallet:", error);
      editCashuWalletContext([], [], [], false);
      reject(error);
    }
  });
};
