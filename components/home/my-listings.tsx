import router from "next/router";
import React, { useContext, useEffect } from "react";
import DisplayEvents from "../display-products";
import { getLocalStorageData } from "../utility/nostr-helper-functions";
import { Button, useDisclosure } from "@nextui-org/react";
import { SHOPSTRBUTTONCLASSNAMES } from "../utility/STATIC-VARIABLES";
import SignInModal from "../sign-in/SignInModal";
import { MyListingsContext, ProductContext } from "@/utils/context/context";
import { SimplePool, Filter } from "nostr-tools";
import parseTags from "../utility/product-parser-functions";

export const MyListingsPage = () => {
  const myListingsContext = useContext(MyListingsContext);
  const productContext = useContext(ProductContext);

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

  useEffect(() => {
    try {
      async function load() {
        myListingsContext.setIsLoading(true);
        const pool = new SimplePool();
        const filter: Filter = {
          authors: [usersPubkey],
          kinds: [30402],
        };
        const events = await pool.querySync(
          getLocalStorageData().relays,
          filter,
        );
        const myListings = events.map((event) => parseTags(event));
        myListingsContext.addNewlyCreatedProductEvents(myListings, true);
        myListingsContext.setIsLoading(false);
      }
      load();
    } catch (err) {
      console.log(err);
      myListingsContext.setIsLoading(false);
    }
  }, productContext.productEvents);
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
            context={MyListingsContext}
          />
        ) : null}
      </div>
      <SignInModal isOpen={isOpen} onClose={onClose} />
    </div>
  );
};

export default MyListingsPage;
