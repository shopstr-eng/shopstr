"use client";

import React, { useContext, useEffect, useState } from "react";
import { ShopMapContext } from "@/utils/context/context";
import { ShopSettings } from "../../utils/types/types";
import { sanitizeUrl } from "@braintree/sanitize-url";
import { useRouter } from "next/router";

import MarketplacePage from "./marketplace";

const HomeFeed = ({
  focusedPubkey,
  setFocusedPubkey,
}: {
  focusedPubkey: string;
  setFocusedPubkey: (value: string) => void;
}) => {
  const router = useRouter();

  const [shopBannerURL, setShopBannerURL] = useState("");
  const [isFetchingShop, setIsFetchingShop] = useState(false);

  const [isHome, setIsHome] = useState(false);

  const shopMapContext = useContext(ShopMapContext);

  useEffect(() => {
    if (!router.pathname.includes("npub")) {
      setIsHome(true);
    }
    setIsFetchingShop(true);
    if (
      focusedPubkey &&
      shopMapContext.shopData.has(focusedPubkey) &&
      typeof shopMapContext.shopData.get(focusedPubkey) != "undefined"
    ) {
      const shopSettings: ShopSettings | undefined =
        shopMapContext.shopData.get(focusedPubkey);
      if (shopSettings) {
        setShopBannerURL(shopSettings.content.ui.banner);
      }
    }
    setIsFetchingShop(false);
  }, [focusedPubkey, shopMapContext, shopBannerURL, router.pathname]);

  return (
    <>
      {focusedPubkey && shopBannerURL && !isFetchingShop && (
        <div className="flex h-auto w-full items-center justify-center bg-light-bg bg-cover bg-center dark:bg-dark-bg">
          <img
            src={sanitizeUrl(shopBannerURL)}
            alt="Shop Banner"
            className="max-h-[210px] w-full items-center justify-center object-cover"
          />
        </div>
      )}
      <div className="flex flex-1 flex-col">
        <div className="flex h-screen flex-1">
          <MarketplacePage
            focusedPubkey={focusedPubkey}
            setFocusedPubkey={setFocusedPubkey}
          />
        </div>
      </div>
    </>
  );
};

export default HomeFeed;
