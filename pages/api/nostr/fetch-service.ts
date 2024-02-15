import { NostrEvent } from "@/pages/components/utility/nostr-helper-functions";
import { ProductContextInterface } from "@/pages/context";
import { SimplePool, nip19 } from "nostr-tools";
import Dexie from "dexie";

const POSTQUERYLIMIT = 200;

type ItemType = "products" | "profiles" | "chats";

const db = new Dexie("ItemsFetchedFromRelays");

db.version(1).stores({
  products: "id, product", // product: {id, product}
  profiles: "id, profile", // profile: {pubkey, created_at, content}
  chats: "id, messages", // messages: {pubkey, messages: [message1, message2, ...]}
  lastFetchedTime: "itemType, time", // item: {products, profiles, chats} time: timestamp
});

let indexedDBWorking = true;
db.open().catch(function (e) {
  console.error("Open failed: " + e.stack);
  indexedDBWorking = false;
});

const { products, profiles, chats, lastFetchedTime } = db;

/**
 * returns the minutes lapsed since last fetch 60000ms = 1 minute
 */
export const getMinutesSinceLastFetch = async (itemType: ItemType) => {
  let lastFetchTime = await lastFetchedTime.get({ itemType });
  if (!lastFetchTime) lastFetchTime = { itemType, time: 0 };
  let timelapsedInMinutes = (Date.now() - lastFetchTime.time) / 60000;
  return timelapsedInMinutes;
};

export const didXMinutesElapseSinceLastFetch = async (
  itemType: ItemType,
  minutes: number,
) => {
  let timelapsedInMinutes = await getMinutesSinceLastFetch(itemType);
  return timelapsedInMinutes > minutes;
};

const addProductsToCache = async (productsArray: NostrEvent[]) => {
  productsArray.forEach(async (product) => {
    await products.put({ id: product.id, product });
  });
  await lastFetchedTime.put({ itemType: "products", time: Date.now() });
};

const addProfilesToCache = async (profileMap: Map<string, any>) => {
  Array.from(profileMap.entries()).forEach(async ([pubkey, profile]) => {
    if (profile === null) return;
    await profiles.put({ id: pubkey, profile });
  });
  await lastFetchedTime.put({ itemType: "profiles", time: Date.now() });
};

const addChatsToCache = async (chatsMap: Map<string, any>) => {
  Array.from(chatsMap.entries()).forEach(async ([pubkey, chat]) => {
    await chats.put({ id: pubkey, messages: chat });
  });
  await lastFetchedTime.put({ itemType: "chats", time: Date.now() });
};

export const removeProductFromCache = async (productIds: string[]) => {
  await products.bulkDelete(productIds);
};

export const fetchAllProductsFromCache = async () => {
  let productsMap = await products.toArray();
  let productsArray = productsMap.map((product) => product.product);
  return productsArray;
};

export const fetchAllProfilesFromCache = async () => {
  let cache = await profiles.toArray();
  let productMap = new Map();
  cache.forEach(({ id, profile }) => {
    productMap.set(id, profile);
  });
  return productMap;
};
export const fetchAllChatsFromCache = async () => {
  let cache = await chats.toArray();
  let chatsMap = new Map();
  cache.forEach(({ id, messages }) => {
    chatsMap.set(id, messages);
  });
  return chatsMap;
};

export const fetchAllPosts = async (
  relays: string[],
  editProductContext: (productEvents: NostrEvent[], isLoading: boolean) => void,
): Promise<{
  profileSetFromProducts: Set<string>;
}> => {
  return new Promise(async function (resolve, reject) {
    try {
      let deletedProductsInCacheSet: Set<any> = new Set(); // used to remove deleted items from cache
      if (indexedDBWorking) {
        let productArrayFromCache = await fetchAllProductsFromCache();
        deletedProductsInCacheSet = new Set(
          productArrayFromCache.map((product) => product.id),
        );
        editProductContext(productArrayFromCache, false);
      }

      const pool = new SimplePool();
      let subParams: { kinds: number[]; authors?: string[]; limit: number } = {
        kinds: [30402],
        limit: POSTQUERYLIMIT,
      };

      let productArrayFromRelay: NostrEvent[] = [];
      let profileSetFromProducts: Set<string> = new Set();

      let h = pool.subscribeMany(relays, [subParams], {
        onevent(event) {
          productArrayFromRelay.push(event);
          if (
            deletedProductsInCacheSet &&
            event.id in deletedProductsInCacheSet
          ) {
            deletedProductsInCacheSet.delete(event.id);
          }
          products.put({ id: event.id, product: event });
          profileSetFromProducts.add(event.pubkey);
        },
        oneose() {
          h.close();
          returnCall();
        },
      });
      const returnCall = () => {
        resolve({
          profileSetFromProducts,
        });
        editProductContext(productArrayFromRelay, false);
        removeProductFromCache(Array.from(deletedProductsInCacheSet));
      };
    } catch (error) {
      console.log("fetchAllPosts error", error);
      reject(error);
    }
  });
};

