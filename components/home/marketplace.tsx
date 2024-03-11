import { ArrowUturnLeftIcon } from "@heroicons/react/24/outline";
import { Button, useDisclosure } from "@nextui-org/react";
import { useRouter } from "next/router";
import { nip19 } from "nostr-tools";
import React, { useContext, useEffect, useState } from "react";
import DisplayEvents from "../display-products";
import LocationDropdown from "../utility-components/dropdowns/location-dropdown";
import { isUserLoggedIn } from "../utility/nostr-helper-functions";
import SignInModal from "../sign-in/SignInModal";
import CategoryDropdown from "../utility-components/dropdowns/category-dropdown";
import { ProductContext } from "@/utils/context/context";
import { Search } from "../utility-components/search";

export function MarketplacePage() {
  const productContext = useContext(ProductContext);
  const router = useRouter();
  const [focusedPubkey, setfocusedPubkey] = useState(""); // pubkey of shop being viewed
  const [searchQuery, setSearchQuery] = useState(
    productContext.filters.searchQuery,
  );
  const [selectedCategories, setSelectedCategories] = useState(
    productContext.filters.categories,
  );
  const [selectedLocation, setSelectedLocation] = useState<string | null>(
    productContext.filters.location,
  );
  const [showApplyFilter, setShowApplyFilter] = useState(false);

  const { isOpen, onOpen, onClose } = useDisclosure();

  // Update focusedPubkey when pubkey in url changes
  useEffect(() => {
    let focusedPubkeys = router.query.pubkey;
    if (focusedPubkeys && typeof focusedPubkeys[0] === "string") {
      const { data } = nip19.decode(focusedPubkeys[0]);
      setfocusedPubkey(data as string); // router.query.pubkey returns array of pubkeys
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
    const areSetFiltersEqual = (a: Set<string>, b: Set<string>) =>
      a.size === b.size && [...a].every((value) => b.has(value));

    const areStringFiltersEqual = (a: string | null, b: string | null) =>
      a === b || (a === null && b === "") || (a === "" && b === null);

    if (
      areStringFiltersEqual(
        productContext.filters.location,
        selectedLocation,
      ) &&
      areSetFiltersEqual(
        productContext.filters.categories,
        selectedCategories,
      ) &&
      areStringFiltersEqual(productContext.filters.searchQuery, searchQuery)
    ) {
      setShowApplyFilter(false);
    } else {
      setShowApplyFilter(true);
    }
  }, [
    selectedLocation,
    selectedCategories,
    searchQuery,
    productContext.filters,
  ]);

  const routeToShop = (npubkey: string) => {
    npubkey = encodeURIComponent(npubkey);
    if (npubkey === "") {
      // handles case where we pass in empty string to clear focusedPubkey
      setfocusedPubkey("");
    }
    router.push("/" + npubkey);
  };

  const applyFilters = () => {
    productContext.setFilters({
      searchQuery: searchQuery,
      categories: selectedCategories,
      location: selectedLocation,
    });
  };

  return (
    <div className="mx-auto w-full">
      <div className="flex max-w-[100%] flex-col bg-light-bg px-3 pb-2 dark:bg-dark-bg">
        <div className="flex flex-col justify-center gap-2 md:flex-row">
          <Search
            searchQuery={searchQuery}
            setSearchQuery={setSearchQuery}
          ></Search>
          <CategoryDropdown
            selectedCategories={selectedCategories}
            setSelectedCategories={setSelectedCategories}
          ></CategoryDropdown>
          <LocationDropdown
            selectedLocation={selectedLocation}
            setSelectedLocation={setSelectedLocation}
          />
        </div>
        {showApplyFilter ? (
          <div className="mt-2">
            <Button className={"w-full"} onClick={() => applyFilters()}>
              <span
                className={"text-accent-light-text dark:text-accent-dark-text"}
              >
                Apply filters
              </span>
            </Button>
          </div>
        ) : null}
        {focusedPubkey ? (
          <div
            className="mt-2 flex w-fit cursor-pointer flex-row rounded-md px-3 align-middle text-shopstr-purple hover:bg-shopstr-yellow dark:text-shopstr-yellow-light hover:dark:bg-shopstr-purple"
            onClick={() => {
              routeToShop("");
            }}
          >
            <div>
              <ArrowUturnLeftIcon
                className="h-5 w-5 pr-1 text-shopstr-purple-light hover:text-purple-700 dark:text-shopstr-yellow-light"
                onClick={() => {
                  routeToShop("");
                }}
              >
                Go Back
              </ArrowUturnLeftIcon>
            </div>

            <span className="overflow-hidden break-all sm:w-72 md:w-full">
              {nip19.npubEncode(focusedPubkey)}
            </span>
          </div>
        ) : undefined}
      </div>
      <DisplayEvents
        focusedPubkey={focusedPubkey}
        context={ProductContext}
        canShowLoadMore={true}
      />
      <SignInModal isOpen={isOpen} onClose={onClose} />
    </div>
  );
}

export default MarketplacePage;
