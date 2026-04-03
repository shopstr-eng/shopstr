import "tailwindcss/tailwind.css";
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
import { NextUIProvider } from "@nextui-org/react";
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
  getMarketplaceEventKey,
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
          const productEventsMap = new Map<string, NostrEvent>();

          productContext.productEvents.forEach((event: NostrEvent) => {
            productEventsMap.set(getMarketplaceEventKey(event), event);
          });

          const nextKey = getMarketplaceEventKey(productEvent);
          const existingEvent = productEventsMap.get(nextKey);
          if (
            !existingEvent ||
            productEvent.created_at >= existingEvent.created_at
          ) {
            productEventsMap.set(nextKey, productEvent);
          }

          return {
            productEvents: Array.from(productEventsMap.values()),
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
  const hydratedMarketplaceProductKeysRef = useRef<Set<string>>(new Set());
  const hydratedMarketplaceSellerPubkeysRef = useRef<Set<string>>(new Set());
  const pendingMarketplaceProductKeysRef = useRef<Set<string>>(new Set());
  const pendingMarketplaceSellerPubkeysRef = useRef<Set<string>>(new Set());
  const didCompleteInitialMarketplaceHydrationRef = useRef(false);

  const mergeProfileContext = (nextProfiles: Map<string, any>) => {
    if (nextProfiles.size === 0) return;

    setProfileContext((profileContext) => {
      const mergedProfiles = new Map(profileContext.profileData);
      nextProfiles.forEach((profile, pubkey) => {
        if (!profile) return;

        const existingProfile = mergedProfiles.get(pubkey);
        if (
          !existingProfile ||
          (profile.created_at || 0) >= (existingProfile.created_at || 0)
        ) {
          mergedProfiles.set(pubkey, profile);
        }
      });

      return {
        profileData: mergedProfiles,
        isLoading: false,
        updateProfileData: profileContext.updateProfileData,
      };
    });
  };

  const mergeShopContext = (nextShops: Map<string, ShopProfile>) => {
    if (nextShops.size === 0) return;

    setShopContext((shopContext) => {
      const mergedShops = new Map(shopContext.shopData);
      nextShops.forEach((shopProfile, pubkey) => {
        if (!shopProfile) return;

        const existingShop = mergedShops.get(pubkey);
        if (
          !existingShop ||
          (shopProfile.created_at || 0) >= (existingShop.created_at || 0)
        ) {
          mergedShops.set(pubkey, shopProfile);
        }
      });

      return {
        shopData: mergedShops,
        isLoading: false,
        updateShopData: shopContext.updateShopData,
      };
    });
  };

  const mergeReviewsContext = (
    nextMerchantReviews: Map<string, number[]>,
    nextProductReviews: Map<string, Map<string, Map<string, string[][]>>>
  ) => {
    if (nextMerchantReviews.size === 0 && nextProductReviews.size === 0) return;

    setReviewsContext((reviewsContext) => {
      const mergedMerchantReviews = new Map(reviewsContext.merchantReviewsData);
      nextMerchantReviews.forEach((scores, merchantPubkey) => {
        if (scores.length === 0) return;

        mergedMerchantReviews.set(merchantPubkey, [
          ...(mergedMerchantReviews.get(merchantPubkey) || []),
          ...scores,
        ]);
      });

      const mergedProductReviews = new Map(reviewsContext.productReviewsData);
      nextProductReviews.forEach((merchantProducts, merchantPubkey) => {
        const mergedMerchantProducts = new Map(
          mergedProductReviews.get(merchantPubkey) || []
        );

        merchantProducts.forEach((productReviews, productDTag) => {
          mergedMerchantProducts.set(productDTag, new Map(productReviews));
        });

        mergedProductReviews.set(merchantPubkey, mergedMerchantProducts);
      });

      return {
        merchantReviewsData: mergedMerchantReviews,
        productReviewsData: mergedProductReviews,
        isLoading: false,
        updateMerchantReviewsData: reviewsContext.updateMerchantReviewsData,
        updateProductReviewsData: reviewsContext.updateProductReviewsData,
      };
    });
  };

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
    profileData: Map<string, any>,
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

  /** FETCH initial FOLLOWS, RELAYS, PRODUCTS, and PROFILES **/
  useEffect(() => {
    async function fetchData() {
      let fetchedProductEvents: NostrEvent[] = [];
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

        // Sequential fetch for critical data with individual error handling
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

        // Fetch products and collect profile pubkeys
        let productEvents: NostrEvent[] = [];
        let profileSetFromProducts = new Set<string>();
        try {
          const result = await fetchAllPosts(
            nostr!,
            allRelays,
            editProductContext
          );
          productEvents = result.productEvents;
          fetchedProductEvents = result.productEvents;
          profileSetFromProducts = result.profileSetFromProducts;
        } catch (error) {
          console.error("Error fetching products:", error);
          editProductContext([], false);
        }

        // Handle profile fetching
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
            editProfileContext
          );
        } catch (error) {
          console.error("Error fetching profiles:", error);
          editProfileContext(new Map(), false);
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

        hydratedMarketplaceProductKeysRef.current = new Set(
          fetchedProductEvents.map((event) => getMarketplaceEventKey(event))
        );
        hydratedMarketplaceSellerPubkeysRef.current = new Set(
          fetchedProductEvents.map((event) => event.pubkey).filter(Boolean)
        );
        didCompleteInitialMarketplaceHydrationRef.current = true;

        try {
          await fetchAllCommunities(nostr!, allRelays, editCommunityContext);
        } catch (error) {
          console.error("Error fetching communities:", error);
          editCommunityContext(new Map(), false);
        }

        // Fetch wallet if logged in
        if (isLoggedIn) {
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
            userPubkey
          );
        } catch (error) {
          console.error("Error fetching follows:", error);
          editFollowsContext([], 0, false);
        }

        // After all fetching operations complete, retry failed relay publishes
        try {
          const { relays, writeRelays } = getLocalStorageData();
          const retryNostr = new NostrManager([...relays, ...writeRelays]);
          await retryFailedRelayPublishes(retryNostr);
        } catch (error) {
          console.error("Failed to retry relay publishes:", error);
        }
      } catch (error) {
        console.error("Critical error during app initialization:", error);
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
      } finally {
        didCompleteInitialMarketplaceHydrationRef.current = true;
      }
    }

    fetchData();
    window.addEventListener("storage", fetchData);
    return () => window.removeEventListener("storage", fetchData);
  }, [nostr, signer, isLoggedIn]);

  useEffect(() => {
    if (
      !nostr ||
      !didCompleteInitialMarketplaceHydrationRef.current ||
      productContext.isLoading ||
      !Array.isArray(productContext.productEvents)
    ) {
      return;
    }

    const allRelays = [
      ...new Set([...relaysContext.relayList, ...relaysContext.readRelayList]),
    ];
    const effectiveRelays = allRelays.length > 0 ? allRelays : getDefaultRelays();

    const nextProducts = (productContext.productEvents as NostrEvent[]).filter(
      (event) =>
        !hydratedMarketplaceProductKeysRef.current.has(
          getMarketplaceEventKey(event)
        ) &&
        !pendingMarketplaceProductKeysRef.current.has(
          getMarketplaceEventKey(event)
        )
    );

    if (nextProducts.length === 0) return;

    nextProducts.forEach((event) => {
      pendingMarketplaceProductKeysRef.current.add(
        getMarketplaceEventKey(event)
      );
    });

    const nextSellerPubkeys = Array.from(
      new Set(
        nextProducts
          .map((event) => event.pubkey)
          .filter(
            (pubkey): pubkey is string =>
              Boolean(pubkey) &&
              !hydratedMarketplaceSellerPubkeysRef.current.has(pubkey) &&
              !pendingMarketplaceSellerPubkeysRef.current.has(pubkey)
          )
      )
    );

    nextSellerPubkeys.forEach((pubkey) => {
      pendingMarketplaceSellerPubkeysRef.current.add(pubkey);
    });

    let isActive = true;

    const hydrateMarketplaceDelta = async () => {
      try {
        if (nextSellerPubkeys.length > 0) {
          const [{ profileMap }, { shopProfileMap }] = await Promise.all([
            fetchProfile(nostr, effectiveRelays, nextSellerPubkeys, () => {}),
            fetchShopProfile(nostr, effectiveRelays, nextSellerPubkeys, () => {}),
          ]);

          if (!isActive) return;

          mergeProfileContext(profileMap);
          mergeShopContext(shopProfileMap);
        }

        const { merchantScoresMap, productReviewsMap } = await fetchReviews(
          nostr,
          effectiveRelays,
          nextProducts,
          () => {}
        );

        if (!isActive) return;

        mergeReviewsContext(merchantScoresMap, productReviewsMap);

        nextProducts.forEach((event) => {
          hydratedMarketplaceProductKeysRef.current.add(
            getMarketplaceEventKey(event)
          );
        });
        nextSellerPubkeys.forEach((pubkey) => {
          hydratedMarketplaceSellerPubkeysRef.current.add(pubkey);
        });
      } catch (error) {
        console.error("Failed to hydrate marketplace relay results:", error);
      } finally {
        nextProducts.forEach((event) => {
          pendingMarketplaceProductKeysRef.current.delete(
            getMarketplaceEventKey(event)
          );
        });
        nextSellerPubkeys.forEach((pubkey) => {
          pendingMarketplaceSellerPubkeysRef.current.delete(pubkey);
        });
      }
    };

    hydrateMarketplaceDelta();

    return () => {
      isActive = false;
    };
  }, [
    nostr,
    productContext.isLoading,
    productContext.productEvents,
    relaysContext.readRelayList,
    relaysContext.relayList,
  ]);

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
