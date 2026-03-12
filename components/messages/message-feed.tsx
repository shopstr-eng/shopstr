"use client";

import { useEffect, useMemo } from "react";
import dynamic from "next/dynamic";
import { useTabs } from "@/components/hooks/use-tabs";
import { Framer } from "@/components/framer";
import { useRouter } from "next/router";

const Messages = dynamic(() => import("./messages"), {
  ssr: false,
});
const OrdersDashboard = dynamic(() => import("./orders-dashboard"), {
  ssr: false,
});

const MessageFeed = ({ isInquiry = false }) => {
  const router = useRouter();

  const tabs = useMemo(
    () => [
      {
        label: "Orders",
        children: <OrdersDashboard />,
        id: "orders",
      },
      {
        label: "Inquiries",
        children: <Messages isPayment={false} />,
        id: "inquiries",
      },
    ],
    []
  );

  const framer = useTabs({
    tabs,
    initialTabId: isInquiry ? "inquiries" : "orders",
  });

  useEffect(() => {
      const handleRouteChange = (url: string) => {
      const isInquiryTab = url.includes("isInquiry=true");
      const newTab = isInquiryTab ? "inquiries" : "orders";

      const newIndex = tabs.findIndex((tab) => tab.id === newTab);
      if (newIndex !== -1 && framer.tabProps.selectedTabIndex !== newIndex) {
        framer.tabProps.setSelectedTab([newIndex, 0]);
      }
    };

    router.events.on("routeChangeComplete", handleRouteChange);

    return () => {
      router.events.off("routeChangeComplete", handleRouteChange);
    };
  }, [router, framer, tabs]);

  return (
    <div className="flex w-full min-w-0 flex-1 flex-col">
      <div className="sticky inset-x-0 top-0 z-30 flex w-full translate-y-0 flex-col border-0 backdrop-blur-xl transition-all md:translate-y-0">
        <div className="w-full overflow-x-auto">
          <div className="flex flex-row items-center justify-center px-4">
            <Framer.Tabs {...framer.tabProps} />
          </div>
        </div>
      </div>

      <div className="flex w-full min-w-0 flex-1 flex-col overflow-x-auto bg-light-bg pt-4 dark:bg-dark-bg">
        {framer.selectedTab?.children}
      </div>
    </div>
  );
};

export default MessageFeed;
