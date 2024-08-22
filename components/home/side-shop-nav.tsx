"use client";

import React, { useContext, useEffect, useState } from "react";

import { nip19 } from "nostr-tools";

import useNavigation from "@/components/hooks/use-navigation";

import { ShopMapContext } from "@/utils/context/context";
import { Button, DropdownItem, Image, useDisclosure } from "@nextui-org/react";
import { SHOPSTRBUTTONCLASSNAMES } from "../utility/STATIC-VARIABLES";
import { useRouter } from "next/router";
import SignInModal from "../sign-in/SignInModal";
import {
  getLocalStorageData,
  isUserLoggedIn,
} from "../utility/nostr-helper-functions";
import { ShopSettings } from "../../utils/types/types";

const SideShopNav = ({ focusedPubkey }: { focusedPubkey: string }) => {
  const {
    isHomeActive,
    isMessagesActive,
    isWalletActive,
    isMetricsActive,
    isProfileActive,
  } = useNavigation();
  const router = useRouter();

  const { isOpen, onOpen, onClose } = useDisclosure();

  const shopMapContext = useContext(ShopMapContext);

  const [signedIn, setSignedIn] = useState(false);

  const [shopAbout, setShopAbout] = useState("");

  useEffect(() => {
    const getSignedInStatus = () => {
      const loggedIn = isUserLoggedIn();
      setSignedIn(loggedIn);
    };
    getSignedInStatus();
    window.addEventListener("storage", getSignedInStatus);
    return () => window.removeEventListener("storage", getSignedInStatus);
  }, []);

  useEffect(() => {
    if (
      focusedPubkey &&
      shopMapContext.shopData.has(focusedPubkey) &&
      typeof shopMapContext.shopData.get(focusedPubkey) != "undefined"
    ) {
      const shopSettings: ShopSettings | undefined =
        shopMapContext.shopData.get(focusedPubkey);
      if (shopSettings) {
        setShopAbout(shopSettings.content.about);
      }
    }
  }, [shopMapContext, focusedPubkey]);

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

  // pass categories of sellers products, make a clickable list of categories to replace "home" button (i.e; All Items (#), Electronics(#), Crafts(#), etc.)
  return (
    <>
      <div className="hidden w-[120px] flex-col items-center bg-light-bg px-6 py-8 dark:bg-dark-bg sm:flex md:w-[250px] md:items-start">
        <Button
          onClick={() => router.push("/")}
          className={`flex w-full flex-row justify-start bg-transparent py-8 text-light-text duration-200 hover:text-purple-700 dark:text-dark-text dark:hover:text-accent-dark-text ${
            isHomeActive
              ? "text-shopstr-purple-light dark:text-shopstr-yellow-light"
              : ""
          }`}
        >
          <span
            className={`hidden pt-2 text-2xl md:flex ${
              isHomeActive ? "font-bold" : ""
            }`}
          >
            Home
          </span>
        </Button>
        <Button
          onClick={() => handleSendMessage(focusedPubkey)}
          className={`${SHOPSTRBUTTONCLASSNAMES} flex flex-row items-center py-7 ${
            isMessagesActive
              ? "text-shopstr-purple-light dark:text-shopstr-yellow-light"
              : ""
          }`}
        >
          <span
            className={`hidden pt-2 text-2xl md:flex ${
              isMessagesActive ? "font-bold" : ""
            }`}
          >
            Message seller
          </span>
        </Button>
        {shopAbout && (
          <div className="flex w-full flex-col justify-start bg-transparent py-8 text-light-text dark:text-dark-text">
            <h2 className="pb-2 text-2xl font-bold">About</h2>
            <p className="text-base">{shopAbout}</p>
          </div>
        )}
      </div>
      <SignInModal isOpen={isOpen} onClose={onClose} />
    </>
  );
};

export default SideShopNav;
