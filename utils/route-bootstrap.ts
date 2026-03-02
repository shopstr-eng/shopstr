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

type Editors = {
  editProductContext: (productEvents: NostrEvent[], isLoading: boolean) => void;
  editReviewsContext: (
    merchantReviewsData: Map<string, number[]>,
    productReviewsData: Map<string, Map<string, Map<string, string[][]>>>,
    isLoading: boolean
  ) => void;
  editShopContext: (shopData: Map<string, ShopProfile>, isLoading: boolean) => void;
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
} & Editors;

export async function runRouteBootstrap({
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
}: Params): Promise<void> {
  const localData = getLocalStorageData();

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

  let allRelays = [...(localData.relays || []), ...(localData.readRelays || [])];
  if (allRelays.length === 0) {
    allRelays = getDefaultRelays();
    localStorage.setItem("relays", JSON.stringify(allRelays));
  }

  const userPubkey = (await signer?.getPubKey()) || undefined;

  if (isLoggedIn) {
    const [relayResult, blossomResult] = await Promise.allSettled([
      fetchAllRelays(nostr, signer!, allRelays, editRelaysContext),
      fetchAllBlossomServers(nostr, signer!, allRelays, editBlossomContext),
    ]);

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
      const postsResult = await fetchAllPosts(nostr, allRelays, editProductContext);
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

  const postBootstrapTasks: Promise<unknown>[] = [];

  if (flags.loadCatalog) {
    postBootstrapTasks.push(
      fetchProfile(nostr, allRelays, pubkeysToFetchProfilesFor, editProfileContext).catch(
        (error) => {
          console.error("Error fetching profiles:", error);
          editProfileContext(new Map(), false);
        }
      ),
      fetchShopProfile(nostr, allRelays, pubkeysToFetchProfilesFor, editShopContext).catch(
        (error) => {
          console.error("Error fetching shop profiles:", error);
          editShopContext(new Map(), false);
        }
      ),
      fetchReviews(nostr, allRelays, productEvents, editReviewsContext).catch(
        (error) => {
          console.error("Error fetching reviews:", error);
          editReviewsContext(new Map(), new Map(), false);
        }
      )
    );
  } else {
    editProfileContext(new Map(), false);
    editShopContext(new Map(), false);
    editReviewsContext(new Map(), new Map(), false);
  }

  if (flags.loadCommunities) {
    postBootstrapTasks.push(
      fetchAllCommunities(nostr, allRelays, editCommunityContext).catch((error) => {
        console.error("Error fetching communities:", error);
        editCommunityContext(new Map(), false);
      })
    );
  } else {
    editCommunityContext(new Map(), false);
  }

  if (flags.loadWallet && isLoggedIn) {
    postBootstrapTasks.push(
      fetchCashuWallet(nostr, signer!, allRelays, editCashuWalletContext)
        .then(({ cashuMints, cashuProofs }) => {
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
