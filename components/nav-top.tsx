import React, { useContext, useEffect, useState } from "react";
import useNavigation from "@/components/hooks/use-navigation";
import { Button, Image, useDisclosure } from "@nextui-org/react";
import { Bars4Icon } from "@heroicons/react/24/outline";
import { countNumberOfUnreadMessagesFromChatsContext } from "@/utils/messages/utils";
import { ChatsContext, ShopMapContext } from "@/utils/context/context";
import { db } from "../pages/api/nostr/cache-service";
import { useLiveQuery } from "dexie-react-hooks";
import {
  getLocalStorageData,
  isUserLoggedIn,
} from "./utility/nostr-helper-functions";
import { useRouter } from "next/router";
import SignInModal from "./sign-in/SignInModal";
import { ProfileWithDropdown } from "./utility-components/profile/profile-dropdown";
import { ShopSettings } from "../utils/types/types";

const TopNav = ({
  setFocusedPubkey,
}: {
  setFocusedPubkey: (value: string) => void;
}) => {
  const { isHomeActive, isProfileActive } = useNavigation();
  const router = useRouter();

  const chatsContext = useContext(ChatsContext);
  const shopMapContext = useContext(ShopMapContext);

  const [unreadMsgCount, setUnreadMsgCount] = useState(0);
  const { isOpen, onOpen, onClose } = useDisclosure();
  const [signedIn, setSignedIn] = useState(false);

  const [shopLogoURL, setShopLogoURL] = useState("");
  const [shopName, setShopName] = useState("");

  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const liveChatMessagesFromCache = useLiveQuery(async () => {
    if (db) {
      await db.table("chatMessages").toArray();
    }
  });

  useEffect(() => {
    const getSignedInStatus = () => {
      const loggedIn = isUserLoggedIn();
      setSignedIn(loggedIn);
    };
    getSignedInStatus();
    window.addEventListener("storage", getSignedInStatus);
    return () => window.removeEventListener("storage", getSignedInStatus);
  }, []);

  useEffect(() => {
    const getUnreadMessages = async () => {
      let unreadMsgCount = await countNumberOfUnreadMessagesFromChatsContext(
        chatsContext.chatsMap,
      );
      setUnreadMsgCount(unreadMsgCount);
    };
    getUnreadMessages();
  }, [chatsContext, liveChatMessagesFromCache]);

  useEffect(() => {
    const npub = router.pathname
      .split("/")
      .find((segment) => segment.includes("npub"));
    const userPubkey = getLocalStorageData().userPubkey;
    if (
      npub &&
      shopMapContext.shopData.has(npub) &&
      typeof shopMapContext.shopData.get(npub) != "undefined"
    ) {
      const shopSettings: ShopSettings | undefined =
        shopMapContext.shopData.get(npub);
      if (shopSettings) {
        setShopLogoURL(shopSettings.content.ui.picture);
        setShopName(shopSettings.content.name);
      }
    } else if (
      router.pathname.includes("my-listings") &&
      userPubkey &&
      shopMapContext.shopData.has(userPubkey) &&
      typeof shopMapContext.shopData.get(userPubkey) != "undefined"
    ) {
      const shopSettings: ShopSettings | undefined =
        shopMapContext.shopData.get(userPubkey);
      if (shopSettings) {
        setShopLogoURL(shopSettings.content.ui.picture);
        setShopName(shopSettings.content.name);
      }
    }
  }, [router.pathname, shopMapContext]);

  const handleRoute = (path: string) => {
    if (signedIn) {
      router.push(path);
      setIsMobileMenuOpen(false);
    } else {
      onOpen();
    }
  };

  const handleHomeClick = () => {
    setFocusedPubkey("");
    router.push("/");
    setIsMobileMenuOpen(false);
  };

  const MobileMenu = () => (
    <div className="absolute left-0 top-full w-full bg-light-fg shadow-lg dark:bg-dark-fg">
      <Button
        className="w-full bg-transparent text-light-text hover:text-purple-700 dark:text-dark-text dark:hover:text-accent-dark-text"
        onClick={handleHomeClick}
      >
        Home
      </Button>
      <Button
        className="w-full bg-transparent text-light-text hover:text-purple-700 dark:text-dark-text dark:hover:text-accent-dark-text"
        onClick={() => handleRoute("/messages")}
      >
        Messages {unreadMsgCount > 0 && `(${unreadMsgCount})`}
      </Button>
      <Button
        className="w-full bg-transparent text-light-text hover:text-purple-700 dark:text-dark-text dark:hover:text-accent-dark-text"
        onClick={() => handleRoute("/wallet")}
      >
        Wallet
      </Button>
      <Button
        className="w-full bg-transparent text-light-text hover:text-purple-700 dark:text-dark-text dark:hover:text-accent-dark-text"
        onClick={() => handleRoute("/my-listings")}
      >
        My Listings
      </Button>
      <Button
        className="w-full bg-transparent text-light-text hover:text-purple-700 dark:text-dark-text dark:hover:text-accent-dark-text"
        onClick={() => handleRoute("/metrics")}
      >
        Metrics
      </Button>
    </div>
  );

  return (
    <div className="fixed top-0 z-50 w-full border-b border-zinc-200 bg-light-fg shadow-lg dark:border-zinc-800 dark:bg-dark-fg">
      <div className="flex items-center justify-between py-2 pr-4">
        <div className="flex items-center">
          <Button
            onClick={handleHomeClick}
            className={`flex items-center bg-transparent text-light-text duration-200 hover:text-purple-700 dark:text-dark-text dark:hover:text-accent-dark-text`}
          >
            <Image
              alt="Shopstr logo"
              height={40}
              radius="sm"
              src={shopLogoURL != "" ? shopLogoURL : "/shopstr-2000x2000.png"}
              width={40}
            />
            <span
              className={`ml-2 text-xl md:flex ${
                isHomeActive ? "font-bold" : ""
              }`}
            >
              {shopName != "" ? shopName : "Shopstr"}
            </span>
          </Button>
        </div>
        <div className="flex flex-row items-center md:hidden">
          <Button
            className="bg-transparent"
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
          >
            <Bars4Icon className="h-6 w-6 text-light-text dark:text-dark-text" />
          </Button>
          {signedIn ? (
            <ProfileWithDropdown
              pubkey={getLocalStorageData().userPubkey}
              baseClassname="w-full dark:hover:shopstr-yellow-light rounded-3xl hover:scale-105 hover:bg-light-bg hover:shadow-lg dark:hover:bg-dark-bg"
              dropDownKeys={[
                "shop_settings",
                "user_profile",
                "settings",
                "logout",
              ]}
              nameClassname="md:block"
            />
          ) : (
            <Button
              onClick={onOpen}
              className="w-full bg-transparent text-light-text hover:text-purple-700 dark:text-dark-text dark:hover:text-accent-dark-text"
            >
              Sign In
            </Button>
          )}
        </div>
        <div className="hidden items-center font-bold text-light-text dark:text-dark-text md:flex">
          <Button
            className="bg-transparent text-light-text hover:text-purple-700 dark:text-dark-text dark:hover:text-accent-dark-text"
            onClick={handleHomeClick}
          >
            Home
          </Button>
          |
          <Button
            className="bg-transparent text-light-text hover:text-purple-700 dark:text-dark-text dark:hover:text-accent-dark-text"
            onClick={() => handleRoute("/messages")}
          >
            Messages {unreadMsgCount > 0 && `(${unreadMsgCount})`}
          </Button>
          |
          <Button
            className="bg-transparent text-light-text hover:text-purple-700 dark:text-dark-text dark:hover:text-accent-dark-text"
            onClick={() => handleRoute("/wallet")}
          >
            Wallet
          </Button>
          |
          <Button
            className="bg-transparent text-light-text hover:text-purple-700 dark:text-dark-text dark:hover:text-accent-dark-text"
            onClick={() => handleRoute("/my-listings")}
          >
            My Listings
          </Button>
          |
          <Button
            className="bg-transparent text-light-text hover:text-purple-700 dark:text-dark-text dark:hover:text-accent-dark-text"
            onClick={() => handleRoute("/metrics")}
          >
            Metrics
          </Button>
          {signedIn ? (
            <>
              |
              <ProfileWithDropdown
                pubkey={getLocalStorageData().userPubkey}
                baseClassname="justify-start dark:hover:shopstr-yellow-light pl-4 rounded-3xl py-2 hover:scale-105 hover:bg-light-bg hover:shadow-lg dark:hover:bg-dark-bg"
                dropDownKeys={[
                  "shop_settings",
                  "user_profile",
                  "settings",
                  "logout",
                ]}
                nameClassname="md:block"
              />
            </>
          ) : (
            <>
              |
              <Button
                onClick={onOpen}
                className={`bg-transparent text-light-text duration-200 hover:text-purple-700 dark:text-dark-text dark:hover:text-accent-dark-text ${
                  isProfileActive
                    ? "text-shopstr-purple-light dark:text-shopstr-yellow-light"
                    : ""
                }`}
              >
                Sign In
              </Button>
            </>
          )}
        </div>
      </div>
      {isMobileMenuOpen && <MobileMenu />}
      <SignInModal isOpen={isOpen} onClose={onClose} />
    </div>
  );
};

export default TopNav;
