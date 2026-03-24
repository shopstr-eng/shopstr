/* eslint-disable @next/next/no-img-element */

"use client";

import { useContext, useEffect, useState } from "react";
import { ShopMapContext } from "@/utils/context/context";
import { ShopProfile } from "../../utils/types/types";
import { sanitizeUrl } from "@braintree/sanitize-url";
import { useRouter } from "next/router";

import MarketplacePage from "./marketplace";

const HomeFeed = ({
  focusedPubkey,
  setFocusedPubkey,
  selectedSection,
  setSelectedSection,
}: {
  focusedPubkey: string;
  setFocusedPubkey: (value: string) => void;
  selectedSection: string;
  setSelectedSection: (value: string) => void;
}) => {
  const router = useRouter();

  const [shopBannerURL, setShopBannerURL] = useState("");
  const [isFetchingShop, setIsFetchingShop] = useState(false);

  const shopMapContext = useContext(ShopMapContext);

  useEffect(() => {
    setIsFetchingShop(true);
    if (
      focusedPubkey &&
      shopMapContext.shopData.has(focusedPubkey) &&
      typeof shopMapContext.shopData.get(focusedPubkey) != "undefined"
    ) {
      const shopProfile: ShopProfile | undefined =
        shopMapContext.shopData.get(focusedPubkey);
      if (shopProfile) {
        setShopBannerURL(shopProfile.content.ui.banner);
      }
    }
    setIsFetchingShop(false);
  }, [focusedPubkey, shopMapContext, shopBannerURL, router.pathname]);

  return (
    <>
      {focusedPubkey && shopBannerURL && !isFetchingShop && (
        <div className="flex h-auto w-full items-center justify-center bg-white bg-cover bg-center">
          <img
            src={sanitizeUrl(shopBannerURL)}
            alt="Shop Banner"
            className="max-h-[210px] w-full items-center justify-center object-cover"
          />
        </div>
      )}
      <div className="flex flex-1 flex-col bg-white">
        <div className="flex min-h-screen flex-1">
          <MarketplacePage
            focusedPubkey={focusedPubkey}
            setFocusedPubkey={setFocusedPubkey}
            selectedSection={selectedSection}
            setSelectedSection={setSelectedSection}
          />
        </div>
      </div>
    </>
  );
};

export default HomeFeed;
