import type { AppProps, AppContext } from "next/app";
import NextApp from "next/app";
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
  fetchStorefrontChats,
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
import StorefrontThemeWrapper from "@/components/storefront/storefront-theme-wrapper";
import { CustomDomainProvider } from "@/utils/storefront/custom-domain-context";
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
import AffiliateRefTracker from "@/components/utility-components/affiliate-ref-tracker";
import { NostrManager } from "@/utils/nostr/nostr-manager";

// Run a callback after the browser has had a chance to paint, yielding the
// main thread first so the visible UI shows before heavy work (e.g. decrypting
// the full gift-wrapped message history) begins.
const scheduleAfterPaint = (cb: () => void) => {
  if (typeof window === "undefined") {
    cb();
    return;
  }
  const ric = (window as any).requestIdleCallback as
    | ((callback: () => void, options?: { timeout: number }) => number)
    | undefined;
  if (ric) {
    ric(cb, { timeout: 2000 });
  } else {
    setTimeout(cb, 200);
  }
};

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
    productEvents: NostrEvent[] | null,
    isLoading: boolean
  ) => {
    setProductContext((productContext) => {
      return {
        productEvents: productEvents ?? productContext.productEvents,
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
  // Seed `storefrontLoadPubkey` from the SSR signal that middleware injects
  // via `x-mm-shop-pubkey` (see proxy.ts + utils/storefront/host-cache.ts).
  // Without this seed the page mounts once with the bare <Component/>,
  // then `setStorefrontLoadPubkey(sfPubkey)` fires from an effect ~100ms
  // later, the wrapper mounts, and React remounts the page subtree inside
  // it. On Safari with the old aggressive service worker that remount was
  // visible as a blank screen.
  const ssrShopPubkey: string | null =
    props.pageProps?.__customDomainShopPubkey ?? null;
  const [storefrontLoadPubkey, setStorefrontLoadPubkey] = useState<
    string | null
  >(ssrShopPubkey);

  const router = useRouter();
  const initializationRunRef = useRef(0);
  // Token guarding deferred storefront chat fetches. It is bumped on every
  // schedule AND at the top of the main init effect (auth/signer/relay change),
  // so a slow message fetch from a previous shop — or a previous signed-in
  // user — can never overwrite the chat context after the user has moved on.
  const storefrontChatRunRef = useRef(0);

  // Fetch the signed-in user's gift-wrapped messages for a storefront AFTER the
  // page has painted, then hydrate any missing counterparty profiles. Kept off
  // the initial render path because decrypting the full message history is the
  // slow part of loading a custom stall/domain page when signed in.
  const scheduleStorefrontChatFetch = (
    sfPubkey: string,
    userPubkey: string,
    allRelays: string[]
  ) => {
    if (!nostr || !signer) return;
    const token = ++storefrontChatRunRef.current;
    scheduleAfterPaint(() => {
      if (storefrontChatRunRef.current !== token) return;
      const guardedEditChat = (chatsMap: ChatsMap, isLoading: boolean) => {
        if (storefrontChatRunRef.current !== token) return;
        editChatContext(chatsMap, isLoading);
      };
      fetchStorefrontChats(
        nostr!,
        signer!,
        allRelays,
        sfPubkey,
        userPubkey,
        guardedEditChat
      )
        .then((profileSet) => {
          if (storefrontChatRunRef.current !== token) return;
          const missing = Array.from(profileSet).filter(
            (pk) => !profileContext.profileData.has(pk)
          );
          if (missing.length > 0) {
            fetchProfile(
              nostr!,
              allRelays,
              missing,
              editProfileContext,
              profileContext.profileData
            ).catch((error) =>
              console.error(
                "Error fetching deferred storefront chat profiles:",
                error
              )
            );
          }
        })
        .catch((error) =>
          console.error("Error during deferred storefront chat fetch:", error)
        );
    });
  };

  // Detect when the visitor is on a seller's custom domain (anything that
  // isn't milk.market, *.milk.market, *.replit.app, *.replit.dev, *.repl.co,
  // or localhost). On a custom domain we suppress the Milk Market TopNav and
  // wrap the page in the seller's storefront chrome (nav + footer + theme).
  //
  // The initial value comes from middleware-set request headers via
  // App.getInitialProps, so the first SSR render is already correct (no
  // platform-chrome flash before client hydration).
  // Middleware injects __isCustomDomainSsr / __customDomainShopSlug into
  // pageProps via App.getInitialProps below. When that signal is present we
  // mark domainState.isResolved = true on the very first render so consumers
  // (CustomDomainProvider, links, the theme wrapper) can render the correct
  // hrefs immediately — no post-hydration flip, no tree-shape change.
  //
  // The follow-up useEffect only runs if the SSR signal disagreed with the
  // client's hostname (e.g. middleware missing in dev) and corrects it once.
  const ssrIsCustomDomain = props.pageProps?.__isCustomDomainSsr === true;
  const ssrShopSlug: string | null =
    props.pageProps?.__customDomainShopSlug ?? null;
  const hasSsrCustomDomainSignal =
    props.pageProps?.__isCustomDomainSsr !== undefined;
  const [domainState, setDomainState] = useState<{
    isCustomDomain: boolean;
    isResolved: boolean;
  }>({
    isCustomDomain: ssrIsCustomDomain,
    isResolved: hasSsrCustomDomainSignal,
  });
  const { isCustomDomain: isCustomDomainVisit } = domainState;
  useEffect(() => {
    if (typeof window === "undefined") return;
    const host = window.location.hostname.toLowerCase();
    if (!host) return;
    const PLATFORM_EXACT = new Set(["localhost", "127.0.0.1", "0.0.0.0"]);
    let detected: boolean;
    if (PLATFORM_EXACT.has(host)) {
      detected = false;
    } else {
      const PLATFORM_SUFFIXES = [
        "milk.market",
        "replit.app",
        "replit.dev",
        "repl.co",
      ];
      const isPlatform = PLATFORM_SUFFIXES.some(
        (s) => host === s || host.endsWith("." + s)
      );
      detected = !isPlatform;
    }
    setDomainState((prev) => {
      if (prev.isCustomDomain === detected && prev.isResolved) return prev;
      return { isCustomDomain: detected, isResolved: true };
    });
  }, []);

  // Stall-scoped routes can be served either by /pages/stall/** directly or
  // by Next.js rewrites (e.g. /stall/<slug>/listing/<id> -> /listing/<id>,
  // /stall/<slug>/cart -> /cart). In the rewrite case `router.pathname` is
  // the destination page, so we also need to inspect `router.asPath` (the
  // user-visible URL) to detect a stall context. Without this the storefront
  // fast-path fetch never runs and the theme wrapper has no shop data to
  // render against, so the custom nav / fonts / neo shadows never appear.
  const isStorefrontRoute =
    router.pathname.startsWith("/stall/") ||
    (router.asPath ?? "").startsWith("/stall/") ||
    (isCustomDomainVisit && !!ssrShopSlug);

  const currentStorefrontSlug =
    router.pathname.startsWith("/stall/") ||
    (router.asPath ?? "").startsWith("/stall/")
      ? decodeURIComponent(
          (
            (router.asPath ?? "").replace(/^\/stall\//, "").split("/")[0] ?? ""
          ).split("?")[0] ?? ""
        )
      : isCustomDomainVisit && ssrShopSlug
        ? ssrShopSlug
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
    let slug: string | null = null;

    const stallPath =
      router.asPath.replace(/^\/stall\//, "").split("/")[0] ?? "";
    if (stallPath) {
      slug = decodeURIComponent(stallPath.split("?")[0] ?? "");
    }

    // Custom-domain visit: the URL has no /stall/<slug> prefix, but
    // middleware passed the slug along via getInitialProps so the
    // storefront fast-path can still resolve the seller's pubkey.
    if (!slug && isCustomDomainVisit && ssrShopSlug) {
      slug = ssrShopSlug;
    }

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
      // Invalidate any deferred storefront chat fetch queued by a previous
      // init run (e.g. before an account switch / logout) so it can't repopulate
      // the chat context with the prior session's messages.
      storefrontChatRunRef.current++;
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
                isLoggedIn && userPubkey ? { userPubkey } : undefined
              );
            } catch (error) {
              console.error("Error during focused storefront fetch:", error);
            }

            if (!isCurrentRun()) return;

            // Defer the heavy gift-wrapped message fetch + decryption until
            // after the storefront has painted. Decrypting the full message
            // history (two signer.decrypt calls per wrap) would otherwise
            // block the initial render for signed-in users on custom domains
            // and stall routes.
            if (isLoggedIn && userPubkey) {
              scheduleStorefrontChatFetch(sfPubkey, userPubkey, allRelays);
            }

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
        const initialUserProfileFetch =
          isLoggedIn && userPubkey
            ? fetchProfile(
                nostr!,
                allRelays,
                [userPubkey],
                guardedEditProfileContext,
                profileContext.profileData
              ).catch((error) => {
                console.error("Error fetching current user profile:", error);
              })
            : Promise.resolve();

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
          () => guardedEditProductContext(null, false)
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

        await initialUserProfileFetch;

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

        setFullLoadComplete(true);
      } catch (error) {
        console.error("Critical error during app initialization:", error);
        if (!isCurrentRun()) return;
        guardedEditProductContext(null, false);
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
          isLoggedIn && userPubkey ? { userPubkey } : undefined
        );
      } catch (error) {
        console.error("Error during storefront-to-storefront refetch:", error);
      }

      // Defer the heavy message fetch + decryption until after the new
      // storefront has painted (see fast-path note above).
      if (isLoggedIn && userPubkey) {
        scheduleStorefrontChatFetch(sfPubkey, userPubkey, allRelays);
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
            editProductContext(null, false);
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
        isCustomDomain={isCustomDomainVisit}
        customDomainShopPubkey={
          isCustomDomainVisit ? storefrontLoadPubkey || ssrShopPubkey : null
        }
      />
      <StructuredData />
      <PageLoadingBar />
      <AffiliateRefTracker storefrontPubkey={storefrontLoadPubkey} />
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
                          {!isCustomDomainVisit &&
                            router.pathname !== "/" &&
                            router.pathname !== "/producer-guide" &&
                            router.pathname !== "/faq" &&
                            router.pathname !== "/terms" &&
                            router.pathname !== "/privacy" &&
                            router.pathname !== "/about" &&
                            router.pathname !== "/contact" &&
                            !router.pathname.startsWith("/stall/") &&
                            !(router.asPath ?? "").startsWith("/stall/") && (
                              <TopNav
                                setFocusedPubkey={setFocusedPubkey}
                                setSelectedSection={setSelectedSection}
                              />
                            )}
                          <div className="flex">
                            <main className="flex-1">
                              <CustomDomainProvider
                                value={domainState.isCustomDomain}
                                isResolved={domainState.isResolved}
                              >
                                {storefrontLoadPubkey ? (
                                  <StorefrontThemeWrapper
                                    sellerPubkey={storefrontLoadPubkey}
                                    // Wrapper internally decides whether to render storefront chrome
                                    // based on isCustomDomain — but its mount/unmount is stable.
                                    //
                                    // Suppress chrome for /stall/* pages: they render
                                    // <StorefrontLayout> themselves, which already paints
                                    // its own nav + footer. Wrapping them in another set
                                    // of chrome doubled the footer (and nav) on custom
                                    // domains once the SSR pubkey seed started populating
                                    // `storefrontLoadPubkey` on first render. The
                                    // `useInsideStorefrontChrome` guard inside the wrapper
                                    // only catches nested <StorefrontThemeWrapper> calls
                                    // (e.g. /listing, /cart), not StorefrontLayout.
                                    renderChrome={
                                      domainState.isCustomDomain &&
                                      !router.pathname.startsWith("/stall/")
                                    }
                                  >
                                    {/* Stable key on both branches so if
                                                  the wrapper ever flips in/out
                                                  (e.g. _error.tsx paths) React
                                                  treats the page as the same
                                                  element instead of remounting. */}
                                    <Component
                                      key="page"
                                      {...pageProps}
                                      focusedPubkey={focusedPubkey}
                                      setFocusedPubkey={setFocusedPubkey}
                                      selectedSection={selectedSection}
                                      setSelectedSection={setSelectedSection}
                                    />
                                  </StorefrontThemeWrapper>
                                ) : (
                                  <Component
                                    key="page"
                                    {...pageProps}
                                    focusedPubkey={focusedPubkey}
                                    setFocusedPubkey={setFocusedPubkey}
                                    selectedSection={selectedSection}
                                    setSelectedSection={setSelectedSection}
                                  />
                                )}
                              </CustomDomainProvider>
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
              <MintRecoveryBoot />
              <MilkMarket props={props} />
            </SignerContextProvider>
          </NostrContextProvider>
        </NextThemesProvider>
      </HeroUIProvider>
    </>
  );
}

// Read middleware-injected custom-domain headers on the server so the very
// first SSR render of every page already knows whether it's serving a
// seller's custom domain (and which seller). This is what eliminates the
// "platform TopNav flash" before client-side detection kicks in, and lets
// the page boot into the storefront chrome without a layout swap.
App.getInitialProps = async (appContext: AppContext) => {
  const appProps = await NextApp.getInitialProps(appContext);
  const req = appContext.ctx.req as
    | (typeof appContext.ctx.req & {
        headers: Record<string, string | string[] | undefined>;
      })
    | undefined;
  const headers = req?.headers ?? {};
  const headerVal = (name: string): string | null => {
    const v = headers[name];
    if (Array.isArray(v)) return v[0] ?? null;
    return typeof v === "string" ? v : null;
  };
  const isCustomDomainSsr = headerVal("x-mm-custom-domain") === "1";
  const customDomainShopSlug = headerVal("x-mm-shop-slug");
  // Also forward the pubkey so the client can seed `storefrontLoadPubkey`
  // synchronously on the first render and avoid a post-hydration remount
  // when the wrapper appears around <Component/>.
  const customDomainShopPubkey = headerVal("x-mm-shop-pubkey");
  return {
    ...appProps,
    pageProps: {
      ...(appProps as { pageProps?: Record<string, unknown> }).pageProps,
      __isCustomDomainSsr: isCustomDomainSsr,
      __customDomainShopSlug: customDomainShopSlug,
      __customDomainShopPubkey: customDomainShopPubkey,
    },
  };
};

export default App;
