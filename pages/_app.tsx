import "tailwindcss/tailwind.css";
import type { AppProps } from "next/app";
import "../styles/globals.css";
import Navbar from "./components/navbar";
import { useState, useEffect } from "react";
import { useRouter } from "next/router";
import { SimplePool, nip19 } from "nostr-tools";
import {
  ProfileMapContext,
  ProfileContextInterface,
  ProductContext,
  ProductContextInterface,
  ChatContext,
  ChatContextInterface,
  MessageContext,
  MessageContextInterface,
} from "./context";
import {
  decryptNpub,
  NostrEvent,
} from "./components/utility/nostr-helper-functions";
import { NextUIProvider } from "@nextui-org/react";
import { ThemeProvider as NextThemesProvider } from "next-themes";
import { CashuMint, CashuWallet } from "@cashu/cashu-ts";

function App({ Component, pageProps }: AppProps) {
  const router = useRouter();
  const isSignInPage = router.pathname === "/sign-in";
  const isKeyPage = router.pathname === "/keys";
  const [relays, setRelays] = useState([]);
  const [profileMap, setProfileMap] = useState(new Map());
  const [pubkeyProfilesToFetch, setPubkeyProfilesToFetch] = useState<
    Set<string>
  >(new Set());
  const [productContext, setProductContext] = useState<ProductContextInterface>(
    {
      productEvents: [],
      isLoading: true,
    },
  );
  const [profileContext, setProfileContext] = useState<ProfileContextInterface>(
    {
      profileData: new Map(),
      addPubkeyToFetch: (pubkeys: [string]) => {
        setPubkeyProfilesToFetch((pubkeyProfilesToFetch) => {
          let newPubkeyProfilesToFetch = new Set(pubkeyProfilesToFetch);
          pubkeys.forEach((pubkey) => {
            newPubkeyProfilesToFetch.add(pubkey);
          });
          return newPubkeyProfilesToFetch;
        });
      },
    },
  );
  const [chatContext, setChatContext] = useState<ChatContextInterface>({
    chatPubkeys: [],
    isLoading: true,
  });
  const [messageContext, setMessageContext] = useState<MessageContextInterface>(
    {
      messages: [],
      isLoading: true,
    },
  );

  useEffect(() => {
    // Perform localStorage action
    if (window !== undefined) {
      const storedRelays = localStorage.getItem("relays");
      if (storedRelays !== null) {
        const parsedRelays = JSON.parse(storedRelays as string);
        // Filter out any null values from the parsed relays
        const filteredRelays = parsedRelays.filter(
          (relay: string | null) => relay !== null,
        );
        setRelays(filteredRelays);
        localStorage.setItem("relays", JSON.stringify(filteredRelays));
      } else {
        const defaultRelays = [
          "wss://relay.damus.io",
          "wss://nos.lol",
          "wss://nostr.mutinywallet.com",
        ];
        localStorage.setItem("relays", JSON.stringify(defaultRelays));
        setRelays(defaultRelays);
      }
      const storedMints = localStorage.getItem("mints");
      if (storedMints === null) {
        const defaultMint = [
          "https://legend.lnbits.com/cashu/api/v1/4gr9Xcmz3XEkUNwiBiQGoC",
        ];
        localStorage.setItem("mints", JSON.stringify(defaultMint));
      }
      setPubkeyProfilesToFetch(
        new Set(
          typeof localStorage.getItem("npub") == "string"
            ? [decryptNpub(localStorage.getItem("npub") as string)]
            : [],
        ) as Set<string>,
      ); // fetches your profile if you are logged in
    }
  }, []);

  /** FETCH ALL PRODUCTS **/
  useEffect(() => {
    const pool = new SimplePool();
    let subParams: { kinds: number[]; authors?: string[] } = {
      kinds: [30402],
    };

    let productArray: NostrEvent[] = [];

    let h = pool.subscribeMany(relays, [subParams], {
      onevent(event) {
        setProductContext((productContext) => {
          productArray.push(event);
          setPubkeyProfilesToFetch((pubkeyProfilesToFetch) => {
            let newPubkeyProfilesToFetch = new Set(pubkeyProfilesToFetch);
            newPubkeyProfilesToFetch.add(event.pubkey);
            return newPubkeyProfilesToFetch;
          });
          return {
            productEvents: productArray,
            isLoading: productContext.isLoading,
          };
        });
      },
      oneose() {
        setProductContext((productContext) => {
          return {
            productEvents: productContext.productEvents,
            isLoading: false,
          };
        });
        // h.close();
      },
    });
  }, [relays]);

  /** FETCH ALL PROFILES AFTER FETCH PRODUCTS DONE AND FOR EVERY NEW PRODUCT EVENT **/
  useEffect(() => {
    if (productContext.isLoading) return;
    const pool = new SimplePool();
    let profileSubParams: { kinds: number[]; authors?: string[] } = {
      kinds: [0],
      authors: Array.from(pubkeyProfilesToFetch),
    };

    let h = pool.subscribeMany(relays, [profileSubParams], {
      onevent(event) {
        setProfileMap((profileMap) => {
          if (
            profileMap.has(event.pubkey) &&
            profileMap.get(event.pubkey).created_at > event.created_at
          ) {
            // if profile already exists and is newer than the one we just fetched, don't update
            return profileMap;
          }
          let newProfileMap = new Map(profileMap);
          try {
            // Try to parse the content of the event
            const content = JSON.parse(event.content);
            newProfileMap.set(event.pubkey, {
              pubkey: event.pubkey,
              created_at: event.created_at,
              content: content,
            });
          } catch (error) {
            // If JSON.parse fails, simply skip setting this event
            console.error(
              `Failed to parse profile data for pubkey: ${event.pubkey}`,
              error,
            );
          }
          // Return the updated or unchanged map
          return newProfileMap;
        });
      },
      // oneose() {
      //   h.close();
      // },
    });
  }, [pubkeyProfilesToFetch, productContext.isLoading, relays]);

  /** UPON PROFILEMAP UPDATE, SET PROFILE CONTEXT **/
  useEffect(() => {
    setProfileContext((profileContext) => {
      return {
        profileData: profileMap,
        addPubkeyToFetch: profileContext.addPubkeyToFetch,
      };
    });
  }, [profileMap]);

  /** FETCH ALL CHATS AND CORRESPONDING MESSAGES **/
  useEffect(() => {
    const pool = new SimplePool();
    let subParams: { kinds: number[]; authors?: string[] } = {
      kinds: [4],
    };

    const validNpub = /^npub[a-zA-Z0-9]{59}$/;

    let chats: string[] = [];
    let messages: NostrEvent[] = [];

    let decryptedNpub = decryptNpub(localStorage.getItem("npub"));

    let h = pool.subscribeMany(relays, [subParams], {
      onevent(event) {
        let tagPubkey = event.tags[0][1];
        let incomingPubkey = event.pubkey;

        if (decryptedNpub === tagPubkey) {
          if (!validNpub.test(incomingPubkey)) {
            if (!chats.includes(incomingPubkey)) {
              setChatContext((chatContext) => {
                chats.push(nip19.npubEncode(incomingPubkey));
                return {
                  chatPubkeys: chats,
                  isLoading: chatContext.isLoading,
                };
              });
              setMessageContext((messageContext) => {
                messages.push(event);
                return {
                  messages: messages,
                  isLoading: messageContext.isLoading,
                };
              });
            }
          } else {
            if (!chats.includes(incomingPubkey)) {
              setChatContext((chatContext) => {
                chats.push(incomingPubkey);
                return {
                  chatPubkeys: chats,
                  isLoading: chatContext.isLoading,
                };
              });
              setMessageContext((messageContext) => {
                messages.push(event);
                return {
                  messages: messages,
                  isLoading: messageContext.isLoading,
                };
              });
            }
          }
        } else if (decryptedNpub === incomingPubkey) {
          if (!validNpub.test(tagPubkey)) {
            if (!chats.includes(tagPubkey)) {
              setChatContext((chatContext) => {
                chats.push(nip19.npubEncode(tagPubkey));
                return {
                  chatPubkeys: chats,
                  isLoading: chatContext.isLoading,
                };
              });
              setMessageContext((messageContext) => {
                messages.push(event);
                return {
                  messages: messages,
                  isLoading: messageContext.isLoading,
                };
              });
            }
          } else {
            if (!chats.includes(tagPubkey)) {
              setChatContext((chatContext) => {
                chats.push(tagPubkey);
                return {
                  chatPubkeys: chats,
                  isLoading: chatContext.isLoading,
                };
              });
              setMessageContext((messageContext) => {
                messages.push(event);
                return {
                  messages: messages,
                  isLoading: messageContext.isLoading,
                };
              });
            }
          }
        }
      },
      oneose() {
        setChatContext((chatContext) => {
          return {
            chatPubkeys: chatContext.chatPubkeys,
            isLoading: false,
          };
        });
        setMessageContext((messageContext) => {
          return {
            messages: messageContext.messages,
            isLoading: false,
          };
        });
        // h.close();
      },
    });
  }, [relays]);

  return (
    <ProfileMapContext.Provider value={profileContext}>
      <ProductContext.Provider value={productContext}>
        <NextUIProvider>
          <NextThemesProvider
            attribute="class"
            forcedTheme={Component.theme || undefined}
          >
            <div className="h-[100vh] bg-light-bg dark:bg-dark-bg">
              {isSignInPage || isKeyPage ? null : <Navbar />}
              <div className="h-20">
                {/*spacer div needed so pages can account for navbar height*/}
              </div>
              <Component {...pageProps} />
            </div>
          </NextThemesProvider>
        </NextUIProvider>
      </ProductContext.Provider>
    </ProfileMapContext.Provider>
  );
}

export default App;
