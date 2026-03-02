import type { AppProps } from "next/app";
import "../styles/globals.css";
import { useState, useEffect, useCallback, useContext } from "react";
import { useRouter } from "next/router";
import dynamic from "next/dynamic";
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
  BlossomContextInterface,
  BlossomContext,
  CashuWalletContext,
  CashuProofEvent,
  CashuWalletContextInterface,
  CommunityContext,
  CommunityContextInterface,
} from "../utils/context/context";
import { NextUIProvider } from "@nextui-org/react";
import { ThemeProvider as NextThemesProvider } from "next-themes";
import type {
  NostrEvent,
  Community,
  ProfileData,
  NostrMessageEvent,
  ShopProfile,
} from "../utils/types/types";
import type { Proof } from "@cashu/cashu-ts";
import DynamicHead from "../components/dynamic-meta-head";
import {
  NostrContextProvider,
  SignerContextProvider,
  NostrContext,
  SignerContext,
} from "@/components/utility-components/nostr-context-provider";

const TopNav = dynamic(() => import("@/components/nav-top"), {
  ssr: false,
});

type RouteBootstrapFlags = {
  loadCatalog: boolean;
  loadChats: boolean;
  loadFollows: boolean;
  loadCommunities: boolean;
  loadWallet: boolean;
};

const STATIC_CONTENT_ROUTES = new Set(["/faq", "/privacy", "/terms", "/404"]);

function getRouteBootstrapFlags(pathname: string): RouteBootstrapFlags {
  const isStaticContent = STATIC_CONTENT_ROUTES.has(pathname);
  const isLanding = pathname === "/";
  const isOrders = pathname.startsWith("/orders");
  const isMarketplace = pathname.startsWith("/marketplace");
  const isCommunities =
    pathname.startsWith("/communities") || pathname.startsWith("/settings/community");
  const isWalletHeavy =
    pathname.startsWith("/wallet") ||
    pathname.startsWith("/cart") ||
    pathname.startsWith("/listing") ||
    pathname.startsWith("/order-summary");
  const isSettings = pathname.startsWith("/settings");

  if (isStaticContent) {
    return {
      loadCatalog: false,
      loadChats: false,
      loadFollows: false,
      loadCommunities: false,
      loadWallet: false,
    };
  }

  return {
    // Keep catalog data for most app routes, including landing.
    loadCatalog: true,
    // Messages data is only needed on Orders route.
    loadChats: isOrders,
    // Follows are only needed for marketplace trust filters.
    loadFollows: isMarketplace,
    loadCommunities: isCommunities,
    loadWallet: isWalletHeavy || isOrders || isSettings || (!isLanding && isMarketplace),
  };
}

