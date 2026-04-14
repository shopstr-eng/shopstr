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
  fetchStorefrontData,
} from "@/utils/nostr/fetch-service";
import {
  NostrEvent,
  Community,
  ProfileData,
  NostrMessageEvent,
  ShopProfile,
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
import { NostrManager } from "@/utils/nostr/nostr-manager";

function MilkMarket({ props }: { props: AppProps }) {
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
      reviewEventIds: new Map(),
      reviewReplies: new Map(),
      isLoading: true,
      updateMerchantReviewsData: (
        merchantPubkey: string,
        merchantReviewsData: number[]
      ) => {
        setReviewsContext((prev) => {
          const merchantReviewsDataMap = new Map(prev.merchantReviewsData);
          merchantReviewsDataMap.set(merchantPubkey, merchantReviewsData);
          return {
            ...prev,
            merchantReviewsData: merchantReviewsDataMap,
            isLoading: false,
          };
        });
      },
      updateProductReviewsData: (
        merchantPubkey: string,
        productDTag: string,
        productReviewsData: Map<string, string[][]>
      ) => {
        setReviewsContext((prev) => {
          const productReviewsDataMap = new Map(prev.productReviewsData);
          const productScoreMap = new Map(
            prev.productReviewsData.get(merchantPubkey)
          );
          productReviewsDataMap.set(
            merchantPubkey,
            productScoreMap.set(productDTag, productReviewsData)
          );
          return {
            ...prev,
            productReviewsData: productReviewsDataMap,
            isLoading: false,
          };
        });
      },
      updateReviewEventId: (reviewKey: string, eventId: string) => {
        setReviewsContext((prev) => {
          const reviewEventIds = new Map(prev.reviewEventIds);
          reviewEventIds.set(reviewKey, eventId);
          return { ...prev, reviewEventIds };
        });
      },
      addReviewReply: (
        reviewEventId: string,
        reply: import("@/utils/context/context").ReviewReply
      ) => {
        setReviewsContext((prev) => {
          const reviewReplies = new Map(prev.reviewReplies);
          const existing = reviewReplies.get(reviewEventId) || [];
          if (!existing.some((r) => r.eventId === reply.eventId)) {
            reviewReplies.set(reviewEventId, [...existing, reply]);
          }
          return { ...prev, reviewReplies };
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
    isLoading: boolean,
    reviewEventIds?: Map<string, string>,
    reviewReplies?: Map<string, import("@/utils/context/context").ReviewReply[]>
  ) => {
    setReviewsContext((prev) => {
      return {
        ...prev,
        merchantReviewsData,
        productReviewsData,
        isLoading,
        reviewEventIds: reviewEventIds ?? prev.reviewEventIds,
        reviewReplies: reviewReplies ?? prev.reviewReplies,
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
  const [fullLoadComplete, setFullLoadComplete] = useState(false);
  const [storefrontLoadPubkey, setStorefrontLoadPubkey] = useState<
    string | null
  >(null);

  const router = useRouter();
  const initializationRunRef = useRef(0);

  const isStorefrontRoute = router.pathname.startsWith("/shop/");

  const currentStorefrontSlug = isStorefrontRoute
    ? decodeURIComponent(
        (
          (router.asPath ?? "").replace(/^\/shop\//, "").split("/")[0] ?? ""
        ).split("?")[0] ?? ""
      )
    : null;

  useEffect(() => {
    if (
      !isStorefrontRoute &&
      !fullLoadComplete &&
      nostr &&
      storefrontLoadPubkey
    ) {
      setStorefrontLoadPubkey(null);
    }
  }, [isStorefrontRoute, fullLoadComplete, nostr, storefrontLoadPubkey]);

  const initRelays = async (): Promise<string[]> => {
    const relays = getLocalStorageData().relays || [];
    const readRelays = getLocalStorageData().readRelays || [];
    let allRelays = [...relays, ...readRelays];

    if (allRelays.length === 0) {
      allRelays = getDefaultRelays();
      localStorage.setItem("relays", JSON.stringify(allRelays));
    }

    if (isLoggedIn) {
      try {
        const { relayList, readRelayList, writeRelayList } =
          await fetchAllRelays(nostr!, signer!, allRelays, editRelaysContext);

        if (relayList.length !== 0) {
          localStorage.setItem("relays", JSON.stringify(relayList));
          localStorage.setItem("readRelays", JSON.stringify(readRelayList));
          localStorage.setItem("writeRelays", JSON.stringify(writeRelayList));
          allRelays = [...relayList, ...readRelayList];
        }
      } catch (error) {
        console.error("Error fetching relays:", error);
        editRelaysContext([], [], [], false);
      }
    } else {
      editRelaysContext(allRelays, [], [], false);
    }

    return allRelays;
  };

  const resolveStorefrontPubkey = async (): Promise<string | null> => {
    const shopPath = router.asPath.replace(/^\/shop\//, "").split("/")[0] ?? "";
    if (!shopPath) return null;
    const slug = decodeURIComponent(shopPath.split("?")[0] ?? "");
    if (!slug) return null;

    try {
      const res = await fetch(
        `/api/storefront/lookup?slug=${encodeURIComponent(slug)}`
      );
      if (res.ok) {
        const data = await res.json();
        if (data.pubkey) return data.pubkey;
      }
    } catch {}
    return null;
  };

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

        // Initialize relays — needed by both the storefront fast-path and the full load
        const relays = getLocalStorageData().relays || [];
        const readRelays = getLocalStorageData().readRelays || [];
        let allRelays = [...relays, ...readRelays];

        if (allRelays.length === 0) {
          allRelays = getDefaultRelays();
          localStorage.setItem("relays", JSON.stringify(allRelays));
        }

        // Fetch relays and signer pubkey in parallel
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

        // Storefront fast-path: do a focused fetch for just the shop being viewed
        if (isStorefrontRoute && !fullLoadComplete) {
          const sfPubkey = await resolveStorefrontPubkey();
          if (sfPubkey) {
            setStorefrontLoadPubkey(sfPubkey);

            try {
              await fetchStorefrontData(
                nostr!,
                allRelays,
                sfPubkey,
                guardedEditProductContext,
                guardedEditShopContext,
                guardedEditProfileContext,
                guardedEditReviewsContext,
                guardedEditCommunityContext,
                isLoggedIn && userPubkey
                  ? {
                      signer: signer!,
                      editChatContext: guardedEditChatContext,
                      userPubkey,
                    }
                  : undefined
              );
            } catch (error) {
              console.error("Error during focused storefront fetch:", error);
            }

            if (!isCurrentRun()) return;

            const blossomPromise = isLoggedIn
              ? runTask(
                  "fetching blossom servers",
                  () =>
                    fetchAllBlossomServers(
                      nostr!,
                      signer!,
                      allRelays,
                      guardedEditBlossomContext
                    ),
                  () => guardedEditBlossomContext([], false)
                )
              : Promise.resolve(undefined);

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

            const [blossomResult, walletResult] = await Promise.all([
              blossomPromise,
              walletPromise,
            ]);

            if (!isCurrentRun()) return;

            if (blossomResult?.blossomServers?.length) {
              localStorage.setItem(
                "blossomServers",
                JSON.stringify(blossomResult.blossomServers)
              );
            } else if (!isLoggedIn) {
              guardedEditBlossomContext([], false);
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

            if (!isLoggedIn) {
              guardedEditChatContext(new Map(), false);
            }
            guardedEditFollowsContext([], 0, false);
            return;
          }
        }

        // Full parallelized load (non-storefront path, or storefront with fullLoadComplete)
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

        // Run them in parallel first since required for profile/shops/reviews
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
          const { relays, writeRelays } = getLocalStorageData();
          const retryNostr = new NostrManager([...relays, ...writeRelays]);
          await retryFailedRelayPublishes(retryNostr);
        });

        setFullLoadComplete(true);
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

  // When navigating between storefront pages, refetch for the new shop
  useEffect(() => {
    if (
      !isStorefrontRoute ||
      !nostr ||
      !currentStorefrontSlug ||
      fullLoadComplete
    )
      return;

    const resolveAndFetch = async () => {
      const sfPubkey = await resolveStorefrontPubkey();
      if (!sfPubkey || sfPubkey === storefrontLoadPubkey) return;

      setStorefrontLoadPubkey(sfPubkey);

      const userPubkey = isLoggedIn
        ? (await signer?.getPubKey()) || undefined
        : undefined;

      const allRelays = await initRelays();

      try {
        await fetchStorefrontData(
          nostr!,
          allRelays,
          sfPubkey,
          editProductContext,
          editShopContext,
          editProfileContext,
          editReviewsContext,
          editCommunityContext,
          isLoggedIn && userPubkey
            ? { signer: signer!, editChatContext, userPubkey }
            : undefined
        );
      } catch (error) {
        console.error("Error during storefront-to-storefront refetch:", error);
      }
    };

    resolveAndFetch();
  }, [currentStorefrontSlug]);

  // When navigating away from a storefront before a full load, trigger the deferred full load
  useEffect(() => {
    if (!isStorefrontRoute && !fullLoadComplete && nostr) {
      async function triggerFullLoad() {
        try {
          const allRelays = await initRelays();

          let productEvents: NostrEvent[] = [];
          let profileSetFromProducts = new Set<string>();
          try {
            const result = await fetchAllPosts(
              nostr!,
              allRelays,
              editProductContext
            );
            productEvents = result.productEvents;
            profileSetFromProducts = result.profileSetFromProducts;
          } catch (error) {
            console.error("Error fetching products:", error);
            editProductContext([], false);
          }

          let pubkeysToFetchProfilesFor = [...profileSetFromProducts];
          const userPubkey = (await signer?.getPubKey()) || undefined;
          const profileSetFromChats = new Set<string>();

          if (isLoggedIn) {
            try {
              const { profileSetFromChats: newProfileSetFromChats } =
                await fetchGiftWrappedChatsAndMessages(
                  nostr!,
                  signer!,
                  allRelays,
                  editChatContext,
                  userPubkey
                );
              newProfileSetFromChats.forEach((profile) =>
                profileSetFromChats.add(profile)
              );
            } catch (error) {
              console.error("Error fetching chats:", error);
              editChatContext(new Map(), false);
            }
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

          try {
            await fetchProfile(
              nostr!,
              allRelays,
              pubkeysToFetchProfilesFor,
              editProfileContext,
              profileContext.profileData
            );
          } catch (error) {
            console.error("Error fetching profiles:", error);
            editProfileContext(new Map(profileContext.profileData), false);
          }

          try {
            await fetchShopProfile(
              nostr!,
              allRelays,
              pubkeysToFetchProfilesFor,
              editShopContext
            );
          } catch (error) {
            console.error("Error fetching shop profiles:", error);
            editShopContext(new Map(), false);
          }

          try {
            await fetchReviews(
              nostr!,
              allRelays,
              productEvents,
              editReviewsContext
            );
          } catch (error) {
            console.error("Error fetching reviews:", error);
            editReviewsContext(new Map(), new Map(), false);
          }

          try {
            await fetchAllCommunities(nostr!, allRelays, editCommunityContext);
          } catch (error) {
            console.error("Error fetching communities:", error);
            editCommunityContext(new Map(), false);
          }

          if (isLoggedIn) {
            try {
              const { blossomServers } = await fetchAllBlossomServers(
                nostr!,
                signer!,
                allRelays,
                editBlossomContext
              );
              if (blossomServers.length != 0) {
                localStorage.setItem(
                  "blossomServers",
                  JSON.stringify(blossomServers)
                );
              }
            } catch (error) {
              console.error("Error fetching blossom servers:", error);
              editBlossomContext([], false);
            }

            try {
              const { cashuMints, cashuProofs } = await fetchCashuWallet(
                nostr!,
                signer!,
                allRelays,
                editCashuWalletContext
              );
              if (cashuMints.length !== 0 && cashuProofs) {
                localStorage.setItem("mints", JSON.stringify(cashuMints));
                localStorage.setItem("tokens", JSON.stringify(cashuProofs));
              }
            } catch (error) {
              console.error("Error fetching wallet:", error);
              editCashuWalletContext([], [], [], false);
            }
          }

          try {
            await fetchAllFollows(
              nostr!,
              allRelays,
              editFollowsContext,
              (await signer?.getPubKey()) || undefined
            );
          } catch (error) {
            console.error("Error fetching follows:", error);
            editFollowsContext([], 0, false);
          }

          try {
            const { relays, writeRelays } = getLocalStorageData();
            const retryNostr = new NostrManager([...relays, ...writeRelays]);
            await retryFailedRelayPublishes(retryNostr);
          } catch (error) {
            console.error("Failed to retry relay publishes:", error);
          }

          setFullLoadComplete(true);
        } catch (error) {
          console.error("Error during deferred full load:", error);
        }
      }

      triggerFullLoad();
    }
  }, [isStorefrontRoute, fullLoadComplete, nostr]);

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

    // Track UTM parameters on initial load
    const trackUTMParameters = async () => {
      if (sessionStorage.getItem("utm_tracked")) {
        return;
      }

      const urlParams = new URLSearchParams(window.location.search);
      const utm_source = urlParams.get("utm_source");
      const utm_medium = urlParams.get("utm_medium");
      const utm_campaign = urlParams.get("utm_campaign");
      const utm_term = urlParams.get("utm_term");
      const utm_content = urlParams.get("utm_content");

      if (utm_source || utm_medium || utm_campaign || utm_term || utm_content) {
        try {
          const response = await fetch("/api/utm-tracking", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              utm_source,
              utm_medium,
              utm_campaign,
              utm_term,
              utm_content,
              referrer: document.referrer,
              user_agent: navigator.userAgent,
            }),
          });

          if (response.ok) {
            sessionStorage.setItem("utm_tracked", "true");

            const cleanUrl = new URL(window.location.href);
            cleanUrl.searchParams.delete("utm_source");
            cleanUrl.searchParams.delete("utm_medium");
            cleanUrl.searchParams.delete("utm_campaign");
            cleanUrl.searchParams.delete("utm_term");
            cleanUrl.searchParams.delete("utm_content");

            window.history.replaceState({}, "", cleanUrl.toString());
          } else {
            const errorData = await response.json();
            console.error(
              "Failed to track UTM parameters: API returned",
              response.status,
              errorData
            );
          }
        } catch (error) {
          console.error("Failed to track UTM parameters:", error);
        }
      }
    };

    const timeoutId = setTimeout(() => {
      trackUTMParameters();
    }, 100);

    return () => clearTimeout(timeoutId);
  }, []);

  return (
    <>
      <DynamicHead
        productEvents={productContext.productEvents}
        shopEvents={shopContext.shopData}
        profileData={profileContext.profileData}
        ssrOgMeta={pageProps?.ogMeta || null}
      />
      <StructuredData />
      <PageLoadingBar />
      <RelaysContext.Provider value={relaysContext}>
        <BlossomContext.Provider value={blossomContext}>
          <CashuWalletContext.Provider value={cashuWalletContext}>
            <CommunityContext.Provider value={communityContext}>
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
                          {router.pathname !== "/" &&
                            router.pathname !== "/producer-guide" &&
                            router.pathname !== "/faq" &&
                            router.pathname !== "/terms" &&
                            router.pathname !== "/privacy" &&
                            router.pathname !== "/about" &&
                            router.pathname !== "/contact" &&
                            !router.pathname.startsWith("/shop/") && (
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
            </CommunityContext.Provider>
          </CashuWalletContext.Provider>
        </BlossomContext.Provider>
      </RelaysContext.Provider>
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
              <MilkMarket props={props} />
            </SignerContextProvider>
          </NostrContextProvider>
        </NextThemesProvider>
      </HeroUIProvider>
    </>
  );
}

export default App;
