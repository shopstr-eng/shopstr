import router from "next/router";
import React from "react";
import DisplayEvents from "../display-products";
import { getLocalStorageData } from "../utility/nostr-helper-functions";
import { Button, useDisclosure } from "@nextui-org/react";
import { SHOPSTRBUTTONCLASSNAMES } from "../utility/STATIC-VARIABLES";
import SignInModal from "../sign-in/SignInModal";

export const MyListingsPage = () => {
  let usersPubkey = getLocalStorageData().userPubkey;
  const { isOpen, onOpen, onClose } = useDisclosure();

  const handleCreateNewListing = () => {
    const loggedIn = getLocalStorageData().userPubkey;

    if (loggedIn) {
      router.push("/?addNewListing");
    } else {
      onOpen();
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
            + Add new listing
          </Button>
        </div>
        {usersPubkey ? (
          <DisplayEvents
            focusedPubkey={usersPubkey}
            selectedCategories={new Set<string>([])}
            selectedLocation={""}
            selectedSearch={""}
            canShowLoadMore={true}
            isMyListings={true}
          />
        ) : null}
      </div>
      <SignInModal isOpen={isOpen} onClose={onClose} />
    </div>
  );
};

export default MyListingsPage;