function Shopstr({ props }: { props: AppProps }) {
  const { Component, pageProps } = props;
  const { nostr } = useContext(NostrContext);
  const { signer, isLoggedIn } = useContext(SignerContext);

  const [productContext, setProductContext] = useState<ProductContextInterface>(
    {
      productEvents: [],
      isLoading: true,
      addNewlyCreatedProductEvent: (productEvent: NostrEvent) => {
        setProductContext((productContext) => {
          const productEvents = [...productContext.productEvents, productEvent];
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
          const productEvents = [...productContext.productEvents].filter(
            (event) => event.id !== productId
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
    }
  );

  const [reviewsContext, setReviewsContext] = useState<ReviewsContextInterface>(
    {
      merchantReviewsData: new Map(),
      productReviewsData: new Map(),
      isLoading: true,
      updateMerchantReviewsData: (
        merchantPubkey: string,
        merchantReviewsData: number[]
      ) => {
        setReviewsContext((reviewsContext) => {
          const merchantReviewsDataMap = new Map(
            reviewsContext.merchantReviewsData
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
        productReviewsData: Map<string, string[][]>
      ) => {
        setReviewsContext((reviewsContext) => {
          const productReviewsDataMap = new Map(
            reviewsContext.productReviewsData
          );
          const productScoreMap = new Map(
            reviewsContext.productReviewsData.get(merchantPubkey)
          );
          productReviewsDataMap.set(
            merchantPubkey,
            productScoreMap.set(productDTag, productReviewsData)
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
    }
  );

  const [shopContext, setShopContext] = useState<ShopContextInterface>({
    shopData: new Map(),
    isLoading: true,
    updateShopData: (shopData: ShopProfile) => {
      setShopContext((shopContext) => {
        const shopDataMap = new Map(shopContext.shopData);
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
          const newProfileData = new Map(profileContext.profileData);
          newProfileData.set(profileData.pubkey, profileData);
          return {
            profileData: newProfileData,
            isLoading: false,
            updateProfileData: profileContext.updateProfileData,
          };
        });
      },
    }
  );

  const [chatsMap, setChatMap] = useState(new Map());
  const [isChatLoading, setIsChatLoading] = useState(true);
  const [newOrderIds, setNewOrderIds] = useState<Set<string>>(new Set());

  const addNewlyCreatedMessageEvent = useCallback(
    async (messageEvent: NostrMessageEvent, sent?: boolean) => {
      const pubkey = await signer?.getPubKey();
      const newChatsMap = new Map(chatsMap);
      const eventWithReadStatus = {
        ...messageEvent,
        read: sent ? true : false,
      };
      let chatArray;
      if (messageEvent.pubkey === pubkey) {
        const recipientPubkey = messageEvent.tags.find(
          (tag) => tag[0] === "p"
        )?.[1];
        if (recipientPubkey) {
          chatArray = newChatsMap.get(recipientPubkey) || [];
          if (sent) {
            chatArray.push(eventWithReadStatus);
          } else {
            chatArray = [eventWithReadStatus, ...chatArray];
          }
          newChatsMap.set(recipientPubkey, chatArray);
        }
      } else {
        chatArray = newChatsMap.get(messageEvent.pubkey) || [];
        if (sent) {
          chatArray.push(eventWithReadStatus);
        } else {
          chatArray = [eventWithReadStatus, ...chatArray];
        }
        newChatsMap.set(messageEvent.pubkey, chatArray);
      }
      setChatMap(newChatsMap);
      setIsChatLoading(false);
    },
    [chatsMap, signer]
  );

  const markAllMessagesAsRead = useCallback(async (): Promise<string[]> => {
    const unreadMessageIds: string[] = [];
    const wrappedEventIds: string[] = [];

    for (const [_, messages] of chatsMap) {
      for (const message of messages as NostrMessageEvent[]) {
        if (!message.read) {
          unreadMessageIds.push(message.id);
          if (message.wrappedEventId) {
            wrappedEventIds.push(message.wrappedEventId);
          }
        }
      }
    }

    if (unreadMessageIds.length > 0) {
      try {
        const idsForDb =
          wrappedEventIds.length > 0 ? wrappedEventIds : unreadMessageIds;
        await fetch("/api/db/mark-messages-read", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messageIds: idsForDb }),
        });

        setNewOrderIds(new Set(unreadMessageIds));

        const newChatsMap = new Map(chatsMap);
        for (const [pubkey, messages] of newChatsMap) {
          const updatedMessages = (messages as NostrMessageEvent[]).map(
            (msg) => ({
              ...msg,
              read: true,
            })
          );
          newChatsMap.set(pubkey, updatedMessages);
        }
        setChatMap(newChatsMap);
      } catch (error) {
        console.error("Failed to mark messages as read:", error);
      }
    }

    return unreadMessageIds;
  }, [chatsMap]);

  const [followsContext, setFollowsContext] = useState<FollowsContextInterface>(
    {
      followList: [],
      firstDegreeFollowsLength: 0,
      isLoading: true,
    }
  );

  const [communityContext, setCommunityContext] =
    useState<CommunityContextInterface>({
      communities: new Map(),
      posts: new Map(),
      isLoading: true,
      addCommunity: (community: Community) => {
        setCommunityContext((prev) => {
          const newCommunities = new Map(prev.communities);
          newCommunities.set(community.id, community);
          return {
            ...prev,
            communities: newCommunities,
          };
        });
      },
    });

  const [relaysContext, setRelaysContext] = useState<RelaysContextInterface>({
    relayList: [],
    readRelayList: [],
    writeRelayList: [],
    isLoading: true,
  });

  const [blossomContext, setBlossomContext] = useState<BlossomContextInterface>(
    {
      blossomServers: [],
      isLoading: true,
    }
  );

  const [cashuWalletContext, setCashuWalletContext] =
    useState<CashuWalletContextInterface>({
      proofEvents: [],
      cashuMints: [],
      cashuProofs: [],
      isLoading: true,
    });

  const editProductContext = (
    productEvents: NostrEvent[],
    isLoading: boolean
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
    isLoading: boolean
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
    shopData: Map<string, ShopProfile>,
    isLoading: boolean
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
    profileData: Map<string, ProfileData>,
    isLoading: boolean
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
    isLoading: boolean
  ) => {
    setFollowsContext({
      followList,
      firstDegreeFollowsLength,
      isLoading,
    });
  };

  const editCommunityContext = (
    communities: Map<string, Community>,
    isLoading: boolean
  ) => {
    setCommunityContext((prev) => ({
      ...prev,
      communities,
      isLoading,
    }));
  };

  const editRelaysContext = (
    relayList: string[],
    readRelayList: string[],
    writeRelayList: string[],
    isLoading: boolean
  ) => {
    setRelaysContext({
      relayList,
      readRelayList,
      writeRelayList,
      isLoading,
    });
  };

  const editBlossomContext = (blossomServers: string[], isLoading: boolean) => {
    setBlossomContext({
      blossomServers,
      isLoading,
    });
  };

  const editCashuWalletContext = (
    proofEvents: CashuProofEvent[],
    cashuMints: string[],
    cashuProofs: Proof[],
    isLoading: boolean
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

  // Emit same-tab storage updates so components can react without polling.
  useEffect(() => {
    if (typeof window === "undefined") return;

    if (window.__shopstrStoragePatched) return;
    window.__shopstrStoragePatched = true;

    const storage = window.localStorage;
    const originalSetItem = storage.setItem.bind(storage);
    const originalRemoveItem = storage.removeItem.bind(storage);

    storage.setItem = function setItem(key: string, value: string) {
      originalSetItem(key, value);
      window.dispatchEvent(new CustomEvent("shopstr:storage", { detail: { key } }));
    };

    storage.removeItem = function removeItem(key: string) {
      originalRemoveItem(key);
      window.dispatchEvent(new CustomEvent("shopstr:storage", { detail: { key } }));
    };

    return () => {
      storage.setItem = originalSetItem;
      storage.removeItem = originalRemoveItem;
      delete window.__shopstrStoragePatched;
    };
  }, []);

  /** FETCH route-scoped data **/
  useEffect(() => {
    let isCancelled = false;

    const resetAllContextsToLoaded = () => {
      editProductContext([], false);
      editReviewsContext(new Map(), new Map(), false);
      editShopContext(new Map(), false);
      editProfileContext(new Map(), false);
      editChatContext(new Map(), false);
      editFollowsContext([], 0, false);
      editRelaysContext([], [], [], false);
      editBlossomContext([], false);
      editCashuWalletContext([], [], [], false);
      editCommunityContext(new Map(), false);
    };

    async function fetchData() {
      try {
        if (!nostr) return;

        const flags = getRouteBootstrapFlags(router.pathname);

        if (
          !flags.loadCatalog &&
          !flags.loadChats &&
          !flags.loadFollows &&
          !flags.loadCommunities &&
          !flags.loadWallet
        ) {
          resetAllContextsToLoaded();
          return;
        }

        const { runRouteBootstrap } = await import("@/utils/route-bootstrap");
        await runRouteBootstrap({
          flags,
          nostr,
          signer,
          isLoggedIn,
          editProductContext,
          editReviewsContext,
          editShopContext,
          editProfileContext,
          editChatContext,
          editFollowsContext,
          editRelaysContext,
          editBlossomContext,
          editCashuWalletContext,
          editCommunityContext,
        });
      } catch (error) {
        console.error("Critical error during app initialization:", error);
        if (!isCancelled) {
          resetAllContextsToLoaded();
        }
      }
    }

    void fetchData();

    const handleStorage = () => {
      if (!isCancelled) {
        void fetchData();
      }
    };

    window.addEventListener("storage", handleStorage);

    return () => {
      isCancelled = true;
      window.removeEventListener("storage", handleStorage);
    };
  }, [nostr, signer, isLoggedIn, router.pathname]);

  return (
    <>
      <DynamicHead
        productEvents={productContext.productEvents}
        shopEvents={shopContext.shopData}
        profileData={profileContext.profileData}
      />
      <CommunityContext.Provider value={communityContext}>
        <RelaysContext.Provider value={relaysContext}>
          <BlossomContext.Provider value={blossomContext}>
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
                              markAllMessagesAsRead: markAllMessagesAsRead,
                              newOrderIds: newOrderIds,
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
          </BlossomContext.Provider>
        </RelaysContext.Provider>
      </CommunityContext.Provider>
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
