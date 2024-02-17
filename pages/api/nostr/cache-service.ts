import { NostrEvent } from "../../types";
import Dexie from "dexie";
import { ItemType } from "../../types";

const db = new Dexie("ItemsFetchedFromRelays");

db.version(1).stores({
  products: "id, product", // product: {id, product}
  profiles: "id, profile", // profile: {pubkey, created_at, content}
  chats: "id, messages", // messages: {pubkey, messages: [message1, message2, ...]}
  lastFetchedTime: "itemType, time", // item: {products, profiles, chats} time: timestamp
});

let indexedDBWorking = true;

db.open().catch(function (e) {
  console.error("IndexDB Open failed: " + e.stack);
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

export const addProductToCache = async (product: NostrEvent) => {
  await products.put({ id: product.id, product });
};

export const addProductsToCache = async (productsArray: NostrEvent[]) => {
  productsArray.forEach(async (product) => {
    await addProductToCache(product);
  });
  await lastFetchedTime.put({ itemType: "products", time: Date.now() });
};

export const addProfilesToCache = async (profileMap: Map<string, any>) => {
  Array.from(profileMap.entries()).forEach(async ([pubkey, profile]) => {
    if (profile === null) return;
    await profiles.put({ id: pubkey, profile });
  });
  await lastFetchedTime.put({ itemType: "profiles", time: Date.now() });
};

export const addChatsToCache = async (chatsMap: Map<string, any>) => {
  Array.from(chatsMap.entries()).forEach(async ([pubkey, chat]) => {
    await chats.put({ id: pubkey, messages: chat });
  });
  await lastFetchedTime.put({ itemType: "chats", time: Date.now() });
};

export const removeProductFromCache = async (productIds: string[]) => {
  await products.bulkDelete(productIds);
};

export const fetchAllProductsFromCache = async () => {
  let productsFromCache = await products.toArray();
  let productsArray = productsFromCache.map(
    (productFromCache: { id: string; product: NostrEvent }) =>
      productFromCache.product,
  );
  return productsArray;
};

export const fetchProfileDataFromCache = async () => {
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
