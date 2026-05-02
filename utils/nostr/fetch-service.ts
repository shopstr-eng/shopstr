import { Filter } from "nostr-tools";
import {
  NostrEvent,
  NostrMessageEvent,
  ShopProfile,
  Community,
} from "@/utils/types/types";
import {
  Mint as CashuMint,
  Wallet as CashuWallet,
  Proof,
} from "@cashu/cashu-ts";
import { ChatsMap } from "@/utils/context/context";
import {
  getLocalStorageData,
  deleteEvent,
  verifyNip05Identifier,
} from "@/utils/nostr/nostr-helper-functions";
import { isHexPubkey } from "@/utils/nostr/pubkey";
import {
  pickPreferredReplaceableEvent,
  selectPreferredReplaceableEvent,
} from "@/utils/nostr/replaceable-events";
import {
  ProductData,
  parseTags,
} from "@/utils/parsers/product-parser-functions";
import { parseCommunityEvent } from "../parsers/community-parser-functions";
import { calculateWeightedScore } from "@/utils/parsers/review-parser-functions";
import { hashToCurve } from "@cashu/cashu-ts";
import { NostrManager } from "@/utils/nostr/nostr-manager";
import { NostrSigner } from "@/utils/nostr/signers/nostr-signer";
import { cacheEventsToDatabase } from "@/utils/db/db-client";
import {
  buildMessagesListProof,
  buildSignedHttpRequestProofTemplate,
  SIGNED_EVENT_HEADER,
} from "@/utils/nostr/request-auth";

interface NipProfile {
  pubkey: string;
  created_at: number;
  content: { nip05?: string; [key: string]: any };
  nip05Verified: boolean;
}

