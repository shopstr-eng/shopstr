import React from "react";
import HomeFeed from "@/components/home/home-feed";

export default function SellerView() {
  return (
    <div className="flex min-h-screen w-full flex-col bg-light-bg pb-20 pt-4 dark:bg-dark-bg sm:ml-[120px] sm:border-r sm:border-zinc-700 md:ml-[250px]">
      <HomeFeed />
    </div>
  );
}
