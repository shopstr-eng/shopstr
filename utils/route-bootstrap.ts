import type { Proof } from "@cashu/cashu-ts";
import type { NostrSigner } from "@/utils/nostr/signers/nostr-signer";
import type { NostrManager } from "@/utils/nostr/nostr-manager";
import type {
  NostrEvent,
  ProfileData,
  ShopProfile,
  Community,
} from "@/utils/types/types";
import type { ChatsMap, CashuProofEvent } from "@/utils/context/context";
import { calculateWeightedScore } from "@/utils/parsers/review-parser-functions";
import {
  getLocalStorageData,
  getDefaultRelays,
  LogOut,
} from "@/utils/nostr/nostr-helper-functions";
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
import { retryFailedRelayPublishes } from "@/utils/nostr/retry-service";

export type RouteBootstrapFlags = {
  loadCatalog: boolean;
  loadChats: boolean;
  loadFollows: boolean;
  loadCommunities: boolean;
  loadWallet: boolean;
};

export type CatalogBackfillMode = "none" | "background" | "until-match";

type ProductReviewsMap = Map<string, Map<string, Map<string, string[][]>>>;

type Editors = {
  editProductContext: (productEvents: NostrEvent[], isLoading: boolean) => void;
  editReviewsContext: (
    merchantReviewsData: Map<string, number[]>,
    productReviewsData: ProductReviewsMap,
    isLoading: boolean
  ) => void;
  editShopContext: (
    shopData: Map<string, ShopProfile>,
    isLoading: boolean
  ) => void;
  editProfileContext: (
    profileData: Map<string, ProfileData>,
    isLoading: boolean
  ) => void;
  editChatContext: (chatsMap: ChatsMap, isLoading: boolean) => void;
  editFollowsContext: (
    followList: string[],
    firstDegreeFollowsLength: number,
    isLoading: boolean
  ) => void;
  editRelaysContext: (
    relayList: string[],
    readRelayList: string[],
    writeRelayList: string[],
    isLoading: boolean
  ) => void;
  editBlossomContext: (blossomServers: string[], isLoading: boolean) => void;
  editCashuWalletContext: (
    proofEvents: CashuProofEvent[],
    cashuMints: string[],
    cashuProofs: Proof[],
    isLoading: boolean
  ) => void;
  editCommunityContext: (
    communities: Map<string, Community>,
    isLoading: boolean
  ) => void;
};

type Params = {
  flags: RouteBootstrapFlags;
  nostr: NostrManager;
  signer?: NostrSigner;
  isLoggedIn?: boolean;
  catalogBackfillMode?: CatalogBackfillMode;
  catalogTargetId?: string;
  signal?: AbortSignal;
} & Editors;

function getProductAddress(productEvent: NostrEvent): string | undefined {
  if (productEvent.kind !== 30402) return undefined;
  const dTag = productEvent.tags.find((tag) => tag[0] === "d")?.[1];
  if (!dTag) return undefined;
  return `${productEvent.kind}:${productEvent.pubkey}:${dTag}`;
}

function mergeProfileMaps(
  target: Map<string, ProfileData>,
  incoming: Map<string, ProfileData>
): void {
  for (const [pubkey, profile] of incoming.entries()) {
    const existing = target.get(pubkey);
    if (!existing || profile.created_at >= existing.created_at) {
      target.set(pubkey, profile);
    }
  }
}

function mergeShopMaps(
  target: Map<string, ShopProfile>,
  incoming: Map<string, ShopProfile>
): void {
  for (const [pubkey, shopProfile] of incoming.entries()) {
    const existing = target.get(pubkey);
    if (!existing || shopProfile.created_at >= existing.created_at) {
      target.set(pubkey, shopProfile);
    }
  }
}

function mergeProductReviews(
  target: ProductReviewsMap,
  incoming: ProductReviewsMap
): void {
  for (const [merchantPubkey, merchantProducts] of incoming.entries()) {
    if (!target.has(merchantPubkey)) {
      target.set(merchantPubkey, new Map());
    }

    const targetMerchantProducts = target.get(merchantPubkey)!;

    for (const [productDTag, productReviews] of merchantProducts.entries()) {
      if (!targetMerchantProducts.has(productDTag)) {
        targetMerchantProducts.set(productDTag, new Map());
      }

      const targetProductReviews = targetMerchantProducts.get(productDTag)!;
      for (const [reviewerPubkey, reviewTags] of productReviews.entries()) {
        targetProductReviews.set(reviewerPubkey, reviewTags);
      }
    }
  }
}

