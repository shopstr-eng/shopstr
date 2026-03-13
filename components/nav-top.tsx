import { useContext, useEffect, useState } from "react";
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
  const {
    isHomeActive,
    isProfileActive,
    isCommunitiesActive,
    isMessagesActive,
    isWalletActive,
    isMyListingsActive,
    isCartActive,
  } = useNavigation();
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
    <div className="absolute left-0 top-full w-full border-t border-black bg-primary-blue shadow-lg">
      <Button
        className={`w-full bg-transparent ${
          isHomeActive ? "text-primary-yellow" : "text-white"
        } hover:text-primary-yellow`}
        onClick={handleHomeClick}
      >
        Marketplace
      </Button>
      <Button
        className={`w-full bg-transparent ${
          isCommunitiesActive ? "text-primary-yellow" : "text-white"
        } hover:text-primary-yellow`}
        onClick={() => router.push("/communities")}
      >
        Communities
      </Button>
      <Button
        className={`w-full bg-transparent ${
          isMessagesActive ? "text-primary-yellow" : "text-white"
        } hover:text-primary-yellow`}
        onClick={() => handleRoute("/orders")}
      >
        Orders
        {unreadMsgCount > 0 && (
          <span className="min-w-5 ml-1 inline-flex h-5 items-center justify-center rounded-full bg-yellow-600 px-1.5 text-xs font-bold text-white">
            {unreadMsgCount}
          </span>
        )}
      </Button>
      <Button
        className={`w-full bg-transparent ${
          isWalletActive ? "text-primary-yellow" : "text-white"
        } hover:text-primary-yellow`}
        onClick={() => handleRoute("/wallet")}
      >
        Wallet
      </Button>
      <Button
        className={`w-full bg-transparent ${
          isMyListingsActive ? "text-primary-yellow" : "text-white"
        } hover:text-primary-yellow`}
        onClick={() => handleRoute("/my-listings")}
      >
        My Listings
      </Button>
      <Button
        className={`w-full bg-transparent ${
          router.pathname === "/cart" ? "text-primary-yellow" : "text-white"
        } hover:text-primary-yellow`}
        onClick={() => {
          router.push("/cart");
          setIsMobileMenuOpen(false);
        }}
      >
        Cart
        {cartQuantity > 0 && (
          <span className="min-w-5 ml-1 inline-flex h-5 items-center justify-center rounded-full bg-yellow-600 px-1.5 text-xs font-bold text-white">
            {cartQuantity}
          </span>
        )}
      </Button>
    </div>
  );

  return (
    <div
      data-main-nav
      className="fixed top-0 z-50 w-full border-b-2 border-black bg-primary-blue shadow-lg"
    >
      <div className="flex items-center justify-between py-2 pr-4">
        <div className="flex flex-shrink-0 items-center">
          <Button
            onClick={handleHomeClick}
            className="flex items-center bg-transparent text-white duration-200 hover:text-primary-yellow"
          >
            <Image
              alt="Milk Market logo"
              height={40}
              radius="sm"
              src={shopLogoURL != "" ? shopLogoURL : "/milk-market.png"}
              width={40}
            />
            <span className="ml-2 text-xl text-white md:hidden lg:flex">
              {shopName != "" ? shopName : "Milk Market"}
            </span>
          </Button>
        </div>
        <div className="ml-auto flex flex-row items-center md:hidden">
          <Button
            className="bg-transparent"
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
          >
            <Bars4Icon className="h-6 w-6 text-white" />
          </Button>
          {signedIn ? (
            <ProfileWithDropdown
              pubkey={userPubkey!}
              baseClassname="flex-shrink-0 hover:bg-opacity-80 rounded-3xl hover:scale-105 hover:shadow-lg"
              dropDownKeys={[
                "shop_profile",
                "user_profile",
                "settings",
                "logout",
              ]}
              nameClassname="hidden text-white"
              bg="dark"
            />
          ) : (
            <Button
              onClick={onOpen}
              className="bg-transparent text-white hover:text-primary-yellow"
            >
              Sign In
            </Button>
          )}
        </div>
        <div className="hidden flex-1 items-center justify-evenly md:flex">
          <Button
            className={`bg-transparent ${
              isHomeActive ? "font-bold text-primary-yellow" : "text-white"
            } hover:text-primary-yellow`}
            onClick={handleHomeClick}
          >
            Marketplace
          </Button>
          <Button
            className={`bg-transparent ${
              isCommunitiesActive
                ? "font-bold text-primary-yellow"
                : "text-white"
            } hover:text-primary-yellow`}
            onClick={() => router.push("/communities")}
          >
            Communities
          </Button>
          <Button
            className={`bg-transparent ${
              isMessagesActive ? "font-bold text-primary-yellow" : "text-white"
            } hover:text-primary-yellow`}
            onClick={() => handleRoute("/orders")}
          >
            Orders
            {unreadMsgCount > 0 && (
              <span className="min-w-5 ml-1 inline-flex h-5 items-center justify-center rounded-full bg-yellow-600 px-1.5 text-xs font-bold text-white">
                {unreadMsgCount}
              </span>
            )}
          </Button>
          <Button
            className={`bg-transparent ${
              isWalletActive ? "font-bold text-primary-yellow" : "text-white"
            } hover:text-primary-yellow`}
            onClick={() => handleRoute("/wallet")}
          >
            Wallet
          </Button>
          <Button
            className={`bg-transparent ${
              isMyListingsActive
                ? "font-bold text-primary-yellow"
                : "text-white"
            } hover:text-primary-yellow`}
            onClick={() => handleRoute("/my-listings")}
          >
            My Listings
          </Button>
          <Button
            className={`bg-transparent ${
              isCartActive ? "font-bold text-primary-yellow" : "text-white"
            } hover:text-primary-yellow`}
            onClick={() => router.push("/cart")}
          >
            Cart
            {cartQuantity > 0 && (
              <span className="min-w-5 ml-1 inline-flex h-5 items-center justify-center rounded-full bg-yellow-600 px-1.5 text-xs font-bold text-white">
                {cartQuantity}
              </span>
            )}
          </Button>
        </div>
        <div className="hidden flex-shrink-0 items-center md:flex">
          {signedIn ? (
            <ProfileWithDropdown
              pubkey={userPubkey!}
              baseClassname="justify-start hover:bg-opacity-80 pl-2 rounded-3xl py-2 hover:scale-105 hover:shadow-lg"
              dropDownKeys={[
                "shop_profile",
                "user_profile",
                "settings",
                "logout",
              ]}
              nameClassname="lg:block text-white"
              bg="dark"
            />
          ) : (
            <Button
              onClick={onOpen}
              className={`bg-transparent ${
                isProfileActive ? "font-bold text-primary-yellow" : "text-white"
              } duration-200 hover:text-primary-yellow`}
            >
              Sign In
            </Button>
          )}
        </div>
      </div>
      {isMobileMenuOpen && <MobileMenu />}
      <SignInModal isOpen={isOpen} onClose={onClose} />
    </div>
  );
};

export default TopNav;
