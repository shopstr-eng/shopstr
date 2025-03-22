import React, { ReactNode, useContext } from "react";
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
import { useRouter } from "next/router";
import { SignerContext } from "@/utils/context/nostr-context";

const cardWidth = 380;
const cardxMargin = 2.5;
export const TOTALPRODUCTCARDWIDTH = cardWidth + cardxMargin * 2 + 10;

export default function ProductCard({
  productData,
  onProductClick,
  isReview,
  footerContent,
}: {
  productData: ProductData;
  onProductClick?: (productId: any) => void;
  isReview?: boolean;
  footerContent?: ReactNode;
}) {
  const router = useRouter();
  const { pubkey: userPubkey } = useContext(SignerContext);
  if (!productData) return null;
  const { pubkey, title, images, categories, location, status } = productData;
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
              dropDownKeys={
                productData.pubkey === userPubkey
                  ? ["shop_settings"]
                  : ["shop", "inquiry", "copy_npub"]
              }
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
              Once purchased, the seller will receive a DM with your order
              details.
            </p>
          </div>
        </CardBody>
        {footerContent && <CardFooter>{footerContent}</CardFooter>}
      </Card>
    );

  const cardHoverStyle =
    "hover:shadow-lg hover:shadow-shopstr-purple dark:hover:shadow-shopstr-yellow";

  return (
    <div
      className={`${cardHoverStyle} mx-2 my-4 rounded-lg duration-300 transition-shadow`}
    >
      <div className="w-80 overflow-hidden rounded-lg">
        <div
          className="cursor-pointer"
          onClick={() => {
            onProductClick && onProductClick(productData);
          }}
        >
          <div className="mb-2">
            <ImageCarousel
              images={images}
              classname="w-full h-[300px]"
              showThumbs={false}
            />
          </div>
          <div className="justify-left flex flex-col p-4">
            {router.pathname !== "/" && (
              <div className="flex items-center justify-between">
                <h2 className="text-2xl font-bold text-light-text dark:text-dark-text">
                  {title}
                </h2>
                <div>
                  {status === "active" && (
                    <span className="mr-2 rounded-full bg-green-500 px-2 py-1 text-xs font-semibold text-white">
                      Active
                    </span>
                  )}
                  {status === "sold" && (
                    <span className="mr-2 rounded-full bg-red-500 px-2 py-1 text-xs font-semibold text-white">
                      Sold
                    </span>
                  )}
                </div>
              </div>
            )}

            <div className="z-10 mb-2 flex w-full justify-between">
              <ProfileWithDropdown
                pubkey={pubkey}
                dropDownKeys={
                  pubkey === userPubkey
                    ? ["shop_settings"]
                    : ["shop", "inquiry", "copy_npub"]
                }
              />
            </div>
            {router.pathname !== "/" && (
              <div className="justify-left flex">
                <CompactPriceDisplay monetaryInfo={productData} />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
