"use client";

import React, { useContext, useEffect, useState } from "react";
import MyListingsPage from "./my-listings";
import ProductForm from "../product-form";
import { useRouter } from "next/router";
import { useSearchParams } from "next/navigation";
import { SignerContext } from "@/components/utility-components/nostr-context-provider";

const MyListingsFeed = () => {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [showModal, setShowModal] = useState(false);
  const { isLoggedIn } = useContext(SignerContext);

  useEffect(() => {
    if (!searchParams || !isLoggedIn) return;
    setShowModal(searchParams.has("addNewListing"));
  }, [searchParams, isLoggedIn]);

  const handleProductModalToggle = () => {
    setShowModal(!showModal);
    router.push("");
  };

  return (
    <div className="relative flex flex-1 flex-col bg-[#111] selection:bg-yellow-400 selection:text-black">
      {/* Background Grid Pattern */}
      <div className="pointer-events-none absolute inset-0 z-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:24px_24px] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)]"></div>

      <div className="relative z-10 flex h-screen flex-1">
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
