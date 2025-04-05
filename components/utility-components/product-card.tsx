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
import { ProductData } from "../utility/product-parser-functions";
import { ProfileWithDropdown } from "./profile/profile-dropdown";
import { useRouter } from "next/router";
import { SignerContext } from "@/utils/context/nostr-context";

const cardWidth = 380;
const cardxMargin = 2.5;
export const TOTALPRODUCTCARDWIDTH = cardWidth + cardxMargin * 2 + 10;

type ProductImage = {
  url: string;
  alt?: string;
};

const FixedImageCarousel = ({
  images,
  showThumbs = false,
}: {
  images: ProductImage[] | string[];
  showThumbs?: boolean;
}) => {
  if (!images || images.length === 0) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-gray-100 dark:bg-gray-800">
        <p className="text-gray-500 dark:text-gray-400">No image available</p>
      </div>
    );
  }

  return (
    <ImageCarousel
      images={images as ProductImage[]}
      classname="w-full h-full object-cover"
      showThumbs={showThumbs}
    />
  );
};

export default function ProductCard({
  productData,
  onProductClick,
  isReview,
  footerContent,
  isLanding = false,
}: {
  productData: ProductData;
  onProductClick?: (productId: any) => void;
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
              <CompactCategories categories={categories} />
            </div>
          </div>
          <div className="mb-5">
            {/* Fixed height container for images */}
            <div className="relative h-[250px] w-full overflow-hidden md:h-[300px]">
              <FixedImageCarousel images={images} showThumbs={false} />
            </div>

            <div className="mt-4 flex flex-row items-center justify-between">
              <Chip
                key={location}
                startContent={locationAvatar(location)}
                className="bg-shopstr-purple/10 text-shopstr-purple dark:bg-shopstr-yellow/10 dark:text-shopstr-yellow"
              >
                {location}
              </Chip>
              <CompactPriceDisplay monetaryInfo={productData} />
            </div>
          </div>
          <Divider className="my-4 opacity-50" />
          <div className="flex w-full flex-col items-center">
            <h2 className="mb-4 text-2xl font-bold text-shopstr-purple dark:text-shopstr-yellow">
              {title}
            </h2>
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
          {/* Fixed height container for images */}
          <div className="relative h-[250px] w-full overflow-hidden">
            <FixedImageCarousel images={images} showThumbs={false} />
            {!isLanding && status && (
              <div className="absolute right-3 top-3 z-10">
                {status === "active" && (
                  <span className="rounded-full bg-gradient-to-r from-green-500 to-green-600 px-3 py-1 text-xs font-semibold text-white shadow-md">
                    Active
                  </span>
                )}
                {status === "sold" && (
                  <span className="rounded-full bg-gradient-to-r from-red-500 to-red-600 px-3 py-1 text-xs font-semibold text-white shadow-md">
                    Sold
                  </span>
                )}
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
                pubkey={pubkey}
                dropDownKeys={
                  pubkey === userPubkey
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
