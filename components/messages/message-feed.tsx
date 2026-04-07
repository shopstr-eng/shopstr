"use client";

import { useEffect, useState } from "react";
import { useTabs } from "@/components/hooks/use-tabs";
import { Framer } from "@/components/framer";
import Messages from "./messages";
import OrdersDashboard from "./orders-dashboard";
import SubscriptionManagement from "./subscription-management";
import { useRouter } from "next/router";

const MessageFeed = ({
  isInquiry = false,
  initialTab,
}: {
  isInquiry?: boolean;
  initialTab?: string;
}) => {
  const router = useRouter();
  const [showSpinner, setShowSpinner] = useState(false);

  const [hookProps] = useState({
    tabs: [
      {
        label: "Orders",
        children: <OrdersDashboard />,
        id: "orders",
      },
      {
        label: "Subscriptions",
        children: <SubscriptionManagement />,
        id: "subscriptions",
      },
      {
        label: "Inquiries",
        children: <Messages isPayment={false} />,
        id: "inquiries",
      },
    ],
    initialTabId: "orders",
  });

  const resolvedInitialTab = initialTab || (isInquiry ? "inquiries" : "orders");

  const framer = useTabs({
    tabs: hookProps.tabs,
    initialTabId: resolvedInitialTab,
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
      const urlParams = new URLSearchParams(url.split("?")[1] || "");
      const tabParam = urlParams.get("tab");
      const isInquiryTab = url.includes("isInquiry=true");

      let newTab = "orders";
      if (tabParam && hookProps.tabs.some((t) => t.id === tabParam)) {
        newTab = tabParam;
      } else if (isInquiryTab) {
        newTab = "inquiries";
      }

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
    <div className="flex w-full min-w-0 flex-1 flex-col">
      <div className="sticky inset-x-0 top-0 z-30 flex w-full translate-y-0 flex-col border-0 backdrop-blur-xl transition-all md:translate-y-0">
        <div className="w-full overflow-x-auto">
          <div className="flex flex-row items-center justify-center px-4">
            <Framer.Tabs {...framer.tabProps} />
          </div>
        </div>
      </div>

      <div className="flex w-full flex-1 flex-col bg-white pt-4">
        {showSpinner ? null : framer.selectedTab!.children}
      </div>
    </div>
  );
};

export default MessageFeed;
