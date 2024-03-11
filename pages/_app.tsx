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
<<<<<<< HEAD
  ChatsMap,
  FollowsContextInterface,
  FollowsContext,
=======
  MyListingsContext,
>>>>>>> af23432 (updates)
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
import parseTags, {
  ProductData,
} from "@/components/utility/product-parser-functions";

function App({ Component, pageProps }: AppProps) {
  const [localStorageValues, setLocalStorageValues] =
    useState<LocalStorageInterface>(getLocalStorageData());
  const [productContext, setProductContext] = useState<ProductContextInterface>(
    {
      productEvents: [],
      isLoading: true,
      setIsLoading: (isLoading) => {
        setProductContext((productContext) => {
          return { ...productContext, isLoading };
        });
      },
      filters: {
        searchQuery: "",
        categories: new Set<string>([]),
        location: null,
      },
      setFilters: (filters) => {
        setProductContext((productContext) => {
          return { ...productContext, filters };
        });
      },
      addNewlyCreatedProductEvents: (products: ProductData[]) => {
        setProductContext((productContext) => {
          const productEvents = [
            ...productContext.productEvents,
            ...products,
          ].sort((a, b) => b.createdAt - a.createdAt);
          return { ...productContext, productEvents };
        });
      },
      removeDeletedProductEvent: (productId: string) => {
        // remove from both
        setProductContext((productContext) => {
          const productEvents = [...productContext.productEvents].filter(
            (event) => event.id !== productId,
          );
          return { ...productContext, productEvents };
        });
        setMyListingsContext((myListingsContext) => {
          const productEvents = [...myListingsContext.productEvents].filter(
            (event) => event.id !== productId,
          );
          return { ...myListingsContext, productEvents };
        });
      },
    },
  );
  const [myListingsContext, setMyListingsContext] =
    useState<ProductContextInterface>({
      productEvents: [],
      isLoading: true,
      setIsLoading: (isLoading) => {
        setMyListingsContext((productContext) => {
          return { ...productContext, isLoading };
        });
      },
      filters: {
        searchQuery: "",
        categories: new Set<string>([]),
        location: null,
      },
      setFilters: (filters) => {
        setMyListingsContext((productContext) => {
          return { ...productContext, filters };
        });
      },
      addNewlyCreatedProductEvents: (
        products: ProductData[],
        replace?: boolean,
      ) => {
        setMyListingsContext((productContext) => {
          const productEvents = [
            ...(replace ? [] : [...productContext.productEvents]),
            ...products,
          ].sort((a, b) => b.createdAt - a.createdAt);
          if (replace) {
            return { ...productContext, productEvents };
          } else {
            return { ...productContext, productEvents };
          }
        });
      },
      removeDeletedProductEvent: (productId: string) => {
        // remove from both
        setProductContext((productContext) => {
          const productEvents = [...productContext.productEvents].filter(
            (event) => event.id !== productId,
          );
          return { ...productContext, productEvents };
        });
        setMyListingsContext((myListingsContext) => {
          const productEvents = [...myListingsContext.productEvents].filter(
            (event) => event.id !== productId,
          );
          return { ...myListingsContext, productEvents };
        });
      },
    });
  const [profileContext, setProfileContext] = useState<ProfileContextInterface>(
    {
      profileData: new Map(),
      isLoading: true,
      updateProfileData: (profileData: ProfileData) => {
        setProfileContext((profileContext) => {
          const newProfileData = new Map(profileContext.profileData);
          newProfileData.set(profileData.pubkey, profileData);
          return { ...profileContext, profileData: newProfileData };
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
      firstDegreeFollowsLength: 0,
      isLoading: true,
    },
  );

<<<<<<< HEAD
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

  const editFollowsContext = (
    followList: string[],
    firstDegreeFollowsLength: number,
    isLoading: boolean,
  ) => {
    setFollowsContext({ followList, firstDegreeFollowsLength, isLoading });
  };

=======
>>>>>>> af23432 (updates)
  /** FETCH initial PRODUCTS and PROFILES **/
  useEffect(() => {
    async function fetchData() {
      const relays = getLocalStorageData().relays;
      const userPubkey = getLocalStorageData().userPubkey;
      try {
        let { followList } = await fetchAllFollows(relays, editFollowsContext);
        let pubkeysToFetchProfilesFor: string[] = [];
        setProductContext({ ...productContext, isLoading: true });
        let { profileSetFromProducts, productArrayFromRelay } =
          await fetchAllPosts(relays, productContext.filters);
        const productEvents = productArrayFromRelay
          .reduce((curr, event) => {
            const productEvent = parseTags(event);
            return productEvent ? [...curr, productEvent] : curr;
          }, [] as ProductData[])
          .sort((a, b) => b.createdAt - a.createdAt);
        setProductContext({
          ...productContext,
          productEvents: [...productEvents],
          isLoading: false,
        });
        pubkeysToFetchProfilesFor = [...profileSetFromProducts];
        setChatsContext({ ...chatsContext, isLoading: true });
        let { profileSetFromChats, chatsData } = await fetchChatsAndMessages(
          relays,
          userPubkey,
        );
        setChatsContext({
          ...chatsContext,
          chatsMap: chatsData,
          isLoading: false,
        });
        pubkeysToFetchProfilesFor = [
          userPubkey as string,
          ...pubkeysToFetchProfilesFor,
          ...profileSetFromChats,
        ];
        setProfileContext({ ...profileContext, isLoading: true });
        let { profileData } = await fetchProfile(
          relays,
          pubkeysToFetchProfilesFor,
        );
        setProfileContext({ ...profileContext, profileData, isLoading: false });
      } catch (error) {
        console.error("Error fetching data:", error);
        setProductContext({ ...productContext, isLoading: false });
        setChatsContext({ ...chatsContext, isLoading: false });
        setProfileContext({ ...profileContext, isLoading: false });
      }
    }
    fetchData();
    window.addEventListener("storage", fetchData);
    return () => window.removeEventListener("storage", fetchData);
  }, [localStorageValues.relays, productContext.filters]);

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
<<<<<<< HEAD
      <FollowsContext.Provider value={followsContext}>
        <ProductContext.Provider value={productContext}>
=======
      <ProductContext.Provider value={productContext}>
        <MyListingsContext.Provider value={myListingsContext}>
>>>>>>> af23432 (updates)
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
<<<<<<< HEAD
        </ProductContext.Provider>
      </FollowsContext.Provider>
=======
        </MyListingsContext.Provider>
      </ProductContext.Provider>
>>>>>>> af23432 (updates)
    </>
  );
}

export default App;
