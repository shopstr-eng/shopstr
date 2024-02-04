import "tailwindcss/tailwind.css";
import type { AppProps } from "next/app";
import "../styles/globals.css";
import Navbar from "./components/navbar";
import { useState, useEffect } from "react";
import { useRouter } from "next/router";
import {
  ProfileMapContext,
  ProfileContextInterface,
  ProductContext,
  ProductContextInterface,
  ChatsContextInterface,
  ChatsContext,
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
import {
  fetchAllPosts,
  fetchChatsAndMessages,
  fetchProfile,
} from "./api/nostr/fetch-service";
import { set } from "react-hook-form";

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
  const [chatsContext, setChatsContext] = useState<ChatsContextInterface>({
    chats: new Map(),
    isLoading: true,
  });

  /** FETCH initial PRODUCTS and PROFILES **/
  useEffect(() => {
    const relays = localStorageValues.relays;
    const decryptedNpub = localStorageValues.decryptedNpub;
    async function fetchData() {
      try {
        // let websocketSubscribers = [];
        // websocketSubscribers.push(productsWebsocketSub);
        let pubkeysToFetchProfilesFor = [];
        let { productsWebsocketSub, profileSetFromProducts } =
          await fetchAllPosts(relays, setProductContext);
        pubkeysToFetchProfilesFor = [...profileSetFromProducts];

        if (decryptedNpub) {
          let { chatsMap, profileSetFromChats } = await fetchChatsAndMessages(
            relays,
            decryptedNpub,
          );
          setChatsContext({
            chats: chatsMap,
            isLoading: false,
          });
          pubkeysToFetchProfilesFor = [
            decryptedNpub as string,
            ...pubkeysToFetchProfilesFor,
            ...profileSetFromChats,
          ];
        } else {
          // when user is not signed in they have no chats, flip is loading to false
          setChatsContext({
            chats: new Map(),
            isLoading: false,
          });
        }

        let { profileMap } = await fetchProfile(
          relays,
          pubkeysToFetchProfilesFor,
        );
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

  return (
    <ProductContext.Provider value={productContext}>
      <ProfileMapContext.Provider value={profileContext}>
        <ChatsContext.Provider value={chatsContext}>
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
        </ChatsContext.Provider>
      </ProfileMapContext.Provider>
    </ProductContext.Provider>
  );
}

export default App;
