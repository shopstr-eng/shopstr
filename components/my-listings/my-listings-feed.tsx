"use client";

import React, { useEffect, useState } from "react";
import MyListingsPage from "./my-listings";
import ProductForm from "../product-form";
import { useRouter } from "next/router";
import { useSearchParams } from "next/navigation";
import { useSignerContext } from "../nostr-context";

const MyListingsFeed = () => {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [showModal, setShowModal] = useState(false);
  const { isLoggedIn } = useSignerContext();

  useEffect(() => {
    if (!searchParams || !isLoggedIn) return;
    setShowModal(searchParams.has("addNewListing"));
  }, [searchParams, isLoggedIn]);

  const handleProductModalToggle = () => {
    setShowModal(!showModal);
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
    </div>
  );
};

export default MyListingsFeed;
