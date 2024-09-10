import dynamic from "next/dynamic";
import React from "react";

const DynamicMyListingsPage = dynamic(
  () => import("@/components/my-listings/my-listings"),
  {
    ssr: false,
  },
);

export default function ShopView() {
  return (
    <div className="flex h-full min-h-screen flex-col bg-light-bg pt-24 dark:bg-dark-bg">
      <DynamicMyListingsPage />
    </div>
  );
}
