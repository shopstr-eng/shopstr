import { MagnifyingGlassIcon } from "@heroicons/react/24/outline";
import {
  Select,
  SelectItem,
  SelectSection,
  Input,
  useDisclosure,
} from "@nextui-org/react";
import { useRouter } from "next/router";
import { nip19 } from "nostr-tools";
import React, { useContext, useEffect, useState } from "react";
import {
  ShopMapContext,
  FollowsContext,
} from "@/utils/context/context";
import DisplayProducts from "../display-products";
import LocationDropdown from "../utility-components/dropdowns/location-dropdown";
import { CATEGORIES } from "@/utils/STATIC-VARIABLES";
import { SignerContext } from "@/components/utility-components/nostr-context-provider";
import SignInModal from "../sign-in/SignInModal";
import ShopstrSwitch from "../utility-components/shopstr-switch";
import SideShopNav from "./side-shop-nav";
import { ShopSettings } from "../../utils/types/types";

function MarketplacePage({
  focusedPubkey,
  setFocusedPubkey,
}: {
  focusedPubkey: string;
  setFocusedPubkey: (value: string) => void;
}) {
  const router = useRouter();
  const [selectedCategories, setSelectedCategories] = useState(new Set<string>([]));
  const [selectedLocation, setSelectedLocation] = useState("");
  const [selectedSearch, setSelectedSearch] = useState("");
  const { isOpen, onOpen, onClose } = useDisclosure();
  const [wotFilter, setWotFilter] = useState(false);
  const [filteredProducts, setFilteredProducts] = useState([]);
  const [shopBannerURL, setShopBannerURL] = useState("");
  const [shopAbout, setShopAbout] = useState("");
  const [isFetchingShop, setIsFetchingShop] = useState(false);
  const [isFetchingFollows, setIsFetchingFollows] = useState(false);
  const [categories, setCategories] = useState([""]);

  const shopMapContext = useContext(ShopMapContext);
  const followsContext = useContext(FollowsContext);
  const { pubkey: userPubkey, isLoggedIn: loggedIn } = useContext(SignerContext);

  useEffect(() => {
    const npub = router.query.npub;
    if (npub && typeof npub[0] === "string") {
      const { data } = nip19.decode(npub[0]);
      setFocusedPubkey(data as string);
    }
  }, [router.query.npub]);

  useEffect(() => {
    setIsFetchingShop(true);
    if (
      focusedPubkey &&
      shopMapContext.shopData.has(focusedPubkey) &&
      typeof shopMapContext.shopData.get(focusedPubkey) !== "undefined"
    ) {
      const shopSettings: ShopSettings | undefined = shopMapContext.shopData.get(focusedPubkey);
      if (shopSettings) {
        setShopBannerURL(shopSettings.content.ui.banner);
        setShopAbout(shopSettings.content.about);
      }
    }
    setIsFetchingShop(false);
  }, [focusedPubkey, shopMapContext]);

  useEffect(() => {
    setIsFetchingFollows(true);
    if (followsContext.followList.length && !followsContext.isLoading) {
      setIsFetchingFollows(false);
    }
  }, [followsContext]);

  const handleFilteredProductsChange = (products: any[]) => {
    setFilteredProducts(products);
  };

  return (
    <div className="min-h-screen w-full bg-gradient-to-tr from-purple-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800">
      {/* Banner */}
      <div className="relative w-full">
        {shopBannerURL && (
          <div
            className="h-48 w-full rounded-b-2xl bg-cover bg-center shadow-lg"
            style={{ backgroundImage: `url(${shopBannerURL})` }}
          />
        )}
        {/* Search & Filters Card */}
        <div className="absolute top-6 left-1/2 z-10 w-full max-w-5xl -translate-x-1/2 px-4">
          <div className="w-full rounded-xl bg-white/90 p-4 shadow-lg backdrop-blur dark:bg-gray-900/90">
            {/* Row 1: Search and Trust Toggle */}
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
              <div className="flex-1">
                <Input
                  className="rounded-lg bg-gray-100 text-indigo-900 dark:bg-gray-800 dark:text-indigo-100"
                  placeholder="Listing title, naddr1..., npub..."
                  value={selectedSearch}
                  startContent={<MagnifyingGlassIcon height={"1em"} />}
                  onChange={(event) => setSelectedSearch(event.target.value)}
                  onClear={() => setSelectedSearch("")}
                  isClearable
                />
              </div>
              <div className="flex-shrink-0 mt-2 sm:mt-0">
                {!isFetchingFollows && (
                  <ShopstrSwitch wotFilter={wotFilter} setWotFilter={setWotFilter} />
                )}
              </div>
            </div>
            {/* Row 2: Filters */}
            <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
              <Select
                className="w-full sm:w-40"
                label="Categories"
                placeholder="All"
                selectedKeys={selectedCategories}
                onChange={(event) => {
                  if (event.target.value === "") {
                    setSelectedCategories(new Set([]));
                  } else {
                    setSelectedCategories(new Set(event.target.value.split(",")));
                  }
                }}
                selectionMode="multiple"
              >
                <SelectSection>
                  {CATEGORIES.map((category) => (
                    <SelectItem value={category} key={category}>
                      {category}
                    </SelectItem>
                  ))}
                </SelectSection>
              </Select>
              <LocationDropdown
                className="w-full sm:w-40"
                placeholder="All"
                label="Location"
                value={selectedLocation}
                onChange={(event: any) => setSelectedLocation(event.target.value)}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="mx-auto mt-32 flex max-w-5xl gap-8 px-4">
        {/* Side Navigation */}
        {focusedPubkey && shopBannerURL && shopAbout && (
          <div className="hidden w-1/4 lg:block">
            <SideShopNav
              focusedPubkey={focusedPubkey}
              categories={categories}
              setSelectedCategories={setSelectedCategories}
            />
          </div>
        )}
        {/* Product Grid */}
        <div className="flex-1">
          <DisplayProducts
            focusedPubkey={focusedPubkey}
            selectedCategories={selectedCategories}
            selectedLocation={selectedLocation}
            selectedSearch={selectedSearch}
            wotFilter={wotFilter}
            setCategories={setCategories}
            onFilteredProductsChange={handleFilteredProductsChange}
          />
        </div>
      </div>
      <SignInModal isOpen={isOpen} onClose={onClose} />
    </div>
  );
}

export default MarketplacePage;
