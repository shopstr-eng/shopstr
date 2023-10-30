import React, { useEffect, useState } from "react";
import DisplayEvents from "./components/display-products";
import { useRouter } from "next/router";
import { ArrowUturnLeftIcon } from "@heroicons/react/24/outline";
import { nip19 } from "nostr-tools";
import ProductForm from "./components/product-form";
import { Button, Select, SelectItem, Input } from "@nextui-org/react";
import {
  CATEGORIES,
  SHOPSTRBUTTONCLASSNAMES,
} from "./components/utility/STATIC-VARIABLES";
import LocationDropdown from "./components/utility-components/location-dropdown";
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

  useEffect(() => {
    if (!localStorage.getItem("relays")) {
      localStorage.setItem(
        "relays",
        JSON.stringify(["wss://relay.damus.io", "wss://nos.lol"]),
      );
    }
  }, []);

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
      <div className="top-[40px] flex flex-col absolute z-20 w-[99vw] max-w-[100%] px-3 bg-white pb-2">
        <div className="flex-row flex gap-2 pb-3">
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
            className="mt-2"
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
            {CATEGORIES.map((category) => (
              <SelectItem value={category} key={category}>
                {category}
              </SelectItem>
            ))}
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
            className="flex flex-row w-fit px-3 align-middle text-yellow-500 hover:bg-purple-700 rounded-md cursor-pointer"
            onClick={() => {
              routeToShop("");
            }}
          >
            <div>
              <ArrowUturnLeftIcon
                className="w-5 h-5 text-purple-500 hover:text-purple-700 pr-1"
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
      <div className="flex flex-row justify-between h-fit absolute w-[99vw] bottom-[0px] bg-white py-[15px] z-20 px-3">
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
