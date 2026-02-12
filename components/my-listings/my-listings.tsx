/* eslint-disable @next/next/no-img-element */

import { useRouter } from "next/router";
import React, { useContext, useState, useEffect, useRef } from "react";
import DisplayProducts from "../display-products";
import { SignerContext } from "@/components/utility-components/nostr-context-provider";
import { Button, useDisclosure } from "@nextui-org/react";
import {
  Bars3Icon,
  PlusIcon,
  PencilSquareIcon,
  BuildingStorefrontIcon,
} from "@heroicons/react/24/outline";
import { NEO_BTN } from "@/utils/STATIC-VARIABLES";
import SignInModal from "../sign-in/SignInModal";
import { ShopMapContext } from "@/utils/context/context";
import { ShopProfile } from "../../utils/types/types";
import DiscountCodes from "./discount-codes";

const MyListingsPage = () => {
  const { pubkey: usersPubkey } = useContext(SignerContext);
  const router = useRouter();
  const { isOpen, onOpen, onClose } = useDisclosure();

  const [shopBannerURL, setShopBannerURL] = useState("");
  const [shopAbout, setShopAbout] = useState("");

  const [selectedSection, setSelectedSection] = useState("Listings");

  const [selectedCategories, setSelectedCategories] = useState(
    new Set<string>([])
  );
  const [talliedCategories, setTalliedCategories] = useState<
    Record<string, number>
  >({});
  const [categories, setCategories] = useState([""]);

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
    if (
      usersPubkey &&
      shopMapContext.shopData.has(usersPubkey) &&
      typeof shopMapContext.shopData.get(usersPubkey) != "undefined"
    ) {
      const shopProfile: ShopProfile | undefined =
        shopMapContext.shopData.get(usersPubkey);
      if (shopProfile) {
        setShopBannerURL(shopProfile.content.ui.banner);
        setShopAbout(shopProfile.content.about);
      }
    }
  }, [usersPubkey, shopMapContext, shopBannerURL]);

  useEffect(() => {
    if (categories) {
      const excludedCategories = ["shopstr"];
      const tallied = categories
        .filter((category) => !excludedCategories.includes(category))
        .reduce(
          (acc, category) => {
            acc[category] = (acc[category] || 0) + 1;
            return acc;
          },
          {} as Record<string, number>
        );
      setTalliedCategories(tallied);
    }
  }, [categories]);

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
    <div className="absolute right-0 top-full z-50 mt-2 w-48 rounded-xl border border-zinc-800 bg-[#1a1a1a] p-1 shadow-2xl md:hidden">
      <div className="py-1">
        <Button
          className="w-full justify-start bg-transparent px-4 py-2 text-left text-sm font-bold uppercase tracking-wider text-zinc-400 hover:text-white"
          onClick={() => {
            setSelectedSection("Listings");
            setIsMobileMenuOpen(false);
          }}
        >
          Listings
        </Button>
        <Button
          className="w-full justify-start bg-transparent px-4 py-2 text-left text-sm font-bold uppercase tracking-wider text-zinc-400 hover:text-white"
          onClick={() => {
            setSelectedSection("Discounts");
            setIsMobileMenuOpen(false);
          }}
        >
          Discounts
        </Button>
        <Button
          className="w-full justify-start bg-transparent px-4 py-2 text-left text-sm font-bold uppercase tracking-wider text-zinc-400 hover:text-white"
          onClick={() => {
            setSelectedSection("About");
            setIsMobileMenuOpen(false);
          }}
        >
          About
        </Button>
        <Button
          className="w-full justify-start bg-transparent px-4 py-2 text-left text-sm font-bold uppercase tracking-wider text-zinc-400 hover:text-white"
          onClick={() => {
            handleViewOrders();
            setIsMobileMenuOpen(false);
          }}
        >
          Orders
        </Button>
        <Button
          className="w-full justify-start bg-transparent px-4 py-2 text-left text-sm font-bold uppercase tracking-wider text-zinc-400 hover:text-white"
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
    <div className="mx-auto flex h-full min-h-screen w-full flex-col bg-light-bg dark:bg-dark-bg md:flex-row">
      {/* Mobile Header */}
      <div className="flex items-center justify-between border-b border-zinc-800 bg-[#161616] p-4 md:hidden">
        <h2 className="text-lg font-bold uppercase tracking-wider text-white">
          {selectedSection}
        </h2>
        <div className="relative" ref={menuRef}>
          <Button
            isIconOnly
            variant="light"
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
          >
            <Bars3Icon className="h-6 w-6 text-white" />
          </Button>
          {isMobileMenuOpen && <MobileMenu />}
        </div>
      </div>

      {/* Left Sidebar */}
      <div className="hidden w-64 flex-col gap-6 border-r border-zinc-800 p-8 md:flex">
        <div className="flex flex-col gap-4">
          <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-500">
            Manage
          </h3>
          <button
            onClick={() => setSelectedSection("Listings")}
            className={`text-left text-sm font-bold uppercase tracking-wide ${
              selectedSection === "Listings"
                ? "text-shopstr-yellow"
                : "text-zinc-400 hover:text-white"
            }`}
          >
            Listings
          </button>
          <button
            onClick={() => setSelectedSection("About")}
            className={`text-left text-sm font-bold uppercase tracking-wide ${
              selectedSection === "About"
                ? "text-shopstr-yellow"
                : "text-zinc-400 hover:text-white"
            }`}
          >
            About
          </button>
          <button
            onClick={handleViewOrders}
            className={`text-left text-sm font-bold uppercase tracking-wide ${
              selectedSection === "Orders"
                ? "text-shopstr-yellow"
                : "text-zinc-400 hover:text-white"
            }`}
          >
            Orders
          </button>
          <button
            onClick={handleManageCommunity}
            className={`text-left text-sm font-bold uppercase tracking-wide ${
              selectedSection === "Community"
                ? "text-shopstr-yellow"
                : "text-zinc-400 hover:text-white"
            }`}
          >
            Community
          </button>
          <button
            onClick={() => setSelectedSection("Discounts")}
            className={`text-left text-sm font-bold uppercase tracking-wide ${
              selectedSection === "Discounts"
                ? "text-shopstr-yellow"
                : "text-zinc-400 hover:text-white"
            }`}
          >
            Discounts
          </button>

          {/* Category Filters (Restored) */}
          {selectedSection === "Listings" &&
            Object.keys(talliedCategories).length > 0 && (
              <>
                <div className="my-2 h-px bg-zinc-800" />
                <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-500">
                  Filter Categories
                </h3>
                <button
                  onClick={() => setSelectedCategories(new Set([]))}
                  className="text-left text-sm font-bold uppercase tracking-wide text-zinc-400 hover:text-white"
                >
                  All Listings
                </button>
                {Object.entries(talliedCategories).map(([category, count]) => (
                  <button
                    key={category}
                    onClick={() => setSelectedCategories(new Set([category]))}
                    className="text-left text-sm font-medium text-zinc-400 hover:text-white"
                  >
                    {category} <span className="text-zinc-600">({count})</span>
                  </button>
                ))}
              </>
            )}
        </div>

        <div className="flex flex-col gap-3">
          <Button
            className={`${NEO_BTN} h-10 w-full text-xs`}
            startContent={<PlusIcon className="h-4 w-4" />}
            onClick={handleCreateNewListing}
          >
            Add Listing
          </Button>
          <Button
            className="h-10 w-full rounded-xl border border-zinc-700 bg-zinc-800/50 text-xs font-bold uppercase tracking-wider text-zinc-300 hover:bg-zinc-800 hover:text-white"
            startContent={<PencilSquareIcon className="h-4 w-4" />}
            onClick={handleEditShop}
          >
            Edit Shop
          </Button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 p-4 md:p-8">
        <div className="mx-auto max-w-7xl">
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
          {selectedSection === "About" && shopAbout && (
            <div className="flex w-full flex-col justify-start bg-transparent px-4 py-8 text-light-text dark:text-dark-text">
              <h2 className="pb-2 text-2xl font-bold">About</h2>
              <p className="text-base">{shopAbout}</p>
            </div>
          )}
          {selectedSection === "About" && !shopAbout && (
            <div className="mt-12 flex w-full flex-col items-center justify-center">
              <div className="mx-auto w-full max-w-md rounded-3xl border border-white/10 bg-[#18181b] p-8 text-center shadow-2xl md:p-16">
                <div className="mx-auto mb-6 flex h-24 w-24 items-center justify-center rounded-3xl bg-zinc-900">
                  <BuildingStorefrontIcon className="h-10 w-10 text-zinc-600" />
                </div>
                <h2 className="mb-2 text-2xl font-black uppercase text-white">
                  Nothing here... yet!
                </h2>
                <p className="mb-8 text-sm font-medium text-zinc-500">
                  Set up your shop description in settings.
                </p>
                <Button
                  className={`${NEO_BTN} h-12 px-8 text-sm`}
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
