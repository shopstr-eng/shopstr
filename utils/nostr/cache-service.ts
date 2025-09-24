import {
  NostrEvent,
  ItemType,
  NostrMessageEvent,
  Community,
} from "../types/types";
import Dexie, { Table } from "dexie";

export let db: ItemsFetchedFromRelays | null = null;
let indexedDBWorking = false;

// In-memory fallback storage
const inMemoryStorage = {
  products: new Map<string, NostrEvent>(),
  profiles: new Map<string, any>(),
  chatMessages: new Map<string, NostrMessageEvent>(),
  lastFetchedTime: new Map<string, number>(),
  communities: new Map<string, Community>(),
};

class ItemsFetchedFromRelays extends Dexie {
  public products!: Table<{ id: string; product: NostrEvent }>;
  public profiles!: Table<{ id: string; profile: Record<string, unknown> }>;
  public chatMessages!: Table<{ id: string; message: NostrMessageEvent }>;
  public communities!: Table<{ id: string; community: Community }>;
  public lastFetchedTime!: Table<{ itemType: string; time: number }>;

  public constructor() {
    super("ItemsFetchedFromRelays");
    this.version(32)
      .stores({
        products: "id, product",
        profiles: "id, profile",
        chatMessages: "id, message",
        communities: "id, community",
        lastFetchedTime: "itemType, time",
      })
      .upgrade((_tx) => {
        // placeholder for future migration logic
      });
  }
}

// Initialize database or fallback storage
if (typeof indexedDB !== "undefined") {
  try {
    db = new ItemsFetchedFromRelays();
    db.open()
      .then(() => {
        indexedDBWorking = true;
      })
      .catch((e) => {
        console.error("IndexDB Open failed: " + e.stack);
      });
  } catch (error) {
    console.error("Error initializing IndexedDB:", error);
  }
} else {
  console.warn(
    "IndexedDB is not available. Using in-memory storage as fallback."
  );
}

export const getMinutesSinceLastFetch = async (
  itemType: ItemType
): Promise<number> => {
  try {
    let lastFetchTime: number | { itemType: string; time: number } | undefined;
    if (indexedDBWorking && db) {
      lastFetchTime = await db.lastFetchedTime.get({ itemType });
    } else {
      lastFetchTime = inMemoryStorage.lastFetchedTime.get(itemType);
    }

    let lastFetchTimeValue: number;
    if (!lastFetchTime) {
      lastFetchTimeValue = 0;
    } else if (typeof lastFetchTime === "number") {
      lastFetchTimeValue = lastFetchTime;
    } else {
      lastFetchTimeValue = lastFetchTime.time;
    }

    return (Date.now() - lastFetchTimeValue) / 60000;
  } catch (error) {
    console.error("Error getting minutes since last fetch:", error);
    return 0;
  }
};

export const didXMinutesElapseSinceLastFetch = async (
  itemType: ItemType,
  minutes: number
): Promise<boolean> => {
  const timelapsedInMinutes = await getMinutesSinceLastFetch(itemType);
  return timelapsedInMinutes > minutes;
};

export const addProductToCache = async (product: NostrEvent): Promise<void> => {
  try {
    if (indexedDBWorking && db) {
      await db.products.put({ id: product.id, product });
    } else {
      inMemoryStorage.products.set(product.id, product);
    }
  } catch (error) {
    console.error("Error adding product to cache:", error);
  }
};

export const addProductsToCache = async (
  productsArray: NostrEvent[]
): Promise<void> => {
  try {
    for (const product of productsArray) {
      await addProductToCache(product);
    }
    await updateLastFetchedTime("products");
  } catch (error) {
    console.error("Error adding products to cache:", error);
  }
};

export const addProfilesToCache = async (
  profileMap: Map<string, any>
): Promise<void> => {
  try {
    for (const [pubkey, profile] of profileMap.entries()) {
      if (profile === null) continue;
      if (indexedDBWorking && db) {
        await db.profiles.put({ id: pubkey, profile });
      } else {
        inMemoryStorage.profiles.set(pubkey, profile);
      }
    }
    await updateLastFetchedTime("profiles");
  } catch (error) {
    console.error("Error adding profiles to cache:", error);
  }
};

