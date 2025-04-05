import React, { ReactNode, useContext } from "react";
import {
  InformationCircleIcon,
  TagIcon,
  MapPinIcon,
} from "@heroicons/react/24/outline";
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
import { SignerContext } from "@/utils/context/nostr-context";

const cardWidth = 380;
const cardxMargin = 2.5;
export const TOTALPRODUCTCARDWIDTH = cardWidth + cardxMargin * 2 + 10;

export default function ProductCard({
  productData,
  onProductClick,
  isReview,
  footerContent,
  isLanding = false,
}: {
  productData: ProductData;
  onProductClick?: (productId: ProductData) => void;
  isReview?: boolean;
  footerContent?: ReactNode;
  isLanding?: boolean;
}) {
  const router = useRouter();
  const { pubkey: userPubkey } = useContext(SignerContext);

  if (!productData) return null;
  const { pubkey, title, images, categories, location, status } = productData;
  if (isReview)
    return (
      <Card className="mx-[2.5px] my-3 w-[100%] overflow-hidden rounded-lg border border-transparent shadow-md duration-300 transition-all hover:border-shopstr-purple/20 dark:hover:border-shopstr-yellow/20">
        <CardBody
          className="cursor-pointer"
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
              <CompactCategories categories={productData.categories} />
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
          <Divider className="my-4 opacity-50" />
          <div className="space-y-2">
            <span className="text-xl font-semibold text-light-text dark:text-dark-text">
              Summary:{" "}
            </span>
            <p className="whitespace-break-spaces break-all leading-relaxed text-light-text dark:text-dark-text">
              {productData.summary}
            </p>
          </div>
          <Divider className="my-4 opacity-50" />
          <div className="space-y-2">
            <span className="text-xl font-semibold text-light-text dark:text-dark-text">
              Cost Breakdown:{" "}
            </span>
            <DisplayCostBreakdown monetaryInfo={productData} />
          </div>
          <div className="mx-4 mt-6 flex items-center justify-center rounded-lg bg-light-fg p-3 text-center dark:bg-dark-fg">
            <InformationCircleIcon className="h-5 w-5 flex-shrink-0 text-shopstr-purple dark:text-shopstr-yellow" />
            <p className="ml-2 text-sm text-light-text dark:text-dark-text">
              Once purchased, the seller will receive a DM with your order
              details.
            </p>
          </div>
        </CardBody>
        {footerContent && (
          <>
            <Divider className="opacity-50" />
            <CardFooter className="bg-light-fg/50 dark:bg-dark-fg/50">
              {footerContent}
            </CardFooter>
          </>
        )}
      </Card>
    );

  return (
    <div className="mx-2 my-4 transform duration-300 transition-all hover:scale-[1.02]">
      <Card className="w-80 overflow-hidden rounded-lg border border-transparent bg-light-bg shadow-md duration-300 transition-all hover:border-shopstr-purple/20 hover:shadow-lg hover:shadow-shopstr-purple/30 dark:bg-dark-bg dark:hover:border-shopstr-yellow/20 dark:hover:shadow-shopstr-yellow/30">
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
          </div>
          <CardBody className="p-4">
            <div className="mb-2 h-6">
              {router.pathname !== "/" && (
                <h2 className="line-clamp-1 text-xl font-bold text-shopstr-purple dark:text-shopstr-yellow">
                  {title}
                </h2>
              )}
            </div>

            <div className="mb-3 flex items-center justify-between">
              <ProfileWithDropdown
                pubkey={productData.pubkey}
                dropDownKeys={
                  productData.pubkey === userPubkey
                    ? ["shop_settings"]
                    : ["shop", "inquiry", "copy_npub"]
                }
              />

              {router.pathname !== "/" && (
                <div className="flex items-center">
                  <Chip
                    size="sm"
                    startContent={<MapPinIcon className="h-3 w-3" />}
                    className="bg-shopstr-purple/10 text-xs text-shopstr-purple dark:bg-shopstr-yellow/10 dark:text-shopstr-yellow"
                  >
                    {location}
                  </Chip>
                </div>
              )}
            </div>

            {router.pathname !== "/" && categories && categories.length > 0 && (
              <div className="mb-3 flex flex-wrap gap-1">
                {categories.slice(0, 2).map((category, index) => (
                  <Chip
                    key={index}
                    size="sm"
                    startContent={<TagIcon className="h-3 w-3" />}
                    className="bg-light-fg text-xs dark:bg-dark-fg"
                  >
                    {category}
                  </Chip>
                ))}
                {categories.length > 2 && (
                  <Chip
                    size="sm"
                    className="bg-light-fg text-xs dark:bg-dark-fg"
                  >
                    +{categories.length - 2}
                  </Chip>
                )}
              </div>
            )}

            {router.pathname !== "/" && (
              <div className="mt-2 flex justify-end">
                <CompactPriceDisplay monetaryInfo={productData} />
              </div>
            )}
          </CardBody>
        </div>
      </Card>
    </div>
  );
}
