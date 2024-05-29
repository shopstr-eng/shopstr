import "tailwindcss/tailwind.css";
import type { AppProps } from "next/app";
import Head from "next/head";
import "../styles/globals.css";
import { useState, useEffect } from "react";
import {
  ProfileMapContext,
  ProfileContextInterface,
  ProductContext,
  ProductContextInterface,
  ChatsContextInterface,
  ChatsContext,
  ChatsMap,
  FollowsContextInterface,
  FollowsContext,
} from "../utils/context/context";
import {
  getLocalStorageData,
  LocalStorageInterface,
} from "../components/utility/nostr-helper-functions";
import { NextUIProvider } from "@nextui-org/react";
import { ThemeProvider as NextThemesProvider } from "next-themes";
import {
  fetchAllPosts,
  fetchChatsAndMessages,
  fetchProfile,
  fetchAllFollows,
} from "./api/nostr/fetch-service";
import { NostrEvent, ProfileData } from "../utils/types/types";
import BottomNav from "@/components/nav-bottom";
import SideNav from "@/components/nav-side";

function App({ Component, pageProps }: AppProps) {
  const [localStorageValues, setLocalStorageValues] =
    useState<LocalStorageInterface>(getLocalStorageData());
  const [productContext, setProductContext] = useState<ProductContextInterface>(
    {
      productEvents: [],
      isLoading: true,
      addNewlyCreatedProductEvent: (productEvent: any) => {
        setProductContext((productContext) => {
          let productEvents = [...productContext.productEvents, productEvent];
          return {
            productEvents: productEvents,
            isLoading: false,
            addNewlyCreatedProductEvent:
              productContext.addNewlyCreatedProductEvent,
            removeDeletedProductEvent: productContext.removeDeletedProductEvent,
          };
        });
      },
      removeDeletedProductEvent: (productId: string) => {
        setProductContext((productContext) => {
          let productEvents = [...productContext.productEvents].filter(
            (event) => event.id !== productId,
          );
          return {
            productEvents: productEvents,
            isLoading: false,
            addNewlyCreatedProductEvent:
              productContext.addNewlyCreatedProductEvent,
            removeDeletedProductEvent: productContext.removeDeletedProductEvent,
          };
        });
      },
    },
  );
  const [profileContext, setProfileContext] = useState<ProfileContextInterface>(
    {
      profileData: new Map(),
      isLoading: true,
      updateProfileData: (profileData: ProfileData) => {
        setProfileContext((profileContext) => {
          let newProfileData = new Map(profileContext.profileData);
          newProfileData.set(profileData.pubkey, profileData);
          return {
            profileData: newProfileData,
            isLoading: false,
            updateProfileData: profileContext.updateProfileData,
          };
        });
      },
    },
  );
  const [chatsContext, setChatsContext] = useState<ChatsContextInterface>({
    chatsMap: new Map(),
    isLoading: true,
  });
  const [followsContext, setFollowsContext] = useState<FollowsContextInterface>(
    {
      followList: [],
      isLoading: true,
    },
  );

  const editProductContext = (
    productEvents: NostrEvent[],
    isLoading: boolean,
  ) => {
    setProductContext((productContext) => {
      return {
        productEvents: productEvents,
        isLoading: isLoading,
        addNewlyCreatedProductEvent: productContext.addNewlyCreatedProductEvent,
        removeDeletedProductEvent: productContext.removeDeletedProductEvent,
      };
    });
  };

  const editProfileContext = (
    profileData: Map<string, any>,
    isLoading: boolean,
  ) => {
    setProfileContext((profileContext) => {
      return {
        profileData,
        isLoading,
        updateProfileData: profileContext.updateProfileData,
      };
    });
  };

  const editChatContext = (chatsMap: ChatsMap, isLoading: boolean) => {
    setChatsContext({ chatsMap, isLoading });
  };

  const editFollowsContext = (followList: string[], isLoading: boolean) => {
    setFollowsContext({ followList, isLoading });
  };

  /** FETCH initial PRODUCTS and PROFILES **/
  useEffect(() => {
    async function fetchData() {
      const relays = getLocalStorageData().relays;
      const userPubkey = getLocalStorageData().userPubkey;
      try {
        let { followList } = await fetchAllFollows(editFollowsContext);
        let pubkeysToFetchProfilesFor: string[] = [];
        let { profileSetFromProducts } = await fetchAllPosts(
          relays,
          editProductContext,
        );
        pubkeysToFetchProfilesFor = [...profileSetFromProducts];
        let { profileSetFromChats } = await fetchChatsAndMessages(
          relays,
          userPubkey,
          editChatContext,
        );
        pubkeysToFetchProfilesFor = [
          userPubkey as string,
          ...pubkeysToFetchProfilesFor,
          ...profileSetFromChats,
        ];
        let { profileMap } = await fetchProfile(
          relays,
          pubkeysToFetchProfilesFor,
          editProfileContext,
        );
      } catch (error) {
        console.error("Error fetching data:", error);
      }
    }
    fetchData();
    window.addEventListener("storage", fetchData);
    return () => window.removeEventListener("storage", fetchData);
  }, [localStorageValues.relays]);

  useEffect(() => {
    if ("serviceWorker" in navigator) {
      window.addEventListener("load", () => {
        navigator.serviceWorker
          .register("/service-worker.js")
          .then((registration) => {
            console.log("Service Worker registered: ", registration);
          })
          .catch((registrationError) => {
            console.log(
              "Service Worker registration failed: ",
              registrationError,
            );
          });
      });
    }
  }, []);

  return (
    <>
      <Head>
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no"
        />
      </Head>
      <FollowsContext.Provider value={followsContext}>
        <ProductContext.Provider value={productContext}>
          <ProfileMapContext.Provider value={profileContext}>
            <ChatsContext.Provider value={chatsContext}>
              <NextUIProvider>
                <NextThemesProvider attribute="class">
                  <div className="flex">
                    <SideNav />
                    <main className="flex-1">
                      <Component {...pageProps} />
                    </main>
                  </div>
                  <BottomNav />
                </NextThemesProvider>
              </NextUIProvider>
            </ChatsContext.Provider>
          </ProfileMapContext.Provider>
        </ProductContext.Provider>
      </FollowsContext.Provider>
    </>
  );
}

export default App;
