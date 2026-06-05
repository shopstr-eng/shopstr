/* eslint-disable @next/next/no-img-element */

import router from "next/router";
import { useContext, useState, useEffect, useRef } from "react";
import DisplayProducts from "../display-products";
import { SignerContext } from "@/components/utility-components/nostr-context-provider";
import { Button, useDisclosure } from "@heroui/react";
import { Bars3Icon } from "@heroicons/react/24/outline";
import { SHOPSTRBUTTONCLASSNAMES } from "@/utils/STATIC-VARIABLES";
import SignInModal from "../sign-in/SignInModal";
import { ShopMapContext } from "@/utils/context/context";
import { ShopProfile } from "../../utils/types/types";
import { sanitizeUrl } from "@braintree/sanitize-url";
import SideShopNav from "../home/side-shop-nav";
import DiscountCodes from "./discount-codes";

const MyListingsPage = () => {
  const { pubkey: usersPubkey } = useContext(SignerContext);
  const { isOpen, onOpen, onClose } = useDisclosure();

  const [selectedSection, setSelectedSection] = useState("Listings");

  const [selectedCategories, setSelectedCategories] = useState(
    new Set<string>([])
  );
  const [categories, setCategories] = useState([""]);

  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const shopMapContext = useContext(ShopMapContext);
  const shopProfile: ShopProfile | undefined = usersPubkey
    ? shopMapContext.shopData.get(usersPubkey)
    : undefined;
  const shopBanner = shopProfile?.content.ui.banner ?? "";
  const shopAboutContent = shopProfile?.content.about ?? "";

  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsMobileMenuOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  const handleCreateNewListing = () => {
    if (usersPubkey) {
      router.push("?addNewListing");
    } else {
      onOpen();
    }
  };

  const handleEditShop = () => {
    if (usersPubkey) {
      router.push("/settings/shop-profile");
    } else {
      onOpen();
    }
  };

  const handleViewOrders = () => {
    if (usersPubkey) {
      router.push("/my-listings/orders");
    } else {
      onOpen();
    }
  };

  const handleManageCommunity = () => {
    if (usersPubkey) {
      router.push("/settings/community");
    } else {
      onOpen();
    }
  };

  const MobileMenu = () => (
    <div className="bg-light-fg dark:bg-dark-fg absolute top-full left-0 z-10 mt-2 w-48 rounded-md shadow-lg md:hidden">
      <div className="py-1">
        <Button
          className="text-light-text dark:text-dark-text dark:hover:text-accent-dark-text w-full bg-transparent px-4 py-2 text-left text-sm hover:text-purple-700"
          onClick={() => {
            setSelectedSection("Listings");
            setIsMobileMenuOpen(false);
          }}
        >
          Listings
        </Button>
        <Button
          className="text-light-text dark:text-dark-text dark:hover:text-accent-dark-text w-full bg-transparent px-4 py-2 text-left text-sm hover:text-purple-700"
          onClick={() => {
            setSelectedSection("Discounts");
            setIsMobileMenuOpen(false);
          }}
        >
          Discounts
        </Button>
        <Button
          className="text-light-text dark:text-dark-text dark:hover:text-accent-dark-text w-full bg-transparent px-4 py-2 text-left text-sm hover:text-purple-700"
          onClick={() => {
            setSelectedSection("About");
            setIsMobileMenuOpen(false);
          }}
        >
          About
        </Button>
        <Button
          className="text-light-text dark:text-dark-text dark:hover:text-accent-dark-text w-full bg-transparent px-4 py-2 text-left text-sm hover:text-purple-700"
          onClick={() => {
            handleViewOrders();
            setIsMobileMenuOpen(false);
          }}
        >
          Orders
        </Button>
        <Button
          className="text-light-text dark:text-dark-text dark:hover:text-accent-dark-text w-full bg-transparent px-4 py-2 text-left text-sm hover:text-purple-700"
          onClick={() => {
            handleManageCommunity();
            setIsMobileMenuOpen(false);
          }}
        >
          Community
        </Button>
      </div>
    </div>
  );

  return (
    <div className="mx-auto h-full w-full">
      <div className="bg-light-bg dark:bg-dark-bg flex max-w-[100%] flex-col px-3 pb-2">
        {shopBanner !== "" ? (
          <>
            <div className="bg-light-bg dark:bg-dark-bg flex h-auto w-full items-center justify-center bg-cover bg-center">
              <img
                src={sanitizeUrl(shopBanner)}
                alt="Shop Banner"
                className="max-h-[210px] w-full items-center justify-center object-cover"
              />
            </div>
            <div className="text-light-text dark:text-dark-text mt-3 flex items-center justify-between font-bold">
              <div className="flex items-center gap-2">
                <div className="relative md:hidden" ref={menuRef}>
                  <Button
                    className="bg-transparent p-1"
                    onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                  >
                    <Bars3Icon className="text-light-text dark:text-dark-text h-6 w-6" />
                  </Button>
                  {isMobileMenuOpen && <MobileMenu />}
                </div>
                <div className="hidden gap-2 md:flex">
                  <Button
                    className="text-light-text dark:text-dark-text dark:hover:text-accent-dark-text bg-transparent text-xl hover:text-purple-700"
                    onClick={() => setSelectedSection("Listings")}
                  >
                    Listings
                  </Button>
                  <Button
                    className="text-light-text dark:text-dark-text dark:hover:text-accent-dark-text bg-transparent text-xl hover:text-purple-700"
                    onClick={() => setSelectedSection("Discounts")}
                  >
                    Discounts
                  </Button>
                  <Button
                    className="text-light-text dark:text-dark-text dark:hover:text-accent-dark-text bg-transparent text-xl hover:text-purple-700"
                    onClick={() => setSelectedSection("About")}
                  >
                    About
                  </Button>
                  <Button
                    className="text-light-text dark:text-dark-text dark:hover:text-accent-dark-text bg-transparent text-xl hover:text-purple-700"
                    onClick={() => handleViewOrders()}
                  >
                    Orders
                  </Button>
                  <Button
                    className="text-light-text dark:text-dark-text dark:hover:text-accent-dark-text bg-transparent text-xl hover:text-purple-700"
                    onClick={() => handleManageCommunity()}
                  >
                    Community
                  </Button>
                </div>
              </div>
              <div className="flex gap-2 sm:hidden">
                <Button
                  className={`${SHOPSTRBUTTONCLASSNAMES}`}
                  onClick={() => handleCreateNewListing()}
                >
                  Add Listing
                </Button>
                <Button
                  className={`${SHOPSTRBUTTONCLASSNAMES}`}
                  onClick={() => handleEditShop()}
                >
                  Edit Shop
                </Button>
              </div>
            </div>
          </>
        ) : (
          <>
            <div className="text-light-text dark:text-dark-text mt-3 flex items-center justify-between font-bold">
              <div className="flex items-center gap-2">
                <div className="relative md:hidden" ref={menuRef}>
                  <Button
                    className="bg-transparent p-1"
                    onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                  >
                    <Bars3Icon className="text-light-text dark:text-dark-text h-6 w-6" />
                  </Button>
                  {isMobileMenuOpen && <MobileMenu />}
                </div>
                <div className="hidden gap-2 md:flex">
                  <Button
                    className="text-light-text dark:text-dark-text dark:hover:text-accent-dark-text bg-transparent text-xl hover:text-purple-700"
                    onClick={() => setSelectedSection("Listings")}
                  >
                    Listings
                  </Button>
                  <Button
                    className="text-light-text dark:text-dark-text dark:hover:text-accent-dark-text bg-transparent text-xl hover:text-purple-700"
                    onClick={() => setSelectedSection("Discounts")}
                  >
                    Discounts
                  </Button>
                  <Button
                    className="text-light-text dark:text-dark-text dark:hover:text-accent-dark-text bg-transparent text-xl hover:text-purple-700"
                    onClick={() => setSelectedSection("About")}
                  >
                    About
                  </Button>
                  <Button
                    className="text-light-text dark:text-dark-text dark:hover:text-accent-dark-text bg-transparent text-xl hover:text-purple-700"
                    onClick={() => handleViewOrders()}
                  >
                    Orders
                  </Button>
                  <Button
                    className="text-light-text dark:text-dark-text dark:hover:text-accent-dark-text bg-transparent text-xl hover:text-purple-700"
                    onClick={() => handleManageCommunity()}
                  >
                    Community
                  </Button>
                </div>
              </div>
              <div className="flex gap-2 sm:hidden">
                <Button
                  className={`${SHOPSTRBUTTONCLASSNAMES}`}
                  onClick={() => handleCreateNewListing()}
                >
                  Add Listing
                </Button>
                <Button
                  className={`${SHOPSTRBUTTONCLASSNAMES}`}
                  onClick={() => handleEditShop()}
                >
                  Edit Shop
                </Button>
              </div>
            </div>
          </>
        )}
        <div className="flex">
          {usersPubkey && (
            <SideShopNav
              focusedPubkey={usersPubkey}
              categories={categories}
              setSelectedCategories={setSelectedCategories}
              isEditingShop={true}
            />
          )}
          {usersPubkey && selectedSection === "Listings" && (
            <DisplayProducts
              focusedPubkey={usersPubkey}
              selectedCategories={selectedCategories}
              selectedLocation={""}
              selectedSearch={""}
              isMyListings={true}
              setCategories={setCategories}
            />
          )}
          {selectedSection === "About" && shopAboutContent && (
            <div className="text-light-text dark:text-dark-text flex w-full flex-col justify-start bg-transparent px-4 py-8">
              <h2 className="pb-2 text-2xl font-bold">About</h2>
              <p className="text-base">{shopAboutContent}</p>
            </div>
          )}
          {selectedSection === "About" && !shopAboutContent && (
            <div className="mt-20 flex flex-grow items-center justify-center py-10">
              <div className="bg-light-fg dark:bg-dark-fg w-full max-w-lg rounded-lg p-8 text-center shadow-lg">
                <p className="text-light-text dark:text-dark-text text-3xl font-semibold">
                  Nothing here . . . yet!
                </p>
                <p className="text-light-text dark:text-dark-text mt-4 text-lg">
                  Set up your shop in settings!
                </p>
                <Button
                  className={`${SHOPSTRBUTTONCLASSNAMES} mt-6`}
                  onClick={() => handleEditShop()}
                >
                  Go to Settings
                </Button>
              </div>
            </div>
          )}
          {usersPubkey && selectedSection === "Discounts" && <DiscountCodes />}
        </div>
      </div>
      <SignInModal isOpen={isOpen} onClose={onClose} />
    </div>
  );
};

export default MyListingsPage;
