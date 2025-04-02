/* eslint-disable @next/next/no-img-element */

import router from "next/router";
import React, { useContext, useState, useEffect, useRef } from "react";
import DisplayProducts from "../display-products";
import { SignerContext } from "@/components/utility-components/nostr-context-provider";
import { Button, useDisclosure } from "@nextui-org/react";
import { Bars3Icon } from "@heroicons/react/24/outline";
import { SHOPSTRBUTTONCLASSNAMES } from "@/utils/STATIC-VARIABLES";
import SignInModal from "../sign-in/SignInModal";
import { ShopMapContext } from "@/utils/context/context";
import { ShopSettings } from "../../utils/types/types";
import { sanitizeUrl } from "@braintree/sanitize-url";
import SideShopNav from "../home/side-shop-nav";

const MyListingsPage = () => {
  const { pubkey: usersPubkey } = useContext(SignerContext);
  const { isOpen, onOpen, onClose } = useDisclosure();

  const [shopBannerURL, setShopBannerURL] = useState("");
  const [shopAbout, setShopAbout] = useState("");
  const [isFetchingShop, setIsFetchingShop] = useState(false);

  const [selectedSection, setSelectedSection] = useState("Listings");

  const [selectedCategories, setSelectedCategories] = useState(
    new Set<string>([])
  );
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
    setIsFetchingShop(true);
    if (
      usersPubkey &&
      shopMapContext.shopData.has(usersPubkey) &&
      typeof shopMapContext.shopData.get(usersPubkey) != "undefined"
    ) {
      const shopSettings: ShopSettings | undefined =
        shopMapContext.shopData.get(usersPubkey);
      if (shopSettings) {
        setShopBannerURL(shopSettings.content.ui.banner);
        setShopAbout(shopSettings.content.about);
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

  const MobileMenu = () => (
    <div className="absolute left-0 top-full z-10 mt-2 w-48 rounded-md bg-light-fg shadow-lg dark:bg-dark-fg md:hidden">
      <div className="py-1">
        <Button
          className="w-full bg-transparent px-4 py-2 text-left text-sm text-light-text hover:text-purple-700 dark:text-dark-text dark:hover:text-accent-dark-text"
          onClick={() => {
            setSelectedSection("Listings");
            setIsMobileMenuOpen(false);
          }}
        >
          Listings
        </Button>
        <Button
          className="w-full bg-transparent px-4 py-2 text-left text-sm text-light-text hover:text-purple-700 dark:text-dark-text dark:hover:text-accent-dark-text"
          onClick={() => {
            setSelectedSection("About");
            setIsMobileMenuOpen(false);
          }}
        >
          About
        </Button>
        <Button
          className="w-full bg-transparent px-4 py-2 text-left text-sm text-light-text hover:text-purple-700 dark:text-dark-text dark:hover:text-accent-dark-text"
          onClick={() => {
            router.push("/orders");
            setIsMobileMenuOpen(false);
          }}
        >
          Messages
        </Button>
      </div>
    </div>
  );

  return (
    <div className="mx-auto h-full w-full">
      <div className="flex max-w-[100%] flex-col bg-light-bg px-3 pb-2 dark:bg-dark-bg">
        {shopBannerURL != "" && !isFetchingShop ? (
          <>
            <div className="flex h-auto w-full items-center justify-center bg-light-bg bg-cover bg-center dark:bg-dark-bg">
              <img
                src={sanitizeUrl(shopBannerURL)}
                alt="Shop Banner"
                className="max-h-[210px] w-full items-center justify-center object-cover"
              />
            </div>
            <div className="mt-3 flex items-center justify-between font-bold text-light-text dark:text-dark-text">
              <div className="flex items-center gap-2">
                <div className="relative md:hidden" ref={menuRef}>
                  <Button
                    className="bg-transparent p-1"
                    onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                  >
                    <Bars3Icon className="h-6 w-6 text-light-text dark:text-dark-text" />
                  </Button>
                  {isMobileMenuOpen && <MobileMenu />}
                </div>
                <div className="hidden gap-2 md:flex">
                  <Button
                    className="bg-transparent text-xl text-light-text hover:text-purple-700 dark:text-dark-text dark:hover:text-accent-dark-text"
                    onClick={() => setSelectedSection("Listings")}
                  >
                    Listings
                  </Button>
                  <Button
                    className="bg-transparent text-xl text-light-text hover:text-purple-700 dark:text-dark-text dark:hover:text-accent-dark-text"
                    onClick={() => setSelectedSection("About")}
                  >
                    About
                  </Button>
                  <Button
                    className="bg-transparent text-xl text-light-text hover:text-purple-700 dark:text-dark-text dark:hover:text-accent-dark-text"
                    onClick={() => router.push("/orders")}
                  >
                    Messages
                  </Button>
                </div>
              </div>
              <div className="flex gap-2 md:hidden">
                <Button
                  className={`${SHOPSTRBUTTONCLASSNAMES}`}
                  onClick={() => handleCreateNewListing()}
                >
                  Add Listing
                </Button>
                <Button
                  className={`${SHOPSTRBUTTONCLASSNAMES}`}
                  onClick={() => router.push("settings/shop-settings")}
                >
                  Edit Shop
                </Button>
              </div>
            </div>
          </>
        ) : (
          <>
            <div className="mt-3 flex items-center justify-between font-bold text-light-text dark:text-dark-text">
              <div className="flex items-center gap-2">
                <div className="relative md:hidden" ref={menuRef}>
                  <Button
                    className="bg-transparent p-1"
                    onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                  >
                    <Bars3Icon className="h-6 w-6 text-light-text dark:text-dark-text" />
                  </Button>
                  {isMobileMenuOpen && <MobileMenu />}
                </div>
                <div className="hidden gap-2 md:flex">
                  <Button
                    className="bg-transparent text-xl text-light-text hover:text-purple-700 dark:text-dark-text dark:hover:text-accent-dark-text"
                    onClick={() => setSelectedSection("Listings")}
                  >
                    Listings
                  </Button>
                  <Button
                    className="bg-transparent text-xl text-light-text hover:text-purple-700 dark:text-dark-text dark:hover:text-accent-dark-text"
                    onClick={() => setSelectedSection("About")}
                  >
                    About
                  </Button>
                  <Button
                    className="bg-transparent text-xl text-light-text hover:text-purple-700 dark:text-dark-text dark:hover:text-accent-dark-text"
                    onClick={() => router.push("/orders")}
                  >
                    Messages
                  </Button>
                </div>
              </div>
              <div className="flex gap-2 md:hidden">
                <Button
                  className={`${SHOPSTRBUTTONCLASSNAMES}`}
                  onClick={() => handleCreateNewListing()}
                >
                  Add Listing
                </Button>
                <Button
                  className={`${SHOPSTRBUTTONCLASSNAMES}`}
                  onClick={() => router.push("settings/shop-settings")}
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
          {selectedSection === "About" && shopAbout && (
            <div className="flex w-full flex-col justify-start bg-transparent px-4 py-8 text-light-text dark:text-dark-text">
              <h2 className="pb-2 text-2xl font-bold">About</h2>
              <p className="text-base">{shopAbout}</p>
            </div>
          )}
          {selectedSection === "About" && !shopAbout && (
            <div className="flex w-full flex-col justify-start bg-transparent px-4 py-8 text-light-text dark:text-dark-text">
              <p className="text-base">
                Nothing here . . . yet!<br></br>
                <br></br>
                Set up your shop in settings!
              </p>
            </div>
          )}
        </div>
      </div>
      <SignInModal isOpen={isOpen} onClose={onClose} />
    </div>
  );
};

export default MyListingsPage;
