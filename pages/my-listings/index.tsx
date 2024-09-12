import React from "react";
import MyListingsFeed from "@/components/my-listings/my-listings-feed";

export default function ShopView() {
  return (
    <div className="flex h-full min-h-screen flex-col bg-light-bg pt-24 dark:bg-dark-bg">
      <MyListingsFeed />
    </div>
  );
}