function getUniqueProofs(proofs: Proof[]): Proof[] {
  const seenSecrets = new Set<string>();
  return proofs.filter((proof) => {
    if (!seenSecrets.has(proof.secret)) {
      seenSecrets.add(proof.secret);
      return true;
    }
    return false;
  });
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
      const BATCH_SIZE = 500;
      const profileSetFromProducts: Set<string> = new Set();
      const dbProductsMap = new Map<string, NostrEvent>();

      const getEventKey = (event: NostrEvent): string => {
        if (event.kind === 30402) {
          const dTag = event.tags?.find((tag: string[]) => tag[0] === "d")?.[1];
          if (dTag) return `${event.pubkey}:${dTag}`;
        }
        return event.id;
      };

      // Cascading DB fetch: load batches one at a time, displaying each as it arrives
      let offset = 0;
      let keepFetching = true;
      while (keepFetching) {
        try {
          const response = await fetch(
            `/api/db/fetch-products?limit=${BATCH_SIZE}&offset=${offset}`
          );
          if (!response.ok) break;
          const batch: NostrEvent[] = await response.json();
          if (!batch.length) break;

          for (const event of batch) {
            if (event && event.id) {
              const key = getEventKey(event);
              const existing = dbProductsMap.get(key);
              if (!existing || event.created_at > existing.created_at) {
                dbProductsMap.set(key, event);
              }
              if (event.pubkey) profileSetFromProducts.add(event.pubkey);
            }
          }

          editProductContext(Array.from(dbProductsMap.values()), true);

          if (batch.length < BATCH_SIZE) break;
          offset += BATCH_SIZE;
        } catch (error) {
          console.error("Failed to fetch products batch from database:", error);
          break;
        }
      }

      const filter: Filter = {
        kinds: [30402],
      };

      const zapsnagFilter: Filter = {
        kinds: [1],
        "#t": ["shopstr-zapsnag", "zapsnag"],
      };

      const fetchedEvents = await nostr.fetch(
        [filter, zapsnagFilter],
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

      // Merge relay events on top of the accumulated DB products
      for (const event of fetchedEvents) {
        if (!event || !event.id) continue;
        const key = getEventKey(event);
        const existing = dbProductsMap.get(key);
        if (!existing || event.created_at >= existing.created_at) {
          dbProductsMap.set(key, event);
        }
        profileSetFromProducts.add(event.pubkey);
      }

      const mergedProductArray = Array.from(dbProductsMap.values());

      editProductContext(mergedProductArray, false);

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

async function verifyProfilesNip05(
  profileMap: Map<string, NipProfile | null>,
  concurrency = 8
): Promise<void> {
  const profiles = Array.from(profileMap.values()).filter(
    (profile): profile is NipProfile =>
      profile !== null && !!profile?.content?.nip05
  );

  for (let i = 0; i < profiles.length; i += concurrency) {
    await Promise.all(
      profiles.slice(i, i + concurrency).map(async (profile) => {
        const nip05 = profile.content.nip05!;
        const pubkey: string = profile.pubkey;
        const host = nip05.includes("@") ? nip05.split("@")[1] : undefined;
        try {
          profile.nip05Verified = await verifyNip05Identifier(nip05, pubkey);
        } catch (error) {
          profile.nip05Verified = false;
          console.error("Failed to verify NIP-05 identifier", {
            host,
            pubkey,
            nip05,
            error,
          });
        }
      })
    );
  }
}

export const fetchProfile = async (
  nostr: NostrManager,
  relays: string[],
  pubkeyProfilesToFetch: string[],
  editProfileContext: (
    profileMap: Map<string, NipProfile | null>,
    isLoading: boolean
  ) => void,
  existingProfileMap: Map<string, any> = new Map()
): Promise<{
  profileMap: Map<string, NipProfile | null>;
}> => {
  return new Promise(async function (resolve, reject) {
    try {
      if (!pubkeyProfilesToFetch.length) {
        const preservedProfileMap = new Map(existingProfileMap);
        editProfileContext(preservedProfileMap, false);
        resolve({ profileMap: preservedProfileMap });
        return;
      }

      const mergedProfileMap = new Map(existingProfileMap);
      const updateProfileIfNewer = (profile: any) => {
        if (!profile?.pubkey) return;

        const existingProfile = mergedProfileMap.get(profile.pubkey);
        if (
          !existingProfile ||
          (profile.created_at ?? 0) >= (existingProfile.created_at ?? 0)
        ) {
          mergedProfileMap.set(profile.pubkey, profile);
        }
      };

      const dbProfileMap = new Map<string, NipProfile>();
      try {
        const response = await fetch("/api/db/fetch-profiles");
        if (response.ok) {
          const profilesFromDb = await response.json();
          const latestDbEvents = new Map<string, NostrEvent>();

          for (const event of profilesFromDb) {
            if (
              event.kind === 0 &&
              pubkeyProfilesToFetch.includes(event.pubkey)
            ) {
              const existing = latestDbEvents.get(event.pubkey);
              if (!existing || event.created_at > existing.created_at) {
                latestDbEvents.set(event.pubkey, event);
              }
            }
          }

          for (const [pubkey, event] of latestDbEvents.entries()) {
            try {
              const content = JSON.parse(event.content);
              const profile: NipProfile = {
                pubkey: event.pubkey,
                created_at: event.created_at,
                content,
                nip05Verified: false,
              };
              dbProfileMap.set(pubkey, profile);
              updateProfileIfNewer(profile);
            } catch (error) {
              console.error(
                `Failed to parse profile from DB: ${pubkey}`,
                error
              );
            }
          }

          if (dbProfileMap.size > 0) {
            editProfileContext(new Map(mergedProfileMap), false);
            await verifyProfilesNip05(dbProfileMap);
            editProfileContext(new Map(mergedProfileMap), false);
          }
        }
      } catch (error) {
        console.error("Failed to fetch profiles from database: ", error);
      }

      const subParams: { kinds: number[]; authors?: string[] } = {
        kinds: [0],
        authors: Array.from(pubkeyProfilesToFetch),
      };

      const profileMap: Map<string, NipProfile | null> = new Map(
        Array.from(pubkeyProfilesToFetch).map((pubkey) => [
          pubkey,
          mergedProfileMap.get(pubkey) || dbProfileMap.get(pubkey) || null,
        ])
      );
      const updatedProfiles = new Map<string, NipProfile | null>();

      const fetchedEvents = await nostr.fetch([subParams], {}, relays);

      for (const event of fetchedEvents) {
        if (event.kind !== 0) continue;
        const existing = profileMap.get(event.pubkey);
        if (
          existing === null ||
          !existing ||
          event.created_at > existing.created_at
        ) {
          try {
            const content = JSON.parse(event.content);
            const profile: NipProfile = {
              pubkey: event.pubkey,
              created_at: event.created_at,
              content,
              nip05Verified: false,
            };
            profileMap.set(event.pubkey, profile);
            updatedProfiles.set(event.pubkey, profile);
            updateProfileIfNewer(profile);
          } catch (error) {
            console.error(
              `Failed parse profile for pubkey: ${event.pubkey}, ${event.content}`,
              error
            );
          }
        }
      }

      await verifyProfilesNip05(updatedProfiles);

      // Cache profiles to database via API (reconstruct from fetched events)
      const validProfileEvents = fetchedEvents.filter(
        (e) => e.id && e.sig && e.pubkey && e.kind === 0
      );
      if (validProfileEvents.length > 0) {
        cacheEventsToDatabase(validProfileEvents).catch((error) =>
          console.error("Failed to cache profiles to database:", error)
        );
      }

      editProfileContext(new Map(mergedProfileMap), false);

      resolve({ profileMap: mergedProfileMap });
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

      if (!signer) {
        // The cached-messages endpoint requires a signed proof of pubkey
        // ownership. Without a signer we cannot prove ownership, so skip the
        // cache read entirely instead of issuing a request that is guaranteed
        // to be rejected with 401.
        console.warn(
          "Skipping cached message fetch: no signer available to prove pubkey ownership."
        );
      } else {
        try {
          const signedEvent = await signer.sign(
            buildSignedHttpRequestProofTemplate(
              buildMessagesListProof(userPubkey)
            )
          );
          const response = await fetch(
            `/api/db/fetch-messages?pubkey=${userPubkey}`,
            {
              headers: {
                [SIGNED_EVENT_HEADER]: JSON.stringify(signedEvent),
              },
            }
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
          } else {
            console.error(
              `Failed to fetch messages from database: ${response.status} ${response.statusText}`
            );
          }
        } catch (error) {
          console.error("Failed to fetch messages from database: ", error);
        }
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
            alert(
              `fetchAllOutgoingChats: Failed to get recipientPubkey from tagsMap`
            );
            return;
          }
          const cachedMessage = chatMessagesFromCache.get(event.id);
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
    directFollowList: string[],
    followList: string[],
    firstDegreeFollowsLength: number,
    isLoading: boolean
  ) => void,
  userPubkey?: string
): Promise<{
  directFollowList: string[];
  followList: string[];
  firstDegreeFollowsLength: number;
}> => {
  const wot = getLocalStorageData().wot;
  const defaultAuthor =
    "d36e8083fa7b36daee646cb8b3f99feaa3d89e5a396508741f003e21ac0b6bec";

  const extractValidFollowTags = (
    tags: string[][],
    excluded = new Set<string>()
  ) =>
    tags
      .filter((tag) => tag[0] === "p")
      .map((tag) => tag[1])
      .filter(
        (pubkey) => isHexPubkey(pubkey!) && !excluded.has(pubkey!)
      ) as string[];

  const getLatestEventByAuthor = (events: NostrEvent[]) => {
    const latestByAuthor = new Map<string, NostrEvent>();
    for (const event of events) {
      const existing = latestByAuthor.get(event.pubkey);
      latestByAuthor.set(
        event.pubkey,
        existing ? selectPreferredReplaceableEvent(event, existing) : event
      );
    }
    return latestByAuthor;
  };

  // Load the user's contact list from DB cache for fast initial display
  let dbContactListEvent: NostrEvent | null = null;
  if (userPubkey) {
    try {
      const response = await fetch(
        `/api/db/fetch-contacts?pubkey=${encodeURIComponent(userPubkey)}`
      );
      if (response.ok) {
        const data = await response.json();
        if (data?.contactList) {
          dbContactListEvent = data.contactList as NostrEvent;
          const dbDirectFollows = Array.from(
            new Set(extractValidFollowTags(dbContactListEvent.tags))
          );
          if (dbDirectFollows.length > 0) {
            editFollowsContext(
              dbDirectFollows,
              dbDirectFollows, // WoT list will be expanded after relay fetch
              dbDirectFollows.length,
              true
            );
          }
        }
      }
    } catch (error) {
      console.error("Failed to fetch contact list from database:", error);
    }
  }

  const fetchFollows = async (authorPubkey: string) => {
    // fetch first-degree follows
    const fetchedFirstDegreeEvents = await nostr.fetch(
      [
        {
          kinds: [3],
          authors: [authorPubkey],
        },
      ],
      {},
      relays
    );

    // Merge DB cached event with relay events to pick the latest
    const allFirstDegreeEvents = [...fetchedFirstDegreeEvents];
    if (
      dbContactListEvent &&
      authorPubkey === userPubkey &&
      dbContactListEvent.id
    ) {
      allFirstDegreeEvents.push(dbContactListEvent);
    }

    const latestFirstDegreeEvent = pickPreferredReplaceableEvent(
      allFirstDegreeEvents as NostrEvent[]
    );

    const directFollowList = latestFirstDegreeEvent
      ? Array.from(new Set(extractValidFollowTags(latestFirstDegreeEvent.tags)))
      : [];

    const firstDegreeFollowsLength = directFollowList.length;
    const followsSet: Set<string> = new Set(directFollowList);
    let secondDegreeFollowsArrayFromRelay: string[] = [];

    // Fetch second-degree follows
    if (directFollowList.length > 0) {
      const fetchedSecondDegreeEvents = await nostr.fetch(
        [
          {
            kinds: [3],
            authors: directFollowList,
          },
        ],
        {},
        relays
      );

      for (const followEvent of getLatestEventByAuthor(
        fetchedSecondDegreeEvents as NostrEvent[]
      ).values()) {
        const validFollowTags = extractValidFollowTags(
          followEvent.tags,
          followsSet
        );
        secondDegreeFollowsArrayFromRelay.push(...validFollowTags);
      }
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
    const followsArrayFromRelay = Array.from(
      new Set(directFollowList.concat(secondDegreeFollowsArrayFromRelay))
    );
    return {
      directFollowList,
      followsArrayFromRelay,
      firstDegreeFollowsLength,
    };
  };

  const userFollows = userPubkey
    ? await fetchFollows(userPubkey)
    : {
        directFollowList: [],
        followsArrayFromRelay: [],
        firstDegreeFollowsLength: 0,
      };

  let directFollowList = userFollows.directFollowList;
  let followsArrayFromRelay = userFollows.followsArrayFromRelay;
  let firstDegreeFollowsLength = userFollows.firstDegreeFollowsLength;

  if (!followsArrayFromRelay?.length) {
    const defaultFollows = await fetchFollows(defaultAuthor);
    followsArrayFromRelay = defaultFollows.followsArrayFromRelay;
    if (!userPubkey) {
      firstDegreeFollowsLength = defaultFollows.firstDegreeFollowsLength;
    }
  }

  editFollowsContext(
    directFollowList,
    followsArrayFromRelay,
    firstDegreeFollowsLength,
    false
  );
  return {
    directFollowList,
    followList: followsArrayFromRelay,
    firstDegreeFollowsLength,
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
            try {
              const decrypted = await signer!.decrypt(
                userPubkey,
                event.content
              );
              const walletContent: string[][] = JSON.parse(decrypted);
              walletContent
                .filter((entry) => entry[0] === "mint")
                .forEach((entry) => {
                  if (entry[1] && !cashuMintSet.has(entry[1])) {
                    cashuMintSet.add(entry[1]);
                    cashuMints.push(entry[1]);
                  }
                });
            } catch (error) {
              console.error(
                `Failed to decrypt wallet config event from DB ${event.id}:`,
                error
              );
            }
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
            // Mints are stored in the encrypted content, not in tags
            try {
              const decrypted = await signer!.decrypt(
                userPubkey,
                event.content
              );
              const walletContent: string[][] = JSON.parse(decrypted);
              walletContent
                .filter((entry) => entry[0] === "mint")
                .forEach((entry) => {
                  if (entry[1] && !cashuMintSet.has(entry[1])) {
                    cashuMintSet.add(entry[1]);
                    cashuMints.push(entry[1]);
                  }
                });
            } catch (decryptError) {
              console.error(
                `Failed to decrypt wallet config event ${event.id}:`,
                decryptError
              );
            }
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
          await wallet.loadMint();

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

            // Remove spent proofs (compare by secret, not reference)
            cashuProofs = cashuProofs.filter((proof) => {
              const mintProofIndex = mintProofs.findIndex(
                (mp) => mp.secret === proof.secret
              );
              if (mintProofIndex !== -1) {
                return !spentYs.has(Ys[mintProofIndex]!);
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
          .flatMap((eventTags) =>
            eventTags
              .filter((tag) => tag[0] === "e" && tag[3] === "destroyed")
              .map((tag) => tag[1])
          )
          .filter((eventId) => eventId !== "") as string[];

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
          .filter((eventId) => eventId !== "") as string[];

        // Remove proofs from events that were spent (out direction)
        const destroyedProofs = proofEvents
          .filter((event) => outProofIds.includes(event.id))
          .flatMap((event) => event.proofs);

        cashuProofs = cashuProofs.filter(
          (proof) =>
            !destroyedProofs.some(
              (destroyed: Proof) => destroyed.secret === proof.secret
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
        "#t": ["shopstr"],
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
