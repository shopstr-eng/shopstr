"use client";

import React, { useEffect, useState } from "react";

import useScrollingEffect from "@/components/hooks/use-scroll";
import { useTabs } from "@/components/hooks/use-tabs";
import { Framer } from "@/components/framer";

import MarketplacePage from "./marketplace";
import MyListingsPage from "./my-listings";
import ProductForm from "../product-form";
import { useRouter } from "next/router";
import { useSearchParams } from "next/navigation";
import { isUserLoggedIn } from "../utility/nostr-helper-functions";

const HomeFeed = () => {
  const scrollDirection = useScrollingEffect();
  const router = useRouter();

  const searchParams = useSearchParams();

  const headerClass =
    scrollDirection === "up" ? "translate-y-0" : "translate-y-[-100%]";
  const [showModal, setShowModal] = useState(false);

  const [hookProps] = useState({
    tabs: [
      {
        label: "Marketplace",
        children: <MarketplacePage />,
        id: "marketplace",
      },
      {
        label: "My Listings",
        children: <MyListingsPage />,
        id: "my-listings",
      },
    ],
    initialTabId: "marketplace",
  });
  const framer = useTabs(hookProps);

  useEffect(() => {
    if (!searchParams || !isUserLoggedIn()) return;
    setShowModal(searchParams.has("addNewListing"));
  }, [searchParams]);

  const handleProductModalToggle = () => {
    setShowModal(!showModal);
    router.push("/");
  };

  return (
    <div className="flex flex-1 flex-col">
      <div
        className={`sticky inset-x-0 top-0 z-30 flex w-full translate-y-0 flex-col border-0 backdrop-blur-xl transition-all ${headerClass} md:translate-y-0`}
      >
        <div className="flex w-full flex-row items-center justify-around">
          <Framer.Tabs {...framer.tabProps} />
        </div>
      </div>

      <div className="flex h-screen flex-1 pt-10">
        {framer.selectedTab.children}
      </div>

      <ProductForm
        showModal={showModal}
        handleModalToggle={handleProductModalToggle}
      />
    </div>
  );
};

export default HomeFeed;
