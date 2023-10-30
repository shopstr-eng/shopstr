import React, { useEffect, useState } from "react";
import { Card, CardBody, Divider, Chip } from "@nextui-org/react";
import { ProfileAvatar } from "./avatar";
import { NostrEvent } from "../nostr-helpers";
import { locationAvatar } from "./location-dropdown";
import CompactCategories from "./compact-categories";
import ImageCarousel from "./image-carousel";
import CompactPriceDisplay from "./display-monetary-info";
import { ProductData, parseTags } from "./utility/productData-parser-functions";

const cardWidth = 380;
const cardxMargin = 2.5;
export const TOTALPRODUCTCARDWIDTH = cardWidth + cardxMargin * 2 + 10;

export default function ProductCard({
  productData,
  handleDelete,
  onProductClick,
}: {
  productData: ProductData;
  handleDelete: (productId: string, passphrase: string) => void;
  onProductClick: (productId: any) => void;
}) {
  if (!productData) return null;
  const {
    title,
    summary,
    publishedAt,
    images,
    categories,
    location,
    price,
    currency,
    shippingType,
    shippingCost,
    totalCost,
  } = productData;

  const cardHoverStyle = "hover:shadow-lg hover:shadow-purple-300";
  return (
    <Card
      className={
        "bg-gray-100 my-3 rounded-lg mx-[2.5px] w-[385px] " + cardHoverStyle
      }
    >
      <CardBody
        className={"cursor-pointer "}
        onClick={() => {
          onProductClick(productData);
        }}
      >
        <div className="flex justify-between z-10 w-full">
          <ProfileAvatar pubkey={productData.pubkey} className="w-4/6" />
          <div className="flex flex-col justify-center ">
            <CompactCategories categories={categories} />
          </div>
        </div>
        <div className="mb-5">
          <ImageCarousel
            images={images}
            classname="w-full h-[300px]"
            showThumbs={false}
          />
          <div className="flex flex-row justify-between mt-3">
            <Chip key={location} startContent={locationAvatar(location)}>
              {location}
            </Chip>
            <CompactPriceDisplay monetaryInfo={productData} />
          </div>
        </div>
        <Divider />
        <div className="w-full flex flex-col items-center mt-5 ">
          <h2 className="text-2xl font-bold mb-4">{title}</h2>
        </div>
      </CardBody>
    </Card>
  );
}
