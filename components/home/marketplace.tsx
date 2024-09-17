import { MagnifyingGlassIcon } from "@heroicons/react/24/outline";
import {
  Button,
  Select,
  SelectItem,
  SelectSection,
  Input,
  useDisclosure,
} from "@nextui-org/react";
import { useRouter } from "next/router";
import { nip19 } from "nostr-tools";
import React, { useContext, useEffect, useState } from "react";
import { ShopMapContext, FollowsContext } from "@/utils/context/context";
import DisplayProducts from "../display-products";
import LocationDropdown from "../utility-components/dropdowns/location-dropdown";
import { CATEGORIES } from "../utility/STATIC-VARIABLES";
import {
  getLocalStorageData,
  isUserLoggedIn,
} from "../utility/nostr-helper-functions";
import SignInModal from "../sign-in/SignInModal";
import ShopstrSwitch from "../utility-components/shopstr-switch";
import { ShopSettings } from "../../utils/types/types";
import SideShopNav from "./side-shop-nav";

export function MarketplacePage({
  focusedPubkey,
  setFocusedPubkey,
}: {
  focusedPubkey: string;
  setFocusedPubkey: (value: string) => void;
}) {
  const router = useRouter();
  const [selectedCategories, setSelectedCategories] = useState(
    new Set<string>([]),
  );
  const [selectedLocation, setSelectedLocation] = useState("");
  const [selectedSearch, setSelectedSearch] = useState("");
  const { isOpen, onClose } = useDisclosure();
  const [selectedSection, setSelectedSection] = useState("Shop");

  const [wotFilter, setWotFilter] = useState(false);

  const [shopBannerURL, setShopBannerURL] = useState("");
  const [shopAbout, setShopAbout] = useState("");
  const [isFetchingShop, setIsFetchingShop] = useState(false);

  const [isFetchingFollows, setIsFetchingFollows] = useState(false);

  const [categories, setCategories] = useState([""]);

  const shopMapContext = useContext(ShopMapContext);
  const followsContext = useContext(FollowsContext);

  // Update focusedPubkey when pubkey in url changes
  useEffect(() => {
    let focusedPubkeys = router.query.pubkey;
    if (focusedPubkeys && typeof focusedPubkeys[0] === "string") {
      const { data } = nip19.decode(focusedPubkeys[0]);
      setFocusedPubkey(data as string); // router.query.pubkey returns array of pubkeys
    }
  }, [router.query.pubkey]);

  useEffect(() => {
    const loggedIn = isUserLoggedIn();
    if (loggedIn) {
      fetch("/api/metrics/post-shopper", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          id: loggedIn,
        }),
      });
    }
  });

  useEffect(() => {
    setIsFetchingShop(true);
    if (
      focusedPubkey &&
      shopMapContext.shopData.has(focusedPubkey) &&
      typeof shopMapContext.shopData.get(focusedPubkey) != "undefined"
    ) {
      const shopSettings: ShopSettings | undefined =
        shopMapContext.shopData.get(focusedPubkey);
      if (shopSettings) {
        setShopBannerURL(shopSettings.content.ui.banner);
        setShopAbout(shopSettings.content.about);
      }
    }
    setIsFetchingShop(false);
  }, [focusedPubkey, shopMapContext, shopBannerURL]);

  useEffect(() => {
    setIsFetchingFollows(true);
    if (followsContext.followList.length && !followsContext.isLoading) {
      setIsFetchingFollows(false);
    }
  }, [followsContext]);

  const handleSendMessage = (pubkeyToOpenChatWith: string) => {
    let { signInMethod } = getLocalStorageData();
    if (!signInMethod) {
      alert("You must be signed in to send a message!");
      return;
    }
    router.push({
      pathname: "/messages",
      query: { pk: nip19.npubEncode(pubkeyToOpenChatWith) },
    });
  };

  return (
    <div className="mx-auto w-full">
      <div className="flex max-w-[100%] flex-col bg-light-bg px-3 pb-2 dark:bg-dark-bg">
        {shopBannerURL != "" && focusedPubkey != "" && !isFetchingShop ? (
          <div className="mt-3 flex items-center justify-between font-bold text-light-text dark:text-dark-text">
            <div className="flex gap-1">
              <Button
                className="bg-transparent text-xl text-light-text hover:text-purple-700 dark:text-dark-text dark:hover:text-accent-dark-text"
                onClick={() => {
                  setSelectedCategories(new Set<string>([]));
                  setSelectedLocation("");
                  setSelectedSearch("");
                  setSelectedSection("Shop");
                }}
              >
                Shop
              </Button>
              {/* <Button className="bg-transparent text-xl text-light-text hover:text-purple-700 dark:text-dark-text dark:hover:text-accent-dark-text">
                  Reviews
                </Button> */}
              <Button
                className="bg-transparent text-xl text-light-text hover:text-purple-700 dark:text-dark-text dark:hover:text-accent-dark-text"
                onClick={() => {
                  setSelectedSection("About");
                }}
              >
                About
              </Button>
              <Button
                className="yoytext-light-text bg-transparent text-xl hover:text-purple-700 dark:text-dark-text dark:hover:text-accent-dark-text"
                onClick={() => handleSendMessage(focusedPubkey)}
              >
                Message
              </Button>
            </div>
            <div>
              <Input
                className="text-light-text dark:text-dark-text"
                isClearable
                placeholder="Search items..."
                startContent={<MagnifyingGlassIcon height={"1em"} />}
                onChange={(event) => setSelectedSearch(event.target.value)}
              />
            </div>
          </div>
        ) : (
          <>
            <div className="flex flex-row gap-2 pb-3">
              <Input
                className="mt-2 text-light-text dark:text-dark-text"
                isClearable
                label="Listings"
                placeholder="Type to search..."
                startContent={<MagnifyingGlassIcon height={"1em"} />}
                onChange={(event) => {
                  const value = event.target.value;
                  setSelectedSearch(value);
                }}
              ></Input>
              <Select
                className="mt-2 text-light-text dark:text-dark-text"
                label="Categories"
                placeholder="All"
                selectedKeys={selectedCategories}
                onChange={(event) => {
                  if (event.target.value === "") {
                    setSelectedCategories(new Set([]));
                  } else {
                    setSelectedCategories(
                      new Set(event.target.value.split(",")),
                    );
                  }
                }}
                selectionMode="multiple"
              >
                <SelectSection className="text-light-text dark:text-dark-text">
                  {CATEGORIES.map((category) => (
                    <SelectItem value={category} key={category}>
                      {category}
                    </SelectItem>
                  ))}
                </SelectSection>
              </Select>
              <LocationDropdown
                className="mt-2"
                placeholder="All"
                label="Location"
                value={selectedLocation}
                onChange={(event: any) => {
                  setSelectedLocation(event.target.value);
                }}
              />
              {!isFetchingFollows ? (
                <ShopstrSwitch
                  wotFilter={wotFilter}
                  setWotFilter={setWotFilter}
                />
              ) : null}
            </div>
          </>
        )}
      </div>
      <div className="flex">
        {focusedPubkey && shopBannerURL && shopAbout && (
          <SideShopNav
            focusedPubkey={focusedPubkey}
            categories={categories}
            setSelectedCategories={setSelectedCategories}
          />
        )}
        {selectedSection === "Shop" && (
          <DisplayProducts
            focusedPubkey={focusedPubkey}
            selectedCategories={selectedCategories}
            selectedLocation={selectedLocation}
            selectedSearch={selectedSearch}
            canShowLoadMore={true}
            wotFilter={wotFilter}
            setCategories={setCategories}
          />
        )}
        {selectedSection === "About" && shopAbout && (
          <div className="flex w-full flex-col justify-start bg-transparent px-4 py-8 text-light-text dark:text-dark-text">
            <h2 className="pb-2 text-2xl font-bold">About</h2>
            <p className="text-base">{shopAbout}</p>
          </div>
        )}
      </div>
      <SignInModal isOpen={isOpen} onClose={onClose} />
    </div>
  );
}

export default MarketplacePage;
