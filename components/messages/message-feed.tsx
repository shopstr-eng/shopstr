"use client";

import React, { useEffect, useState } from "react";

import { useTabs } from "@/components/hooks/use-tabs";
import { Framer } from "@/components/framer";

import Inquiries from "./inquiries";
import Payments from "./payments";
import { useRouter } from "next/router";
import { isUserLoggedIn } from "../utility/nostr-helper-functions";

const MessageFeed = () => {
  const router = useRouter();

  const [hookProps] = useState({
    tabs: [
      {
        label: "Inquiries",
        children: <Inquiries />,
        id: "inquiries",
      },
      {
        label: "Payments",
        children: <Payments />,
        id: "payments",
      },
    ],
    initialTabId: "inquiries",
  });
  const framer = useTabs(hookProps);

  return (
    <div className="flex flex-1 flex-col">
      <div
        className={`sticky inset-x-0 top-0 z-30 flex w-full translate-y-0 flex-col border-0 backdrop-blur-xl transition-all md:translate-y-0`}
      >
        {/* <span className=" flex px-4 text-2xl font-bold">Home</span> */}

        <div className="flex w-full flex-row items-center justify-around">
          <Framer.Tabs {...framer.tabProps} />
        </div>
      </div>

      <div className="flex h-screen flex-1 pt-10">
        {framer.selectedTab.children}
      </div>
    </div>
  );
};

export default MessageFeed;
