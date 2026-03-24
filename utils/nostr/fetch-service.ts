import { Filter } from "nostr-tools";
import {
  NostrEvent,
  NostrMessageEvent,
  ShopProfile,
  Community,
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
import { parseCommunityEvent } from "../parsers/community-parser-functions";
import { calculateWeightedScore } from "@/utils/parsers/review-parser-functions";
import { hashToCurve } from "@cashu/crypto/modules/common";
import { NostrManager } from "@/utils/nostr/nostr-manager";
import { NostrSigner } from "@/utils/nostr/signers/nostr-signer";
import { cacheEventsToDatabase } from "@/utils/db/db-client";

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
      // First, load from database to immediately populate the UI
      let productArrayFromDb: NostrEvent[] = [];
      try {
        const response = await fetch("/api/db/fetch-products");
        if (response.ok) {
          productArrayFromDb = await response.json();
          if (productArrayFromDb.length > 0) {
            editProductContext(productArrayFromDb, false);
          }
        }
      } catch (error) {
        console.error("Failed to fetch products from database: ", error);
      }

      const filter: Filter = {
        kinds: [30402],
        "#t": ["MilkMarket", "FREEMILK"],
      };

      const specificPubkeyFilter: Filter = {
        kinds: [30402],
        authors: [
          "99cefa645b00817373239aebb96d2d1990244994e5e565566c82c04b8dc65b54",
        ],
      };

      const zapsnagFilter: Filter = {
        kinds: [1],
        "#t": ["milk-market-zapsnag"],
      };

      const profileSetFromProducts: Set<string> = new Set();

      productArrayFromDb.forEach((event) => {
        if (event.pubkey) profileSetFromProducts.add(event.pubkey);
      });

      const fetchedEvents = await nostr.fetch(
        [filter, specificPubkeyFilter, zapsnagFilter],
        {},
        relays
      );
      if (!fetchedEvents.length) {
        console.error("No products found with filter: ", filter);
      }

      // Cache valid product events to database
      const validProductEvents = fetchedEvents.filter(
        (e) => e.id && e.sig && e.pubkey && (e.kind === 30402 || e.kind === 1)
      );
      if (validProductEvents.length > 0) {
        cacheEventsToDatabase(validProductEvents).catch((error) =>
          console.error("Failed to cache products to database:", error)
        );
      }

      const getEventKey = (event: NostrEvent): string => {
        if (event.kind === 30402) {
          const dTag = event.tags?.find((tag: string[]) => tag[0] === "d")?.[1];
          if (dTag) return `${event.pubkey}:${dTag}`;
        }
        return event.id;
      };

      const mergedProductsMap = new Map<string, NostrEvent>();

      for (const event of productArrayFromDb) {
        if (event && event.id) {
          mergedProductsMap.set(getEventKey(event), event);
        }
      }

      for (const event of fetchedEvents) {
        if (!event || !event.id) continue;

        const key = getEventKey(event);
        const existing = mergedProductsMap.get(key);
        if (!existing || event.created_at >= existing.created_at) {
          mergedProductsMap.set(key, event);
        }
        profileSetFromProducts.add(event.pubkey);
      }

      const mergedProductArray = Array.from(mergedProductsMap.values());

      editProductContext(mergedProductArray, false);

      // Cache fetched products to database via API (only valid events with signatures)
      const validProducts = fetchedEvents.filter(
        (e) => e.id && e.sig && e.pubkey
      );
      if (validProducts.length > 0) {
        cacheEventsToDatabase(validProducts).catch((error) =>
          console.error("Failed to cache products to database:", error)
        );
      }

      resolve({
        productEvents: mergedProductArray,
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

      // First load from database
      try {
        const response = await fetch("/api/db/fetch-profiles");
        if (response.ok) {
          const profilesFromDb = await response.json();
          const shopProfilesFromDb = profilesFromDb.filter(
            (e: NostrEvent) =>
              e.kind === 30019 && pubkeyShopProfileToFetch.includes(e.pubkey)
          );

          if (shopProfilesFromDb.length > 0) {
            shopProfilesFromDb.sort(
              (a: NostrEvent, b: NostrEvent) => b.created_at - a.created_at
            );
            const latestEventsMap: Map<string, NostrEvent> = new Map();
            shopProfilesFromDb.forEach((event: NostrEvent) => {
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
                  event: event,
                };
                shopProfile.set(pubkey, shopProfileSetting);
              } catch (error) {
                console.error(
                  `Failed to parse shop profile from DB for pubkey: ${pubkey}`,
                  error
                );
              }
            });

            if (shopProfile.size > 0) {
              editShopContext(shopProfile, false);
            }
          }
        }
      } catch (error) {
        console.error("Failed to fetch shop profiles from database: ", error);
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
              event: event,
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

        // Cache shop profiles to database via API
        const validShopEvents = shopEvents.filter(
          (e) => e.id && e.sig && e.pubkey && e.kind === 30019
        );
        if (validShopEvents.length > 0) {
          cacheEventsToDatabase(validShopEvents).catch((error) =>
            console.error("Failed to cache shop profiles to database:", error)
          );
        }

        resolve({ shopProfileMap: shopProfile });
      } else {
        editShopContext(shopProfile, false);
        resolve({ shopProfileMap: shopProfile });
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

      const dbProfileMap = new Map<string, any>();
      try {
        const response = await fetch("/api/db/fetch-profiles");
        if (response.ok) {
          const profilesFromDb = await response.json();
          for (const event of profilesFromDb) {
            if (pubkeyProfilesToFetch.includes(event.pubkey)) {
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
                dbProfileMap.set(event.pubkey, profile);
              } catch (error) {
                console.error(
                  `Failed to parse profile from DB: ${event.pubkey}`,
                  error
                );
              }
            }
          }
          if (dbProfileMap.size > 0) {
            editProfileContext(dbProfileMap, false);
          }
        }
      } catch (error) {
        console.error("Failed to fetch profiles from database: ", error);
      }

      const subParams: { kinds: number[]; authors?: string[] } = {
        kinds: [0],
        authors: Array.from(pubkeyProfilesToFetch),
      };

      const profileMap: Map<string, any> = new Map(
        Array.from(pubkeyProfilesToFetch).map((pubkey) => [
          pubkey,
          dbProfileMap.get(pubkey) || null,
        ])
      );

      const fetchedEvents = await nostr.fetch([subParams], {}, relays);

      for (const event of fetchedEvents) {
        const existing = profileMap.get(event.pubkey);
        if (
          existing === null ||
          !existing ||
          event.created_at > existing.created_at
        ) {
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

      // Cache profiles to database via API (reconstruct from fetched events)
      const validProfileEvents = fetchedEvents.filter(
        (e) => e.id && e.sig && e.pubkey && e.kind === 0
      );
      if (validProfileEvents.length > 0) {
        cacheEventsToDatabase(validProfileEvents).catch((error) =>
          console.error("Failed to cache profiles to database:", error)
        );
      }

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
      // Load from database first
      const chatMessagesFromCache = new Map<string, NostrMessageEvent>();

      try {
        const response = await fetch(
          `/api/db/fetch-messages?pubkey=${userPubkey}`
        );
        if (response.ok) {
          const messagesFromDb = await response.json();
          for (const event of messagesFromDb) {
            if (!chatMessagesFromCache.has(event.id)) {
              chatMessagesFromCache.set(event.id, {
                ...event,
                sig: event.sig || "",
                read: event.is_read === true,
              } as NostrMessageEvent);
            }
          }
        }
      } catch (error) {
        console.error("Failed to fetch messages from database: ", error);
      }

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
            subject !== "shipping-info" &&
            subject !== "zapsnag-order"
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
            return;
          }
          let cachedMessage = chatMessagesFromCache.get(event.id);
          let chatMessage: NostrMessageEvent;
          if (cachedMessage) {
            chatMessage = {
              ...messageEvent,
              sig: "",
              read: cachedMessage.read,
              wrappedEventId: event.id,
            };
          } else {
            chatMessage = {
              ...messageEvent,
              sig: "",
              read: false,
              wrappedEventId: event.id,
            };
          }
          if (senderPubkey === userPubkey) {
            addToChatsMap(recipientPubkey, chatMessage);
          } else {
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

        // Cache messages to database via API (only valid messages with required fields)
        const validMessages = fetchedEvents.filter(
          (e) => e.id && e.sig && e.pubkey && e.kind === 1059
        );
        if (validMessages.length > 0) {
          cacheEventsToDatabase(validMessages).catch((error) =>
            console.error("Failed to cache messages to database:", error)
          );
        }

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

      const productReviewsMap = new Map<
        string,
        Map<string, Map<string, string[][]>>
      >();

      const reviewScoreTracker = new Map<
        string,
        { score: number; created_at: number }
      >();
      const getReviewScoreKey = (
        merchantPubkey: string,
        productDTag: string,
        reviewerPubkey: string
      ) => `${merchantPubkey}:${productDTag}:${reviewerPubkey}`;

      const processReviewEvent = (event: NostrEvent, addressTag: string) => {
        const [_, _kind, merchantPubkey, productDTag] = addressTag.split(":");
        if (!merchantPubkey || !productDTag) return;

        const ratingTags = event.tags.filter(
          (tag: string[]) => tag[0] === "rating"
        );
        const commentArray = ["comment", event.content];
        ratingTags.unshift(commentArray);

        const scoreKey = getReviewScoreKey(
          merchantPubkey,
          productDTag,
          event.pubkey
        );
        const score = calculateWeightedScore(event.tags);
        const existingScore = reviewScoreTracker.get(scoreKey);

        if (!existingScore || event.created_at > existingScore.created_at) {
          reviewScoreTracker.set(scoreKey, {
            score,
            created_at: event.created_at,
          });
        }

        if (!productReviewsMap.has(merchantPubkey)) {
          productReviewsMap.set(merchantPubkey, new Map());
        }

        const merchantProducts = productReviewsMap.get(merchantPubkey)!;
        if (!merchantProducts.has(productDTag)) {
          merchantProducts.set(productDTag, new Map());
        }

        const productReviews = merchantProducts.get(productDTag)!;
        const createdAt = event.created_at;
        const existingReview = productReviews.get(event.pubkey);

        if (
          !existingReview ||
          createdAt >
            Number(existingReview.find((item) => item[0] === "created_at")?.[1])
        ) {
          const updatedReview = existingReview
            ? existingReview.map((item) => {
                if (item[0] === "created_at") {
                  return ["created_at", createdAt.toString()];
                }
                return item;
              })
            : [...ratingTags, ["created_at", createdAt.toString()]];

          productReviews.set(event.pubkey, updatedReview);
        }
      };

      // First load from database
      try {
        const response = await fetch("/api/db/fetch-reviews");
        if (!response.ok) throw new Error("Failed to fetch reviews");
        const reviewsFromDb = await response.json();

        for (const event of reviewsFromDb) {
          const addressTag = event.tags.find(
            (tag: string[]) => tag[0] === "d"
          )?.[1];
          if (!addressTag || !addresses.includes(addressTag)) continue;
          processReviewEvent(event, addressTag);
        }

        if (reviewScoreTracker.size > 0 || productReviewsMap.size > 0) {
          const merchantScoresMap = new Map<string, number[]>();
          reviewScoreTracker.forEach(({ score }, key) => {
            const merchantPubkey = key.split(":")[0]!;
            if (!merchantScoresMap.has(merchantPubkey)) {
              merchantScoresMap.set(merchantPubkey, []);
            }
            merchantScoresMap.get(merchantPubkey)!.push(score);
          });

          const cleanedProductReviewsMap = new Map(productReviewsMap);
          cleanedProductReviewsMap.forEach((merchantProducts) => {
            merchantProducts.forEach((productReviews) => {
              productReviews.forEach((review, reviewerPubkey) => {
                const cleanedReview = review.filter(
                  (item) => item[0] !== "created_at"
                );
                if (cleanedReview.length > 0) {
                  productReviews.set(reviewerPubkey, cleanedReview);
                }
              });
            });
          });
          editReviewsContext(
            merchantScoresMap,
            cleanedProductReviewsMap,
            false
          );
        }
      } catch (error) {
        console.error("Failed to fetch reviews from database: ", error);
      }

      const reviewsFilter: Filter = {
        kinds: [31555],
        "#d": addresses,
      };

      const fetchedEvents = await nostr.fetch([reviewsFilter], {}, relays);

      for (const event of fetchedEvents) {
        const addressTag = event.tags.find((tag) => tag[0] === "d")?.[1];
        if (!addressTag) continue;
        processReviewEvent(event, addressTag);
      }

      const merchantScoresMap = new Map<string, number[]>();
      reviewScoreTracker.forEach(({ score }, key) => {
        const merchantPubkey = key.split(":")[0]!;
        if (!merchantScoresMap.has(merchantPubkey)) {
          merchantScoresMap.set(merchantPubkey, []);
        }
        merchantScoresMap.get(merchantPubkey)!.push(score);
      });

      productReviewsMap.forEach((merchantProducts) => {
        merchantProducts.forEach((productReviews) => {
          productReviews.forEach((review, reviewerPubkey) => {
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

      // Cache reviews to database via API (only valid events)
      const validReviews = fetchedEvents.filter(
        (e) => e.id && e.sig && e.pubkey && e.kind === 31555
      );
      if (validReviews.length > 0) {
        cacheEventsToDatabase(validReviews).catch((error) =>
          console.error("Failed to cache reviews to database:", error)
        );
      }

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

      // Load from database first
      try {
        const response = await fetch(
          `/api/db/fetch-relays?pubkey=${userPubkey}`
        );
        if (!response.ok) throw new Error("Failed to fetch relay config");
        const relayEventsFromDb = await response.json();

        for (const event of relayEventsFromDb) {
          const validRelays = event.tags.filter(
            (tag: string[]) => tag[0] === "r" && !tag[2]
          );
          const validReadRelays = event.tags.filter(
            (tag: string[]) => tag[0] === "r" && tag[2] === "read"
          );
          const validWriteRelays = event.tags.filter(
            (tag: string[]) => tag[0] === "r" && tag[2] === "write"
          );

          validRelays.forEach((tag: string[]) => relaySet.add(tag[1]!));
          relayList.push(
            ...validRelays
              .map((tag: string[]) => tag[1]!)
              .filter((tag: string[]) => tag !== undefined)
          );

          validReadRelays.forEach((tag: string[]) => readRelaySet.add(tag[1]!));
          readRelayList.push(
            ...validReadRelays
              .map((tag: string[]) => tag[1]!)
              .filter((tag: string[]) => tag !== undefined)
          );

          validWriteRelays.forEach((tag: string[]) =>
            writeRelaySet.add(tag[1]!)
          );
          writeRelayList.push(
            ...validWriteRelays
              .map((tag: string[]) => tag[1]!)
              .filter((tag: string[]) => tag !== undefined)
          );
        }

        if (relayList.length > 0) {
          editRelaysContext(relayList, readRelayList, writeRelayList, false);
        }
      } catch (error) {
        console.error("Failed to fetch relay config from database: ", error);
      }

      const relayfilter: Filter = {
        kinds: [10002],
        authors: [userPubkey],
      };

      const fetchedEvents = await nostr.fetch([relayfilter], {}, relays);

      // Cache relay config events to database
      const validRelayEvents = fetchedEvents.filter(
        (e) => e.id && e.sig && e.pubkey && e.kind === 10002
      );
      if (validRelayEvents.length > 0) {
        cacheEventsToDatabase(validRelayEvents).catch((error) =>
          console.error(
            "Failed to cache relay config events to database:",
            error
          )
        );
      }

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

        validRelays.forEach((tag) => {
          if (tag[1] && !relaySet.has(tag[1])) {
            relaySet.add(tag[1]);
            relayList.push(tag[1]);
          }
        });

        validReadRelays.forEach((tag) => {
          if (tag[1] && !readRelaySet.has(tag[1])) {
            readRelaySet.add(tag[1]);
            readRelayList.push(tag[1]);
          }
        });

        validWriteRelays.forEach((tag) => {
          if (tag[1] && !writeRelaySet.has(tag[1])) {
            writeRelaySet.add(tag[1]);
            writeRelayList.push(tag[1]);
          }
        });
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

      // Load from database first
      try {
        const response = await fetch(
          `/api/db/fetch-blossom?pubkey=${userPubkey}`
        );
        if (!response.ok) throw new Error("Failed to fetch blossom config");
        const blossomEventsFromDb = await response.json();

        for (const event of blossomEventsFromDb) {
          const validBlossomServers = event.tags.filter(
            (tag: string[]) => tag[0] === "server"
          );
          validBlossomServers.forEach((tag: string[]) =>
            blossomSet.add(tag[1]!)
          );
          blossomServers.push(
            ...validBlossomServers
              .map((tag: string[]) => tag[1]!)
              .filter((tag: string[]) => tag !== undefined)
          );
        }

        if (blossomServers.length > 0) {
          editBlossomContext(blossomServers, false);
        }
      } catch (error) {
        console.error("Failed to fetch blossom config from database: ", error);
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

      // Cache blossom server config events to database
      const validBlossomEvents = fetchedEvents.filter(
        (e) => e.id && e.sig && e.pubkey && e.kind === 10063
      );
      if (validBlossomEvents.length > 0) {
        cacheEventsToDatabase(validBlossomEvents).catch((error) =>
          console.error(
            "Failed to cache blossom config events to database:",
            error
          )
        );
      }

      for (const event of fetchedEvents) {
        const validBlossomServers = event.tags.filter(
          (tag) => tag[0] === "server"
        );

        validBlossomServers.forEach((tag) => {
          if (tag[1] && !blossomSet.has(tag[1])) {
            blossomSet.add(tag[1]);
            blossomServers.push(tag[1]);
          }
        });
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

      // Load wallet events from database first
      try {
        const response = await fetch(
          `/api/db/fetch-wallet?pubkey=${userPubkey}`
        );
        if (!response.ok) throw new Error("Failed to fetch wallet events");
        const walletEventsFromDb = await response.json();

        for (const event of walletEventsFromDb) {
          if (event.kind === 17375) {
            const mints = event.tags.filter(
              (tag: string[]) => tag[0] === "mint"
            );
            mints.forEach((tag: string[]) => {
              if (tag[1] && !cashuMintSet.has(tag[1])) {
                cashuMintSet.add(tag[1]);
                cashuMints.push(tag[1]);
              }
            });
          } else if (event.kind === 37375) {
            if (
              !mostRecentWalletEvent ||
              event.created_at > mostRecentWalletEvent.created_at
            ) {
              mostRecentWalletEvent = event;
            }
          } else if (event.kind === 7375 || event.kind === 7376) {
            // Process proof and spending history from DB
            try {
              const eventContent = await signer!.decrypt(
                userPubkey,
                event.content
              );
              if (eventContent) {
                const cashuWalletEventContent = JSON.parse(eventContent);
                if (
                  event.kind === 7375 &&
                  cashuWalletEventContent?.mint &&
                  cashuWalletEventContent?.proofs
                ) {
                  proofEvents.push({
                    id: event.id,
                    mint: cashuWalletEventContent.mint,
                    proofs: cashuWalletEventContent.proofs,
                    created_at: event.created_at,
                  });
                  if (!cashuMintSet.has(cashuWalletEventContent.mint)) {
                    cashuMintSet.add(cashuWalletEventContent.mint);
                    cashuMints.push(cashuWalletEventContent.mint);
                  }
                  cashuProofs = getUniqueProofs([
                    ...cashuProofs,
                    ...cashuWalletEventContent.proofs,
                  ]);
                } else if (event.kind === 7376 && cashuWalletEventContent) {
                  incomingSpendingHistory.push(cashuWalletEventContent);
                }
              }
            } catch (error) {
              console.error(
                `Failed to decrypt wallet event from DB ${event.id}:`,
                error
              );
            }
          }
        }

        if (mostRecentWalletEvent) {
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
        }
      } catch (error) {
        console.error("Failed to fetch wallet events from database: ", error);
      }

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

      // Cache wallet config events to database
      const validWalletConfigEvents = hEvents.filter(
        (e) =>
          e.id && e.sig && e.pubkey && (e.kind === 17375 || e.kind === 37375)
      );
      if (validWalletConfigEvents.length > 0) {
        cacheEventsToDatabase(validWalletConfigEvents).catch((error) =>
          console.error(
            "Failed to cache wallet config events to database:",
            error
          )
        );
      }

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

      // Cache wallet proof events to database
      const validWalletProofEvents = proofEvents_raw.filter(
        (e) => e.id && e.sig && e.pubkey && (e.kind === 7375 || e.kind === 7376)
      );
      if (validWalletProofEvents.length > 0) {
        cacheEventsToDatabase(validWalletProofEvents).catch((error) =>
          console.error(
            "Failed to cache wallet proof events to database:",
            error
          )
        );
      }

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

export const fetchAllCommunities = async (
  nostr: NostrManager,
  relays: string[],
  editCommunityContext: (
    communities: Map<string, Community>,
    isLoading: boolean
  ) => void
): Promise<Map<string, Community>> => {
  return new Promise(async (resolve, reject) => {
    try {
      const dbCommunityMap = new Map<string, Community>();
      try {
        const response = await fetch("/api/db/fetch-communities");
        if (response.ok) {
          const communitiesFromDb = await response.json();
          if (communitiesFromDb.length > 0) {
            for (const event of communitiesFromDb) {
              const community = parseCommunityEvent(event);
              if (community) {
                dbCommunityMap.set(community.id, community);
              }
            }
            if (dbCommunityMap.size > 0) {
              editCommunityContext(new Map(dbCommunityMap), false);
            }
          }
        }
      } catch (error) {
        console.error("Failed to fetch communities from database: ", error);
      }

      const filter: Filter = {
        kinds: [34550],
        "#t": ["milkmarket"],
      };

      const fetchedEvents = await nostr.fetch([filter], {}, relays);

      const communityMap = new Map(dbCommunityMap);

      for (const event of fetchedEvents) {
        const community = parseCommunityEvent(event);
        if (community) {
          const existing = communityMap.get(community.id);
          if (!existing || community.createdAt >= existing.createdAt) {
            communityMap.set(community.id, community);
          }
        }
      }

      editCommunityContext(communityMap, false);

      // Cache communities to database via API (only valid events)
      const validCommunities = fetchedEvents.filter(
        (e) => e.id && e.sig && e.pubkey && e.kind === 34550
      );
      if (validCommunities.length > 0) {
        cacheEventsToDatabase(validCommunities).catch((error) =>
          console.error("Failed to cache communities to database:", error)
        );
      }

      resolve(communityMap);
    } catch (error) {
      reject(error);
    }
  });
};

// returns CommunityPost[] (posts augmented with approval metadata)
export const fetchCommunityPosts = async (
  nostr: NostrManager,
  community: Community,
  limit: number = 20
): Promise<NostrEvent[]> => {
  return new Promise(async (resolve, reject) => {
    if (!community) {
      resolve([]);
      return;
    }
    try {
      const communityAddress = `${community.kind}:${community.pubkey}:${community.d}`;
      const { relays: userRelays } = getLocalStorageData();
      // Create a combined, unique list of relays for fetching
      const combinedRelays = Array.from(
        new Set([...community.relays.all, ...userRelays])
      );

      if (combinedRelays.length === 0) {
        resolve([]);
        return;
      }

      // choose relays to check approvals: prefer explicitly labeled approvals relays, fallback to all
      const approvalRelays = community.relays.approvals.length
        ? community.relays.approvals
        : combinedRelays;

      // Step 1: Fetch approval events from relays where approvals are expected
      const approvalFilter: Filter = {
        kinds: [4550],
        "#a": [communityAddress],
        limit: limit * 4, // fetch a bit more approval events
      };

      // fetch approvals across candidate relays
      const approvalEvents = await nostr.fetch(
        [approvalFilter],
        {},
        approvalRelays
      );

      // Step 2: Validate approval events: only accept those issued by moderators of the community.
      const validApprovals = approvalEvents.filter((ap) =>
        community.moderators.includes(ap.pubkey)
      );

      // map post id -> single approval (take latest per approver)
      const approvalByPostId: Map<
        string,
        { approvalId: string; approver: string; created_at: number }
      > = new Map();

      for (const ap of validApprovals) {
        const eTags = ap.tags
          .filter((t) => t[0] === "e")
          .map((t) => t[1])
          .filter((id): id is string => !!id);
        for (const approvedId of eTags) {
          const existing = approvalByPostId.get(approvedId);
          if (!existing || ap.created_at > existing.created_at) {
            approvalByPostId.set(approvedId, {
              approvalId: ap.id,
              approver: ap.pubkey,
              created_at: ap.created_at,
            });
          }
        }
      }

      const approvedEventIds = Array.from(approvalByPostId.keys());
      if (approvedEventIds.length === 0) {
        resolve([]);
        return;
      }

      // Step 3: Fetch approved posts in batches using request relays or all
      const requestRelays = community.relays.requests.length
        ? community.relays.requests
        : combinedRelays;
      const batchSize = 50;
      const postEvents: NostrEvent[] = [];
      for (let i = 0; i < approvedEventIds.length; i += batchSize) {
        const batchIds = approvedEventIds.slice(i, i + batchSize);
        if (batchIds.length > 0) {
          const postsFilter: Filter = {
            kinds: [1111],
            ids: batchIds,
          };
          const batchEvents = await nostr.fetch(
            [postsFilter],
            {},
            requestRelays
          );
          postEvents.push(...batchEvents);
        }
      }

      // Annotate posts with approval metadata where available
      const annotatedPosts = postEvents.map((post) => {
        const approval = approvalByPostId.get(post.id);
        const annotated: any = { ...post };
        if (approval) {
          annotated.approved = true;
          annotated.approvalEventId = approval.approvalId;
          annotated.approvedBy = approval.approver;
        } else {
          annotated.approved = false;
        }
        return annotated as NostrEvent;
      });

      // Sort posts by creation date, newest first.
      annotatedPosts.sort((a, b) => b.created_at - a.created_at);
      resolve(annotatedPosts);
    } catch (error) {
      console.error("Failed to fetch community posts:", error);
      reject(error);
    }
  });
};

export const fetchPendingPosts = async (
  nostr: NostrManager,
  community: Community,
  limit: number = 20
): Promise<NostrEvent[]> => {
  return new Promise(async (resolve, reject) => {
    try {
      const { relays: userRelays } = getLocalStorageData();
      const communityAddress = `${community.kind}:${community.pubkey}:${community.d}`;
      const approvedPostEvents = await fetchCommunityPosts(
        nostr,
        community,
        limit * 2
      );
      const approvedPostIds = new Set(approvedPostEvents.map((p) => p.id));

      // Fetch post requests using 'requests' relays (or fallback to all)
      const requestRelays = Array.from(
        new Set([
          ...community.relays.requests,
          ...community.relays.all,
          ...userRelays,
        ])
      );
      if (requestRelays.length === 0) {
        resolve([]);
        return;
      }
      const postRequestFilter: Filter = {
        kinds: [1111],
        "#a": [communityAddress],
        limit: limit,
      };

      const allPostRequests = await nostr.fetch(
        [postRequestFilter],
        {},
        requestRelays
      );

      // Pending = requests that don't have an approval
      const pendingPosts = allPostRequests.filter(
        (post) => !approvedPostIds.has(post.id)
      );
      pendingPosts.sort((a, b) => b.created_at - a.created_at);
      resolve(pendingPosts);
    } catch (error) {
      console.error("Failed to fetch pending posts:", error);
      reject(error);
    }
  });
};
