"use client";

import React, { useContext, useEffect, useState } from "react";

import useNavigation from "@/components/hooks/use-navigation";

import {
  HomeIcon,
  EnvelopeOpenIcon,
  ChartBarIcon,
  Cog6ToothIcon,
  WalletIcon,
  ArrowLeftOnRectangleIcon,
  ArrowRightOnRectangleIcon,
} from "@heroicons/react/24/outline";
import { countNumberOfUnreadMessagesFromChatsContext } from "@/utils/messages/utils";
import { ChatsContext } from "@/utils/context/context";
import { db } from "../pages/api/nostr/cache-service";
import { useLiveQuery } from "dexie-react-hooks";
import { Button, DropdownItem, Image, useDisclosure } from "@nextui-org/react";
import { SHOPSTRBUTTONCLASSNAMES } from "./utility/STATIC-VARIABLES";
import { useRouter } from "next/router";
import SignInModal from "./sign-in/SignInModal";
import {
  getLocalStorageData,
  isUserLoggedIn,
} from "./utility/nostr-helper-functions";
import { ProfileWithDropdown } from "./utility-components/profile/profile-dropdown";

const SideNav = () => {
  const {
    isHomeActive,
    isMessagesActive,
    isWalletActive,
    isMetricsActive,
    isProfileActive,
  } = useNavigation();
  const router = useRouter();

  const { isOpen, onOpen, onClose } = useDisclosure();

  const chatsContext = useContext(ChatsContext);

  const [unreadMsgCount, setUnreadMsgCount] = useState(0);
  const [signedIn, setSignedIn] = useState(false);

  const liveChatMessagesFromCache = useLiveQuery(
    async () => await db.table("chatMessages").toArray(),
  );

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
    const getUnreadMessages = async () => {
      let unreadMsgCount = await countNumberOfUnreadMessagesFromChatsContext(
        chatsContext.chatsMap,
      );
      setUnreadMsgCount(unreadMsgCount);
    };
    getUnreadMessages();
  }, [chatsContext, liveChatMessagesFromCache]);

  const handleRoute = (path: string) => {
    if (signedIn) {
      router.push(path);
    } else {
      onOpen();
    }
  };

  const handleCreateNewListing = () => {
    if (signedIn) {
      router.push("/?addNewListing");
    } else {
      onOpen();
    }
  };

  return (
    <>
      <div className="fixed z-50 hidden h-full w-[120px] flex-col items-center border-0 bg-light-fg py-8  dark:bg-dark-fg sm:flex md:w-[250px] md:items-start">
        <Button
          onClick={() => router.push("/")}
          className={`mb-5 flex w-full flex-row justify-start bg-transparent py-8 text-light-text duration-200 hover:text-purple-700 dark:text-dark-text dark:hover:text-accent-dark-text`}
        >
          <Image
            alt="Shopstr logo"
            height={50}
            radius="sm"
            src="/shopstr-2000x2000.png"
            width={50}
          />
          <span
            className={`hidden pt-2 text-2xl md:flex ${
              isHomeActive ? "font-bold" : ""
            }`}
          >
            Shopstr
          </span>
        </Button>
        <Button
          onClick={() => router.push("/")}
          className={`flex w-full flex-row justify-start bg-transparent py-8 text-light-text duration-200 hover:text-purple-700 dark:text-dark-text dark:hover:text-accent-dark-text ${
            isHomeActive
              ? "text-shopstr-purple-light dark:text-shopstr-yellow-light"
              : ""
          }`}
        >
          <HomeIcon height={32} width={32}></HomeIcon>
          <span
            className={`hidden pt-2 text-2xl md:flex ${
              isHomeActive ? "font-bold" : ""
            }`}
          >
            Home
          </span>
        </Button>
        <Button
          onClick={() => handleRoute("/messages")}
          className={`flex w-full flex-row justify-start bg-transparent py-8 text-light-text duration-200 hover:text-purple-700 dark:text-dark-text dark:hover:text-accent-dark-text ${
            isMessagesActive
              ? "text-shopstr-purple-light dark:text-shopstr-yellow-light"
              : ""
          }`}
        >
          {unreadMsgCount > 0 && (
            <div className="absolute ml-3 flex h-3 w-fit items-center justify-center rounded-full bg-shopstr-purple-light px-1 py-2 font-bold text-light-bg dark:bg-shopstr-yellow-light dark:text-dark-bg">
              {unreadMsgCount}
            </div>
          )}
          <EnvelopeOpenIcon height={32} width={32} />
          <span
            className={`hidden pt-2 text-2xl md:flex ${
              isMessagesActive ? "font-bold" : ""
            }`}
          >
            Messages
          </span>
        </Button>
        <Button
          onClick={() => handleRoute("/wallet")}
          className={`flex w-full  flex-row justify-start bg-transparent py-8 text-light-text duration-200 hover:text-purple-700 dark:text-dark-text dark:hover:text-accent-dark-text ${
            isWalletActive
              ? "text-shopstr-purple-light dark:text-shopstr-yellow-light"
              : ""
          }`}
        >
          <WalletIcon height={32} width={32}></WalletIcon>
          <span
            className={`hidden text-2xl md:flex ${
              isWalletActive ? "font-bold" : ""
            }`}
          >
            Wallet
          </span>
        </Button>
        <Button
          onClick={() => handleRoute("/metrics")}
          className={`flex w-full flex-row justify-start bg-transparent py-8 text-light-text duration-200 hover:text-purple-700 dark:text-dark-text dark:hover:text-accent-dark-text ${
            isMetricsActive
              ? "text-shopstr-purple-light dark:text-shopstr-yellow-light"
              : ""
          }`}
        >
          <ChartBarIcon height={32} width={32}></ChartBarIcon>
          <span
            className={`hidden pt-2 text-2xl md:flex ${
              isMetricsActive ? "font-bold" : ""
            }`}
          >
            Metrics
          </span>
        </Button>
        <Button
          onClick={() => handleRoute("/settings")}
          className={`flex w-full  flex-row justify-start bg-transparent py-8 text-light-text duration-200 hover:text-purple-700 dark:text-dark-text dark:hover:text-accent-dark-text ${
            isProfileActive
              ? "text-shopstr-purple-light dark:text-shopstr-yellow-light"
              : ""
          }`}
        >
          <Cog6ToothIcon height={32} width={32}></Cog6ToothIcon>
          <span
            className={`hidden text-2xl md:flex ${
              isProfileActive ? "font-bold" : ""
            }`}
          >
            Settings
          </span>
        </Button>

        <div className="hidden w-full md:flex">
          <Button
            className={`${SHOPSTRBUTTONCLASSNAMES} m-5 w-full`}
            onClick={() => handleCreateNewListing()}
          >
            + Add new listing
          </Button>
        </div>
        <div className="bottom-0 mt-auto w-full">
          {signedIn ? (
            <div className="flex w-full justify-center">
              <ProfileWithDropdown
                pubkey={getLocalStorageData().userPubkey}
                baseClassname="justify-start dark:hover:shopstr-yellow-light w-[95%] pl-4 rounded-3xl py-2  hover:scale-105 hover:bg-light-bg hover:shadow-lg dark:hover:bg-dark-bg"
                dropDownKeys={["user_profile", "logout"]}
                nameClassname="md:block"
              />
            </div>
          ) : (
            <Button
              onClick={() => {
                onOpen();
              }}
              className={`flex w-full  flex-row justify-start bg-transparent py-8 text-light-text duration-200 hover:text-purple-700 dark:text-dark-text dark:hover:text-accent-dark-text ${
                isProfileActive
                  ? "text-shopstr-purple-light dark:text-shopstr-yellow-light"
                  : ""
              }`}
            >
              <ArrowLeftOnRectangleIcon height={32} width={32} />
              <span
                className={`hidden text-2xl md:flex ${
                  isProfileActive ? "font-bold" : ""
                }`}
              >
                Sign In
              </span>
            </Button>
          )}
        </div>
      </div>
      <SignInModal isOpen={isOpen} onClose={onClose} />
    </>
  );
};

export default SideNav;