export const addChatMessageToCache = async (
  chat: NostrMessageEvent
): Promise<void> => {
  try {
    if (indexedDBWorking && db) {
      await db.chatMessages.put({ id: chat.id, message: chat });
    } else {
      inMemoryStorage.chatMessages.set(chat.id, chat);
    }
  } catch (error) {
    console.error("Error adding chat message to cache:", error);
  }
};

export const addChatMessagesToCache = async (
  chats: NostrMessageEvent[]
): Promise<void> => {
  try {
    for (const chat of chats) {
      await addChatMessageToCache(chat);
    }
  } catch (error) {
    console.error("Error adding chat messages to cache:", error);
  }
};

export const addCommunityToCache = async (
  community: Community
): Promise<void> => {
  try {
    if (indexedDBWorking && db) {
      await db.communities.put({ id: community.id, community });
    } else {
      inMemoryStorage.communities.set(community.id, community);
    }
  } catch (error) {
    console.error("Error adding community to cache:", error);
  }
};

export const addCommunitiesToCache = async (
  communities: Community[]
): Promise<void> => {
  for (const community of communities) {
    await addCommunityToCache(community);
  }
  await updateLastFetchedTime("communities");
};

export const removeProductFromCache = async (
  productIds: string[]
): Promise<void> => {
  try {
    if (indexedDBWorking && db) {
      await db.products.bulkDelete(productIds);
    } else {
      for (const id of productIds) {
        inMemoryStorage.products.delete(id);
      }
    }
  } catch (error) {
    console.error("Error removing products from cache:", error);
  }
};

export const fetchAllProductsFromCache = async (): Promise<NostrEvent[]> => {
  try {
    if (indexedDBWorking && db) {
      const productsFromCache = await db.products.toArray();
      return productsFromCache.map(({ product }) => product);
    } else {
      return Array.from(inMemoryStorage.products.values());
    }
  } catch (error) {
    console.error("Error fetching products from cache:", error);
    return [];
  }
};

export const fetchProfileDataFromCache = async (): Promise<
  Map<string, any>
> => {
  try {
    if (indexedDBWorking && db) {
      const cache = await db.profiles.toArray();
      return new Map(cache.map(({ id, profile }) => [id, profile]));
    } else {
      return new Map(inMemoryStorage.profiles);
    }
  } catch (error) {
    console.error("Error fetching profile data from cache:", error);
    return new Map();
  }
};

export const fetchAllChatsFromCache = async (): Promise<
  Map<string, NostrMessageEvent>
> => {
  try {
    if (indexedDBWorking && db) {
      const cache = await db.chatMessages.toArray();
      return new Map(cache.map(({ id, message }) => [id, message]));
    } else {
      return new Map(inMemoryStorage.chatMessages);
    }
  } catch (error) {
    console.error("Error fetching all chats from cache:", error);
    return new Map();
  }
};

export const fetchAllCommunitiesFromCache = async (): Promise<Community[]> => {
  try {
    if (indexedDBWorking && db) {
      const communitiesFromCache = await db.communities.toArray();
      return communitiesFromCache.map(({ community }) => community);
    } else {
      return Array.from(inMemoryStorage.communities.values());
    }
  } catch (error) {
    console.error("Error fetching communities from cache:", error);
    return [];
  }
};

export const fetchChatMessagesFromCache = async (): Promise<
  Map<string, NostrMessageEvent>
> => {
  return fetchAllChatsFromCache();
};

const updateLastFetchedTime = async (itemType: string): Promise<void> => {
  try {
    const time = Date.now();
    if (indexedDBWorking && db) {
      await db.lastFetchedTime.put({ itemType, time });
    } else {
      inMemoryStorage.lastFetchedTime.set(itemType, time);
    }
  } catch (error) {
    console.error("Error updating last fetched time:", error);
  }
};
