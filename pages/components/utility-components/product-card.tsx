import React, { ReactNode, useEffect, useState } from "react";
import { Card, CardBody, Divider, Chip, CardFooter } from "@nextui-org/react";
import { ProfileAvatar } from "./avatar";
import { locationAvatar } from "./dropdowns/location-dropdown";
import CompactCategories from "./compact-categories";
import ImageCarousel from "./image-carousel";
import CompactPriceDisplay from "./display-monetary-info";
import { ProductData } from "../utility/product-parser-functions";

const cardWidth = 380;
const cardxMargin = 2.5;
export const TOTALPRODUCTCARDWIDTH = cardWidth + cardxMargin * 2 + 10;

export default function ProductCard({
  productData,
  handleDelete,
  onProductClick,
  isCheckout,
  footerContent,
  uniqueKey,
}: {
  productData: ProductData;
  handleDelete?: (productId: string, passphrase: string) => void;
  onProductClick?: (productId: any) => void;
  isCheckout?: boolean;
  footerContent?: ReactNode;
  uniqueKey?: string;
}) {
  if (!productData) return null;
  const { id, pubkey, title, images, categories, location } = productData;
  if (isCheckout)
    return (
      <Card className={"mx-[2.5px] my-3 w-[100%] rounded-lg"}>
        <CardBody
          className={"cursor-pointer "}
          onClick={() => {
            onProductClick && onProductClick(productData);
          }}
        >
          <div className="z-10 flex w-full justify-between">
            <ProfileAvatar pubkey={pubkey} className="w-4/6" />
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
            <div className="mt-3 flex flex-row justify-between">
              <Chip key={location} startContent={locationAvatar(location)}>
                {location}
              </Chip>
              <CompactPriceDisplay monetaryInfo={productData} />
            </div>
          </div>
          <Divider />
          <div className="mt-5 flex w-full flex-col items-center ">
            <h2 className="mb-4 text-2xl font-bold">{title}</h2>
          </div>
          <Divider />
          <span className="text-xl font-semibold">Summary: </span>
          {productData.summary}
        </CardBody>
        {footerContent && <CardFooter>{footerContent}</CardFooter>}
      </Card>
    );

  const cardHoverStyle =
    "hover:shadow-lg hover:shadow-shopstr-purple dark:hover:shadow-shopstr-yellow";

  return (
    <Card
      className={
        "mx-[2.5px] my-3 w-[385px] rounded-lg bg-light-fg dark:bg-dark-fg " +
        cardHoverStyle
      }
      key={uniqueKey}
    >
      <CardBody
        className={"cursor-pointer "}
        onClick={() => {
          onProductClick && onProductClick(productData);
        }}
      >
        <div className="z-10 flex w-full justify-between">
          <ProfileAvatar pubkey={pubkey} className="w-4/6" />
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
          <div className="mt-3 flex flex-row justify-between">
            <Chip key={location} startContent={locationAvatar(location)}>
              {location}
            </Chip>
            <CompactPriceDisplay monetaryInfo={productData} />
          </div>
        </div>
        <Divider />
        <div className="mt-5 flex w-full flex-col items-center ">
          <h2 className="mb-4 text-2xl font-bold">{title}</h2>
        </div>
      </CardBody>
      {footerContent && <CardFooter>{footerContent}</CardFooter>}
    </Card>
  );
}
