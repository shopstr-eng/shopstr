"use client";

import React from "react";

import MarketplacePage from "./marketplace";

const HomeFeed = ({
  focusedPubkey,
  setFocusedPubkey,
}: {
  focusedPubkey: string;
  setFocusedPubkey: (value: string) => void;
}) => {
  return (
    <div className="flex flex-1 flex-col">
      <div className="flex h-screen flex-1">
        <MarketplacePage
          focusedPubkey={focusedPubkey}
          setFocusedPubkey={setFocusedPubkey}
        />
      </div>
    </div>
  );
};

export default HomeFeed;
