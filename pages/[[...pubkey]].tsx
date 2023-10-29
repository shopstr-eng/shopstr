import React, { useEffect, useState } from "react";
import DisplayEvents from "./components/display-events";
import { useRouter } from "next/router";
import { ArrowUturnLeftIcon } from "@heroicons/react/24/outline";
import { nip19, SimplePool } from "nostr-tools";
import ProductForm from "./components/product-form";
import { Button } from "@nextui-org/react";

const SellerView = () => {
  const router = useRouter();
  const [focusedPubkey, setfocusedPubkey] = useState(""); // pubkey of shop being viewed
  const [showModal, setShowModal] = useState(false);

  // Update focusedPubkey when pubkey in url changes
  useEffect(() => {
    let focusedPubkeys = router.query.pubkey;
    if (focusedPubkeys && typeof focusedPubkeys[0] === "string") {
      const { data } = nip19.decode(focusedPubkeys[0]);
      setfocusedPubkey(data); // router.query.pubkey returns array of pubkeys
    }
  }, [router.query.pubkey]);

  const routeToShop = (npubkey) => {
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
    <div className="flex flex-col">
      {focusedPubkey ? (
        <div
          className="flex flex-row items-center w-fit pr-2 align-middle text-yellow-500 hover:bg-purple-700 rounded-md cursor-pointer"
          onClick={() => {
            routeToShop("");
          }}
        >
          <ArrowUturnLeftIcon
            className="w-5 h-5 text-purple-500 hover:text-purple-700 pr-1"
            onClick={() => {
              routeToShop("");
            }}
          >
            Go Back
          </ArrowUturnLeftIcon>
          {nip19.npubEncode(focusedPubkey)}
        </div>
      ) : undefined}
      <DisplayEvents focusedPubkey={focusedPubkey} />
      <div className="flex flex-row justify-between h-fit absolute w-[99vw] bottom-0 bg-white py-[20px] z-20">
        <Button
          type="button"
          className="text-white shadow-lg bg-gradient-to-tr from-purple-600 via-purple-500 to-purple-600 min-w-fit w-[20%] "
          onClick={() => {
            if (localStorage.getItem("signIn")) {
              let usersNPubkey = localStorage.getItem("npub");
              routeToShop(usersNPubkey);
            } else {
              alert("You must be signed in to view your listings!");
            }
          }}
        >
          View Your Listings
        </Button>
        <Button
          className="text-white shadow-lg bg-gradient-to-tr from-purple-600 via-purple-500 to-purple-600 min-w-fit w-[20%]"
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
