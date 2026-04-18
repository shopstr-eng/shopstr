import type { AppProps } from "next/app";
import "../styles/globals.css";
import { useState, useEffect, useCallback, useContext, useRef } from "react";
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
  BlossomContextInterface,
  BlossomContext,
  CashuWalletContext,
  CashuWalletContextInterface,
  CommunityContext,
  CommunityContextInterface,
} from "../utils/context/context";
import {
  getLocalStorageData,
  getDefaultRelays,
  LogOut,
} from "@/utils/nostr/nostr-helper-functions";
import { createNip98AuthorizationHeader } from "@/utils/nostr/nip98-auth";
import { HeroUIProvider } from "@heroui/react";
import { ThemeProvider as NextThemesProvider } from "next-themes";
import {
  fetchAllPosts,
  fetchReviews,
  fetchShopProfile,
  fetchProfile,
  fetchAllFollows,
  fetchAllRelays,
  fetchAllBlossomServers,
  fetchCashuWallet,
  fetchAllCommunities,
  fetchGiftWrappedChatsAndMessages,
} from "@/utils/nostr/fetch-service";
import {
  NostrEvent,
  Community,
  ProfileData,
  NostrMessageEvent,
  ShopProfile,
  FilterParams,
} from "../utils/types/types";
import { Proof } from "@cashu/cashu-ts";
import TopNav from "@/components/nav-top";
import PageLoadingBar from "@/components/page-loading-bar";
import DynamicHead from "../components/dynamic-meta-head";
import StructuredData from "../components/structured-data";
import {
  NostrContextProvider,
  SignerContextProvider,
  NostrContext,
  SignerContext,
} from "@/components/utility-components/nostr-context-provider";
import { retryFailedRelayPublishes } from "@/utils/nostr/retry-service";
import { MintRecoveryBoot } from "@/components/utility-components/mint-recovery-boot";
import { NostrManager } from "@/utils/nostr/nostr-manager";

