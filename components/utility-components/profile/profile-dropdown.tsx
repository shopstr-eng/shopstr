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
  UserIcon,
} from "@heroicons/react/24/outline";
import { useRouter } from "next/router";
import { SignerContext } from "@/components/utility-components/nostr-context-provider";
import SignInModal from "../../sign-in/SignInModal";
import { copyToClipboard } from "@/utils/clipboard";
import { ProfileData } from "@/utils/types/types";

import { GlobeAltIcon } from "@heroicons/react/24/outline";

type DropDownKeys =
  | "shop"
  | "shop_profile"
  | "storefront"
  | "inquiry"
  | "settings"
  | "user_profile"
  | "logout"
  | "copy_npub";

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
  bg,
}: {
  baseClassname?: string;
  nameClassname?: string;
  pubkey: string;
  dropDownKeys: DropDownKeys[];
  bg?: string;
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
    [key in DropDownKeys]: DropdownItemProps & { label: string };
  } = {
    shop: {
      key: "shop",
      color: "default",
      className:
        "!text-black hover:!bg-blue-400 hover:!text-white font-bold data-[hover=true]:!bg-blue-400 data-[hover=true]:!text-white",
      startContent: (
        <BuildingStorefrontIcon className={"h-5 w-5 !text-black"} />
      ),
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
      className:
        "!text-black hover:!bg-blue-400 hover:!text-white font-bold data-[hover=true]:!bg-blue-400 data-[hover=true]:!text-white",
      startContent: <GlobeAltIcon className={"h-5 w-5 !text-black"} />,
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
      className:
        "!text-black hover:!bg-blue-400 hover:!text-white font-bold data-[hover=true]:!bg-blue-400 data-[hover=true]:!text-white",
      startContent: (
        <BuildingStorefrontIcon className={"h-5 w-5 !text-black"} />
      ),
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
      className:
        "!text-black hover:!bg-blue-400 hover:!text-white font-bold data-[hover=true]:!bg-blue-400 data-[hover=true]:!text-white",
      startContent: (
        <ChatBubbleBottomCenterIcon className={"h-5 w-5 !text-black"} />
      ),
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
    user_profile: {
      key: "user_profile",
      color: "default",
      className:
        "!text-black hover:!bg-blue-400 hover:!text-white font-bold data-[hover=true]:!bg-blue-400 data-[hover=true]:!text-white",
      startContent: <UserIcon className={"h-5 w-5 !text-black"} />,
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
      className:
        "!text-black hover:!bg-blue-400 hover:!text-white font-bold data-[hover=true]:!bg-blue-400 data-[hover=true]:!text-white",
      startContent: <Cog6ToothIcon className={"h-5 w-5 !text-black"} />,
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
      className:
        "!text-red-600 hover:!bg-red-600 hover:!text-white font-bold data-[hover=true]:!bg-red-600 data-[hover=true]:!text-white",
      startContent: (
        <ArrowRightStartOnRectangleIcon
          className={"h-5 w-5 !text-red-600 group-hover:!text-white"}
        />
      ),
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
      className:
        "!text-black hover:!bg-blue-400 hover:!text-white font-bold data-[hover=true]:!bg-blue-400 data-[hover=true]:!text-white",
      startContent: isNPubCopied ? (
        <CheckIcon className="h-5 w-5 !text-green-600" />
      ) : (
        <ClipboardIcon className="h-5 w-5 !text-black" />
      ),
      onPress: () => {
        handleDropdownAction(async () => {
          try {
            const npub = nip19.npubEncode(pubkey);
            const ok = await copyToClipboard(npub);
            if (!ok) {
              throw new Error("Clipboard API is not available");
            }
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
          isOpen={isDropdownOpen}
          onOpenChange={setIsDropdownOpen}
          className="rounded-md border-4 border-black bg-white shadow-[8px_8px_0px_0px_rgba(0,0,0,1)]"
          placement="bottom-start"
          classNames={{
            content:
              "bg-white border-4 border-black rounded-md p-0 min-w-[200px]",
          }}
        >
          <DropdownTrigger>
            <User
              as="button"
              data-slot="trigger"
              avatarProps={{
                src: pfp,
                className: "border-2 border-black",
              }}
              className={
                "group cursor-pointer rounded-md px-1 py-0.5 transition-all duration-200 hover:bg-white/10 hover:shadow-sm"
              }
              classNames={{
                name: `overflow-hidden text-ellipsis whitespace-nowrap ${
                  bg && bg === "dark" ? "text-white" : "text-black"
                } hidden ${nameClassname} ${
                  isNip05Verified ? "text-primary-yellow" : ""
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
            classNames={{
              base: "bg-white p-1",
              list: "bg-white gap-1",
            }}
            itemClasses={{
              base: "!text-black data-[hover=true]:!bg-blue-400 data-[hover=true]:!text-white rounded-md",
            }}
          >
            {(item) => {
              return (
                <DropdownItem
                  key={item.key}
                  color={item.color}
                  className={item.className}
                  startContent={item.startContent}
                  onPress={item.onPress}
                >
                  {item.label}
                </DropdownItem>
              );
            }}
          </DropdownMenu>
        </Dropdown>
      </div>
      <SignInModal isOpen={isOpen} onClose={onClose} />
    </>
  );
};
