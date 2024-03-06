import {
  LogOut,
  isUserLoggedIn,
} from "@/components/utility/nostr-helper-functions";
import { ProfileMapContext } from "@/utils/context/context";
import {
  Dropdown,
  DropdownItem,
  DropdownMenu,
  DropdownTrigger,
  User,
} from "@nextui-org/react";
import { nip19 } from "nostr-tools";
import { useContext, useEffect, useState } from "react";
import {
  ArrowRightOnRectangleIcon,
  BuildingStorefrontIcon,
  ChatBubbleBottomCenterIcon,
  Cog6ToothIcon,
  UserIcon,
} from "@heroicons/react/24/outline";
import { useRouter } from "next/router";

type DropDownKeys = "shop" | "message" | "settings" | "user_profile" | "logout";

export const ProfileWithDropdown = ({
  pubkey,
  children,
  baseClassname,
  nameClassname = "block",
  dropDownKeys,
}: {
  baseClassname?: string;
  nameClassname?: string;
  pubkey: string;
  children?: React.ReactNode;
  dropDownKeys?: DropDownKeys[];
}) => {
  const [pfp, setPfp] = useState("");
  const [displayName, setDisplayName] = useState("");
  const profileContext = useContext(ProfileMapContext);
  const npub = pubkey ? nip19.npubEncode(pubkey) : "";
  const router = useRouter();
  useEffect(() => {
    const profileMap = profileContext.profileData;
    const profile = profileMap.has(pubkey) ? profileMap.get(pubkey) : undefined;
    setDisplayName(() => {
      let displayName =
        profile && profile.content.name ? profile.content.name : npub;
      displayName =
        displayName.length > 20
          ? displayName.slice(0, 20) + "..."
          : displayName;
      return displayName;
    });
    setPfp(
      profile && profile.content && profile.content.picture
        ? profile.content.picture
        : `https://robohash.idena.io/${pubkey}`,
    );
  }, [profileContext, pubkey]);

  const DropDownItems: {
    [K in DropDownKeys]?: any;
  } = {
    shop: (
      <DropdownItem
        key="shop"
        color="default"
        className="text-light-text dark:text-dark-text"
        startContent={<BuildingStorefrontIcon className={"h-5 w-5"} />}
        onClick={() => {
          let npub = nip19.npubEncode(pubkey);
          router.push(`/${npub}`);
        }}
      >
        Visit Seller
      </DropdownItem>
    ),
    message: (
      <DropdownItem
        key="message"
        color="default"
        className="text-light-text dark:text-dark-text"
        startContent={<ChatBubbleBottomCenterIcon className={"h-5 w-5"} />}
        onClick={() => {
          if (!isUserLoggedIn()) {
            alert("You must be signed in to send a message!");
            return;
          }
          router.push({
            pathname: "/messages",
            query: { pk: npub },
          });
        }}
      >
        Send Message
      </DropdownItem>
    ),
    settings: (
      <DropdownItem
        key="settings"
        color="default"
        className="text-light-text dark:text-dark-text"
        startContent={<Cog6ToothIcon className={"h-5 w-5"} />}
        onClick={() => {
          router.push("/settings");
        }}
      >
        Settings
      </DropdownItem>
    ),
    user_profile: (
      <DropdownItem
        key="user_profile"
        color="default"
        className="text-light-text dark:text-dark-text"
        startContent={<UserIcon className={"h-5 w-5"} />}
        onClick={() => {
          router.push("/settings/user-profile");
        }}
      >
        Profile
      </DropdownItem>
    ),
    logout: (
      <DropdownItem
        key="logout"
        color="danger"
        className="text-light-text dark:text-dark-text"
        startContent={
          <ArrowRightOnRectangleIcon
            className={"text-color-red-900 " + "h-5 w-5"}
            color="red"
          />
        }
        onClick={() => {
          LogOut();

          router.push("/");
        }}
      >
        Log Out
      </DropdownItem>
    ),
  };

  return (
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
      <DropdownMenu aria-label="User Actions" variant="flat">
        {dropDownKeys?.map((key) => {
          return DropDownItems[key];
        })}
        {children}
      </DropdownMenu>
    </Dropdown>
  );
};
