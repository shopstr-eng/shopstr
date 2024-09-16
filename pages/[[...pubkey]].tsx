import React from "react";
import Head from "next/head";
import HomeFeed from "@/components/home/home-feed";

export default function SellerView({
  focusedPubkey,
  setFocusedPubkey,
}: {
  focusedPubkey: string;
  setFocusedPubkey: (value: string) => void;
}) {
  return (
    <>
      <Head>
        <title>Shopstr</title>
        <meta
          name="description"
          content="Buy and sell anything, anywhere, anytime."
        />

        <meta property="og:url" content="https://shopstr.store" />
        <meta property="og:type" content="website" />
        <meta property="og:title" content="Shopstr" />
        <meta
          property="og:description"
          content="Buy and sell anything, anywhere, anytime."
        />
        <meta property="og:image" content="/shopstr-2000x2000.png" />

        <meta name="twitter:card" content="summary_large_image" />
        <meta property="twitter:domain" content="shopstr.store" />
        <meta property="twitter:url" content="https://shopstr.store" />
        <meta name="twitter:title" content="Shopstr" />
        <meta
          name="twitter:description"
          content="Buy and sell anything, anywhere, anytime."
        />
        <meta name="twitter:image" content="/shopstr-2000x2000.png" />
      </Head>
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
        />
      </div>
    </>
  );
}
