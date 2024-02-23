import {
  MagnifyingGlassIcon,
  ArrowUturnLeftIcon,
} from "@heroicons/react/24/outline";
import {
  Button,
  Select,
  SelectItem,
  SelectSection,
  Input,
} from "@nextui-org/react";
import { useRouter } from "next/router";
import { nip19 } from "nostr-tools";
import React, { useEffect, useState } from "react";
import DisplayEvents from "../display-products";
import LocationDropdown from "../utility-components/dropdowns/location-dropdown";
import {
  CATEGORIES,
  SHOPSTRBUTTONCLASSNAMES,
} from "../utility/STATIC-VARIABLES";
import { getLocalStorageData } from "../utility/nostr-helper-functions";
import SignInModal from "../sign-in/SignInModal";

export function MarketplacePage() {
  const router = useRouter();
  const [focusedPubkey, setfocusedPubkey] = useState(""); // pubkey of shop being viewed
  const [selectedCategories, setSelectedCategories] = useState(
    new Set<string>([]),
  );
  const [selectedLocation, setSelectedLocation] = useState("");
  const [selectedSearch, setSelectedSearch] = useState("");
  const [toggleSignInPage, setToggleSignInPage] = useState(false);
  let [count, setCount] = useState(0);

  // Update focusedPubkey when pubkey in url changes
  useEffect(() => {
    let focusedPubkeys = router.query.pubkey;
    if (focusedPubkeys && typeof focusedPubkeys[0] === "string") {
      const { data } = nip19.decode(focusedPubkeys[0]);
      setfocusedPubkey(data as string); // router.query.pubkey returns array of pubkeys
    }
  }, [router.query.pubkey]);

  useEffect(() => {
    const loggedIn = getLocalStorageData().decryptedNpub;
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

  const routeToShop = (npubkey: string) => {
    npubkey = encodeURIComponent(npubkey);
    if (npubkey === "") {
      // handles case where we pass in empty string to clear focusedPubkey
      setfocusedPubkey("");
    }
    router.push("/" + npubkey);
  };

  const handleCreateNewListing = () => {
    const loggedIn = getLocalStorageData().npub;

    if (loggedIn) {
      router.push("/?addNewListing");
    } else {
      setToggleSignInPage(true);
      setCount(++count);
    }
  };

  return (
    <div className="mx-auto w-full">
      <div className="flex max-w-[100%] flex-col bg-light-bg px-3 pb-2 dark:bg-dark-bg">
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
                setSelectedCategories(new Set(event.target.value.split(",")));
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
        </div>
        <div>
          <Button
            className={`${SHOPSTRBUTTONCLASSNAMES} w-full md:hidden`}
            onClick={() => handleCreateNewListing()}
          >
            + Create new listing
          </Button>
        </div>
        {focusedPubkey ? (
          <div
            className="flex w-fit cursor-pointer flex-row rounded-md px-3 align-middle text-shopstr-purple hover:bg-shopstr-yellow dark:text-shopstr-yellow-light hover:dark:bg-shopstr-purple"
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

            <span className="max-w-full overflow-hidden overflow-ellipsis whitespace-nowrap">
              {nip19.npubEncode(focusedPubkey)}
            </span>
          </div>
        ) : undefined}
      </div>
      <DisplayEvents
        focusedPubkey={focusedPubkey}
        selectedCategories={selectedCategories}
        selectedLocation={selectedLocation}
        selectedSearch={selectedSearch}
      />
      <SignInModal some={count} opened={toggleSignInPage}></SignInModal>
    </div>
  );
}

export default MarketplacePage;
