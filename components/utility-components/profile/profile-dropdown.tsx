import {
  getStoredReadRelays,
  getStoredRelays,
  LogOut,
} from "@/utils/nostr/nostr-helper-functions";
import {
  ProfileMapContext,
  RelaysContext,
  ShopMapContext,
} from "@/utils/context/context";
import {
  Dropdown,
  DropdownItem,
  DropdownItemProps,
  DropdownMenu,
  DropdownTrigger,
  Spinner,
  User,
  useDisclosure,
} from "@heroui/react";
import { nip19 } from "nostr-tools";
import { useContext, useEffect, useRef, useState } from "react";
import { getProfileSlug } from "@/utils/url-slugs";
import {
  ArrowRightStartOnRectangleIcon,
  BuildingStorefrontIcon,
  ChatBubbleBottomCenterIcon,
  CheckIcon,
  ClipboardIcon,
  Cog6ToothIcon,
  GlobeAltIcon,
  ExclamationTriangleIcon,
  UserIcon,
  UserMinusIcon,
  UserPlusIcon,
} from "@heroicons/react/24/outline";
import { useRouter } from "next/router";
import {
  NostrContext,
  SignerContext,
} from "@/components/utility-components/nostr-context-provider";
import SignInModal from "../../sign-in/SignInModal";
import useReportEventFlow from "../use-report-event-flow";
import { ProfileData } from "@/utils/types/types";
import { useFollowToggle } from "@/components/hooks/use-follow-toggle";
import {
  clearNip58ProfileBadgeHydrationCache,
  fetchProfile,
  hydrateNip58ProfileBadges,
  NIP58_BADGE_HYDRATION_RETRY_MS,
} from "@/utils/nostr/fetch-service";
import { getDefaultRelays } from "@/utils/nostr/relay-config";
import { sanitizeUrl } from "@braintree/sanitize-url";

type DropDownKeys =
  | "shop"
  | "shop_profile"
  | "storefront"
  | "inquiry"
  | "report_profile"
  | "settings"
  | "user_profile"
  | "logout"
  | "copy_npub"
  | "follow";

type DropdownActionItem = Omit<DropdownItemProps, "onClick"> & {
  label: string;
  onClick?: () => void | Promise<void>;
};
type ProfileBadge = NonNullable<ProfileData["badges"]>[number];
type VisibleProfileBadge = {
  badge: ProfileBadge;
  imageUrl: string;
};

const fetchedProfileContentCache = new Map<string, ProfileData["content"]>();
const inFlightProfileRequests = new Map<
  string,
  Promise<ProfileData["content"] | null>
>();
const MAX_PROFILE_CACHE_ENTRIES = 100;
const MAX_VISIBLE_PROFILE_BADGES = 4;

const trimProfileContentCache = () => {
  while (fetchedProfileContentCache.size > MAX_PROFILE_CACHE_ENTRIES) {
    const oldestKey = fetchedProfileContentCache.keys().next().value;
    if (!oldestKey) break;
    fetchedProfileContentCache.delete(oldestKey);
  }
};

const clearProfileRequestCaches = () => {
  fetchedProfileContentCache.clear();
  inFlightProfileRequests.clear();
  clearNip58ProfileBadgeHydrationCache();
};

const sanitizeBadgeImageUrl = (imageUrl?: string) => {
  const sanitizedUrl = sanitizeUrl(imageUrl || "");
  if (!sanitizedUrl || sanitizedUrl === "about:blank") return "";

  try {
    const parsedUrl = new URL(sanitizedUrl);
    return parsedUrl.protocol === "http:" || parsedUrl.protocol === "https:"
      ? sanitizedUrl
      : "";
  } catch {
    return "";
  }
};

const fetchProfileContent = async (pubkey: string) => {
  try {
    const response = await fetch(
      `/api/db/fetch-profile?pubkey=${encodeURIComponent(pubkey)}`
    );
    if (!response.ok) return null;

    const responseText = await response.text();
    if (!responseText) return null;

    const data = JSON.parse(responseText) as {
      profile?: {
        content?: ProfileData["content"];
      };
    };

    return data?.profile?.content || null;
  } catch {
    return null;
  }
};