function cloneProductReviewsMap(source: ProductReviewsMap): ProductReviewsMap {
  const cloned: ProductReviewsMap = new Map();

  for (const [merchantPubkey, merchantProducts] of source.entries()) {
    const productClone = new Map<string, Map<string, string[][]>>();
    for (const [productDTag, productReviews] of merchantProducts.entries()) {
      productClone.set(productDTag, new Map(productReviews));
    }
    cloned.set(merchantPubkey, productClone);
  }

  return cloned;
}

function recomputeMerchantScores(
  productReviewsMap: ProductReviewsMap
): Map<string, number[]> {
  const merchantScoresMap = new Map<string, number[]>();

  for (const [
    merchantPubkey,
    merchantProducts,
  ] of productReviewsMap.entries()) {
    const merchantScores: number[] = [];

    for (const productReviews of merchantProducts.values()) {
      for (const reviewTags of productReviews.values()) {
        merchantScores.push(calculateWeightedScore(reviewTags));
      }
    }

    if (merchantScores.length > 0) {
      merchantScoresMap.set(merchantPubkey, merchantScores);
    }
  }

  return merchantScoresMap;
}

export async function runRouteBootstrap({
  flags,
  nostr,
  signer,
  isLoggedIn,
  catalogBackfillMode = "none",
  catalogTargetId,
  signal,
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
}: Params): Promise<void> {
  const localData = getLocalStorageData();

  if (signal?.aborted) return;

  if (localData.signInMethod === "amber") {
    LogOut();
    return;
  }

  if (
    localData.signInMethod === "extension" ||
    localData.signer?.type === "nip07"
  ) {
    if (!window.nostr?.nip44) {
      LogOut();
      return;
    }
  }

  let allRelays = [
    ...(localData.relays || []),
    ...(localData.readRelays || []),
  ];
  if (allRelays.length === 0) {
    allRelays = getDefaultRelays();
    localStorage.setItem("relays", JSON.stringify(allRelays));
  }

  const userPubkey = (await signer?.getPubKey()) || undefined;

  const mergedProfileMap = new Map<string, ProfileData>();
  const mergedShopMap = new Map<string, ShopProfile>();
  const mergedProductReviewsMap: ProductReviewsMap = new Map();
  const loadedCatalogPubkeys = new Set<string>();
  const loadedReviewAddresses = new Set<string>();

  const noopEditProfileContext = (_profileData: Map<string, ProfileData>) => {};
  const noopEditShopContext = (_shopData: Map<string, ShopProfile>) => {};
  const noopEditReviewsContext = (
    _merchantReviewsData: Map<string, number[]>,
    _productReviewsData: ProductReviewsMap
  ) => {};

  const applyProfileDelta = (incomingProfiles: Map<string, ProfileData>) => {
    if (signal?.aborted || incomingProfiles.size === 0) return;
    mergeProfileMaps(mergedProfileMap, incomingProfiles);
    editProfileContext(new Map(mergedProfileMap), false);
  };

  const applyShopDelta = (incomingShops: Map<string, ShopProfile>) => {
    if (signal?.aborted || incomingShops.size === 0) return;
    mergeShopMaps(mergedShopMap, incomingShops);
    editShopContext(new Map(mergedShopMap), false);
  };

  const applyReviewDelta = (incomingReviews: ProductReviewsMap) => {
    if (signal?.aborted || incomingReviews.size === 0) return;
    mergeProductReviews(mergedProductReviewsMap, incomingReviews);
    editReviewsContext(
      recomputeMerchantScores(mergedProductReviewsMap),
      cloneProductReviewsMap(mergedProductReviewsMap),
      false
    );
  };

  const loadCatalogMetadataForProducts = async (
    catalogProducts: NostrEvent[],
    abortSignal: AbortSignal | undefined = signal
  ): Promise<void> => {
    if (abortSignal?.aborted || catalogProducts.length === 0) return;

    const nextPubkeys = Array.from(
      new Set(catalogProducts.map((product) => product.pubkey).filter(Boolean))
    ).filter((pubkey) => !loadedCatalogPubkeys.has(pubkey));

    const nextReviewAddresses = Array.from(
      new Set(
        catalogProducts
          .map(getProductAddress)
          .filter((address): address is string => !!address)
      )
    ).filter((address) => !loadedReviewAddresses.has(address));

    nextPubkeys.forEach((pubkey) => loadedCatalogPubkeys.add(pubkey));
    nextReviewAddresses.forEach((address) =>
      loadedReviewAddresses.add(address)
    );

    const metadataTasks: Promise<void>[] = [];

    if (nextPubkeys.length > 0) {
      metadataTasks.push(
        fetchProfile(nostr, allRelays, nextPubkeys, noopEditProfileContext)
          .then(({ profileMap }) => {
            if (!abortSignal?.aborted) {
              applyProfileDelta(profileMap);
            }
          })
          .catch((error) => {
            console.error("Error fetching backfilled profiles:", error);
          }),
        fetchShopProfile(nostr, allRelays, nextPubkeys, noopEditShopContext)
          .then(({ shopProfileMap }) => {
            if (!abortSignal?.aborted) {
              applyShopDelta(shopProfileMap);
            }
          })
          .catch((error) => {
            console.error("Error fetching backfilled shop profiles:", error);
          })
      );
    }

    if (nextReviewAddresses.length > 0) {
      metadataTasks.push(
        fetchReviews(nostr, allRelays, catalogProducts, noopEditReviewsContext)
          .then(({ productReviewsMap }) => {
            if (!abortSignal?.aborted) {
              applyReviewDelta(productReviewsMap);
            }
          })
          .catch((error) => {
            console.error("Error fetching backfilled reviews:", error);
          })
      );
    }

    await Promise.allSettled(metadataTasks);
  };

  if (isLoggedIn) {
    const [relayResult, blossomResult] = await Promise.allSettled([
      fetchAllRelays(nostr, signer!, allRelays, editRelaysContext),
      fetchAllBlossomServers(nostr, signer!, allRelays, editBlossomContext),
    ]);

    if (signal?.aborted) return;

    if (relayResult.status === "fulfilled") {
      const { relayList, readRelayList, writeRelayList } = relayResult.value;
      if (relayList.length !== 0) {
        localStorage.setItem("relays", JSON.stringify(relayList));
        localStorage.setItem("readRelays", JSON.stringify(readRelayList));
        localStorage.setItem("writeRelays", JSON.stringify(writeRelayList));
        allRelays = [...relayList, ...readRelayList];
      }
    } else {
      console.error("Error fetching relays:", relayResult.reason);
      editRelaysContext([], [], [], false);
    }

    if (blossomResult.status === "fulfilled") {
      const { blossomServers } = blossomResult.value;
      if (blossomServers.length !== 0) {
        localStorage.setItem("blossomServers", JSON.stringify(blossomServers));
      }
    } else {
      console.error("Error fetching blossom servers:", blossomResult.reason);
      editBlossomContext([], false);
    }
  } else {
    editRelaysContext([], [], [], false);
    editBlossomContext([], false);
  }

  let productEvents: NostrEvent[] = [];
  let profileSetFromProducts = new Set<string>();

  if (flags.loadCatalog) {
    try {
      const postsResult = await fetchAllPosts(
        nostr,
        allRelays,
        editProductContext,
        {
          backfillMode: catalogBackfillMode,
          targetProductId: catalogTargetId,
          signal,
          onBackgroundProductsMerged: async (
            deltaProducts,
            _allProducts,
            backfillSignal
          ) => {
            await loadCatalogMetadataForProducts(deltaProducts, backfillSignal);
          },
        }
      );

      if (signal?.aborted) return;

      productEvents = postsResult.productEvents;
      profileSetFromProducts = postsResult.profileSetFromProducts;
    } catch (error) {
      console.error("Error fetching products:", error);
      editProductContext([], false);
    }
  } else {
    editProductContext([], false);
  }

  const profileSetFromChats = new Set<string>();
  if (flags.loadChats && isLoggedIn && userPubkey) {
    try {
      const { profileSetFromChats: chatProfiles } =
        await fetchGiftWrappedChatsAndMessages(
          nostr,
          signer,
          allRelays,
          editChatContext,
          userPubkey
        );
      chatProfiles.forEach((profile) => profileSetFromChats.add(profile));
    } catch (error) {
      console.error("Error fetching chats:", error);
      editChatContext(new Map(), false);
    }
  } else {
    editChatContext(new Map(), false);
  }

  let pubkeysToFetchProfilesFor = [...profileSetFromProducts];
  if (userPubkey) {
    pubkeysToFetchProfilesFor = [
      userPubkey,
      ...pubkeysToFetchProfilesFor,
      ...profileSetFromChats,
    ];
  }

  pubkeysToFetchProfilesFor = Array.from(
    new Set(pubkeysToFetchProfilesFor.filter(Boolean))
  );

  for (const pubkey of pubkeysToFetchProfilesFor) {
    loadedCatalogPubkeys.add(pubkey);
  }

  for (const address of productEvents
    .map(getProductAddress)
    .filter((value): value is string => !!value)) {
    loadedReviewAddresses.add(address);
  }

  const postBootstrapTasks: Promise<unknown>[] = [];

  if (flags.loadCatalog) {
    if (pubkeysToFetchProfilesFor.length > 0) {
      postBootstrapTasks.push(
        fetchProfile(
          nostr,
          allRelays,
          pubkeysToFetchProfilesFor,
          noopEditProfileContext
        )
          .then(({ profileMap }) => {
            if (!signal?.aborted) {
              applyProfileDelta(profileMap);
            }
          })
          .catch((error) => {
            console.error("Error fetching profiles:", error);
            if (!signal?.aborted) {
              editProfileContext(new Map(), false);
            }
          }),
        fetchShopProfile(
          nostr,
          allRelays,
          pubkeysToFetchProfilesFor,
          noopEditShopContext
        )
          .then(({ shopProfileMap }) => {
            if (!signal?.aborted) {
              applyShopDelta(shopProfileMap);
            }
          })
          .catch((error) => {
            console.error("Error fetching shop profiles:", error);
            if (!signal?.aborted) {
              editShopContext(new Map(), false);
            }
          })
      );
    } else {
      editProfileContext(new Map(), false);
      editShopContext(new Map(), false);
    }

    if (productEvents.length > 0) {
      postBootstrapTasks.push(
        fetchReviews(nostr, allRelays, productEvents, noopEditReviewsContext)
          .then(({ productReviewsMap }) => {
            if (!signal?.aborted) {
              applyReviewDelta(productReviewsMap);
            }
          })
          .catch((error) => {
            console.error("Error fetching reviews:", error);
            if (!signal?.aborted) {
              editReviewsContext(new Map(), new Map(), false);
            }
          })
      );
    } else {
      editReviewsContext(new Map(), new Map(), false);
    }
  } else {
    editProfileContext(new Map(), false);
    editShopContext(new Map(), false);
    editReviewsContext(new Map(), new Map(), false);
  }

  if (flags.loadCommunities) {
    postBootstrapTasks.push(
      fetchAllCommunities(nostr, allRelays, editCommunityContext).catch(
        (error) => {
          console.error("Error fetching communities:", error);
          editCommunityContext(new Map(), false);
        }
      )
    );
  } else {
    editCommunityContext(new Map(), false);
  }

  if (flags.loadWallet && isLoggedIn) {
    postBootstrapTasks.push(
      fetchCashuWallet(nostr, signer!, allRelays, editCashuWalletContext)
        .then(({ cashuMints, cashuProofs }) => {
          if (signal?.aborted) return;
          if (cashuMints.length !== 0 && cashuProofs) {
            localStorage.setItem("mints", JSON.stringify(cashuMints));
            localStorage.setItem("tokens", JSON.stringify(cashuProofs));
          }
        })
        .catch((error) => {
          console.error("Error fetching wallet:", error);
          editCashuWalletContext([], [], [], false);
        })
    );
  } else {
    editCashuWalletContext([], [], [], false);
  }

  if (flags.loadFollows) {
    postBootstrapTasks.push(
      fetchAllFollows(nostr, allRelays, editFollowsContext, userPubkey).catch(
        (error) => {
          console.error("Error fetching follows:", error);
          editFollowsContext([], 0, false);
        }
      )
    );
  } else {
    editFollowsContext([], 0, false);
  }

  await Promise.allSettled(postBootstrapTasks);

  if (signal?.aborted) return;

  if (isLoggedIn) {
    try {
      const { relays, writeRelays } = getLocalStorageData();
      const { NostrManager } = await import("@/utils/nostr/nostr-manager");
      const retryNostr = new NostrManager([...relays, ...writeRelays]);
      await retryFailedRelayPublishes(retryNostr);
    } catch (error) {
      console.error("Failed to retry relay publishes:", error);
    }
  }
}
