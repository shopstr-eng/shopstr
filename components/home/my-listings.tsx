import router from "next/router";
import React, { useState } from "react";
import DisplayEvents from "../display-products";
import { getLocalStorageData } from "../utility/nostr-helper-functions";
import { Button } from "@nextui-org/react";
import { SHOPSTRBUTTONCLASSNAMES } from "../utility/STATIC-VARIABLES";
import SignInModal from "../sign-in/SignInModal";

export const MyListingsPage = () => {
  let usersNPub = getLocalStorageData().decryptedNpub;
  const [openSignInModal, setOpenSignInModal] = useState(false);
  let [count, setcount] = useState(0);

  const handleCreateNewListing = () => {
    const loggedIn = getLocalStorageData().decryptedNpub;

    if (loggedIn) {
      router.push("/?addNewListing");
    } else {
      setOpenSignInModal(true);
      setcount(++count);
    }
  };
  return (
    <div className="mx-auto h-full w-full">
      <div className="flex max-w-[100%] flex-col bg-light-bg px-3 pb-2 dark:bg-dark-bg">
        <div>
          <Button
            className={`${SHOPSTRBUTTONCLASSNAMES} w-full md:hidden`}
            onClick={() => handleCreateNewListing()}
          >
            + Create new listing
          </Button>
        </div>
        {usersNPub ? (
          <DisplayEvents
            focusedPubkey={usersNPub}
            selectedCategories={new Set<string>([])}
            selectedLocation={""}
            selectedSearch={""}
          />
        ) : null}
      </div>
      <SignInModal opened={openSignInModal} some={count}></SignInModal>
    </div>
  );
};

export default MyListingsPage;
