import React, { useContext, useEffect, useState } from "react";
import useNavigation from "@/components/hooks/use-navigation";
import { Button, Image, useDisclosure } from "@nextui-org/react";
import { Bars4Icon } from "@heroicons/react/24/outline";
import { countNumberOfUnreadMessagesFromChatsContext } from "@/utils/messages/utils";
import { ChatsContext, ShopMapContext } from "@/utils/context/context";
import { SignerContext } from "@/components/utility-components/nostr-context-provider";
import { useRouter } from "next/router";
import SignInModal from "./sign-in/SignInModal";
import { ProfileWithDropdown } from "./utility-components/profile/profile-dropdown";
import { ShopProfile } from "../utils/types/types";

const TopNav = ({
  setFocusedPubkey,
  setSelectedSection,
}: {
  setFocusedPubkey: (value: string) => void;
  setSelectedSection: (value: string) => void;
}) => {
  const { isHomeActive, isProfileActive, isCommunitiesActive } =
    useNavigation();
  const router = useRouter();

  const chatsContext = useContext(ChatsContext);
  const shopMapContext = useContext(ShopMapContext);

  const [unreadMsgCount, setUnreadMsgCount] = useState(0);
  const [cartQuantity, setCartQuantity] = useState(0);
  const { isOpen, onOpen, onClose } = useDisclosure();
  const { isLoggedIn: signedIn, pubkey: userPubkey } =
    useContext(SignerContext);

  const [shopLogoURL, setShopLogoURL] = useState("");
  const [shopName, setShopName] = useState("");

  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  useEffect(() => {
    const fetchAndUpdateCartQuantity = async () => {
      const cartList = localStorage.getItem("cart")
        ? JSON.parse(localStorage.getItem("cart") as string)
        : [];
      if (cartList) {
        setCartQuantity(cartList.length);
      }
    };

    fetchAndUpdateCartQuantity();

    const interval = setInterval(() => {
      fetchAndUpdateCartQuantity();
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const getUnreadMessages = async () => {
      const unreadMsgCount = await countNumberOfUnreadMessagesFromChatsContext(
        chatsContext.chatsMap
      );
      setUnreadMsgCount(unreadMsgCount);
    };
    getUnreadMessages();
  }, [chatsContext]);

  useEffect(() => {
    const npub = router.pathname
      .split("/")
      .find((segment) => segment.includes("npub"));
    if (
      npub &&
      shopMapContext.shopData.has(npub) &&
      typeof shopMapContext.shopData.get(npub) != "undefined"
    ) {
      const shopProfile: ShopProfile | undefined =
        shopMapContext.shopData.get(npub);
      if (shopProfile) {
        setShopLogoURL(shopProfile.content.ui.picture);
        setShopName(shopProfile.content.name);
      }
    } else if (
      router.pathname.includes("my-listings") &&
      userPubkey &&
      shopMapContext.shopData.has(userPubkey) &&
      typeof shopMapContext.shopData.get(userPubkey) != "undefined"
    ) {
      const shopProfile: ShopProfile | undefined =
        shopMapContext.shopData.get(userPubkey);
      if (shopProfile) {
        setShopLogoURL(shopProfile.content.ui.picture);
        setShopName(shopProfile.content.name);
      }
    } else {
      setShopLogoURL("");
      setShopName("");
    }
  }, [router.pathname, shopMapContext, userPubkey]);

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
    setSelectedSection("");
    router.push("/marketplace");
    setIsMobileMenuOpen(false);
  };

  const MobileMenu = () => (
    <div className="absolute left-0 top-full w-full max-h-[calc(100vh-70px)] overflow-y-auto border-b border-zinc-800 bg-[#161616] shadow-xl flex flex-col p-2">
      <Button
        className="w-full h-14 justify-start px-6 bg-transparent font-bold uppercase text-zinc-400 hover:text-white"
        onClick={handleHomeClick}
      >
        Marketplace
      </Button>
      <Button
        className="w-full h-14 justify-start px-6 bg-transparent font-bold uppercase text-zinc-400 hover:text-white"
        onClick={() => router.push("/communities")}
      >
        Communities
      </Button>
      <Button
        className="w-full h-14 justify-start px-6 bg-transparent font-bold uppercase text-zinc-400 hover:text-white"
        onClick={() => handleRoute("/orders")}
      >
        Orders
        {unreadMsgCount > 0 && (
          <span className="ml-2 inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-yellow-400 px-1.5 text-xs font-bold text-black">
            {unreadMsgCount}
          </span>
        )}
      </Button>
      <Button
        className="w-full h-14 justify-start px-6 bg-transparent font-bold uppercase text-zinc-400 hover:text-white"
        onClick={() => handleRoute("/wallet")}
      >
        Wallet
      </Button>
      <Button
        className="w-full h-14 justify-start px-6 bg-transparent font-bold uppercase text-zinc-400 hover:text-white"
        onClick={() => handleRoute("/my-listings")}
      >
        My Listings
      </Button>
      <Button
        className="w-full h-14 justify-start px-6 bg-transparent font-bold uppercase text-zinc-400 hover:text-white"
        onClick={() => handleRoute("/cart")}
      >
        Cart
        {cartQuantity > 0 && (
          <span className="ml-2 inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-yellow-400 px-1.5 text-xs font-bold text-black">
            {cartQuantity}
          </span>
        )}
      </Button>
    </div>
  );

  return (
    <div className="fixed top-0 z-50 w-full border-b border-zinc-800 bg-[#161616] shadow-lg">
      <div className="flex items-center justify-between py-2 pr-4">
        <div className="flex items-center">
          <Button
            onClick={handleHomeClick}
            className="flex items-center bg-transparent text-white hover:text-yellow-400"
          >
            <Image
              alt="Shopstr logo"
              height={40}
              radius="sm"
              src={shopLogoURL != "" ? shopLogoURL : "/shopstr-2000x2000.png"}
              width={40}
            />
            <span
              className={`ml-2 hidden text-xl font-black uppercase tracking-tighter md:flex ${
                isHomeActive ? "text-white" : "text-white"
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
            <Bars4Icon className="h-6 w-6 text-white" />
          </Button>
          {signedIn ? (
            <ProfileWithDropdown
              pubkey={userPubkey!}
              baseClassname="w-auto rounded-3xl hover:bg-[#111]"
              dropDownKeys={[
                "shop_profile",
                "user_profile",
                "settings",
                "logout",
              ]}
              nameClassname="md:block"
            />
          ) : (
            <Button
              onClick={onOpen}
              className="w-full bg-transparent font-bold text-yellow-400 hover:text-white"
            >
              Sign In
            </Button>
          )}
        </div>
        <div className="hidden items-center gap-1 font-bold text-zinc-400 md:flex">
          <Button
            className={`bg-transparent text-xs font-black uppercase tracking-widest hover:text-white ${
              isHomeActive ? "text-yellow-400" : ""
            }`}
            onClick={handleHomeClick}
          >
            Marketplace
          </Button>
          <span className="text-zinc-700">|</span>
          <Button
            className={`bg-transparent text-xs font-black uppercase tracking-widest hover:text-white ${
              isCommunitiesActive ? "text-yellow-400" : ""
            }`}
            onClick={() => router.push("/communities")}
          >
            Communities
          </Button>
          <span className="text-zinc-700">|</span>
          <Button
            className="bg-transparent text-xs font-black uppercase tracking-widest hover:text-white"
            onClick={() => handleRoute("/orders")}
          >
            Orders
            {unreadMsgCount > 0 && (
              <span className="ml-2 inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-yellow-400 px-1.5 text-xs font-bold text-black">
                {unreadMsgCount}
              </span>
            )}
          </Button>
          <span className="text-zinc-700">|</span>
          <Button
            className="bg-transparent text-xs font-black uppercase tracking-widest hover:text-white"
            onClick={() => handleRoute("/wallet")}
          >
            Wallet
          </Button>
          <span className="text-zinc-700">|</span>
          <Button
            className="bg-transparent text-xs font-black uppercase tracking-widest hover:text-white"
            onClick={() => handleRoute("/my-listings")}
          >
            My Listings
          </Button>
          <span className="text-zinc-700">|</span>
          <Button
            className="bg-transparent text-xs font-black uppercase tracking-widest hover:text-white"
            onClick={() => handleRoute("/cart")}
          >
            Cart
            {cartQuantity > 0 && (
              <span className="ml-2 inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-yellow-400 px-1.5 text-xs font-bold text-black">
                {cartQuantity}
              </span>
            )}
          </Button>
          <span className="text-zinc-700">|</span>
          {signedIn ? (
            <>
              <ProfileWithDropdown
                pubkey={userPubkey!}
                baseClassname="justify-start pl-4 rounded-3xl py-2 hover:bg-[#111]"
                dropDownKeys={[
                  "shop_profile",
                  "user_profile",
                  "settings",
                  "logout",
                ]}
                nameClassname="md:block"
              />
            </>
          ) : (
            <>
              <Button
                onClick={onOpen}
                className={`bg-transparent text-xs font-black uppercase tracking-widest hover:text-white ${
                  isProfileActive ? "text-yellow-400" : ""
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