export const fetchProfile = async (
  relays: string[],
  pubkeyProfilesToFetch: string[],
): Promise<{
  profileMap: Map<string, any>;
}> => {
  return new Promise(function (resolve, reject) {
    try {
      const pool = new SimplePool();
      let subParams: { kinds: number[]; authors?: string[] } = {
        kinds: [0],
        authors: Array.from(pubkeyProfilesToFetch),
      };

      let profileMap: Map<string, any> = new Map(
        Array.from(pubkeyProfilesToFetch).map((pubkey) => [pubkey, null]),
      );

      let h = pool.subscribeMany(relays, [subParams], {
        onevent(event) {
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
        },
        oneose() {
          h.close();
          resolve({ profileMap });
          addProfilesToCache(profileMap);
        },
      });
    } catch (error) {
      reject(error);
    }
  });
};

export const fetchAllIncomingChats = async (
  relays: string[],
  decryptedNpub: string,
): Promise<{
  chatsMap: Map<string, any>;
}> => {
  return new Promise(function (resolve, reject) {
    try {
      const pool = new SimplePool();
      let subParams: { kinds: number[] } = {
        kinds: [4],
        "#p": [decryptedNpub],
      };

      let chatsMap: Map<string, any> = new Map();

      let h = pool.subscribeMany(relays, [subParams], {
        onevent(event) {
          // console.log("incoming chat event: ", event);
          let incomingPubkey = event.pubkey;
          if (!chatsMap.has(incomingPubkey))
            chatsMap.set(incomingPubkey, [event]);
          else {
            chatsMap.get(incomingPubkey).push(event);
          }
        },
        oneose() {
          h.close();
          resolve({ chatsMap });
        },
      });
    } catch (error) {
      console.error("Failed to fetchAllIncomingChats", error);
    }
  });
};

export const fetchAllOutgoingChats = async (
  relays: string[],
  decryptedNpub: string,
): Promise<{
  chatsMap: Map<string, any>;
}> => {
  return new Promise(function (resolve, reject) {
    try {
      const pool = new SimplePool();
      let subParams: { kinds: number[]; authors: string[] } = {
        kinds: [4],
        authors: [decryptedNpub],
      };

      let chatsMap: Map<string, any> = new Map();

      let h = pool.subscribeMany(relays, [subParams], {
        onevent(event: NostrEvent) {
          // console.log("outgoing chat event: ", event);
          let tagsMap: Map<string, string> = new Map(event.tags);
          let receipientPubkey = tagsMap.get("p") ? tagsMap.get("p") : null; // pubkey you sent the message to
          if (typeof receipientPubkey !== "string")
            throw new Error(
              `fetchAllOutgoingChats: Failed to get receipientPubkey from tagsMap",
              ${tagsMap},
              ${event}`,
            );
          if (!chatsMap.has(receipientPubkey))
            chatsMap.set(receipientPubkey, [event]);
          else {
            chatsMap.get(receipientPubkey).push(event);
          }
        },
        oneose() {
          h.close();
          resolve({ chatsMap });
        },
      });
    } catch (error) {
      console.error("Failed to fetchAllOutgoingChats", error);
    }
  });
};

export const fetchChatsAndMessages = async (
  relays: string[],
  decryptedNpub: string,
): Promise<{
  chatsMap: Map<string, any>;
  profileSetFromChats: Set<string>;
}> => {
  return new Promise(async function (resolve, reject) {
    try {
      const incomingChats = await fetchAllIncomingChats(relays, decryptedNpub);
      const outgoingChats = await fetchAllOutgoingChats(relays, decryptedNpub);
      let chatsMap = new Map();
      let profileSetFromChats: Set<string> = new Set();
      incomingChats.chatsMap.forEach((value, key) => {
        chatsMap.set(key, value);
        profileSetFromChats.add(key);
      });
      outgoingChats.chatsMap.forEach((value, key) => {
        profileSetFromChats.add(key);
        if (chatsMap.has(key)) {
          chatsMap.get(key).push(...value);
        } else {
          chatsMap.set(key, value);
        }
      });

      //sort chats by created_at
      chatsMap.forEach((value, key) => {
        value.sort((a, b) => a.created_at - b.created_at);
      });

      resolve({ chatsMap, profileSetFromChats });
      await addChatsToCache(chatsMap);
    } catch (error) {
      console.log("Failed to fetchChatsAndMessages: ", error);
      alert("Failed to fetchChatsAndMessages: " + error);
      throw new Error("Failed to fetchChatsAndMessages: " + error);
    }
  });
};
