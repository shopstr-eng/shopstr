/* eslint-disable @next/next/no-img-element */

"use client";

import React, { useContext, useEffect, useState } from "react";
import Image from "next/image";
import { ShopMapContext } from "@/utils/context/context";
import { ShopProfile } from "../../utils/types/types";
import { sanitizeUrl } from "@braintree/sanitize-url";

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

  const [shopBannerURL, setShopBannerURL] = useState("");

  const shopMapContext = useContext(ShopMapContext);

  useEffect(() => {
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
  }, [focusedPubkey, shopMapContext]);

  return (
    <>
      {focusedPubkey && shopBannerURL && (
        <div className="relative flex h-32 w-full items-center justify-center bg-[#111] md:h-[210px]">
          <Image
            src={sanitizeUrl(shopBannerURL)}
            alt="Shop Banner"
            fill
            className="object-cover"
            priority
          />
        </div>
      )}
      <div className="relative flex flex-1 flex-col bg-[#111] selection:bg-yellow-400 selection:text-black">
        {/* Background Grid Pattern */}
        <div className="pointer-events-none absolute inset-0 z-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:24px_24px] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)]"></div>

        <div className="relative z-10 flex min-h-screen flex-1">
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
