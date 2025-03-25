/* eslint-disable @next/next/no-img-element */

import React from "react";
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
        <div className="flex h-auto w-full items-center justify-center bg-white bg-cover bg-center pt-20 dark:bg-black">
          <img
            src="/shop-freely-light.png"
            alt="Shopstr Banner"
            className="hidden max-h-[210px] w-full items-center justify-center object-cover dark:hidden sm:flex"
          />
          <img
            src="/shop-freely-dark.png"
            alt="Shopstr Banner"
            className="hidden max-h-[210px] w-full items-center justify-center object-cover sm:hidden dark:sm:flex"
          />
          <img
            src="/shop-freely-light-sm.png"
            alt="Shopstr Banner"
            className="flex max-h-[210px] w-full items-center justify-center object-cover pb-4 dark:hidden sm:hidden"
          />
          <img
            src="/shop-freely-dark-sm.png"
            alt="Shopstr Banner"
            className="hidden max-h-[210px] w-full items-center justify-center object-cover pb-4 dark:flex dark:sm:hidden"
          />
        </div>
      )}
      <div
        className={`flex h-full min-h-screen flex-col bg-light-bg dark:bg-dark-bg ${
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
