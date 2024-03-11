<<<<<<< HEAD
import { Filter, Nostr, Relay, SimplePool } from "nostr-tools";
=======
import { Filter, SimplePool } from "nostr-tools";
>>>>>>> af23432 (updates)
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
<<<<<<< HEAD
import { getLocalStorageData } from "@/components/utility/nostr-helper-functions";

function isHexString(value: string): boolean {
  return /^[0-9a-fA-F]{64}$/.test(value);
}
=======
import { getNameToCodeMap } from "@/utils/location/location";
import parseTags, {
  ProductData,
} from "@/components/utility/product-parser-functions";
import { getKeywords } from "@/utils/text";
>>>>>>> af23432 (updates)

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
        console.log("Failed to fetch all listings from cache: ", error);
      }

      const pool = new SimplePool();

      if (!since) {
        since = Math.trunc(DateTime.now().minus({ days: 14 }).toSeconds());
      }
      if (!until) {
        until = Math.trunc(DateTime.now().toSeconds());
      }

      const filter: Filter = {
        kinds: [30402],
        since,
        until,
        // No relays support NIP-50 for 30402 kinds, yet...
        // ...(filters.searchQuery.length > 0 && {
        //   search: filters.searchQuery,
        // }),
        ...(filters.searchQuery.length > 0 && {
          "#s": getKeywords(filters.searchQuery),
        }),
        ...(filters.location && {
          "#g": [getNameToCodeMap(filters.location)],
        }),
        ...(filters.categories.size > 0 && {
          "#t": Array.from(filters.categories),
        }),
      };

      let productArrayFromRelay: NostrEvent[] = [];
      let profileSetFromProducts: Set<string> = new Set();

      let h = pool.subscribeMany(relays, [filter], {
        onevent(event) {
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
      console.log("Failed to fetch all listings from relays: ", error);
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
<<<<<<< HEAD
      try {
        let profileData = await fetchProfileDataFromCache();
        editProfileContext(profileData, false);
      } catch (error) {
        console.log("Failed to fetch profiles: ", error);
      }
=======
      let profileData = await fetchProfileDataFromCache();
>>>>>>> af23432 (updates)

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
      console.log("Failed to fetch chats and messages: ", error);
    }
  });
};

export const fetchAllFollows = async (
  relays: string[],
  editFollowsContext: (
    followList: string[],
    firstDegreeFollowsLength: number,
    isLoading: boolean,
  ) => void,
): Promise<{
  followList: string[];
}> => {
  return new Promise(async function (resolve, reject) {
    const wot = getLocalStorageData().wot;
    try {
      const pool = new SimplePool();

      let followsArrayFromRelay: string[] = [];
      const followsSet: Set<string> = new Set();
      let firstDegreeFollowsLength = 0;

      const firstFollowfilter: Filter = {
        kinds: [3],
        authors: [getLocalStorageData().userPubkey],
      };

      let first = pool.subscribeMany(relays, [firstFollowfilter], {
        onevent(event) {
          const validTags = event.tags
            .map((tag) => tag[1])
            .filter((pubkey) => isHexString(pubkey) && !followsSet.has(pubkey));
          validTags.forEach((pubkey) => followsSet.add(pubkey));
          followsArrayFromRelay.push(...validTags);

          firstDegreeFollowsLength = followsArrayFromRelay.length;

          const secondFollowFilter: Filter = {
            kinds: [3],
            authors: followsArrayFromRelay,
          };

          let secondDegreeFollowsArrayFromRelay: string[] = [];

          let second = pool.subscribeMany(relays, [secondFollowFilter], {
            onevent(followEvent) {
              const validFollowTags = followEvent.tags
                .map((tag) => tag[1])
                .filter(
                  (pubkey) => isHexString(pubkey) && !followsSet.has(pubkey),
                );
              secondDegreeFollowsArrayFromRelay.push(...validFollowTags);
            },
            oneose() {
              second.close();
              const pubkeyCount: Map<string, number> = new Map();
              secondDegreeFollowsArrayFromRelay.forEach((pubkey) => {
                pubkeyCount.set(pubkey, (pubkeyCount.get(pubkey) || 0) + 1);
              });
              secondDegreeFollowsArrayFromRelay =
                secondDegreeFollowsArrayFromRelay.filter(
                  (pubkey) => (pubkeyCount.get(pubkey) || 0) >= wot,
                );
              followsArrayFromRelay.push(...secondDegreeFollowsArrayFromRelay);
            },
          });
        },
        oneose() {
          first.close();
          returnCall(
            relays,
            followsArrayFromRelay,
            followsSet,
            firstDegreeFollowsLength,
          );
        },
      });
      const returnCall = async (
        relays: string[],
        followsArray: string[],
        followsSet: Set<string>,
        firstDegreeFollowsLength: number,
      ) => {
        // If followsArrayFromRelay is still empty, add the default value
        if (followsArray.length === 0) {
          const firstFollowfilter: Filter = {
            kinds: [3],
            authors: [
              "d36e8083fa7b36daee646cb8b3f99feaa3d89e5a396508741f003e21ac0b6bec",
            ],
          };

          let first = pool.subscribeMany(relays, [firstFollowfilter], {
            onevent(event) {
              const validTags = event.tags
                .map((tag) => tag[1])
                .filter(
                  (pubkey) => isHexString(pubkey) && !followsSet.has(pubkey),
                );
              validTags.forEach((pubkey) => followsSet.add(pubkey));
              followsArray.push(...validTags);

              firstDegreeFollowsLength = followsArray.length;

              const secondFollowFilter: Filter = {
                kinds: [3],
                authors: followsArray,
              };

              let secondDegreeFollowsArray: string[] = [];

              let second = pool.subscribeMany(relays, [secondFollowFilter], {
                onevent(followEvent) {
                  const validFollowTags = followEvent.tags
                    .map((tag) => tag[1])
                    .filter(
                      (pubkey) =>
                        isHexString(pubkey) && !followsSet.has(pubkey),
                    );
                  secondDegreeFollowsArray.push(...validFollowTags);
                },
                oneose() {
                  second.close();
                  const pubkeyCount: Map<string, number> = new Map();
                  secondDegreeFollowsArray.forEach((pubkey) => {
                    pubkeyCount.set(pubkey, (pubkeyCount.get(pubkey) || 0) + 1);
                  });
                  secondDegreeFollowsArray = secondDegreeFollowsArray.filter(
                    (pubkey) => (pubkeyCount.get(pubkey) || 0) >= wot,
                  );
                  followsArray.push(...secondDegreeFollowsArray);
                },
              });
            },
            oneose() {
              first.close();
            },
          });
        }
        resolve({
          followList: followsArrayFromRelay,
        });
        editFollowsContext(
          followsArrayFromRelay,
          firstDegreeFollowsLength,
          false,
        );
      };
    } catch (error) {
      console.log("failed to fetch follow list: ", error);
      reject(error);
    }
  });
};
