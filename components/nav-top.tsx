import React, { useContext, useEffect, useState } from "react";
import { useRouter } from "next/router";
import { Button, Image, useDisclosure } from "@nextui-org/react";
import { Bars4Icon, ShoppingCartIcon } from "@heroicons/react/24/outline";
import { ChatsContext, ShopMapContext } from "@/utils/context/context";
import { SignerContext } from "@/components/utility-components/nostr-context-provider";
import { db } from "@/utils/nostr/cache-service";
import { useLiveQuery } from "dexie-react-hooks";
import { ProfileWithDropdown } from "./utility-components/profile/profile-dropdown";
import SignInModal from "./sign-in/SignInModal";
import { ShopSettings } from "../utils/types/types";
import { countNumberOfUnreadMessagesFromChatsContext } from "@/utils/messages/utils";
import cn from "classnames";

interface TopNavProps {
  setFocusedPubkey: (value: string) => void;
  setSelectedSection: (value: string) => void;
}

const TopNav: React.FC<TopNavProps> = ({ setFocusedPubkey, setSelectedSection }) => {
  const [shopLogoURL, setShopLogoURL] = useState("");
  const [shopName, setShopName] = useState("Shopstr"); // default brand name
  const [cartQuantity, setCartQuantity] = useState(0);
  const [unreadMsgCount, setUnreadMsgCount] = useState(0);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const { isOpen, onOpen, onClose } = useDisclosure();

  const { isLoggedIn: signedIn, pubkey: userPubkey } = useContext(SignerContext);
  const chatsContext = useContext(ChatsContext);
  const shopMapContext = useContext(ShopMapContext);

  const router = useRouter();
  const liveChatMessagesFromCache = useLiveQuery(async () => {
    if (db) return db.table("chatMessages").toArray();
  });

  // Fetch cart quantity from localStorage
  useEffect(() => {
    const fetchAndUpdateCartQuantity = () => {
      const cartList = localStorage.getItem("cart")
        ? JSON.parse(localStorage.getItem("cart") as string)
        : [];
      setCartQuantity(cartList?.length || 0);
    };

    fetchAndUpdateCartQuantity();
    const interval = setInterval(() => fetchAndUpdateCartQuantity(), 1000);
    return () => clearInterval(interval);
  }, []);

  // Count unread messages
  useEffect(() => {
    (async () => {
      const count = await countNumberOfUnreadMessagesFromChatsContext(chatsContext.chatsMap);
      setUnreadMsgCount(count);
    })();
  }, [chatsContext, liveChatMessagesFromCache]);

  // Fetch brand information based on router pathname
  useEffect(() => {
    const npub = router.pathname.split("/").find((segment) => segment.includes("npub"));
    if (npub && shopMapContext.shopData.has(npub)) {
      const shopSettings: ShopSettings | undefined = shopMapContext.shopData.get(npub);
      if (shopSettings) {
        setShopLogoURL(shopSettings.content.ui.picture);
        setShopName(shopSettings.content.name);
      }
    } else if (router.pathname.includes("my-listings") && userPubkey && shopMapContext.shopData.has(userPubkey)) {
      const shopSettings: ShopSettings | undefined = shopMapContext.shopData.get(userPubkey);
      if (shopSettings) {
        setShopLogoURL(shopSettings.content.ui.picture);
        setShopName(shopSettings.content.name);
      }
    } else {
      setShopLogoURL("");
      setShopName("Shopstr");
    }
  }, [router.pathname, shopMapContext, userPubkey]);

  // Helpers to determine active state based on current route
  const isActive = (path: string) => router.pathname.startsWith(path);

  const handleHomeClick = () => {
    setFocusedPubkey("");
    setSelectedSection("");
    router.push("/marketplace");
    setIsMobileMenuOpen(false);
  };

  const handleRoute = (path: string) => {
    if (signedIn) {
      router.push(path);
      setIsMobileMenuOpen(false);
    } else {
      onOpen(); // open sign-in modal
    }
  };

  // Mobile menu component with active styling
  const MobileMenu = () => (
    <div className="absolute inset-x-0 top-full z-50 bg-white dark:bg-dark-fg shadow-md flex flex-col">
      <button
        className={cn("px-12 py-2 text-left hover:bg-gray-100 dark:hover:bg-gray-800", {
          "text-purple-700 font-bold": isActive("/marketplace"),
        })}
        onClick={handleHomeClick}
      >
        Marketplace
      </button>
      <button
        className={cn("px-12 py-2 text-left hover:bg-gray-100 dark:hover:bg-gray-800", {
          "text-purple-700 font-bold": isActive("/orders"),
        })}
        onClick={() => handleRoute("/orders")}
      >
        Orders {unreadMsgCount > 0 && `(${unreadMsgCount})`}
      </button>
      <button
        className={cn("px-12 py-2 text-left hover:bg-gray-100 dark:hover:bg-gray-800", {
          "text-purple-700 font-bold": isActive("/wallet"),
        })}
        onClick={() => handleRoute("/wallet")}
      >
        Wallet
      </button>
      <button
        className={cn("px-12 py-2 text-left hover:bg-gray-100 dark:hover:bg-gray-800", {
          "text-purple-700 font-bold": isActive("/my-listings"),
        })}
        onClick={() => handleRoute("/my-listings")}
      >
        My Listings
      </button>
      <button
        className={cn("px-12 py-2 text-left hover:bg-gray-100 dark:hover:bg-gray-800", {
          "text-purple-700 font-bold": isActive("/cart"),
        })}
        onClick={() => handleRoute("/cart")}
      >
        Cart {cartQuantity > 0 && `(${cartQuantity})`}
      </button>
    </div>
  );

  return (
    <nav className="fixed top-0 z-50 w-full bg-white dark:bg-dark-fg border-b dark:border-gray-700 shadow-sm">
      <div className="mx-auto flex items-center justify-between py-3 px-4">
        {/* Left section: brand */}
        <div className="flex items-center space-x-2">
          <button onClick={handleHomeClick} className="flex items-center focus:outline-none">
          <Image
            alt="Shopstr logo"
            src={shopLogoURL !== "" ? shopLogoURL : "/shopstr-2000x2000.png"}
            width={52}
            height={52}
            radius="sm"
            className="object-cover"
            />
            <span
              className={cn("ml-2 text-lg font-bold transition-colors duration-200 rounded p-1", {
              })}
            >
              {shopName !== "" ? shopName : "Shopstr"}
            </span>
          </button>
        </div>

        {/* Desktop nav (hidden on mobile) */}
        <div className="hidden md:flex items-center space-x-6">
          <Button
            className={cn("bg-transparent hover:text-purple-700 dark:hover:text-accent-dark-text focus:outline-none", {
              "border border-purple-500/30 rounded-lg": isActive("/marketplace"),
            })}
            onClick={handleHomeClick}
          >
            Marketplace
          </Button>
          <Button
            className={cn("bg-transparent hover:text-purple-700 dark:hover:text-accent-dark-text focus:outline-none", {
              "border border-purple-500/30 rounded-lg": isActive("/orders"),
            })}
            onClick={() => handleRoute("/orders")}
          >
            Orders {unreadMsgCount > 0 && `(${unreadMsgCount})`}
          </Button>
          <Button
            className={cn("bg-transparent hover:text-purple-700 dark:hover:text-accent-dark-text focus:outline-none", {
              "border border-purple-500/30 rounded-lg": isActive("/wallet"),
            })}
            onClick={() => handleRoute("/wallet")}
          >
            Wallet
          </Button>
          <Button
            className={cn("bg-transparent hover:text-purple-700 dark:hover:text-accent-dark-text focus:outline-none", {
              "border border-purple-500/30 rounded-lg": isActive("/my-listings"),
            })}
            onClick={() => handleRoute("/my-listings")}
          >
            My Listings
          </Button>
          <Button
            className={cn("bg-transparent hover:text-purple-700 dark:hover:text-accent-dark-text focus:outline-none relative", {
              "border border-purple-500/30 rounded-lg": isActive("/cart"),
            })}
            onClick={() => handleRoute("/cart")}
          >
            <div className="flex items-center">
              <ShoppingCartIcon className="h-5 w-5 mr-1" />
              Cart
              {cartQuantity > 0 && (
                <span className="ml-1 rounded-full bg-purple-600 px-2 py-0.5 text-xs text-white">
                  {cartQuantity}
                </span>
              )}
            </div>
          </Button>
          {signedIn ? (
            <ProfileWithDropdown
              pubkey={userPubkey!}
              baseClassname="hover:scale-105"
              dropDownKeys={[
                "shop_settings",
                "user_profile",
                "settings",
                "logout",
              ]}
            />
          ) : (
            <Button
              onClick={onOpen}
              className="bg-transparent hover:text-purple-700 dark:hover:text-accent-dark-text focus:outline-none"
            >
              Sign In
            </Button>
          )}
        </div>

        {/* Mobile: hamburger + optional user sign in */}
        <div className="flex items-center space-x-2 md:hidden">
          <button
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            className="focus:outline-none"
          >
            <Bars4Icon className="h-6 w-6" />
          </button>
          {signedIn ? (
            <ProfileWithDropdown
              pubkey={userPubkey!}
              dropDownKeys={[
                "shop_settings",
                "user_profile",
                "settings",
                "logout",
              ]}
            />
          ) : (
            <Button onClick={onOpen} className="bg-transparent hover:text-purple-700 focus:outline-none">
              Sign In
            </Button>
          )}
        </div>
      </div>
      {/* Mobile menu */}
      {isMobileMenuOpen && (
        <div className="md:hidden">
          <MobileMenu />
        </div>
      )}
      <SignInModal isOpen={isOpen} onClose={onClose} />
    </nav>
  );
};

export default TopNav;
