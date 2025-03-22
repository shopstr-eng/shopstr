import "tailwindcss/tailwind.css";
import type { AppProps } from "next/app";
import "../styles/globals.css";
import { useState, useEffect, useCallback, useContext } from "react";
import { useRouter } from "next/router";
import {
  ProfileMapContext,
  ProfileContextInterface,
  ShopMapContext,
  ShopContextInterface,
  ProductContext,
  ProductContextInterface,
  ChatsContextInterface,
  ChatsContext,
  ChatsMap,
  ReviewsContextInterface,
  ReviewsContext,
  FollowsContextInterface,
  FollowsContext,
  RelaysContextInterface,
  RelaysContext,
  CashuWalletContext,
  CashuWalletContextInterface,
} from "../utils/context/context";
import {
  getLocalStorageData,
  getDefaultRelays,
  LogOut,
} from "../components/utility/nostr-helper-functions";
import { NextUIProvider } from "@nextui-org/react";
import { ThemeProvider as NextThemesProvider } from "next-themes";
import {
  fetchAllPosts,
  fetchReviews,
  fetchShopSettings,
  fetchProfile,
  fetchAllFollows,
  fetchAllRelays,
  fetchCashuWallet,
  fetchGiftWrappedChatsAndMessages,
} from "./api/nostr/fetch-service";
import {
  NostrEvent,
  ProfileData,
  NostrMessageEvent,
  ShopSettings,
} from "../utils/types/types";
import { Proof } from "@cashu/cashu-ts";
import TopNav from "@/components/nav-top";
import DynamicHead from "../components/dynamic-meta-head";
import {
  NostrContextProvider,
  SignerContextProvider,
  NostrContext,
  SignerContext,
} from "@/utils/context/nostr-context";

