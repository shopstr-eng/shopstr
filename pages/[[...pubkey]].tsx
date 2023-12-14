import React, { useEffect, useState } from "react";
import DisplayEvents from "./components/display-products";
import Head from "next/head";
import { useRouter } from "next/router";
import { ArrowUturnLeftIcon } from "@heroicons/react/24/outline";
import { nip19 } from "nostr-tools";
import ProductForm from "./components/product-form";
import {
  Button,
  Select,
  SelectItem,
  SelectSection,
  Input,
} from "@nextui-org/react";
import {
  CATEGORIES,
  SHOPSTRBUTTONCLASSNAMES,
} from "./components/utility/STATIC-VARIABLES";
import LocationDropdown from "./components/utility-components/dropdowns/location-dropdown";
import { MagnifyingGlassIcon } from "@heroicons/react/24/outline";

const SellerView = () => {
  const router = useRouter();
  const [focusedPubkey, setfocusedPubkey] = useState(""); // pubkey of shop being viewed
  const [showModal, setShowModal] = useState(false);
  const [selectedCategories, setSelectedCategories] = useState(
    new Set<string>([]),
  );
  const [selectedLocation, setSelectedLocation] = useState("");
  const [selectedSearch, setSelectedSearch] = useState("");

  // Update focusedPubkey when pubkey in url changes
  useEffect(() => {
    let focusedPubkeys = router.query.pubkey;
    if (focusedPubkeys && typeof focusedPubkeys[0] === "string") {
      const { data } = nip19.decode(focusedPubkeys[0]);
      setfocusedPubkey(data as string); // router.query.pubkey returns array of pubkeys
    }
  }, [router.query.pubkey]);

  const routeToShop = (npubkey: string) => {
    npubkey = encodeURIComponent(npubkey);
    if (npubkey === "") {
      // handles case where we pass in empty string to clear focusedPubkey
      setfocusedPubkey("");
    }
    router.push("/" + npubkey);
  };

  const handleModalToggle = () => {
    if (localStorage.getItem("signIn")) {
      setShowModal(!showModal);
    } else {
      alert("You must be signed in to add a listing!");
    }
  };

  return (
    <div className="">
      <Head>
        <title>Shopstr</title>
        <meta
          name="description"
          content="Buy and sell anything, anywhere, anytime."
        />

        <meta property="og:url" content="https://shopstr.store" />
        <meta property="og:type" content="website" />
        <meta property="og:title" content="Shopstr" />
        <meta
          property="og:description"
          content="Buy and sell anything, anywhere, anytime."
        />
        <meta property="og:image" content="/shopstr.png" />

        <meta name="twitter:card" content="summary_large_image" />
        <meta property="twitter:domain" content="shopstr.store" />
        <meta property="twitter:url" content="https://shopstr.store" />
        <meta name="twitter:title" content="Shopstr" />
        <meta
          name="twitter:description"
          content="Buy and sell anything, anywhere, anytime."
        />
        <meta name="twitter:image" content="/shopstr.png" />
      </Head>
      <div className="absolute top-[40px] z-20 flex w-[99vw] max-w-[100%] flex-col bg-light-bg px-3 pb-2 dark:bg-dark-bg">
        <div className="flex flex-row gap-2 pb-3">
          <Input
            className="mt-2"
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
            onChange={(event) => {
              setSelectedLocation(event.target.value);
            }}
          />
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
      <div className="absolute bottom-[0px] z-20 flex h-fit w-[99vw] flex-row justify-between bg-light-bg px-3 py-[15px] dark:bg-dark-bg">
        <Button
          type="button"
          className={SHOPSTRBUTTONCLASSNAMES + " w-[20%]"}
          onClick={() => {
            if (
              localStorage.getItem("signIn") &&
              localStorage.getItem("npub") != null
            ) {
              let usersNPub = localStorage.getItem("npub") as string;
              routeToShop(usersNPub);
            } else {
              alert("You must be signed in to view your listings!");
            }
          }}
        >
          View Your Listings
        </Button>
        <Button
          className={SHOPSTRBUTTONCLASSNAMES + " w-[20%]"}
          onClick={handleModalToggle}
        >
          Add New Listing
        </Button>
      </div>
      <ProductForm
        showModal={showModal}
        handleModalToggle={handleModalToggle}
      />
    </div>
  );
};

export default SellerView;
