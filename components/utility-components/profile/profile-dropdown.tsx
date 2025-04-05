import { LogOut } from "@/utils/nostr/nostr-helper-functions";
import { ProfileMapContext } from "@/utils/context/context";
import {
  Dropdown,
  DropdownItem,
  DropdownItemProps,
  DropdownMenu,
  DropdownTrigger,
  User,
} from "@nextui-org/react";
import { nip19 } from "nostr-tools";
import { useContext, useEffect, useState } from "react";
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
import FailureModal from "../failure-modal";
import { SignerContext } from "@/components/utility-components/nostr-context-provider";

type DropDownKeys =
  | "shop"
  | "shop_settings"
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
}: {
  baseClassname?: string;
  nameClassname?: string;
  pubkey: string;
  dropDownKeys: DropDownKeys[];
}) => {
  const [pfp, setPfp] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [showFailureModal, setShowFailureModal] = useState(false);
  const [isNPubCopied, setIsNPubCopied] = useState(false);
  const profileContext = useContext(ProfileMapContext);
  const npub = pubkey ? nip19.npubEncode(pubkey) : "";
  const router = useRouter();
  const { isLoggedIn } = useContext(SignerContext);
  useEffect(() => {
    const profileMap = profileContext.profileData;
    const profile = profileMap.has(pubkey) ? profileMap.get(pubkey) : undefined;
    setDisplayName(() => {
      let displayName =
        profile && profile.content.name ? profile.content.name : npub;
      displayName =
        displayName.length > 15
          ? displayName.slice(0, 15) + "..."
          : displayName;
      return displayName;
    });
    setPfp(
      profile && profile.content && profile.content.picture
        ? profile.content.picture
        : `https://robohash.org/${pubkey}`
    );
  }, [profileContext, pubkey, npub]);

  const DropDownItems: {
    [key in DropDownKeys]: DropdownItemProps & { label: string };
  } = {
    shop: {
      key: "shop",
      color: "default",
      className: "text-light-text dark:text-dark-text",
      startContent: <BuildingStorefrontIcon className={"h-5 w-5"} />,
      onClick: () => {
        const npub = nip19.npubEncode(pubkey);
        router.push(`/marketplace/${npub}`);
      },
      label: "Visit Seller",
    },
    shop_settings: {
      key: "shop_settings",
      color: "default",
      className: "text-light-text dark:text-dark-text",
      startContent: <BuildingStorefrontIcon className={"h-5 w-5"} />,
      onClick: () => {
        router.push("/settings/shop-settings");
      },
      label: "Shop Settings",
    },
    inquiry: {
      key: "inquiry",
      color: "default",
      className: "text-light-text dark:text-dark-text",
      startContent: <ChatBubbleBottomCenterIcon className={"h-5 w-5"} />,
      onClick: () => {
        if (!isLoggedIn) {
          setShowFailureModal(true);
          return;
        }
        router.push({
          pathname: "/orders",
          query: { pk: npub, isInquiry: true },
        });
      },
      label: "Send Inquiry",
    },
    user_profile: {
      key: "user_profile",
      color: "default",
      className: "text-light-text dark:text-dark-text",
      startContent: <UserIcon className={"h-5 w-5"} />,
      onClick: () => {
        router.push("/settings/user-profile");
      },
      label: "Profile",
    },
    settings: {
      key: "settings",
      color: "default",
      className: "text-light-text dark:text-dark-text",
      startContent: <Cog6ToothIcon className={"h-5 w-5"} />,
      onClick: () => {
        router.push("/settings");
      },
      label: "Settings",
    },
    logout: {
      key: "logout",
      color: "danger",
      className: "text-light-text dark:text-dark-text",
      startContent: (
        <ArrowRightStartOnRectangleIcon
          className={"text-color-red-900 " + "h-5 w-5"}
          color="red"
        />
      ),
      onClick: () => {
        LogOut();
        router.push("/marketplace");
      },
      label: "Log Out",
    },
    copy_npub: {
      key: "copy_npub",
      color: "default",
      className: "text-light-text dark:text-dark-text",
      startContent: isNPubCopied ? (
        <CheckIcon className="h-5 w-5" />
      ) : (
        <ClipboardIcon className="h-5 w-5" />
      ),
      onClick: () => {
        const npub = nip19.npubEncode(pubkey);
        navigator.clipboard.writeText(npub);
        setIsNPubCopied(true);
        setTimeout(() => {
          setIsNPubCopied(false);
        }, 2100);
      },
      label: "Copy npub",
    },
  };

  return (
    <>
      <Dropdown placement="bottom-start">
        <DropdownTrigger>
          <User
            as="button"
            avatarProps={{
              src: pfp,
            }}
            className={"transition-transform"}
            classNames={{
              name: `overflow-hidden text-ellipsis whitespace-nowrap text-light-text dark:text-dark-text hidden ${nameClassname}`,
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
                onClick={item.onClick}
              >
                {item.label}
              </DropdownItem>
            );
          }}
        </DropdownMenu>
      </Dropdown>
      <FailureModal
        bodyText="You must be signed in to send a message!"
        isOpen={showFailureModal}
        onClose={() => setShowFailureModal(false)}
      />
    </>
  );
};
