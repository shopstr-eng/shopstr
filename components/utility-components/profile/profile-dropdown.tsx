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
} from "@nextui-org/react";
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
  UserIcon,
} from "@heroicons/react/24/outline";
import { useRouter } from "next/router";
import { SignerContext } from "@/components/utility-components/nostr-context-provider";
import SignInModal from "../../sign-in/SignInModal";

type DropDownKeys =
  | "shop"
  | "shop_profile"
  | "storefront"
  | "inquiry"
  | "settings"
  | "user_profile"
  | "logout"
  | "copy_npub";

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
  const [pfp, setPfp] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [isNPubCopied, setIsNPubCopied] = useState(false);
  const [isNip05Verified, setIsNip05Verified] = useState(false);
  const profileContext = useContext(ProfileMapContext);
  const shopMapContext = useContext(ShopMapContext);
  const npub = pubkey ? nip19.npubEncode(pubkey) : "";
  const router = useRouter();
  const { isLoggedIn } = useContext(SignerContext);
  const { isOpen, onOpen, onClose } = useDisclosure();
  const {
    isOpen: isDropdownOpen,
    onClose: onDropdownClose,
    onOpenChange: onDropdownOpenChange,
  } = useDisclosure();

  useEffect(() => {
    const profileMap = profileContext.profileData;
    const profile = profileMap.has(pubkey) ? profileMap.get(pubkey) : undefined;
    setDisplayName(() => {
      let name = profile && profile.content.name ? profile.content.name : npub;
      if (profile?.content?.nip05 && profile.nip05Verified) {
        name = profile.content.nip05;
      }
      name = name.length > 10 ? name.slice(0, 10) + "..." : name;
      return name;
    });
    setPfp(
      profile && profile.content && profile.content.picture
        ? profile.content.picture
        : `https://robohash.org/${pubkey}`
    );
    setIsNip05Verified(profile?.nip05Verified || false);
  }, [profileContext, pubkey, npub]);

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
      onClick: () => {
        const slug = getProfileSlug(pubkey, profileContext.profileData);
        router.push(`/marketplace/${slug}`);
      },
      label: "Visit Seller",
    },
    storefront: {
      key: "storefront",
      color: "default",
      className:
        "!text-black hover:!bg-blue-400 hover:!text-white font-bold data-[hover=true]:!bg-blue-400 data-[hover=true]:!text-white",
      startContent: <GlobeAltIcon className={"h-5 w-5 !text-black"} />,
      onClick: () => {
        const shopData = shopMapContext.shopData.get(pubkey);
        const shopSlug = shopData?.content?.storefront?.shopSlug;
        if (shopSlug) {
          router.push(`/shop/${shopSlug}`);
        } else {
          const slug = getProfileSlug(pubkey, profileContext.profileData);
          router.push(`/marketplace/${slug}`);
        }
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
      onClick: () => {
        onDropdownClose();
        router.push("/settings/shop-profile");
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
      onClick: () => {
        onDropdownClose();
        if (isLoggedIn) {
          router.push({
            pathname: "/orders",
            query: { pk: npub, isInquiry: true },
          });
        } else {
          onOpen();
        }
      },
      label: "Send Inquiry",
    },
    user_profile: {
      key: "user_profile",
      color: "default",
      className:
        "!text-black hover:!bg-blue-400 hover:!text-white font-bold data-[hover=true]:!bg-blue-400 data-[hover=true]:!text-white",
      startContent: <UserIcon className={"h-5 w-5 !text-black"} />,
      onClick: () => {
        onDropdownClose();
        router.push("/settings/user-profile");
      },
      label: "Profile",
    },
    settings: {
      key: "settings",
      color: "default",
      className:
        "!text-black hover:!bg-blue-400 hover:!text-white font-bold data-[hover=true]:!bg-blue-400 data-[hover=true]:!text-white",
      startContent: <Cog6ToothIcon className={"h-5 w-5 !text-black"} />,
      onClick: () => {
        onDropdownClose();
        router.push("/settings");
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
      onClick: () => {
        onDropdownClose();
        LogOut();
        router.push("/marketplace");
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
      onClick: () => {
        const npub = nip19.npubEncode(pubkey);
        navigator.clipboard.writeText(npub);
        setIsNPubCopied(true);
        setTimeout(() => {
          setIsNPubCopied(false);
        }, 2100);
      },
      label: isNPubCopied ? "Copied!" : "Copy npub",
    },
  };

  return (
    <>
      <Dropdown
        isOpen={isDropdownOpen}
        onOpenChange={onDropdownOpenChange}
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
            className={"transition-transform"}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
            classNames={{
              name: `overflow-hidden text-ellipsis whitespace-nowrap ${
                bg && bg === "dark" ? "text-white" : "text-black"
              } hidden ${nameClassname} ${
                isNip05Verified ? "text-primary-yellow" : ""
              }`,
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
                onClick={item.onClick}
              >
                {item.label}
              </DropdownItem>
            );
          }}
        </DropdownMenu>
      </Dropdown>
      <SignInModal isOpen={isOpen} onClose={onClose} />
    </>
  );
};
