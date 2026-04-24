"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { useTabs } from "@/components/hooks/use-tabs";
import { Framer } from "@/components/framer";
import ShopProfileForm from "@/components/settings/shop-profile-form";
import StallFeed from "@/components/stall/stall-feed";
import StripeConnectBanner from "@/components/stripe-connect/StripeConnectBanner";
import ProtectedRoute from "@/components/utility-components/protected-route";

const TAB_IDS = ["storefront", "products"] as const;
type MarketTabId = (typeof TAB_IDS)[number];

const StallManagementPage = () => {
  const router = useRouter();
  const { tab } = router.query;

  const initialTab: MarketTabId =
    typeof tab === "string" && (TAB_IDS as readonly string[]).includes(tab)
      ? (tab as MarketTabId)
      : "products";

  const [hookProps] = useState({
    tabs: [
      {
        label: "Stall",
        id: "storefront",
        children: (
          <div className="mx-auto h-full w-full min-w-0 px-4 lg:w-1/2 xl:w-[90%] xl:max-w-[1600px]">
            <ShopProfileForm />
          </div>
        ),
      },
      {
        label: "Products & Discounts",
        id: "products",
        children: (
          <div className="flex h-full min-h-screen flex-col bg-white">
            <StallFeed />
          </div>
        ),
      },
    ],
    initialTabId: initialTab,
  });

  const framer = useTabs({
    tabs: hookProps.tabs,
    initialTabId: hookProps.initialTabId,
  });

  const [showSpinner, setShowSpinner] = useState(false);

  useEffect(() => {
    setShowSpinner(true);
    const timeout = setTimeout(() => setShowSpinner(false), 1);
    return () => clearTimeout(timeout);
  }, [framer.selectedTab]);

  useEffect(() => {
    const handleRouteChange = (url: string) => {
      const urlParams = new URLSearchParams(url.split("?")[1] || "");
      const tabParam = urlParams.get("tab");
      const newTab: MarketTabId =
        tabParam && (TAB_IDS as readonly string[]).includes(tabParam)
          ? (tabParam as MarketTabId)
          : "products";

      const newIndex = hookProps.tabs.findIndex((t) => t.id === newTab);
      if (newIndex !== -1 && framer.tabProps.selectedTabIndex !== newIndex) {
        framer.tabProps.setSelectedTab([newIndex, 0]);
      }
    };

    router.events.on("routeChangeComplete", handleRouteChange);
    return () => {
      router.events.off("routeChangeComplete", handleRouteChange);
    };
  }, [router, framer, hookProps.tabs]);

  return (
    <ProtectedRoute>
      <div className="flex min-h-screen w-full flex-col overflow-x-hidden bg-white pt-24 pb-24 md:pb-32">
        <div className="px-4">
          <StripeConnectBanner
            returnPath="/settings/stall?stripe=success"
            refreshPath="/settings/stall?stripe=refresh"
          />
        </div>
        <div className="mx-auto w-full px-4 pb-2">
          <h1 className="text-3xl font-bold text-black">Market Stall</h1>
        </div>
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
    </ProtectedRoute>
  );
};

export default StallManagementPage;
