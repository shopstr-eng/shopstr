"use client";

import React, { useContext, useEffect, useState } from "react";
import MyListingsPage from "./my-listings";
import ProductForm from "../product-form";
import ZapsnagForm from "../ZapsnagForm";
import { useRouter } from "next/router";
import { useSearchParams } from "next/navigation";
import { SignerContext } from "@/components/utility-components/nostr-context-provider";

const MyListingsFeed = () => {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [showModal, setShowModal] = useState(false);
  const [showZapsnagModal, setShowZapsnagModal] = useState(false);
  const { isLoggedIn } = useContext(SignerContext);

  useEffect(() => {
    if (!searchParams || !isLoggedIn) return;
    setShowModal(searchParams.has("addNewListing"));
    setShowZapsnagModal(searchParams.has("addFlashSale"));
  }, [searchParams, isLoggedIn]);

  const handleProductModalToggle = () => {
    setShowModal(!showModal);
    router.push("");
  };

  const handleZapsnagModalToggle = () => {
    setShowZapsnagModal(!showZapsnagModal);
    router.push("");
  };

  return (
    <div className="flex flex-1 flex-col">
      <div className="flex h-screen flex-1">
        <MyListingsPage />
      </div>

      <ProductForm
        showModal={showModal}
        handleModalToggle={handleProductModalToggle}
      />

      <ZapsnagForm
        isOpen={showZapsnagModal}
        onClose={handleZapsnagModalToggle}
      />
    </div>
  );
};

export default MyListingsFeed;
