import React, { useEffect, useState } from "react";
import DisplayEvents from "../components/display-events";
import { useRouter } from "next/router";
import { ArrowUturnLeftIcon } from "@heroicons/react/24/outline";
import { nip19, SimplePool } from "nostr-tools";
import "websocket-polyfill";
import { handlePostListing } from "../nostr-helpers";
import ProductForm from "../components/product-form";

const SellerView = () => {
  const router = useRouter();

  const [decryptedNpub, setDecryptedNpub] = useState("");
  const [encryptedPrivateKey, setEncryptedPrivateKey] = useState("");
  const [signIn, setSignIn] = useState("");
  const [relays, setRelays] = useState([]);
  const [focusedPubkey, setfocusedPubkey] = useState(""); // pubkey of shop being viewed
  const [showModal, setShowModal] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const npub = localStorage.getItem("npub");
      const { data } = nip19.decode(npub);
      setDecryptedNpub(data);
      const encrypted = localStorage.getItem("encryptedPrivateKey");
      setEncryptedPrivateKey(encrypted);
      const signIn = localStorage.getItem("signIn");
      setSignIn(signIn);
      const storedRelays = localStorage.getItem("relays");
      setRelays(storedRelays ? JSON.parse(storedRelays) : []);
    }
  }, []);

  // Update focusedPubkey when pubkey in url changes
  useEffect(() => {
    let focusedPubkeys = router.query.pubkey;
    if (focusedPubkeys && typeof focusedPubkeys[0] === "string") {
      const { data } = nip19.decode(focusedPubkeys[0]);
      setfocusedPubkey(data); // router.query.pubkey returns array of pubkeys
    }
  }, [router.query.pubkey]);

  const routeToShop = (npubkey) => {
    if (npubkey === "") {
      // handles case where we pass in empty string to clear focusedPubkey
      setfocusedPubkey("");
    }
    router.push("/marketplace/" + npubkey);
  };

  const handleModalToggle = () => {
    setShowModal(!showModal);
  };

  return (
    <div>
      {focusedPubkey ? (
        <div
          className="flex flex-row items-center w-fit pr-2 align-middle text-yellow-500 hover:bg-purple-600 rounded-md cursor-pointer"
          onClick={() => {
            routeToShop("");
          }}
        >
          <ArrowUturnLeftIcon
            className="w-5 h-5 text-yellow-100 hover:text-purple-700 pr-1"
            onClick={() => {
              routeToShop("");
            }}
          >
            Go Back
          </ArrowUturnLeftIcon>
          {nip19.npubEncode(focusedPubkey)}
        </div>
      ) : undefined}
      <DisplayEvents
        focusedPubkey={focusedPubkey}
        clickNPubkey={(npubkey) => {
          routeToShop(npubkey);
        }}
      />
      <div className="flex flex-row justify-between">
        <button
          type="button"
          className="bg-yellow-100 hover:bg-purple-700 text-purple-500 font-bold py-2 px-4 rounded"
          onClick={() => {
            routeToShop(decryptedNpub);
          }}
        >
          View Your Listings
        </button>
        <button
          className="bg-yellow-100 hover:bg-purple-700 text-purple-500 font-bold py-2 px-4 rounded"
          onClick={handleModalToggle}
        >
          Add New Listing
        </button>
      </div>
      <ProductForm
        handlePostListing={(values, passphrase) => {
          handlePostListing(
            values,
            passphrase,
            signIn,
            encryptedPrivateKey,
            decryptedNpub,
            relays
          );
        }}
        showModal={showModal}
        handleModalToggle={handleModalToggle}
      />
    </div>
  );
};

export default SellerView;
