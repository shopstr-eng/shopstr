import { LogOut } from "@/utils/nostr/nostr-helper-functions";
import {
  ProfileMapContext,
  ReportsContext,
  ShopMapContext,
} from "@/utils/context/context";
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
  ExclamationTriangleIcon,
  UserIcon,
} from "@heroicons/react/24/outline";
import { useRouter } from "next/router";
import {
  NostrContext,
  SignerContext,
} from "@/components/utility-components/nostr-context-provider";
import {
  publishReportEvent,
  ReportType,
} from "@/utils/nostr/nostr-helper-functions";
import ReportEventModal from "../modals/report-event-modal";
import SignInModal from "../../sign-in/SignInModal";
import SuccessModal from "../success-modal";

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
  const [isNPubCopied, setIsNPubCopied] = useState(false);
  const [isNip05Verified, setIsNip05Verified] = useState(false);
  const profileContext = useContext(ProfileMapContext);
  const shopMapContext = useContext(ShopMapContext);
  const npub = pubkey ? nip19.npubEncode(pubkey) : "";
  const router = useRouter();
  const reportsContext = useContext(ReportsContext);
  const { nostr } = useContext(NostrContext);
  const { isLoggedIn, signer } = useContext(SignerContext);
  const { isOpen, onOpen, onClose } = useDisclosure();
  const [showReportModal, setShowReportModal] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);

  useEffect(() => {
    const profileMap = profileContext.profileData;
    const profile = profileMap.has(pubkey) ? profileMap.get(pubkey) : undefined;
    setDisplayName(() => {
      let name = profile && profile.content.name ? profile.content.name : npub;
      if (profile?.content?.nip05 && profile.nip05Verified) {
        name = profile.content.nip05;
      }
      name = name.length > 15 ? name.slice(0, 15) + "..." : name;
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
      className: "text-light-text dark:text-dark-text",
      startContent: <BuildingStorefrontIcon className={"h-5 w-5"} />,
      onClick: () => {
        const slug = getProfileSlug(pubkey, profileContext.profileData);
        router.push(`/marketplace/${slug}`);
      },
      label: "Visit Seller",
    },
    storefront: {
      key: "storefront",
      color: "default",
      className: "text-light-text dark:text-dark-text",
      startContent: <GlobeAltIcon className={"h-5 w-5"} />,
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
      className: "text-light-text dark:text-dark-text",
      startContent: <BuildingStorefrontIcon className={"h-5 w-5"} />,
      onClick: () => {
        router.push("/settings/shop-profile");
      },
      label: "Shop Profile",
    },
    inquiry: {
      key: "inquiry",
      color: "default",
      className: "text-light-text dark:text-dark-text",
      startContent: <ChatBubbleBottomCenterIcon className={"h-5 w-5"} />,
      onClick: () => {
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
    report_profile: {
      key: "report_profile",
      color: "danger",
      className: "text-light-text dark:text-dark-text",
      startContent: <ExclamationTriangleIcon className={"h-5 w-5"} />,
      onClick: () => {
        if (isLoggedIn) {
          setShowReportModal(true);
        } else {
          onOpen();
        }
      },
      label: "Report Profile",
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
      startContent: <ArrowRightStartOnRectangleIcon className={"h-5 w-5"} />,
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
        <CheckIcon className="h-5 w-5 text-shopstr-purple dark:text-shopstr-yellow" />
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
      label: isNPubCopied ? "Copied!" : "Copy npub",
    },
  };

  const handleSubmitProfileReport = async (
    reportType: ReportType,
    content: string
  ) => {
    if (!nostr || !signer) {
      throw new Error("Missing nostr manager or signer");
    }

    const signedEvent = await publishReportEvent(nostr, signer, {
      content,
      reportType,
      reportedPubkey: pubkey,
    });

    if (signedEvent) {
      reportsContext.addReportEvent(signedEvent);
    }

    setShowSuccessModal(true);
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
              name: `overflow-hidden text-ellipsis whitespace-nowrap text-light-text dark:text-dark-text hidden ${nameClassname} ${
                isNip05Verified
                  ? "text-shopstr-purple dark:text-shopstr-yellow"
                  : ""
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
      <ReportEventModal
        isOpen={showReportModal}
        onClose={() => setShowReportModal(false)}
        targetLabel="profile"
        onSubmit={handleSubmitProfileReport}
      />
      <SuccessModal
        bodyText="Your report has been published."
        isOpen={showSuccessModal}
        onClose={() => setShowSuccessModal(false)}
      />
      <SignInModal isOpen={isOpen} onClose={onClose} />
    </>
  );
};