function Shopstr({ props }: { props: AppProps }) {
  const { Component, pageProps } = props;
  const { nostr } = useContext(NostrContext);
  const { signer, isLoggedIn } = useContext(SignerContext);
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
  const [reviewsContext, setReviewsContext] = useState<ReviewsContextInterface>(
    {
      merchantReviewsData: new Map(),
      productReviewsData: new Map(),
      isLoading: true,
      updateMerchantReviewsData: (
        merchantPubkey: string,
        merchantReviewsData: number[],
      ) => {
        setReviewsContext((reviewsContext) => {
          let merchantReviewsDataMap = new Map(
            reviewsContext.merchantReviewsData,
          );
          merchantReviewsDataMap.set(merchantPubkey, merchantReviewsData);
          return {
            merchantReviewsData: merchantReviewsDataMap,
            productReviewsData: reviewsContext.productReviewsData,
            isLoading: false,
            updateMerchantReviewsData: reviewsContext.updateMerchantReviewsData,
            updateProductReviewsData: reviewsContext.updateProductReviewsData,
          };
        });
      },
      updateProductReviewsData: (
        merchantPubkey: string,
        productDTag: string,
        productReviewsData: Map<string, string[][]>,
      ) => {
        setReviewsContext((reviewsContext) => {
          let productReviewsDataMap = new Map(
            reviewsContext.productReviewsData,
          );
          let productScoreMap = new Map(
            reviewsContext.productReviewsData.get(merchantPubkey),
          );
          productReviewsDataMap.set(
            merchantPubkey,
            productScoreMap.set(productDTag, productReviewsData),
          );
          return {
            merchantReviewsData: reviewsContext.merchantReviewsData,
            productReviewsData: productReviewsDataMap,
            isLoading: false,
            updateMerchantReviewsData: reviewsContext.updateMerchantReviewsData,
            updateProductReviewsData: reviewsContext.updateProductReviewsData,
          };
        });
      },
    },
  );
  const [shopContext, setShopContext] = useState<ShopContextInterface>({
    shopData: new Map(),
    isLoading: true,
    updateShopData: (shopData: ShopSettings) => {
      setShopContext((shopContext) => {
        let shopDataMap = new Map(shopContext.shopData);
        shopDataMap.set(shopData.pubkey, shopData);
        return {
          shopData: shopDataMap,
          isLoading: false,
          updateShopData: shopContext.updateShopData,
        };
      });
    },
  });
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

  const [chatsMap, setChatMap] = useState(new Map());
  const [isChatLoading, setIsChatLoading] = useState(true);
  const addNewlyCreatedMessageEvent = useCallback(
    async (messageEvent: NostrMessageEvent, sent?: boolean) => {
      const pubkey = await signer?.getPubKey();
      const newChatsMap = new Map(chatsMap);
      let chatArray;
      if (messageEvent.pubkey === pubkey) {
        let recipientPubkey = messageEvent.tags.find(
          (tag) => tag[0] === "p",
        )?.[1];
        if (recipientPubkey) {
          chatArray = newChatsMap.get(recipientPubkey) || [];
          if (sent) {
            chatArray.push(messageEvent);
          } else {
            chatArray = [messageEvent, ...chatArray];
          }
          newChatsMap.set(recipientPubkey, chatArray);
        }
      } else {
        chatArray = newChatsMap.get(messageEvent.pubkey) || [];
        if (sent) {
          chatArray.push(messageEvent);
        } else {
          chatArray = [messageEvent, ...chatArray];
        }
        newChatsMap.set(messageEvent.pubkey, chatArray);
      }
      setChatMap(newChatsMap);
      setIsChatLoading(false);
    },
    [chatsMap, signer],
  );

  const [followsContext, setFollowsContext] = useState<FollowsContextInterface>(
    {
      followList: [],
      firstDegreeFollowsLength: 0,
      isLoading: true,
    },
  );
  const [relaysContext, setRelaysContext] = useState<RelaysContextInterface>({
    relayList: [],
    readRelayList: [],
    writeRelayList: [],
    isLoading: true,
  });
  const [cashuWalletContext, setCashuWalletContext] =
    useState<CashuWalletContextInterface>({
      proofEvents: [],
      cashuMints: [],
      cashuProofs: [],
      isLoading: true,
    });

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

  const editReviewsContext = (
    merchantReviewsData: Map<string, number[]>,
    productReviewsData: Map<string, Map<string, Map<string, string[][]>>>,
    isLoading: boolean,
  ) => {
    setReviewsContext((reviewsContext) => {
      return {
        merchantReviewsData,
        productReviewsData,
        isLoading,
        updateMerchantReviewsData: reviewsContext.updateMerchantReviewsData,
        updateProductReviewsData: reviewsContext.updateProductReviewsData,
      };
    });
  };

  const editShopContext = (
    shopData: Map<string, ShopSettings>,
    isLoading: boolean,
  ) => {
    setShopContext((shopContext) => {
      return {
        shopData,
        isLoading,
        updateShopData: shopContext.updateShopData,
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
    setChatMap(chatsMap);
    setIsChatLoading(isLoading);
  };

  const editFollowsContext = (
    followList: string[],
    firstDegreeFollowsLength: number,
    isLoading: boolean,
  ) => {
    setFollowsContext({
      followList,
      firstDegreeFollowsLength,
      isLoading,
    });
  };

  const editRelaysContext = (
    relayList: string[],
    readRelayList: string[],
    writeRelayList: string[],
    isLoading: boolean,
  ) => {
    setRelaysContext({
      relayList,
      readRelayList,
      writeRelayList,
      isLoading,
    });
  };

  const editCashuWalletContext = (
    proofEvents: any[],
    cashuMints: string[],
    cashuProofs: Proof[],
    isLoading: boolean,
  ) => {
    setCashuWalletContext({
      proofEvents,
      cashuMints,
      cashuProofs,
      isLoading,
    });
  };

  const [focusedPubkey, setFocusedPubkey] = useState("");
  const [selectedSection, setSelectedSection] = useState("");

  const router = useRouter();

  /** FETCH initial FOLLOWS, RELAYS, PRODUCTS, and PROFILES **/
  useEffect(() => {
    async function fetchData() {
      if (getLocalStorageData().signInMethod === "amber") {
        LogOut();
      }
      if (
        getLocalStorageData().signInMethod === "extension" ||
        getLocalStorageData().signer?.type === "nip07"
      ) {
        if (!window.nostr.nip44) {
          LogOut();
        }
      }
      const relays = getLocalStorageData().relays;
      const readRelays = getLocalStorageData().readRelays;
      let allRelays = [...relays, ...readRelays];
      if (allRelays.length === 0) {
        allRelays = getDefaultRelays();
        localStorage.setItem("relays", JSON.stringify(allRelays));
      }
      try {
        let { relayList, readRelayList, writeRelayList } = await fetchAllRelays(
          nostr!,
          signer!,
          allRelays,
          editRelaysContext,
        );
        if (relayList.length != 0) {
          localStorage.setItem("relays", JSON.stringify(relayList));
          localStorage.setItem("readRelays", JSON.stringify(readRelayList));
          localStorage.setItem("writeRelays", JSON.stringify(writeRelayList));
          allRelays = [...relayList, ...readRelayList];
        }
        let pubkeysToFetchProfilesFor: string[] = [];
        let { productEvents, profileSetFromProducts } = await fetchAllPosts(
          nostr!,
          allRelays,
          editProductContext,
        );
        pubkeysToFetchProfilesFor = [...profileSetFromProducts];
        const userPubkey = (await signer?.getPubKey()) || undefined;
        let profileSetFromChats = new Set<string>();
        if (isLoggedIn) {
          let { profileSetFromChats: newProfileSetFromChats } =
            await fetchGiftWrappedChatsAndMessages(
              nostr!,
              signer!,
              allRelays,
              editChatContext,
              userPubkey,
            );
          newProfileSetFromChats.forEach((profile) =>
            profileSetFromChats.add(profile),
          );
        }
        if (userPubkey && profileSetFromChats.size != 0) {
          pubkeysToFetchProfilesFor = [
            userPubkey as string,
            ...pubkeysToFetchProfilesFor,
            ...profileSetFromChats,
          ];
        } else if (userPubkey) {
          pubkeysToFetchProfilesFor = [
            userPubkey as string,
            ...pubkeysToFetchProfilesFor,
          ];
        }
        await fetchShopSettings(
          nostr!,
          allRelays,
          pubkeysToFetchProfilesFor,
          editShopContext,
        );
        await fetchProfile(
          nostr!,
          allRelays,
          pubkeysToFetchProfilesFor,
          editProfileContext,
        );
        await fetchReviews(
          nostr!,
          allRelays,
          productEvents,
          editReviewsContext,
        );
        if (isLoggedIn) {
          let { cashuMints, cashuProofs } = await fetchCashuWallet(
            nostr!,
            signer!,
            allRelays,
            editCashuWalletContext,
          );

          if (cashuMints.length != 0 && cashuProofs) {
            localStorage.setItem("mints", JSON.stringify(cashuMints));
            localStorage.setItem("tokens", JSON.stringify(cashuProofs));
          }
        }
        await fetchAllFollows(
          nostr!,
          allRelays,
          editFollowsContext,
          userPubkey,
        );
      } catch (error) {
        console.error("Error fetching data:", error);
      }
    }
    fetchData();
    window.addEventListener("storage", fetchData);
    return () => window.removeEventListener("storage", fetchData);
  }, [nostr, signer, isLoggedIn]);

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
      <DynamicHead
        productEvents={productContext.productEvents}
        shopEvents={shopContext.shopData}
      />
      <RelaysContext.Provider value={relaysContext}>
        <CashuWalletContext.Provider value={cashuWalletContext}>
          <FollowsContext.Provider value={followsContext}>
            <ProductContext.Provider value={productContext}>
              <ReviewsContext.Provider value={reviewsContext}>
                <ProfileMapContext.Provider value={profileContext}>
                  <ShopMapContext.Provider value={shopContext}>
                    <ChatsContext.Provider
                      value={
                        {
                          chatsMap: chatsMap,
                          isLoading: isChatLoading,
                          addNewlyCreatedMessageEvent:
                            addNewlyCreatedMessageEvent,
                        } as ChatsContextInterface
                      }
                    >
                      {router.pathname !== "/" && (
                        <TopNav
                          setFocusedPubkey={setFocusedPubkey}
                          setSelectedSection={setSelectedSection}
                        />
                      )}
                      <div className="flex">
                        <main className="flex-1">
                          <Component
                            {...pageProps}
                            focusedPubkey={focusedPubkey}
                            setFocusedPubkey={setFocusedPubkey}
                            selectedSection={selectedSection}
                            setSelectedSection={setSelectedSection}
                          />
                        </main>
                      </div>
                    </ChatsContext.Provider>
                  </ShopMapContext.Provider>
                </ProfileMapContext.Provider>
              </ReviewsContext.Provider>
            </ProductContext.Provider>
          </FollowsContext.Provider>
        </CashuWalletContext.Provider>
      </RelaysContext.Provider>
    </>
  );
}

function App(props: AppProps) {
  return (
    <>
      <NextUIProvider>
        <NextThemesProvider attribute="class">
          <NostrContextProvider>
            <SignerContextProvider>
              <Shopstr props={props} />
            </SignerContextProvider>
          </NostrContextProvider>
        </NextThemesProvider>
      </NextUIProvider>
    </>
  );
}

export default App;