function Shopstr({ props }: { props: AppProps }) {
  const { Component, pageProps } = props;
  const { nostr } = useContext(NostrContext);
  const { signer, isLoggedIn } = useContext(SignerContext);

  const [productContext, setProductContext] = useState<ProductContextInterface>(
    {
      productEvents: [],
      totalEvents: 0,
      isLoading: true,
      setProductEvents: (_events: NostrEvent[], _total?: number) => {},
      loadMoreProducts: async () => {},
      refreshProducts: async () => {},
      addNewlyCreatedProductEvent: (productEvent: NostrEvent) => {
        setProductContext((productContext) => {
          const productEvents = [...productContext.productEvents, productEvent];
          return {
            ...productContext,
            productEvents: productEvents,
            totalEvents: productContext.totalEvents + 1,
            isLoading: false,
          };
        });
      },
      removeDeletedProductEvent: (productId: string) => {
        setProductContext((productContext) => {
          const productEvents = [...productContext.productEvents].filter(
            (event) => event.id !== productId
          );
          return {
            ...productContext,
            productEvents: productEvents,
            totalEvents: Math.max(0, productContext.totalEvents - 1),
            isLoading: false,
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
        const body = JSON.stringify({ messageIds: idsForDb });
        const authHeader = await createNip98AuthorizationHeader(
          signer!,
          `${window.location.origin}/api/db/mark-messages-read`,
          "POST",
          body
        );
        await fetch("/api/db/mark-messages-read", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: authHeader,
          },
          body,
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
  }, [chatsMap, signer]);

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
    isLoading: boolean,
    totalEvents?: number
  ) => {
    setProductContext((productContext) => {
      return {
        ...productContext,
        productEvents: productEvents,
        isLoading: isLoading,
        totalEvents: totalEvents ?? productContext.totalEvents,
      };
    });
  };

  const loadMoreProducts = useCallback(
    async (filters?: FilterParams) => {
      setProductContext((prev) => {
        if (prev.isLoading || prev.productEvents.length === 0) return prev;

        const oldestEvent = [...prev.productEvents].sort(
          (a, b) => a.created_at - b.created_at
        )[0];
        if (!oldestEvent) return prev;

        const performFetch = async () => {
          const relays = getLocalStorageData().relays || [];
          const readRelays = getLocalStorageData().readRelays || [];
          const allRelaysBeforeCheck = [...relays, ...readRelays];
          const allRelays =
            allRelaysBeforeCheck.length > 0
              ? allRelaysBeforeCheck
              : getDefaultRelays();

          await fetchAllPosts(
            nostr!,
            allRelays,
            (newEvents, isLoading, total) => {
              setProductContext((current) => {
                const currentIds = new Set(
                  current.productEvents.map((e) => e.id)
                );
                const merged = [...current.productEvents];

                newEvents.forEach((event) => {
                  if (!currentIds.has(event.id)) {
                    merged.push(event);
                  }
                });

                let finalTotal = total ?? current.totalEvents;
                if (!isLoading && currentIds.size === merged.length) {
                  finalTotal = merged.length;
                }

                return {
                  ...current,
                  productEvents: merged.sort(
                    (a, b) => b.created_at - a.created_at
                  ),
                  isLoading: isLoading,
                  totalEvents: finalTotal,
                };
              });
            },
            oldestEvent.created_at,
            filters
          );
        };

        performFetch();

        return {
          ...prev,
          isLoading: true,
        };
      });
    },
    [nostr]
  );

  const refreshProducts = useCallback(
    async (filters?: FilterParams) => {
      setProductContext((prev) => ({ ...prev, isLoading: true }));

      const relays = getLocalStorageData().relays || [];
      const readRelays = getLocalStorageData().readRelays || [];
      const allRelaysBeforeCheck = [...relays, ...readRelays];
      const allRelays =
        allRelaysBeforeCheck.length > 0
          ? allRelaysBeforeCheck
          : getDefaultRelays();

      await fetchAllPosts(
        nostr!,
        allRelays,
        (newEvents, isLoading, total) => {
          setProductContext((current) => ({
            ...current,
            productEvents: newEvents,
            isLoading,
            totalEvents: total ?? current.totalEvents,
          }));
        },
        undefined,
        filters
      );
    },
    [nostr]
  );

  // Update the productContext with the actual loadMoreProducts and refreshProducts implementations
  useEffect(() => {
    setProductContext((prev) => ({
      ...prev,
      loadMoreProducts,
      refreshProducts,
    }));
  }, [loadMoreProducts, refreshProducts]);

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
    profileData: Map<string, any>,
    isLoading: boolean
  ) => {
    setProfileContext((profileContext) => {
      const mergedProfileData = new Map(profileContext.profileData);

      profileData.forEach((incomingProfile, pubkey) => {
        const existingProfile = mergedProfileData.get(pubkey);
        if (
          !existingProfile ||
          (incomingProfile?.created_at ?? 0) >
            (existingProfile?.created_at ?? 0)
        ) {
          mergedProfileData.set(pubkey, incomingProfile);
          return;
        }

        if (
          (incomingProfile?.created_at ?? 0) ===
          (existingProfile?.created_at ?? 0)
        ) {
          mergedProfileData.set(pubkey, {
            ...existingProfile,
            ...incomingProfile,
          });
        }
      });

      return {
        profileData: mergedProfileData,
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
    proofEvents: any[],
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
  const initializationRunRef = useRef(0);

  /** FETCH initial FOLLOWS, RELAYS, PRODUCTS, and PROFILES **/
  useEffect(() => {
    async function fetchData() {
      const runId = ++initializationRunRef.current;
      const isCurrentRun = () => runId === initializationRunRef.current;
      type EditorFn = (...args: any[]) => void;

      const guard = <TFn extends EditorFn>(fn: TFn) => {
        return ((...args: Parameters<TFn>) => {
          if (!isCurrentRun()) return;
          fn(...args);
        }) as TFn;
      };
      const createGuardedEditors = <T extends Record<string, EditorFn>>(
        editors: T
      ): T => {
        const guardedEditors = {} as T;

        (Object.keys(editors) as Array<keyof T>).forEach((key) => {
          guardedEditors[key] = guard(editors[key]);
        });

        return guardedEditors;
      };

      const {
        guardedEditProductContext,
        guardedEditReviewsContext,
        guardedEditShopContext,
        guardedEditProfileContext,
        guardedEditChatContext,
        guardedEditFollowsContext,
        guardedEditRelaysContext,
        guardedEditBlossomContext,
        guardedEditCashuWalletContext,
        guardedEditCommunityContext,
      } = createGuardedEditors({
        guardedEditProductContext: editProductContext,
        guardedEditReviewsContext: editReviewsContext,
        guardedEditShopContext: editShopContext,
        guardedEditProfileContext: editProfileContext,
        guardedEditChatContext: editChatContext,
        guardedEditFollowsContext: editFollowsContext,
        guardedEditRelaysContext: editRelaysContext,
        guardedEditBlossomContext: editBlossomContext,
        guardedEditCashuWalletContext: editCashuWalletContext,
        guardedEditCommunityContext: editCommunityContext,
      });

      const runTask = async <T,>(
        taskName: string,
        task: () => Promise<T>,
        onError?: () => void
      ): Promise<T | undefined> => {
        try {
          return await task();
        } catch (error) {
          console.error(`Error ${taskName}:`, error);
          if (isCurrentRun()) {
            onError?.();
          }
          return undefined;
        }
      };

      try {
        // Check login status
        if (getLocalStorageData().signInMethod === "amber") {
          LogOut();
          return;
        }

        if (
          getLocalStorageData().signInMethod === "extension" ||
          getLocalStorageData().signer?.type === "nip07"
        ) {
          if (!window.nostr?.nip44) {
            LogOut();
            return;
          }
        }

        // Initialize relays
        const relays = getLocalStorageData().relays || [];
        const readRelays = getLocalStorageData().readRelays || [];
        let allRelays = [...relays, ...readRelays];

        if (allRelays.length === 0) {
          allRelays = getDefaultRelays();
          localStorage.setItem("relays", JSON.stringify(allRelays));
        }

        // Fire them first and in parellel since independent of each other and other depend on it
        const [relayResult, userPubkey] = await Promise.all([
          runTask(
            "fetching relays",
            () =>
              fetchAllRelays(
                nostr!,
                signer!,
                allRelays,
                guardedEditRelaysContext
              ),
            () => guardedEditRelaysContext([], [], [], false)
          ),
          runTask(
            "resolving signer pubkey",
            async () => (await signer?.getPubKey()) || undefined
          ),
        ]);

        if (!isCurrentRun()) return;

        if (relayResult && relayResult.relayList.length !== 0) {
          localStorage.setItem("relays", JSON.stringify(relayResult.relayList));
          localStorage.setItem(
            "readRelays",
            JSON.stringify(relayResult.readRelayList)
          );
          localStorage.setItem(
            "writeRelays",
            JSON.stringify(relayResult.writeRelayList)
          );
          allRelays = [...relayResult.relayList, ...relayResult.readRelayList];
        }

        // We just fire them and not await them so that they just update their context and not block others
        const blossomPromise = runTask(
          "fetching blossom servers",
          () =>
            fetchAllBlossomServers(
              nostr!,
              signer!,
              allRelays,
              guardedEditBlossomContext
            ),
          () => guardedEditBlossomContext([], false)
        );

        const walletPromise = isLoggedIn
          ? runTask(
              "fetching wallet",
              () =>
                fetchCashuWallet(
                  nostr!,
                  signer!,
                  allRelays,
                  guardedEditCashuWalletContext
                ),
              () => guardedEditCashuWalletContext([], [], [], false)
            )
          : Promise.resolve(undefined);

        const followsPromise = runTask(
          "fetching follows",
          () =>
            fetchAllFollows(
              nostr!,
              allRelays,
              guardedEditFollowsContext,
              userPubkey
            ),
          () => guardedEditFollowsContext([], 0, false)
        );

        const communitiesPromise = runTask(
          "fetching communities",
          () =>
            fetchAllCommunities(nostr!, allRelays, guardedEditCommunityContext),
          () => guardedEditCommunityContext(new Map(), false)
        );

        const productsPromise = runTask(
          "fetching products",
          () => fetchAllPosts(nostr!, allRelays, guardedEditProductContext),
          () => guardedEditProductContext([], false)
        );

        const chatsPromise = isLoggedIn
          ? runTask(
              "fetching chats",
              () =>
                fetchGiftWrappedChatsAndMessages(
                  nostr!,
                  signer!,
                  allRelays,
                  guardedEditChatContext,
                  userPubkey
                ),
              () => guardedEditChatContext(new Map(), false)
            )
          : Promise.resolve(undefined);

        // Run them in parellel first since required for profile/shops/reviews
        const [productsResult, chatsResult] = await Promise.all([
          productsPromise,
          chatsPromise,
        ]);

        if (!isCurrentRun()) return;

        // Derive the pubkey list
        const productEvents = productsResult?.productEvents ?? [];
        const profileSetFromProducts =
          productsResult?.profileSetFromProducts ?? new Set<string>();
        const profileSetFromChats =
          chatsResult?.profileSetFromChats ?? new Set<string>();

        const pubkeySet = new Set<string>([
          ...profileSetFromProducts,
          ...profileSetFromChats,
        ]);

        if (userPubkey) {
          pubkeySet.add(userPubkey);
        }

        const pubkeysToFetchProfilesFor = Array.from(pubkeySet);

        // These start immediately — no waiting for wallet, blossom, follows, or communities.
        await Promise.all([
          runTask(
            "fetching profiles",
            () =>
              fetchProfile(
                nostr!,
                allRelays,
                pubkeysToFetchProfilesFor,
                guardedEditProfileContext,
                profileContext.profileData
              ),
            () =>
              guardedEditProfileContext(
                new Map(profileContext.profileData),
                false
              )
          ),
          runTask(
            "fetching shop profiles",
            () =>
              fetchShopProfile(
                nostr!,
                allRelays,
                pubkeysToFetchProfilesFor,
                guardedEditShopContext
              ),
            () => guardedEditShopContext(new Map(), false)
          ),
          runTask(
            "fetching reviews",
            () =>
              fetchReviews(
                nostr!,
                allRelays,
                productEvents,
                guardedEditReviewsContext
              ),
            () => guardedEditReviewsContext(new Map(), new Map(), false)
          ),
        ]);

        if (!isCurrentRun()) return;

        // By now these are likely already done; we await to catch errors and read results.
        const [blossomResult, walletResult] = await Promise.all([
          blossomPromise,
          walletPromise,
          followsPromise,
          communitiesPromise,
        ]);

        if (!isCurrentRun()) return;

        if (blossomResult?.blossomServers?.length) {
          localStorage.setItem(
            "blossomServers",
            JSON.stringify(blossomResult.blossomServers)
          );
        }

        if (walletResult?.cashuMints?.length && walletResult.cashuProofs) {
          localStorage.setItem(
            "mints",
            JSON.stringify(walletResult.cashuMints)
          );
          localStorage.setItem(
            "tokens",
            JSON.stringify(walletResult.cashuProofs)
          );
        }

        await runTask("retrying relay publishes", async () => {
          if (!signer) {
            return;
          }

          const { relays, writeRelays } = getLocalStorageData();
          const retryNostr = new NostrManager([...relays, ...writeRelays]);
          await retryFailedRelayPublishes(retryNostr, signer);
        });
      } catch (error) {
        console.error("Critical error during app initialization:", error);
        if (!isCurrentRun()) return;
        guardedEditProductContext([], false);
        guardedEditReviewsContext(new Map(), new Map(), false);
        guardedEditShopContext(new Map(), false);
        guardedEditProfileContext(new Map(), false);
        guardedEditChatContext(new Map(), false);
        guardedEditFollowsContext([], 0, false);
        guardedEditRelaysContext([], [], [], false);
        guardedEditBlossomContext([], false);
        guardedEditCashuWalletContext([], [], [], false);
        guardedEditCommunityContext(new Map(), false);
      }
    }

    fetchData();
  }, [nostr, signer, isLoggedIn]);

  useEffect(() => {
    if ("serviceWorker" in navigator) {
      window.addEventListener("load", () => {
        navigator.serviceWorker
          .register("/service-worker.js")
          .catch((registrationError) => {
            console.error(
              "Service Worker registration failed: ",
              registrationError
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
        profileData={profileContext.profileData}
        ssrOgMeta={pageProps.ogMeta ?? null}
      />
      <StructuredData />
      <PageLoadingBar />
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
                          {![
                            "/",
                            "/about",
                            "/contact",
                            "/faq",
                            "/terms",
                            "/privacy",
                          ].includes(router.pathname) && (
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
      <HeroUIProvider>
        <NextThemesProvider attribute="class">
          <NostrContextProvider>
            <SignerContextProvider>
              <MintRecoveryBoot />
              <Shopstr props={props} />
            </SignerContextProvider>
          </NostrContextProvider>
        </NextThemesProvider>
      </HeroUIProvider>
    </>
  );
}

export default App;
