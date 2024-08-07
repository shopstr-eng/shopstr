import React, { ReactNode, useEffect, useState } from "react";
import Link from "next/link";
import { InformationCircleIcon } from "@heroicons/react/24/outline";
import { Card, CardBody, Divider, Chip, CardFooter } from "@nextui-org/react";
import { locationAvatar } from "./dropdowns/location-dropdown";
import CompactCategories from "./compact-categories";
import ImageCarousel from "./image-carousel";
import CompactPriceDisplay, {
  DisplayCostBreakdown,
} from "./display-monetary-info";
import { ProductData } from "../utility/product-parser-functions";
import { ProfileWithDropdown } from "./profile/profile-dropdown";

const cardWidth = 380;
const cardxMargin = 2.5;
export const TOTALPRODUCTCARDWIDTH = cardWidth + cardxMargin * 2 + 10;

export default function ProductCard({
  productData,
  onProductClick,
  isReview,
  footerContent,
  uniqueKey,
}: {
  productData: ProductData;
  onProductClick?: (productId: any) => void;
  isReview?: boolean;
  footerContent?: ReactNode;
  uniqueKey?: string;
}) {
  if (!productData) return null;
  const { id, pubkey, title, images, categories, location } = productData;
  if (isReview)
    return (
      <Card className={"mx-[2.5px] my-3 w-[100%] rounded-lg"}>
        <CardBody
          className={"cursor-pointer"}
          onClick={() => {
            onProductClick && onProductClick(productData);
          }}
        >
          <div className="z-10 flex w-full justify-between pb-3">
            <ProfileWithDropdown
              pubkey={productData.pubkey}
              dropDownKeys={["shop", "message"]}
            />
            <div className="flex flex-col justify-center">
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
          <span className="mt-4 text-xl font-semibold">Summary: </span>
          <span className="whitespace-break-spaces break-all">
            {productData.summary}
          </span>
          <Divider className="mt-4" />
          <span className="mt-4 text-xl font-semibold">Cost Breakdown: </span>
          <DisplayCostBreakdown monetaryInfo={productData} />
          <div className="mx-4 mt-2 flex items-center justify-center text-center">
            <InformationCircleIcon className="h-6 w-6 text-light-text dark:text-dark-text" />
            <p className="ml-2 text-xs text-light-text dark:text-dark-text">
              Once purchased, the seller will receive a message with a{" "}
              <Link href="https://cashu.space" passHref legacyBehavior>
                <a
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline"
                >
                  Cashu
                </a>
              </Link>{" "}
              token containing your payment.
            </p>
          </div>
        </CardBody>
        {footerContent && <CardFooter>{footerContent}</CardFooter>}
      </Card>
    );

  const cardHoverStyle =
    "hover:shadow-lg hover:shadow-shopstr-purple dark:hover:shadow-shopstr-yellow";

  return (
    <Card
      className={
        "mx-[2.5px] my-3 w-80 rounded-lg bg-light-fg dark:bg-dark-fg " +
        cardHoverStyle
      }
      key={uniqueKey}
    >
      <CardBody
        className={"cursor-pointer overflow-x-hidden"}
        onClick={() => {
          onProductClick && onProductClick(productData);
        }}
      >
        <div className="z-10 mb-2 flex w-full justify-between">
          <ProfileWithDropdown
            pubkey={productData.pubkey}
            dropDownKeys={["shop", "message"]}
          />
          <div className="flex flex-col justify-center">
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
              {location
                ? location.length > 20
                  ? location.slice(0, 20) + "..."
                  : location
                : ""}
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
