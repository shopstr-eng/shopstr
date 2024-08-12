"use client";

import React, { useEffect, useState } from "react";

import useScrollingEffect from "@/components/hooks/use-scroll";
import MyListingsPage from "./my-listings";
import ProductForm from "../product-form";
import { useRouter } from "next/router";
import { useSearchParams } from "next/navigation";
import { isUserLoggedIn } from "../utility/nostr-helper-functions";

const MyListingsFeed = () => {
  const scrollDirection = useScrollingEffect();
  const router = useRouter();
  const searchParams = useSearchParams();

  const headerClass =
    scrollDirection === "up" ? "translate-y-0" : "translate-y-[-100%]";
  const [showModal, setShowModal] = useState(false);

  useEffect(() => {
    if (!searchParams || !isUserLoggedIn()) return;
    setShowModal(searchParams.has("addNewListing"));
  }, [searchParams]);

  const handleProductModalToggle = () => {
    setShowModal(!showModal);
    router.push("/");
  };

  return (
    <div className="flex flex-1 flex-col">
      <div className="flex h-screen flex-1 pt-10">
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
