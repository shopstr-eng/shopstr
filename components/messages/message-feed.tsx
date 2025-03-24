"use client";

import React, { useEffect, useState } from "react";
import { useTabs } from "@/components/hooks/use-tabs";
import { Framer } from "@/components/framer";
import Messages from "./messages";
import { useRouter } from "next/router";

const MessageFeed = ({ isInquiry = false }) => {
  const router = useRouter();
  const [showSpinner, setShowSpinner] = useState(false);

  const [hookProps] = useState({
    tabs: [
      {
        label: "Orders",
        children: <Messages isPayment={true} />,
        id: "orders",
      },
      {
        label: "Inquiries",
        children: <Messages isPayment={false} />,
        id: "inquiries",
      },
    ],
    initialTabId: "orders",
  });

  const framer = useTabs({
    tabs: hookProps.tabs,
    initialTabId: isInquiry ? "inquiries" : "orders",
  });

  useEffect(() => {
    setShowSpinner(true);
    const timeout = setTimeout(() => {
      setShowSpinner(false);
    }, 1);
    return () => clearTimeout(timeout);
  }, [framer.selectedTab]);

  useEffect(() => {
    const handleRouteChange = (url: string) => {
      const isInquiryTab = url.includes("isInquiry=true");
      const newTab = isInquiryTab ? "inquiries" : "orders";

      const newIndex = hookProps.tabs.findIndex((tab) => tab.id === newTab);
      if (newIndex !== -1 && framer.tabProps.selectedTabIndex !== newIndex) {
        framer.tabProps.setSelectedTab([newIndex, 0]);
      }
    };

    router.events.on("routeChangeComplete", handleRouteChange);

    return () => {
      router.events.off("routeChangeComplete", handleRouteChange);
    };
  }, [router, framer]);

  return (
    <div className="flex flex-1 flex-col">
      <div className="sticky inset-x-0 top-0 z-30 flex w-full translate-y-0 flex-col border-0 backdrop-blur-xl transition-all md:translate-y-0">
        <div className="flex w-full flex-row items-center justify-around">
          <Framer.Tabs {...framer.tabProps} />
        </div>
      </div>

      <div className="flex h-[90vh] w-full flex-col bg-light-bg pt-4 dark:bg-dark-bg">
        {showSpinner ? null : framer.selectedTab!.children}
      </div>
    </div>
  );
};

export default MessageFeed;
