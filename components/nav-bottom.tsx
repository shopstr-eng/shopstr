"use client";

import React, { useContext, useEffect, useState } from "react";

import useNavigation from "@/components/hooks/use-navigation";

import {
  HomeIcon,
  EnvelopeOpenIcon,
  ArrowLeftOnRectangleIcon,
  ChartBarIcon,
  Cog6ToothIcon,
  WalletIcon,
} from "@heroicons/react/24/outline";
import { Button, DropdownItem, useDisclosure } from "@nextui-org/react";
import { countNumberOfUnreadMessagesFromChatsContext } from "@/utils/messages/utils";
import { ChatsContext } from "@/utils/context/context";
import { db } from "../pages/api/nostr/cache-service";

import { useLiveQuery } from "dexie-react-hooks";
import {
  LogOut,
  getLocalStorageData,
  isUserLoggedIn,
} from "./utility/nostr-helper-functions";
import { useRouter } from "next/router";
import SignInModal from "./sign-in/SignInModal";
import { ProfileWithDropdown } from "./utility-components/profile/profile-dropdown";

const BottomNav = () => {
  const {
    isHomeActive,
    isMessagesActive,
    isWalletActive,
    isMetricsActive,
    isProfileActive,
  } = useNavigation();
  const router = useRouter();

  const chatsContext = useContext(ChatsContext);

  const [unreadMsgCount, setUnreadMsgCount] = useState(0);
  const { isOpen, onOpen, onClose } = useDisclosure();
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

  return (
    <div
      className={`fixed bottom-0 z-50 w-full border-t border-zinc-200 bg-light-fg pb-2 shadow-lg shadow-lg dark:border-zinc-800 dark:bg-dark-fg sm:hidden`}
    >
      <div className="flex w-full flex-row items-center justify-evenly justify-items-stretch">
        <div>
          <Button
            className="bg-transparent py-8"
            onClick={() => router.push("/")}
          >
            <HomeIcon
              height={32}
              width={32}
              className={`cursor-pointer text-light-text hover:text-purple-700 dark:text-dark-text dark:hover:text-accent-dark-text ${
                isHomeActive
                  ? "text-shopstr-purple-light dark:text-shopstr-yellow-light"
                  : ""
              }`}
            ></HomeIcon>
          </Button>
        </div>
        <div>
          <Button
            className="bg-transparent py-8"
            onClick={() => handleRoute("/messages")}
          >
            {unreadMsgCount > 0 && (
              <div className="absolute ml-3 flex h-3 w-fit items-center justify-center rounded-full bg-shopstr-purple-light px-1 py-2 font-bold text-light-bg dark:bg-shopstr-yellow-light dark:text-dark-bg">
                {unreadMsgCount}
              </div>
            )}
            <EnvelopeOpenIcon
              height={32}
              width={32}
              className={`cursor-pointer text-light-text hover:text-purple-700 dark:text-dark-text dark:hover:text-accent-dark-text ${
                isMessagesActive
                  ? "text-shopstr-purple-light dark:text-shopstr-yellow-light"
                  : ""
              }`}
            ></EnvelopeOpenIcon>
          </Button>
        </div>
        <div>
          <Button
            className="bg-transparent py-8"
            onClick={() => handleRoute("/wallet")}
          >
            <WalletIcon
              height={32}
              width={32}
              className={`cursor-pointer text-light-text hover:text-purple-700 dark:text-dark-text dark:hover:text-accent-dark-text ${
                isWalletActive
                  ? "text-shopstr-purple-light dark:text-shopstr-yellow-light"
                  : ""
              }`}
            ></WalletIcon>
          </Button>
        </div>
        <div>
          <Button
            className="bg-transparent py-8"
            onClick={() => handleRoute("/metrics")}
          >
            <ChartBarIcon
              height={32}
              width={32}
              className={`cursor-pointer text-light-text hover:text-purple-700 dark:text-dark-text dark:hover:text-accent-dark-text ${
                isMetricsActive
                  ? "text-shopstr-purple-light dark:text-shopstr-yellow-light"
                  : ""
              }`}
            ></ChartBarIcon>
          </Button>
        </div>{" "}
        <div className="">
          {signedIn ? (
            <ProfileWithDropdown
              pubkey={getLocalStorageData().userPubkey}
              baseClassname="justify-start dark:hover:shopstr-yellow-light w-[95%] pl-4 rounded-3xl py-2  hover:scale-105 hover:bg-light-bg hover:shadow-lg dark:hover:bg-dark-bg"
              dropDownKeys={["settings", "user_profile", "logout"]}
              nameClassname="md:block"
            />
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
    </div>
  );
};

export default BottomNav;
