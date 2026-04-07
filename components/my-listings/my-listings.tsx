/* eslint-disable @next/next/no-img-element */

import router from "next/router";
import { useContext, useState, useEffect, useRef } from "react";
import DisplayProducts from "../display-products";
import { SignerContext } from "@/components/utility-components/nostr-context-provider";
import { Button, useDisclosure } from "@nextui-org/react";
import { Bars3Icon } from "@heroicons/react/24/outline";
import { BLUEBUTTONCLASSNAMES } from "@/utils/STATIC-VARIABLES";
import SignInModal from "../sign-in/SignInModal";
import { ShopMapContext } from "@/utils/context/context";
import { ShopProfile } from "../../utils/types/types";
import { sanitizeUrl } from "@braintree/sanitize-url";
import DiscountCodes from "./discount-codes";
import StripeConnectBanner from "@/components/stripe-connect/StripeConnectBanner";

const MyListingsPage = () => {
  const { pubkey: usersPubkey } = useContext(SignerContext);
  const { isOpen, onOpen, onClose } = useDisclosure();

  const [shopBannerURL, setShopBannerURL] = useState("");
  const [isFetchingShop, setIsFetchingShop] = useState(false);

  const [selectedSection, setSelectedSection] = useState("Listings");

  const [selectedCategories] = useState(new Set<string>([]));
  const [_categories, setCategories] = useState([""]);

  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const shopMapContext = useContext(ShopMapContext);

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

  useEffect(() => {
    setIsFetchingShop(true);
    if (
      usersPubkey &&
      shopMapContext.shopData.has(usersPubkey) &&
      typeof shopMapContext.shopData.get(usersPubkey) != "undefined"
    ) {
      const shopProfile: ShopProfile | undefined =
        shopMapContext.shopData.get(usersPubkey);
      if (shopProfile) {
        setShopBannerURL(shopProfile.content.ui.banner);
      }
    }
    setIsFetchingShop(false);
  }, [usersPubkey, shopMapContext, shopBannerURL]);

  const handleCreateNewListing = () => {
    if (usersPubkey) {
      router.push("?addNewListing");
    } else {
      onOpen();
    }
  };

  const handleEditShop = () => {
    if (usersPubkey) {
      router.push("settings/shop-profile");
    } else {
      onOpen();
    }
  };

  const handleViewOrders = () => {
    if (usersPubkey) {
      router.push("/orders");
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
    <div className="absolute left-0 top-full z-10 mt-2 w-48 rounded-md border-2 border-black bg-white shadow-neo">
      <div className="py-1">
        <Button
          className="w-full bg-transparent px-4 py-2 text-left text-sm font-bold text-black hover:bg-gray-100"
          onClick={() => {
            setSelectedSection("Listings");
            setIsMobileMenuOpen(false);
          }}
        >
          Listings
        </Button>
        <Button
          className="w-full bg-transparent px-4 py-2 text-left text-sm font-bold text-black hover:bg-gray-100"
          onClick={() => {
            setSelectedSection("Discounts");
            setIsMobileMenuOpen(false);
          }}
        >
          Discounts
        </Button>
        <Button
          className="w-full bg-transparent px-4 py-2 text-left text-sm font-bold text-black hover:bg-gray-100"
          onClick={() => {
            handleViewOrders();
            setIsMobileMenuOpen(false);
          }}
        >
          Orders
        </Button>
        <Button
          className="w-full bg-transparent px-4 py-2 text-left text-sm font-bold text-black hover:bg-gray-100"
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
    <div className="mx-auto h-full w-full bg-white">
      <div className="flex max-w-[100%] flex-col px-3 pb-2">
        <StripeConnectBanner
          returnPath="/my-listings?stripe=success"
          refreshPath="/my-listings?stripe=refresh"
        />
        {shopBannerURL != "" && !isFetchingShop ? (
          <>
            <div className="mb-6 flex h-auto w-full items-center justify-center overflow-hidden rounded-lg border-4 border-black shadow-neo">
              <img
                src={sanitizeUrl(shopBannerURL)}
                alt="Shop Banner"
                className="max-h-[210px] w-full object-cover"
              />
            </div>
          </>
        ) : null}

        {/* Navigation Tabs */}
        <div className="mb-6 flex items-center justify-between border-b-4 border-black pb-2">
          <div className="flex items-center gap-2">
            <div className="relative sm:hidden" ref={menuRef}>
              <Button
                className="bg-transparent p-1"
                onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              >
                <Bars3Icon className="h-6 w-6 text-black" />
              </Button>
              {isMobileMenuOpen && <MobileMenu />}
            </div>
            <div className="hidden gap-6 md:flex">
              <Button
                className={`bg-transparent px-0 text-lg font-bold ${
                  selectedSection === "Listings"
                    ? "border-b-4 border-black text-black"
                    : "text-gray-500 hover:text-black"
                }`}
                onClick={() => setSelectedSection("Listings")}
              >
                Listings
              </Button>
              <Button
                className={`bg-transparent px-0 text-lg font-bold ${
                  selectedSection === "Discounts"
                    ? "border-b-4 border-black text-black"
                    : "text-gray-500 hover:text-black"
                }`}
                onClick={() => setSelectedSection("Discounts")}
              >
                Discounts
              </Button>
              <Button
                className="bg-transparent px-0 text-lg font-bold text-gray-500 hover:text-black"
                onClick={() => handleViewOrders()}
              >
                Orders
              </Button>
              <Button
                className="bg-transparent px-0 text-lg font-bold text-gray-500 hover:text-black"
                onClick={() => handleManageCommunity()}
              >
                Community
              </Button>
            </div>
          </div>
        </div>

        {/* Mobile buttons - shown at top on mobile */}
        <div className="mb-4 flex gap-2 sm:hidden">
          <Button
            className={`${BLUEBUTTONCLASSNAMES} flex-1`}
            onClick={() => handleCreateNewListing()}
          >
            Add Listing
          </Button>
          <Button
            className={`${BLUEBUTTONCLASSNAMES} flex-1`}
            onClick={() => handleEditShop()}
          >
            Edit Shop
          </Button>
        </div>

        <div className="flex gap-6">
          {/* Sidebar */}
          <div className="hidden w-64 flex-shrink-0 md:block">
            <div className="space-y-3">
              <Button
                className={`${BLUEBUTTONCLASSNAMES} w-full`}
                onClick={() => handleCreateNewListing()}
              >
                Add Listing
              </Button>
              <Button
                className={`${BLUEBUTTONCLASSNAMES} w-full`}
                onClick={() => handleEditShop()}
              >
                Edit Shop
              </Button>
            </div>
          </div>

          {/* Main Content Area */}
          <div className="flex-1">
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
          </div>
          {usersPubkey && selectedSection === "Discounts" && <DiscountCodes />}
        </div>
      </div>
      <SignInModal isOpen={isOpen} onClose={onClose} />
    </div>
  );
};

export default MyListingsPage;
