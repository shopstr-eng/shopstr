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
  getLocalStorageData,
  LocalStorageInterface,
  NostrEvent,
} from "./components/utility/nostr-helper-functions";
import { NextUIProvider } from "@nextui-org/react";
import { ThemeProvider as NextThemesProvider } from "next-themes";
import { CashuMint, CashuWallet } from "@cashu/cashu-ts";
import { fetchAllPosts, fetchProfile } from "./api/nostr/fetch-service";

function App({ Component, pageProps }: AppProps) {
  const router = useRouter();
  const isSignInPage = router.pathname === "/sign-in";
  const isKeyPage = router.pathname === "/keys";
  const [localStorageValues, setLocalStorageValues] =
    useState<LocalStorageInterface>(getLocalStorageData());
  const [productContext, setProductContext] = useState<ProductContextInterface>(
    {
      productEvents: [],
      isLoading: true,
    },
  );
  const [profileMap, setProfileMap] = useState(new Map());
  const [profileContext, setProfileContext] = useState<ProfileContextInterface>(
    {
      profileData: new Map(),
      mergeProfileMaps: (newProfileMap: Map<string, any>) => {
        setProfileMap((profileMap) => {
          return new Map([...profileMap, ...newProfileMap]);
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

  /** FETCH initial PRODUCTS and PROFILES **/
  useEffect(() => {
    const relays = localStorageValues.relays;
    async function fetchData() {
      try {
        let websocketSubscribers = [];
        let { productsWebsocketSub, profileArray } = await fetchAllPosts(
          relays,
          setProductContext,
        );
        websocketSubscribers.push(productsWebsocketSub);
        let { decryptedNpub } = getLocalStorageData();
        let { profileMap } = await fetchProfile(relays, [
          decryptedNpub as string,
          ...profileArray,
        ]);
        profileContext.mergeProfileMaps(profileMap);
      } catch (error) {
        console.error("Error fetching data:", error);
      }
    }
    if (relays) fetchData(); // Call the async function immediately
  }, [localStorageValues.relays]);

  /** UPON PROFILEMAP UPDATE, SET PROFILE CONTEXT **/
  useEffect(() => {
    setProfileContext((profileContext: ProfileContextInterface) => {
      return {
        profileData: profileMap,
        mergeProfileMaps: profileContext.mergeProfileMaps,
      };
    });
  }, [profileMap]);

  // /** FETCH ALL CHATS AND CORRESPONDING MESSAGES **/
  // useEffect(() => {
  //   const pool = new SimplePool();
  //   let subParams: { kinds: number[]; authors?: string[] } = {
  //     kinds: [4],
  //   };

  //   const validNpub = /^npub[a-zA-Z0-9]{59}$/;

  //   let chats: string[] = [];
  //   let messages: NostrEvent[] = [];

  //   let decryptedNpub = getLocalStorageData().decryptedNpub;

  //   let h = pool.subscribeMany(relays, [subParams], {
  //     onevent(event) {
  //       let tagPubkey = event.tags[0][1];
  //       let incomingPubkey = event.pubkey;

  //       if (decryptedNpub === tagPubkey) {
  //         if (!validNpub.test(incomingPubkey)) {
  //           if (!chats.includes(incomingPubkey)) {
  //             setChatContext((chatContext) => {
  //               chats.push(nip19.npubEncode(incomingPubkey));
  //               return {
  //                 chatPubkeys: chats,
  //                 isLoading: chatContext.isLoading,
  //               };
  //             });
  //             setMessageContext((messageContext) => {
  //               messages.push(event);
  //               return {
  //                 messages: messages,
  //                 isLoading: messageContext.isLoading,
  //               };
  //             });
  //           }
  //         } else {
  //           if (!chats.includes(incomingPubkey)) {
  //             setChatContext((chatContext) => {
  //               chats.push(incomingPubkey);
  //               return {
  //                 chatPubkeys: chats,
  //                 isLoading: chatContext.isLoading,
  //               };
  //             });
  //             setMessageContext((messageContext) => {
  //               messages.push(event);
  //               return {
  //                 messages: messages,
  //                 isLoading: messageContext.isLoading,
  //               };
  //             });
  //           }
  //         }
  //       } else if (decryptedNpub === incomingPubkey) {
  //         if (!validNpub.test(tagPubkey)) {
  //           if (!chats.includes(tagPubkey)) {
  //             setChatContext((chatContext) => {
  //               chats.push(nip19.npubEncode(tagPubkey));
  //               return {
  //                 chatPubkeys: chats,
  //                 isLoading: chatContext.isLoading,
  //               };
  //             });
  //             setMessageContext((messageContext) => {
  //               messages.push(event);
  //               return {
  //                 messages: messages,
  //                 isLoading: messageContext.isLoading,
  //               };
  //             });
  //           }
  //         } else {
  //           if (!chats.includes(tagPubkey)) {
  //             setChatContext((chatContext) => {
  //               chats.push(tagPubkey);
  //               return {
  //                 chatPubkeys: chats,
  //                 isLoading: chatContext.isLoading,
  //               };
  //             });
  //             setMessageContext((messageContext) => {
  //               messages.push(event);
  //               return {
  //                 messages: messages,
  //                 isLoading: messageContext.isLoading,
  //               };
  //             });
  //           }
  //         }
  //       }
  //     },
  //     oneose() {
  //       setChatContext((chatContext) => {
  //         return {
  //           chatPubkeys: chatContext.chatPubkeys,
  //           isLoading: false,
  //         };
  //       });
  //       setMessageContext((messageContext) => {
  //         return {
  //           messages: messageContext.messages,
  //           isLoading: false,
  //         };
  //       });
  //       // h.close();
  //     },
  //   });
  // }, [relays]);

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
