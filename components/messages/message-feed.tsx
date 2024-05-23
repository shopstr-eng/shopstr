"use client";

import React, { useEffect, useState } from "react";

import { useTabs } from "@/components/hooks/use-tabs";
import { Framer } from "@/components/framer";

import Messages from "./messages";

const MessageFeed = () => {
  const [showSpinner, setShowSpinner] = useState(false);

  const [hookProps] = useState({
    tabs: [
      {
        label: "Inquiries",
        children: <Messages isPayment={false} />,
        id: "inquiries",
      },
      {
        label: "Payments",
        children: <Messages isPayment={true} />,
        id: "payments",
      },
    ],
    initialTabId: "inquiries",
  });
  const framer = useTabs(hookProps);

  useEffect(() => {
    setShowSpinner(true);
    const timeout = setTimeout(() => {
      setShowSpinner(false);
    }, 1);
    return () => clearTimeout(timeout);
  }, [framer.selectedTab]);

  return (
    <div className="flex flex-1 flex-col">
      <div className="sticky inset-x-0 top-0 z-30 flex w-full translate-y-0 flex-col border-0 backdrop-blur-xl transition-all md:translate-y-0">
        <div className="flex w-full flex-row items-center justify-around">
          <Framer.Tabs {...framer.tabProps} />
        </div>
      </div>

      <div className="flex h-[90vh] w-full flex-col bg-light-bg pt-4 dark:bg-dark-bg">
        {showSpinner ? null : framer.selectedTab.children}
      </div>
    </div>
  );
};

export default MessageFeed;
