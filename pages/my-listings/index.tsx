import React from "react";
import MyListingsPage from "@/components/my-listings/my-listings";

export default function ShopView() {
  return (
    <div className="flex h-full min-h-screen flex-col bg-light-bg pt-24 dark:bg-dark-bg">
      <MyListingsPage />
    </div>
  );
}
