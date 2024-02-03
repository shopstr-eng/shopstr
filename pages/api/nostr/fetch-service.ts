import { NostrEvent } from "@/pages/components/utility/nostr-helper-functions";
import { ProductContextInterface } from "@/pages/context";
import { SimplePool } from "nostr-tools";

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
