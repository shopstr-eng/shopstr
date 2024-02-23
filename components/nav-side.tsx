"use client";

import React, { useContext, useEffect, useState } from "react";

import useNavigation from "@/components/hooks/use-navigation";

import {
  HomeIcon,
  EnvelopeOpenIcon,
  ChartBarIcon,
  Cog6ToothIcon,
} from "@heroicons/react/24/outline";
import { countNumberOfUnreadMessagesFromChatsContext } from "@/pages/messages/utils";
import { ChatsContext } from "@/pages/context";
import { db } from "../pages/api/nostr/cache-service";

import { useLiveQuery } from "dexie-react-hooks";
import { Button, Image } from "@nextui-org/react";
import { SHOPSTRBUTTONCLASSNAMES } from "./utility/STATIC-VARIABLES";
import { useRouter } from "next/router";
import SignInModal from "./sign-in/SignInModal";
import { getLocalStorageData } from "./utility/nostr-helper-functions";

const SideNav = () => {
  const { isHomeActive, isMessagesActive, isMetricsActive, isProfileActive } =
    useNavigation();
  const router = useRouter();

  const [openSignInModal, setOpenSignInModal] = useState(false);
  let [count, setCount] = useState(0);

  const chatsContext = useContext(ChatsContext);

  const [unreadMsgCount, setUnreadMsgCount] = useState(0);

  const liveChatMessagesFromCache = useLiveQuery(
    async () => await db.table("chatMessages").toArray(),
  );

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
    const loggedIn = getLocalStorageData().npub;

    if (loggedIn) {
      router.push(path);
    } else {
      setOpenSignInModal(true);
      setCount(++count);
    }
  };

  const handleCreateNewListing = () => {
    const loggedIn = getLocalStorageData().npub;

    if (loggedIn) {
      router.push("/?addNewListing");
    } else {
      setOpenSignInModal(true);
      setCount(++count);
    }
  };

  return (
    <>
      <div className="fixed hidden h-full w-[120px] flex-col items-center border-0 bg-light-fg py-8  dark:bg-dark-fg sm:flex md:w-[250px] md:items-start">
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
          {/* <span className='h-2 w-2 rounded-full bg-sky-500 absolute top-3 right-[16px] md:right-[100px]'></span> */}
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
      </div>
      <SignInModal some={count} opened={openSignInModal}></SignInModal>
    </>
  );
};

export default SideNav;
