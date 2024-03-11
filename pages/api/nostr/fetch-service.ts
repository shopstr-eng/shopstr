import { Filter, SimplePool } from "nostr-tools";
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
  ProfileData,
} from "@/utils/types/types";
import { ChatsMap, ProductContextInterface } from "@/utils/context/context";
import { DateTime } from "luxon";
import { getNameToCodeMap } from "@/utils/location/location";
import parseTags, {
  ProductData,
} from "@/components/utility/product-parser-functions";
import keyword_extractor from "keyword-extractor";
import { getKeywords } from "@/utils/text";

export const fetchAllPosts = async (
  relays: string[],
  filters: ProductContextInterface["filters"],
  since?: number,
  until?: number,
): Promise<{
  profileSetFromProducts: Set<string>;
  productArrayFromRelay: NostrEvent[];
}> => {
  return new Promise(async function (resolve, reject) {
    try {
      let deletedProductsInCacheSet: Set<string> = new Set(); // used to remove deleted items from cache
      try {
        let productArrayFromCache = await fetchAllProductsFromCache();
        deletedProductsInCacheSet = new Set(
          productArrayFromCache.map((product: ProductData) => product.id),
        );
      } catch (error) {
        console.log("Error: ", error);
      }

      const pool = new SimplePool();

      if (!since) {
        since = Math.trunc(DateTime.now().minus({ days: 14 }).toSeconds());
      }
      if (!until) {
        until = Math.trunc(DateTime.now().toSeconds());
      }

      const buildTagsFilters: string[] = [];
      if (filters.categories.size > 0) {
        buildTagsFilters.push(...Array.from(filters.categories));
      }
      if (filters.searchQuery.length > 0) {
        buildTagsFilters.push(
          ...getKeywords(filters.searchQuery),
        );
      }
      const filter: Filter = {
        kinds: [30402],
        since,
        until,
        // No relays support NIP-50 for 30402 kinds, yet...
        // ...(filters.searchQuery.length > 0 && {
        //   search: filters.searchQuery,
        // }),
        ...(filters.location && {
          "#g": [getNameToCodeMap(filters.location)],
        }),
        ...(buildTagsFilters.length > 0 && {
          "#t": buildTagsFilters,
        }),
      };

      let productArrayFromRelay: NostrEvent[] = [];
      let profileSetFromProducts: Set<string> = new Set();

      console.log(relays);
      console.log(filters);
      let h = pool.subscribeMany(relays, [filter], {
        onevent(event) {
          console.log(event);
          productArrayFromRelay.push(event);
          if (
            deletedProductsInCacheSet &&
            event.id in deletedProductsInCacheSet
          ) {
            deletedProductsInCacheSet.delete(event.id);
          }
          addProductToCache(parseTags(event));
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
          productArrayFromRelay,
        });
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
  profileData: Map<string, ProfileData>;
}> => {
  return new Promise(async function (resolve, reject) {
    try {
      let profileData = await fetchProfileDataFromCache();

      const pool = new SimplePool();
      let subParams: { kinds: number[]; authors?: string[] } = {
        kinds: [0],
        authors: Array.from(pubkeyProfilesToFetch),
      };

      let h = pool.subscribeMany(relays, [subParams], {
        onevent(event) {
          if (
            !profileData.has(event.pubkey) ||
            (profileData.get(event.pubkey) as ProfileData).created_at >
              event.created_at
          ) {
            // update only if the profile is not already set or the new event is newer
            try {
              const content = JSON.parse(event.content);
              profileData.set(event.pubkey, {
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
          resolve({ profileData });
          addProfilesToCache(profileData);
        },
      });
    } catch (error) {
      reject(error);
    }
  });
};

export const fetchChatsAndMessages = async (
  relays: string[],
  userPubkey: string,
): Promise<{
  profileSetFromChats: Set<string>;
  chatsData: ChatsMap;
}> => {
  return new Promise(async function (resolve, reject) {
    // if no userPubkey, user is not signed in
    if (!userPubkey) {
      resolve({ profileSetFromChats: new Set(), chatsData: new Map() });
    }
    let chatMessagesFromCache: Map<string, NostrMessageEvent> =
      await fetchChatMessagesFromCache();
    try {
      let chatsMap = new Map();
      let incomingChatsReachedEOSE = false;
      let outgoingChatsReachedEOSE = false;

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

      const onEOSE = () => {
        if (incomingChatsReachedEOSE && outgoingChatsReachedEOSE) {
          //sort chats by created_at
          chatsMap.forEach((value, key) => {
            value.sort(
              (a: NostrMessageEvent, b: NostrMessageEvent) =>
                a.created_at - b.created_at,
            );
          });
          resolve({
            profileSetFromChats: new Set(chatsMap.keys()),
            chatsData: chatsMap,
          });
        }
      };

      new SimplePool().subscribeMany(
        relays,
        [
          {
            kinds: [4],
            authors: [userPubkey], // all chats where you are the author
          },
        ],
        {
          onevent(event: NostrEvent) {
            let tagsMap: Map<string, string> = new Map(
              event.tags.map(([k, v]) => [k, v]),
            );
            let receipientPubkey = tagsMap.get("p") ? tagsMap.get("p") : null; // pubkey you sent the message to
            if (typeof receipientPubkey !== "string") {
              console.error(
                `fetchAllOutgoingChats: Failed to get receipientPubkey from tagsMap",
                    ${tagsMap},
                    ${event}`,
              );
              alert(
                `fetchAllOutgoingChats: Failed to get receipientPubkey from tagsMap`,
              );
              return;
            }
            let chatMessage = chatMessagesFromCache.get(event.id);
            if (!chatMessage) {
              chatMessage = { ...event, read: true }; // true because the user sent it himself
              addChatMessageToCache(chatMessage);
            }
            addToChatsMap(receipientPubkey, chatMessage);
            if (incomingChatsReachedEOSE && outgoingChatsReachedEOSE) {
              resolve({
                profileSetFromChats: new Set(chatsMap.keys()),
                chatsData: chatsMap,
              });
            }
          },
          oneose() {
            incomingChatsReachedEOSE = true;
            onEOSE();
          },
          onclose(reasons) {
            console.log(reasons);
          },
        },
      );
      new SimplePool().subscribeMany(
        relays,
        [
          {
            kinds: [4],
            "#p": [userPubkey], // all chats where you are the receipient
          },
        ],
        {
          async onevent(event) {
            let senderPubkey = event.pubkey;
            let chatMessage = chatMessagesFromCache.get(event.id);
            if (!chatMessage) {
              chatMessage = { ...event, read: false }; // false because the user received it and it wasn't in the cache
              addChatMessageToCache(chatMessage);
            }
            addToChatsMap(senderPubkey, chatMessage);
            if (incomingChatsReachedEOSE && outgoingChatsReachedEOSE) {
              resolve({
                profileSetFromChats: new Set(chatsMap.keys()),
                chatsData: chatsMap,
              });
            }
          },
          async oneose() {
            outgoingChatsReachedEOSE = true;
            onEOSE();
          },
          onclose(reasons) {
            console.log(reasons);
          },
        },
      );
    } catch (error) {
      console.log("Failed to fetchChatsAndMessages: ", error);
      alert("Failed to fetchChatsAndMessages: " + error);
      throw new Error("Failed to fetchChatsAndMessages: " + error);
    }
  });
};
