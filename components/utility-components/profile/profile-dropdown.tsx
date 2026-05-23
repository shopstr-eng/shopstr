import { LogOut } from "@/utils/nostr/nostr-helper-functions";
import { ProfileMapContext, ShopMapContext } from "@/utils/context/context";
import {
  Dropdown,
  DropdownItem,
  DropdownItemProps,
  DropdownMenu,
  DropdownTrigger,
  User,
  useDisclosure,
} from "@heroui/react";
import { nip19 } from "nostr-tools";
import { useContext, useEffect, useState } from "react";
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
} from "@heroicons/react/24/outline";
import { useRouter } from "next/router";
import { SignerContext } from "@/components/utility-components/nostr-context-provider";
import SignInModal from "../../sign-in/SignInModal";
import useReportEventFlow from "../use-report-event-flow";
import { ProfileData } from "@/utils/types/types";

type DropDownKeys =
  | "shop"
  | "shop_profile"
  | "storefront"
  | "inquiry"
  | "report_profile"
  | "settings"
  | "user_profile"
  | "logout"
  | "copy_npub";

type DropdownActionItem = Omit<DropdownItemProps, "onClick"> & {
  label: string;
  onClick?: () => void;
};

const fetchedProfileContentCache = new Map<string, ProfileData["content"]>();
const inFlightProfileRequests = new Map<
  string,
  Promise<ProfileData["content"] | null>
>();
const MAX_PROFILE_CACHE_ENTRIES = 100;

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
}: {
  baseClassname?: string;
  nameClassname?: string;
  pubkey: string;
  dropDownKeys: DropDownKeys[];
}) => {
  const [fetchedProfileContent, setFetchedProfileContent] = useState<
    ProfileData["content"] | null
  >(null);
  const [isNPubCopied, setIsNPubCopied] = useState(false);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const profileContext = useContext(ProfileMapContext);
  const shopMapContext = useContext(ShopMapContext);
  const npub = pubkey ? nip19.npubEncode(pubkey) : "";
  const router = useRouter();
  const { isLoggedIn } = useContext(SignerContext);
  const { isOpen, onOpen, onClose } = useDisclosure();

  const { openReportFlow, reportFlowUi } = useReportEventFlow({
    targetLabel: "profile",
    reportedPubkey: pubkey,
    onRequireLogin: onOpen,
  });

  const handleDropdownAction = (action: () => void) => {
    setIsDropdownOpen(false);
    action();
  };

  useEffect(() => {
    let isCancelled = false;

    if (!pubkey) return;
    if (typeof fetch !== "function") return;

    const contextProfileContent =
      profileContext.profileData.get(pubkey)?.content;
    if (contextProfileContent) {
      setFetchedProfileContent(contextProfileContent);
      return;
    }

    const cachedProfileContent = fetchedProfileContentCache.get(pubkey);
    if (cachedProfileContent) {
      setFetchedProfileContent(cachedProfileContent);
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
  }, [pubkey, profileContext.profileData]);

  const profile = profileContext.profileData.get(pubkey);
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
              name={displayName}
            />
          </DropdownTrigger>
          <DropdownMenu
            aria-label="User Actions"
            variant="flat"
            items={dropDownKeys.map((key) => DropDownItems[key])}
          >
            {(item) => {
              return (
                <DropdownItem
                  key={item.key}
                  color={item.color}
                  className={item.className}
                  startContent={item.startContent}
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