export const ProfileWithDropdown = ({
  pubkey,
  baseClassname,
  nameClassname = "block",
  dropDownKeys,
  hydrateMissingProfileFromRelays = false,
}: {
  baseClassname?: string;
  nameClassname?: string;
  pubkey: string;
  dropDownKeys: DropDownKeys[];
  hydrateMissingProfileFromRelays?: boolean;
}) => {
  const [fetchedProfileContent, setFetchedProfileContent] = useState<
    ProfileData["content"] | null
  >(null);
  const [isNPubCopied, setIsNPubCopied] = useState(false);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const profileContext = useContext(ProfileMapContext);
  const {
    profileData,
    isLoading: isProfileLoading,
    updateProfileData,
  } = profileContext;
  const profileDataRef = useRef(profileContext.profileData);
  profileDataRef.current = profileContext.profileData;
  const contextProfile = profileData.get(pubkey);
  const [badgeHydrationRetry, setBadgeHydrationRetry] = useState(0);
  const shopMapContext = useContext(ShopMapContext);
  const relaysContext = useContext(RelaysContext);
  const { nostr } = useContext(NostrContext);
  const npub = pubkey ? nip19.npubEncode(pubkey) : "";
  const router = useRouter();
  const { isLoggedIn } = useContext(SignerContext);
  const { isOpen, onOpen, onClose } = useDisclosure();

  const { openReportFlow, reportFlowUi } = useReportEventFlow({
    targetLabel: "profile",
    reportedPubkey: pubkey,
    onRequireLogin: onOpen,
  });

  const closeDropdown = () => {
    setIsDropdownOpen(false);
  };

  const handleDropdownAction = (action: () => void | Promise<void>) => {
    closeDropdown();
    void action();
  };

  const {
    isFollowing,
    isLoading: isFollowLoading,
    toggle: toggleFollow,
  } = useFollowToggle(pubkey, {
    onRequireSignIn: () => {
      closeDropdown();
      onOpen();
    },
    onSuccess: closeDropdown,
  });

  useEffect(() => {
    let isCancelled = false;

    if (!pubkey) return;
    if (typeof fetch !== "function") return;

    const contextProfileContent = contextProfile?.content;
    if (contextProfileContent) {
      setFetchedProfileContent(contextProfileContent);
      return;
    }

    const cachedProfileContent = fetchedProfileContentCache.get(pubkey);
    if (cachedProfileContent) {
      setFetchedProfileContent(cachedProfileContent);
      return;
    }

    if (isProfileLoading) {
      setFetchedProfileContent(null);
      return;
    }

    setFetchedProfileContent(null);
    let request = inFlightProfileRequests.get(pubkey);
    if (!request) {
      request = fetchProfileContent(pubkey)
        .then((content) => {
          if (content) {
            fetchedProfileContentCache.set(pubkey, content);
            trimProfileContentCache();
          }
          return content;
        })
        .finally(() => {
          inFlightProfileRequests.delete(pubkey);
        });
      inFlightProfileRequests.set(pubkey, request);
    }

    request
      .then((content) => {
        if (!content || isCancelled) return;
        setFetchedProfileContent(content);
      })
      .catch(() => {});

    return () => {
      isCancelled = true;
    };
  }, [contextProfile?.content, isProfileLoading, pubkey]);

  useEffect(() => {
    if (!pubkey || !nostr || typeof nostr.fetch !== "function") return;
    if (isProfileLoading && !hydrateMissingProfileFromRelays) return;

    if (Array.isArray(contextProfile?.badges)) return;
    if (!contextProfile && !hydrateMissingProfileFromRelays) return;

    const relays = Array.from(
      new Set([
        ...(relaysContext.relayList || []),
        ...(relaysContext.readRelayList || []),
      ])
    );
    const storedRelays = Array.from(
      new Set([...getStoredRelays(), ...getStoredReadRelays()])
    );
    const relaysToFetch =
      relays.length > 0
        ? relays
        : storedRelays.length > 0
          ? storedRelays
          : getDefaultRelays();

    const updateProfileContext = (profileMap: Map<string, unknown>) => {
      const profile = profileMap.get(pubkey);
      if (profile) {
        const incomingProfile = profile as ProfileData;
        const currentProfile = profileDataRef.current.get(pubkey);
        updateProfileData(
          currentProfile && Array.isArray(incomingProfile.badges)
            ? { ...currentProfile, badges: incomingProfile.badges }
            : incomingProfile
        );
      }
    };
    const request = contextProfile
      ? hydrateNip58ProfileBadges(
          nostr,
          relaysToFetch,
          [pubkey],
          updateProfileContext,
          profileDataRef.current
        )
      : fetchProfile(
          nostr,
          relaysToFetch,
          [pubkey],
          updateProfileContext,
          profileDataRef.current
        ).then(
          ({ badgeHydration }) =>
            badgeHydration || Promise.resolve({ retryAt: null })
        );

    let cancelled = false;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    void request
      .catch((error) => {
        console.error("Failed to hydrate profile from relays:", error);
        return { retryAt: Date.now() + NIP58_BADGE_HYDRATION_RETRY_MS };
      })
      .then((outcome) => {
        if (cancelled || !outcome?.retryAt) return;
        retryTimer = setTimeout(
          () => {
            setBadgeHydrationRetry((retry) => retry + 1);
          },
          Math.max(0, outcome.retryAt - Date.now())
        );
      });

    return () => {
      cancelled = true;
      if (retryTimer) clearTimeout(retryTimer);
    };
  }, [
    badgeHydrationRetry,
    contextProfile,
    pubkey,
    hydrateMissingProfileFromRelays,
    isProfileLoading,
    nostr,
    relaysContext.readRelayList,
    relaysContext.relayList,
    updateProfileData,
  ]);

  const profile = contextProfile;
  const profileContent = profile?.content ?? fetchedProfileContent;
  const displayName = (() => {
    let name =
      profile?.content?.nip05 && profile.nip05Verified
        ? profile.content.nip05
        : profileContent?.name || npub;
    name = name.length > 15 ? name.slice(0, 15) + "..." : name;
    return name;
  })();
  const pfp = profileContent?.picture || `https://robohash.org/${pubkey}`;
  const isNip05Verified = profile?.nip05Verified || false;
  const showFollowingIndicator = dropDownKeys.includes("follow") && isFollowing;
  const profileBadges: VisibleProfileBadge[] = Array.isArray(profile?.badges)
    ? (profile.badges as ProfileBadge[])
        .reduce<VisibleProfileBadge[]>((visibleBadges, badge) => {
          const imageUrl = sanitizeBadgeImageUrl(
            badge.thumbnail || badge.image
          );
          if (imageUrl) {
            visibleBadges.push({ badge, imageUrl });
          }
          return visibleBadges;
        }, [])
        .slice(0, MAX_VISIBLE_PROFILE_BADGES)
    : [];
  const displayNameContent = (
    <span className="flex min-w-0 items-center gap-1.5">
      <span className="overflow-hidden text-ellipsis whitespace-nowrap">
        {displayName}
      </span>
      {profileBadges.length > 0 ? (
        <span className="inline-flex shrink-0 items-center -space-x-1">
          {profileBadges.map(({ badge, imageUrl }) => {
            return (
              <img
                key={`${badge.definitionAddress}:${badge.awardEventId}`}
                src={imageUrl}
                alt={`${badge.name} badge`}
                title={
                  badge.description
                    ? `${badge.name}: ${badge.description}`
                    : badge.name
                }
                className="h-4 w-4 rounded-full border border-white bg-white object-cover shadow-sm dark:border-black dark:bg-black"
                loading="lazy"
                referrerPolicy="no-referrer"
              />
            );
          })}
        </span>
      ) : null}
      {showFollowingIndicator ? (
        <span className="text-shopstr-purple dark:text-shopstr-yellow inline-flex shrink-0 items-center gap-1 text-[10px] font-medium">
          <span
            aria-hidden="true"
            className="h-1.5 w-1.5 rounded-full bg-current"
          />
          Following
        </span>
      ) : null}
    </span>
  );

  const DropDownItems: {
    [key in DropDownKeys]: DropdownActionItem;
  } = {
    shop: {
      key: "shop",
      color: "default",
      className: "text-light-text dark:text-dark-text",
      startContent: <BuildingStorefrontIcon className={"h-5 w-5"} />,
      onPress: () => {
        handleDropdownAction(() => {
          const slug = getProfileSlug(pubkey, profileContext.profileData);
          router.push(`/marketplace/${slug}`);
        });
      },
      label: "Visit Seller",
    },
    storefront: {
      key: "storefront",
      color: "default",
      className: "text-light-text dark:text-dark-text",
      startContent: <GlobeAltIcon className={"h-5 w-5"} />,
      onPress: () => {
        handleDropdownAction(() => {
          const shopData = shopMapContext.shopData.get(pubkey);
          const shopSlug = shopData?.content?.storefront?.shopSlug;
          if (shopSlug) {
            router.push(`/shop/${shopSlug}`);
          } else {
            const slug = getProfileSlug(pubkey, profileContext.profileData);
            router.push(`/marketplace/${slug}`);
          }
        });
      },
      label: "Visit Storefront",
    },
    shop_profile: {
      key: "shop_profile",
      color: "default",
      className: "text-light-text dark:text-dark-text",
      startContent: <BuildingStorefrontIcon className={"h-5 w-5"} />,
      onPress: () => {
        handleDropdownAction(() => {
          router.push("/settings/shop-profile");
        });
      },
      label: "Shop Profile",
    },
    inquiry: {
      key: "inquiry",
      color: "default",
      className: "text-light-text dark:text-dark-text",
      startContent: <ChatBubbleBottomCenterIcon className={"h-5 w-5"} />,
      onPress: () => {
        handleDropdownAction(() => {
          if (isLoggedIn) {
            router.push({
              pathname: "/orders",
              query: { pk: npub, isInquiry: true },
            });
          } else {
            onOpen();
          }
        });
      },
      label: "Send Inquiry",
    },
    report_profile: {
      key: "report_profile",
      color: "danger",
      className: "text-light-text dark:text-dark-text",
      startContent: <ExclamationTriangleIcon className={"h-5 w-5"} />,
      onClick: openReportFlow,
      label: "Report Profile",
    },
    user_profile: {
      key: "user_profile",
      color: "default",
      className: "text-light-text dark:text-dark-text",
      startContent: <UserIcon className={"h-5 w-5"} />,
      onPress: () => {
        handleDropdownAction(() => {
          router.push("/settings/user-profile");
        });
      },
      label: "Profile",
    },
    settings: {
      key: "settings",
      color: "default",
      className: "text-light-text dark:text-dark-text",
      startContent: <Cog6ToothIcon className={"h-5 w-5"} />,
      onPress: () => {
        handleDropdownAction(() => {
          router.push("/settings");
        });
      },
      label: "Settings",
    },
    logout: {
      key: "logout",
      color: "danger",
      className: "text-light-text dark:text-dark-text",
      startContent: <ArrowRightStartOnRectangleIcon className={"h-5 w-5"} />,
      onPress: () => {
        handleDropdownAction(() => {
          clearProfileRequestCaches();
          LogOut();
          router.push("/marketplace");
        });
      },
      label: "Log Out",
    },
    copy_npub: {
      key: "copy_npub",
      color: "default",
      className: "text-light-text dark:text-dark-text",
      startContent: isNPubCopied ? (
        <CheckIcon className="text-shopstr-purple dark:text-shopstr-yellow h-5 w-5" />
      ) : (
        <ClipboardIcon className="h-5 w-5" />
      ),
      onPress: () => {
        handleDropdownAction(async () => {
          try {
            const npub = nip19.npubEncode(pubkey);
            if (!navigator.clipboard?.writeText) {
              throw new Error("Clipboard API is not available");
            }
            await navigator.clipboard.writeText(npub);
            setIsNPubCopied(true);
            setTimeout(() => {
              setIsNPubCopied(false);
            }, 2100);
          } catch (error) {
            console.error("Failed to copy npub to clipboard", error);
          }
        });
      },
      label: isNPubCopied ? "Copied!" : "Copy npub",
    },
    follow: {
      key: "follow",
      color: "default",
      className: "text-light-text dark:text-dark-text",
      startContent: isFollowLoading ? (
        <Spinner size="sm" />
      ) : isFollowing ? (
        <UserMinusIcon className="h-5 w-5" />
      ) : (
        <UserPlusIcon className="h-5 w-5" />
      ),
      onPress: () => {
        void toggleFollow();
      },
      label: isFollowLoading
        ? "Please sign..."
        : isFollowing
          ? "Unfollow"
          : "+ Follow",
      isDisabled: isFollowLoading,
    },
  };

  const handleReportDropdownAction = (item: DropdownActionItem) => {
    setIsDropdownOpen(false);
    window.setTimeout(() => {
      item.onClick?.();
    }, 0);
  };

  return (
    <>
      <div
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
        }}
        onPointerDown={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <Dropdown
          placement="bottom-start"
          isOpen={isDropdownOpen}
          onOpenChange={setIsDropdownOpen}
        >
          <DropdownTrigger>
            <User
              as="button"
              avatarProps={{
                src: pfp,
              }}
              className={
                "group cursor-pointer rounded-md px-1 py-0.5 transition-all duration-200 hover:bg-black/5 hover:shadow-sm dark:hover:bg-white/10"
              }
              classNames={{
                name: `overflow-hidden text-ellipsis whitespace-nowrap text-light-text dark:text-dark-text hidden ${nameClassname} ${
                  isNip05Verified
                    ? "text-shopstr-purple dark:text-shopstr-yellow"
                    : ""
                } group-hover:underline group-hover:underline-offset-2`,
                base: `${baseClassname}`,
              }}
              name={displayNameContent}
            />
          </DropdownTrigger>
          <DropdownMenu
            aria-label="User Actions"
            variant="flat"
            // closeOnSelect is disabled so the follow item can stay open and
            // show its spinner while signing; every OTHER item must close the
            // menu itself (handleDropdownAction / handleReportDropdownAction).
            closeOnSelect={false}
            items={dropDownKeys.map((key) => DropDownItems[key])}
          >
            {(item) => {
              return (
                <DropdownItem
                  key={item.key}
                  color={item.color}
                  className={item.className}
                  startContent={item.startContent}
                  isDisabled={item.isDisabled}
                  onPress={
                    item.onClick
                      ? () => handleReportDropdownAction(item)
                      : item.onPress
                  }
                >
                  {item.label}
                </DropdownItem>
              );
            }}
          </DropdownMenu>
        </Dropdown>
      </div>
      {reportFlowUi}
      <SignInModal isOpen={isOpen} onClose={onClose} />
    </>
  );
};
