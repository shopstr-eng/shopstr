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
  ShopSettings,
} from "@/utils/types/types";
import { CashuMint, CashuWallet, Proof } from "@cashu/cashu-ts";
import { ChatsMap } from "@/utils/context/context";
import {
  getLocalStorageData,
  deleteEvent,
} from "@/components/utility/nostr-helper-functions";
import {
  ProductData,
  parseTags,
} from "@/components/utility/product-parser-functions";
import { calculateWeightedScore } from "@/components/utility/review-parser-functions";
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
  editProductContext: (productEvents: NostrEvent[], isLoading: boolean) => void,
): Promise<{
  productEvents: NostrEvent[];
  profileSetFromProducts: Set<string>;
}> => {
  // TODO refactor this to not use new Promise
  return new Promise(async function (resolve, reject) {
    try {
      let deletedProductsInCacheSet: Set<any> = new Set(); // used to remove deleted items from cache
      try {
        let productArrayFromCache = await fetchAllProductsFromCache();
        deletedProductsInCacheSet = new Set(
          productArrayFromCache.map((product: NostrEvent) => product.id),
        );
        editProductContext(productArrayFromCache, false);
      } catch (error) {
        console.log("Failed to fetch all listings from cache: ", error);
      }

      const filter: Filter = {
        kinds: [30402],
      };

      let productArrayFromRelay: NostrEvent[] = [];
      let profileSetFromProducts: Set<string> = new Set();

      const fetchedEvents = await nostr.fetch([filter], {}, relays);
      if (!fetchedEvents.length) {
        console.log("No product events found with filter: ", filter);
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

      resolve({
        productEvents: productArrayFromRelay,
        profileSetFromProducts,
      });

      editProductContext(productArrayFromRelay, false);
      removeProductFromCache(Array.from(deletedProductsInCacheSet));
    } catch (error) {
      console.log("Failed to fetch all listings from relays: ", error);
      reject(error);
    }
  });
};

export const fetchCart = async (
  nostr: NostrManager,
  signer: NostrSigner | undefined,
  relays: string[],
  editCartContext: (cartAddresses: string[][], isLoading: boolean) => void,
  products: NostrEvent[],
): Promise<{
  cartList: ProductData[];
}> => {
  // TODO refactor this to not use new Promise
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

      let cartArrayFromRelay: ProductData[] = [];
      let cartAddressesArray: string[][] = [];

      const fetchedEvents: Array<NostrEvent> = await nostr.fetch(
        [filter],
        {},
        relays,
      );

      for (const event of fetchedEvents) {
        try {
          let eventContent = await signer.decrypt(userPubkey, event.content);
          if (eventContent) {
            let addressArray = JSON.parse(eventContent);
            cartAddressesArray = addressArray;
            for (const addressElement of addressArray) {
              let address = addressElement[1];
              const [kind, _, dTag] = address;
              if (kind === "30402") {
                const foundEvent = products.find((event) =>
                  event.tags.some((tag) => tag[0] === "d" && tag[1] === dTag),
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
      let updatedCartList = Array.from(uniqueProducts.values());
      resolve({
        cartList: updatedCartList,
      });

      editCartContext(cartAddressesArray, false);
    } catch (error) {
      console.log("Failed to fetch cart: ", error);
      reject(error);
    }
  });
};

export const fetchShopSettings = async (
  nostr: NostrManager,
  relays: string[],
  pubkeyShopSettingsToFetch: string[],
  editShopContext: (
    shopEvents: Map<string, ShopSettings>,
    isLoading: boolean,
  ) => void,
): Promise<{
  shopSettingsMap: Map<string, ShopSettings>;
}> => {
  // TODO refactor this to not use new Promise
  return new Promise(async function (resolve, reject) {
    try {
      let shopEvents: NostrEvent[] = [];

      let shopSettings: Map<string, ShopSettings | any> = new Map(
        pubkeyShopSettingsToFetch.map((pubkey) => [pubkey, null]),
      );

      if (pubkeyShopSettingsToFetch.length === 0) {
        editShopContext(new Map(), false);
        resolve({ shopSettingsMap: new Map() });
        return;
      }

      let shopFilter: Filter = {
        kinds: [30019],
        authors: pubkeyShopSettingsToFetch,
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
            const shopSetting = {
              pubkey: event.pubkey,
              content: JSON.parse(event.content),
              created_at: event.created_at,
            };
            shopSettings.set(pubkey, shopSetting);
          } catch (error) {
            console.error(
              `Failed to parse shop setting for pubkey: ${pubkey}`,
              error,
            );
          }
        });

        editShopContext(shopSettings, false);
        resolve({ shopSettingsMap: shopSettings });
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
  editProfileContext: (
    productEvents: Map<any, any>,
    isLoading: boolean,
  ) => void,
): Promise<{
  profileMap: Map<string, any>;
}> => {
  // TODO: refactor this to not use new Promise
  return new Promise(async function (resolve, reject) {
    try {
      if (!pubkeyProfilesToFetch.length) {
        editProfileContext(new Map(), false);
        resolve({ profileMap: new Map() });
        return;
      }

      try {
        let profileData = await fetchProfileDataFromCache();
        editProfileContext(profileData, false);
      } catch (error) {
        console.log("Failed to fetch profiles: ", error);
      }
      let subParams: { kinds: number[]; authors?: string[] } = {
        kinds: [0],
        authors: Array.from(pubkeyProfilesToFetch),
      };
      let profileMap: Map<string, any> = new Map(
        Array.from(pubkeyProfilesToFetch).map((pubkey) => [pubkey, null]),
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
            profileMap.set(event.pubkey, {
              pubkey: event.pubkey,
              created_at: event.created_at,
              content: content,
            });
          } catch (error) {
            console.error(
              `Failed parse profile for pubkey: ${event.pubkey}, ${event.content}`,
              error,
            );
          }
        }
      }
      resolve({ profileMap });
      await addProfilesToCache(profileMap);
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
  userPubkey?: string,
): Promise<{
  profileSetFromChats: Set<string>;
}> => {
  // TODO refactor this to not use new Promise
  // TODO pull pubkey from signer?
  return new Promise(async function (resolve, reject) {
    // if no userPubkey, user is not signed in
    if (!userPubkey) {
      editChatContext(new Map(), false);
      resolve({ profileSetFromChats: new Set() });
      // FIXME return to stop execution (?)
    } else {
      let chatMessagesFromCache: Map<string, NostrMessageEvent> =
        await fetchChatMessagesFromCache();
      try {
        let chatsMap = new Map();

        const addToChatsMap = (
          pubkeyOfChat: string,
          event: NostrMessageEvent,
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
          relays,
        );

        for (const event of fetchedEvents) {
          let messageEvent;

          let sealEventString = await signer!.decrypt(
            event.pubkey,
            event.content,
          );
          if (sealEventString) {
            const sealEvent = JSON.parse(sealEventString);
            if (sealEvent?.kind === 13) {
              const messageEventString = await signer!.decrypt(
                sealEvent.pubkey,
                sealEvent.content,
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
          let senderPubkey = messageEvent.pubkey;

          let tagsMap: Map<string, string> = new Map(
            messageEvent.tags.map(([k, v]: [string, string]) => [k, v]),
          );
          let subject = tagsMap.has("subject") ? tagsMap.get("subject") : null;
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
          let recipientPubkey = tagsMap.get("p") ? tagsMap.get("p") : null; // pubkey you sent the message to
          if (typeof recipientPubkey !== "string") {
            console.error(
              `fetchAllOutgoingChats: Failed to get recipientPubkey from tagsMap",
                ${tagsMap},
                ${event}`,
            );
            alert(
              `fetchAllOutgoingChats: Failed to get recipientPubkey from tagsMap`,
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
              a.created_at - b.created_at,
          );
        });
        resolve({ profileSetFromChats: new Set(chatsMap.keys()) });
        editChatContext(chatsMap, false);
      } catch (error) {
        console.log("Failed to fetch chats and messages: ", error);
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
    isLoading: boolean,
  ) => void,
): Promise<{
  merchantScoresMap: Map<string, number[]>;
  productReviewsMap: Map<string, Map<string, Map<string, string[][]>>>;
}> => {
  // TODO refactor this to not use new Promise
  return new Promise(async function (resolve, reject) {
    try {
      const addresses = products
        .map((product) => {
          const dTag = product.tags.find(
            (tag: string[]) => tag[0] === "d",
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
              (item) => item[0] !== "created_at",
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
      console.log("failed to fetch reviews: ", error);
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
    isLoading: boolean,
  ) => void,
  userPubkey?: string,
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
      relays,
    );
    const authors: string[] = [];
    for (const event of fetchedEvents) {
      const validTags = event.tags
        .map((tag) => tag[1])
        .filter((pubkey) => isHexString(pubkey) && !followsSet.has(pubkey));
      validTags.forEach((pubkey) => followsSet.add(pubkey));
      followsArrayFromRelay.push(...validTags);
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
      relays,
    );

    for (const followEvent of fetchedEvents) {
      const validFollowTags = followEvent.tags
        .map((tag) => tag[1])
        .filter((pubkey) => isHexString(pubkey) && !followsSet.has(pubkey));
      secondDegreeFollowsArrayFromRelay.push(...validFollowTags);
    }

    const pubkeyCount: Map<string, number> = new Map();
    secondDegreeFollowsArrayFromRelay.forEach((pubkey) => {
      pubkeyCount.set(pubkey, (pubkeyCount.get(pubkey) || 0) + 1);
    });
    secondDegreeFollowsArrayFromRelay =
      secondDegreeFollowsArrayFromRelay.filter(
        (pubkey) => (pubkeyCount.get(pubkey) || 0) >= wot,
      );
    // Concatenate arrays ensuring uniqueness
    followsArrayFromRelay = Array.from(
      new Set(followsArrayFromRelay.concat(secondDegreeFollowsArrayFromRelay)),
    );
    return {
      followsArrayFromRelay,
      firstDegreeFollowsLength,
    };
  };

  let { followsArrayFromRelay, firstDegreeFollowsLength } = await fetchFollows(
    userPubkey || defaultAuthor,
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
    isLoading: boolean,
  ) => void,
): Promise<{
  relayList: string[];
  readRelayList: string[];
  writeRelayList: string[];
}> => {
  // TODO refactor this to not use new Promise
  return new Promise(async function (resolve, reject) {
    try {
      let relayList: string[] = [];
      const relaySet: Set<string> = new Set();
      let readRelayList: string[] = [];
      const readRelaySet: Set<string> = new Set();
      let writeRelayList: string[] = [];
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
          (tag) => tag[0] === "r" && !tag[2],
        );

        const validReadRelays = event.tags.filter(
          (tag) => tag[0] === "r" && tag[2] === "read",
        );

        const validWriteRelays = event.tags.filter(
          (tag) => tag[0] === "r" && tag[2] === "write",
        );

        validRelays.forEach((tag) => relaySet.add(tag[1]));
        relayList.push(...validRelays.map((tag) => tag[1]));

        validReadRelays.forEach((tag) => readRelaySet.add(tag[1]));
        readRelayList.push(...validReadRelays.map((tag) => tag[1]));

        validWriteRelays.forEach((tag) => writeRelaySet.add(tag[1]));
        writeRelayList.push(...validWriteRelays.map((tag) => tag[1]));
      }
      resolve({
        relayList: relayList,
        readRelayList: readRelayList,
        writeRelayList: writeRelayList,
      });
      editRelaysContext(relayList, readRelayList, writeRelayList, false);
    } catch (error) {
      console.log("failed to fetch follow list: ", error);
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
    isLoading: boolean,
  ) => void,
): Promise<{
  proofEvents: any[];
  cashuMints: string[];
  cashuProofs: Proof[];
}> => {
  // TODO: refactor this to not use new Promise
  return new Promise(async function (resolve, reject) {
    const { tokens } = getLocalStorageData();
    const userPubkey = await signer?.getPubKey?.();
    if (!userPubkey) {
      resolve({
        proofEvents: [],
        cashuMints: [],
        cashuProofs: [],
      });
      return;
    }
    const enc = new TextEncoder();
    try {
      let mostRecentWalletEvent: NostrEvent[] = [];
      let proofEvents: any[] = [];

      let cashuRelays: string[] = [];
      const cashuRelaySet: Set<string> = new Set();

      let cashuMints: string[] = [];
      let cashuMintSet: Set<string> = new Set();

      let cashuProofs: Proof[] = [];
      let incomingSpendingHistory: [][] = [];
      const cashuWalletFilter: Filter = {
        kinds: [17375, 37375],
        authors: [userPubkey],
      };

      const hEvents: NostrEvent[] = await nostr.fetch(
        [cashuWalletFilter],
        {},
        relays,
      );

      // find most recent wallet event
      for (const event of hEvents) {
        if (event.kind === 17375) {
          const mints = event.tags.filter((tag: string[]) => tag[0] === "mint");
          mints.forEach((tag) => {
            if (!cashuMintSet.has(tag[1])) {
              cashuMintSet.add(tag[1]);
              cashuMints.push(tag[1]);
            }
          });
        } else if (
          (event.kind === 37375 && mostRecentWalletEvent.length === 0) ||
          event.created_at > mostRecentWalletEvent[0].created_at
        ) {
          mostRecentWalletEvent = [event];
        }
      }
      if (mostRecentWalletEvent.length > 0) {
        // extract cashu data
        const relayList = mostRecentWalletEvent[0].tags.filter(
          (tag: string[]) => tag[0] === "relay",
        );
        relayList.forEach((tag) => cashuRelaySet.add(tag[1]));
        cashuRelays.push(...relayList.map((tag: string[]) => tag[1]));
        const mints = mostRecentWalletEvent[0].tags.filter(
          (tag: string[]) => tag[0] === "mint",
        );
        mints.forEach((tag) => {
          if (!cashuMintSet.has(tag[1])) {
            cashuMintSet.add(tag[1]);
            cashuMints.push(tag[1]);
          }
        });
      }
      const cashuProofFilter: Filter = {
        kinds: [7375, 7376],
        authors: [userPubkey],
      };

      const wEvent: NostrEvent[] = await nostr.fetch(
        [cashuProofFilter],
        {},
        cashuRelays.length !== 0 ? cashuRelays : relays,
      );

      for (const event of wEvent) {
        try {
          let eventContent = await signer!.decrypt(userPubkey, event.content);
          const cashuWalletEventContent = eventContent
            ? JSON.parse(eventContent)
            : null;
          if (
            event.kind === 7375 &&
            cashuWalletEventContent &&
            cashuWalletEventContent.mint &&
            cashuWalletEventContent.proofs
          ) {
            proofEvents.push({
              id: event.id,
              proofs: cashuWalletEventContent.proofs,
            });
            let wallet = new CashuWallet(
              new CashuMint(cashuWalletEventContent?.mint),
            );
            const Ys = cashuWalletEventContent?.proofs.map((p: Proof) =>
              hashToCurve(enc.encode(p.secret)).toHex(true),
            );
            let proofsStates = await wallet?.checkProofsStates(
              cashuWalletEventContent?.proofs,
            );
            const spentYs = new Set(
              proofsStates
                .filter((state) => state.state === "SPENT")
                .map((state) => state.Y),
            );
            const allYsMatch =
              Ys.length === spentYs.size &&
              Ys.every((y: string) => spentYs.has(y));
            if (proofsStates && proofsStates.length > 0 && allYsMatch) {
              await deleteEvent(nostr, signer!, [event.id]);
            } else if (cashuWalletEventContent.proofs) {
              let allProofs = [
                ...tokens,
                ...cashuWalletEventContent?.proofs,
                ...cashuProofs,
              ];
              cashuProofs = getUniqueProofs(allProofs);
            }
          } else if (event.kind === 7376 && cashuWalletEventContent) {
            incomingSpendingHistory.push(cashuWalletEventContent);
          }
        } catch (error) {
          console.log("Error fetching cashu wallet: ", error);
        }
      }

      for (const mint of cashuMints) {
        try {
          let wallet = new CashuWallet(new CashuMint(mint));
          if (cashuProofs.length > 0) {
            const Ys = cashuProofs.map((p: Proof) =>
              hashToCurve(enc.encode(p.secret)).toHex(true),
            );
            let proofsStates = await wallet?.checkProofsStates(cashuProofs);
            const spentYs = new Set(
              proofsStates
                .filter((state) => state.state === "SPENT")
                .map((state) => state.Y),
            );
            if (spentYs.size > 0) {
              cashuProofs = cashuProofs.filter(
                (_, index) => !spentYs.has(Ys[index]),
              );
            }
          }

          let outProofIds = incomingSpendingHistory
            .filter((eventTags) =>
              eventTags.some(
                (tag) => tag[0] === "direction" && tag[1] === "out",
              ),
            )
            .map((eventTags) => {
              const destroyedTag = eventTags.find(
                (tag) => tag[0] === "e" && tag[3] === "destroyed",
              );
              return destroyedTag ? destroyedTag[1] : "";
            })
            .filter((eventId) => eventId !== "");

          let destroyedProofsArray = proofEvents
            .filter((event) => outProofIds.includes(event.id))
            .map((event) => event.proofs);

          cashuProofs = cashuProofs.filter(
            (cashuProof) => !destroyedProofsArray.includes(cashuProof),
          );

          let inProofIds = incomingSpendingHistory
            .filter((eventTags) =>
              eventTags.some(
                (tag) =>
                  tag[0] === "direction" &&
                  (tag[1] === "out" || tag[1] === "in"),
              ),
            )
            .map((eventTags) => {
              const createdTag = eventTags.find(
                (tag) => tag[0] === "e" && tag[3] === "created",
              );
              return createdTag ? createdTag[1] : "";
            })
            .filter((eventId) => eventId !== "");

          let proofIdsToAddBack = inProofIds.filter(
            (id) => !outProofIds.includes(id),
          );
          let arrayOfProofsToAddBack = proofEvents
            .filter((event) => proofIdsToAddBack.includes(event.id))
            .map((event) => event.proofs);

          const proofExists = (
            proofToAdd: Proof,
            existingProofArray: Proof[],
          ): boolean => {
            return existingProofArray.includes(proofToAdd);
          };

          for (const proofsToAddBack of arrayOfProofsToAddBack) {
            for (const proofToAdd of proofsToAddBack) {
              if (proofToAdd && !proofExists(proofToAdd, cashuProofs)) {
                cashuProofs.push(proofToAdd);
              }
            }
          }

          cashuProofs = getUniqueProofs(cashuProofs);

          if (outProofIds.length > 0) {
            await deleteEvent(nostr, signer!, outProofIds);
          }
        } catch (error) {
          console.log("Error checking spent proofs: ", error);
        }
      }

      resolve({
        proofEvents: proofEvents,
        cashuMints: cashuMints,
        cashuProofs: cashuProofs,
      });

      editCashuWalletContext(proofEvents, cashuMints, cashuProofs, false);
    } catch (error) {
      console.log("failed to fetch Cashu wallet: ", error);
      reject(error);
    }
  });
};
