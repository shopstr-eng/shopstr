/* eslint-disable @next/next/no-img-element */

import React from "react";
import Image from "next/image";
import HomeFeed from "@/components/home/home-feed";

export default function SellerView({
  focusedPubkey,
  setFocusedPubkey,
  selectedSection,
  setSelectedSection,
}: {
  focusedPubkey: string;
  setFocusedPubkey: (value: string) => void;
  selectedSection: string;
  setSelectedSection: (value: string) => void;
}) {
  return (
    <>
      {!focusedPubkey && (
        <div className="flex h-auto w-full items-center justify-center bg-[#111] bg-cover bg-center pt-20">
          <Image
            src="/shop-freely-light.png"
            alt="Shopstr Banner"
            className="hidden h-full w-full object-cover"
            width={1200}
            height={210}
          />
          <Image
            src="/shop-freely-dark.png"
            alt="Shopstr Banner"
            className="hidden max-h-[210px] w-full object-cover sm:flex"
            width={1200}
            height={210}
            priority
          />
          <Image
            src="/shop-freely-light-sm.png"
            alt="Shopstr Banner"
            className="hidden"
            width={600}
            height={210}
          />
          <Image
            src="/shop-freely-dark-sm.png"
            alt="Shopstr Banner"
            className="flex h-auto w-full object-contain pb-4 sm:hidden"
            width={600}
            height={210}
            priority
          />
        </div>
      )}
      <div
        className={`flex h-full min-h-screen flex-col bg-[#111] ${
          focusedPubkey ? "pt-20" : ""
        }`}
      >
        <HomeFeed
          focusedPubkey={focusedPubkey}
          setFocusedPubkey={setFocusedPubkey}
          selectedSection={selectedSection}
          setSelectedSection={setSelectedSection}
        />
      </div>
    </>
  );
}
