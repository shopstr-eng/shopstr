import { NostrEvent } from "../../types";
import Dexie from "dexie";
import { ItemType, NostrMessageEvent } from "../../types";

export const db = new Dexie("ItemsFetchedFromRelays");

db.version(2).stores({
  products: "id, product", // product: {id, product}
  profiles: "id, profile", // profile: {pubkey, created_at, content}
  chatMessages: "id, message", // message: NostrEvent
  lastFetchedTime: "itemType, time", // item: {products, profiles, chats} time: timestamp
});

let indexedDBWorking = true;

db.open().catch(function (e) {
  console.error("IndexDB Open failed: " + e.stack);
  indexedDBWorking = false;
});

const { products, profiles, chatMessages, lastFetchedTime } = db;

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

export const addChatMessageToCache = async (chat: NostrMessageEvent) => {
  await chatMessages.put({ id: chat.id, message: chat });
};

export const addChatMessagesToCache = async (chats: NostrMessageEvent[]) => {
  chats.forEach(async (chat) => {
    await addChatMessageToCache(chat);
  });
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
  let cache = await chatMessages.toArray();
  let chatsMap = new Map();
  cache.forEach(({ id, messages }) => {
    chatsMap.set(id, messages);
  });
  return chatsMap;
};

export const fetchChatMessagesFromCache = async (): Promise<
  Map<string, NostrMessageEvent>
> => {
  let chatMessagesFromCache = await chatMessages.toArray();
  let chatMessagesMap = new Map();
  chatMessagesFromCache.forEach(
    ({ id, message }: { id: string; message: NostrMessageEvent }) => {
      chatMessagesMap.set(id, message);
    },
  );
  return chatMessagesMap;
};
