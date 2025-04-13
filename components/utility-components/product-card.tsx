import React, { ReactNode, useContext } from "react";
import { InformationCircleIcon } from "@heroicons/react/24/outline";
import { Card, CardBody, Divider, Chip, CardFooter } from "@nextui-org/react";
import { locationAvatar } from "./dropdowns/location-dropdown";
import CompactCategories from "./compact-categories";
import ImageCarousel from "./image-carousel";
import CompactPriceDisplay, {
  DisplayCostBreakdown,
} from "./display-monetary-info";
import { ProductData } from "@/utils/parsers/product-parser-functions";
import { ProfileWithDropdown } from "./profile/profile-dropdown";
import { useRouter } from "next/router";
import { SignerContext } from "@/components/utility-components/nostr-context-provider";

export default function ProductCard({
  productData,
  onProductClick,
  isReview,
  footerContent,
}: {
  productData: ProductData;
  onProductClick?: (productId: ProductData) => void;
  isReview?: boolean;
  footerContent?: ReactNode;
}) {
  const router = useRouter();
  const { pubkey: userPubkey } = useContext(SignerContext);
  if (!productData) return null;

  const cardHoverStyle =
    "hover:shadow-xl dark:hover:shadow-yellow-500/30 hover:scale-[1.01]";

  if (isReview)
    return (
      <Card className="mx-2 my-3 w-full rounded-2xl bg-white shadow-lg dark:bg-neutral-900">
        <CardBody
          className="cursor-pointer p-6"
          onClick={() => {
            onProductClick && onProductClick(productData);
          }}
        >
          <div className="flex w-full justify-between pb-4">
            <ProfileWithDropdown
              pubkey={productData.pubkey}
              dropDownKeys={
                productData.pubkey === userPubkey
                  ? ["shop_settings"]
                  : ["shop", "inquiry", "copy_npub"]
              }
            />
            <CompactCategories categories={productData.categories} />
          </div>
          <div className="mb-4">
            <ImageCarousel
              images={productData.images}
              classname="w-full h-[300px] rounded-xl"
              showThumbs={false}
            />
            <div className="mt-4 flex items-center justify-between">
              <Chip
                key={productData.location}
                startContent={locationAvatar(productData.location)}
                className="text-sm"
              >
                {productData.location}
              </Chip>
              <CompactPriceDisplay monetaryInfo={productData} />
            </div>
          </div>
          <Divider />
          <div className="mt-5 text-center">
            <h2 className="mb-4 text-2xl font-bold">{productData.title}</h2>
          </div>
          <Divider />
          <div className="mt-4">
            <span className="text-xl font-semibold">Summary:</span>
            <p className="mt-2 whitespace-break-spaces break-words text-base">
              {productData.summary}
            </p>
          </div>
          <Divider className="mt-4" />
          <div className="mt-4">
            <span className="text-xl font-semibold">Cost Breakdown:</span>
            <DisplayCostBreakdown monetaryInfo={productData} />
          </div>
          <div className="mx-4 mt-4 flex items-center text-sm text-neutral-500 dark:text-neutral-300">
            <InformationCircleIcon className="mr-2 h-5 w-5" />
            <p>
              Once purchased, the seller will receive a DM with your order
              details.
            </p>
          </div>
        </CardBody>
        {footerContent && <CardFooter>{footerContent}</CardFooter>}
      </Card>
    );

  return (
    <div
      className={`${cardHoverStyle} mx-2 my-4 rounded-2xl bg-white shadow-md duration-300 transition-all dark:bg-neutral-900`}
    >
      <div className="w-80 overflow-hidden rounded-2xl">
        <div
          className="cursor-pointer"
          onClick={() => {
            onProductClick && onProductClick(productData);
          }}
        >
          <div>
            <ImageCarousel
              images={productData.images}
              classname="w-full h-[300px] rounded-t-2xl"
              showThumbs={false}
            />
          </div>
          <div className="flex flex-col p-4">
            {router.pathname !== "/" && (
              <div className="mb-2 flex items-center justify-between">
                <h2 className="max-w-[70%] truncate text-xl font-semibold text-light-text dark:text-dark-text">
                  {productData.title}
                </h2>
                {productData.status === "active" && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700 dark:bg-green-900 dark:text-green-300">
                    🟢 Active
                  </span>
                )}
                {productData.status === "sold" && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700 dark:bg-red-900 dark:text-red-300">
                    🔴 Sold
                  </span>
                )}
              </div>
            )}
            <div className="mb-3">
              <ProfileWithDropdown
                pubkey={productData.pubkey}
                dropDownKeys={
                  productData.pubkey === userPubkey
                    ? ["shop_settings"]
                    : ["shop", "inquiry", "copy_npub"]
                }
              />
            </div>
            {router.pathname !== "/" && (
              <div className="mt-1 flex items-center justify-between">
                <Chip
                  key={productData.location}
                  startContent={locationAvatar(productData.location)}
                  className="text-xs"
                >
                  {productData.location}
                </Chip>
                <CompactPriceDisplay monetaryInfo={productData} />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
