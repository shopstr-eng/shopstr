import { NostrEvent } from "@/pages/components/utility/nostr-helper-functions";
import { ProductContextInterface } from "@/pages/context";
import { SimplePool, nip19 } from "nostr-tools";

const POSTQUERYLIMIT = 200;

export const fetchAllPosts = async (
  relays: string[],
  setProductContext: (value: ProductContextInterface) => void,
): Promise<{ productsWebsocketSub: SubCloser; profileArray: string[] }> => {
  return new Promise(function (resolve, reject) {
    try {
      const pool = new SimplePool();
      let subParams: { kinds: number[]; authors?: string[]; limit: number } = {
        kinds: [30402],
        limit: POSTQUERYLIMIT,
      };

      let productArray: NostrEvent[] = [];
      let profileSet: Set<string> = new Set();

      let h = pool.subscribeMany(relays, [subParams], {
        onevent(event) {
          productArray.push(event);
          profileSet.add(event.pubkey);
        },
        oneose() {
          setProductContext({
            productEvents: productArray,
            isLoading: false,
          });
          returnCall();
        },
      });
      const returnCall = () => {
        resolve({
          productsWebsocketSub: h,
          profileArray: Array.from(profileSet),
        });
      };
    } catch (error) {
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
          console.log("incoming chat event: ", event);
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
          console.log("outgoing chat event: ", event);
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
}> => {
  return new Promise(async function (resolve, reject) {
    try {
      const incomingChats = await fetchAllIncomingChats(relays, decryptedNpub);
      const outgoingChats = await fetchAllOutgoingChats(relays, decryptedNpub);
      let chatsMap = new Map();
      incomingChats.chatsMap.forEach((value, key) => {
        chatsMap.set(key, value);
      });
      outgoingChats.chatsMap.forEach((value, key) => {
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

      resolve({ chatsMap });
    } catch (error) {
      reject(error);
    }
  });
};
