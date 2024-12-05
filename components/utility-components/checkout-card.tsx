import React, { useContext, useEffect, useRef, useState } from "react";
import { nip19 } from "nostr-tools";
import { ProductData } from "../utility/product-parser-functions";
import { ProfileWithDropdown } from "./profile/profile-dropdown";
import { getLocalStorageData } from "../utility/nostr-helper-functions";
import {
  DisplayCostBreakdown,
  DisplayCheckoutCost,
} from "./display-monetary-info";
import ProductInvoiceCard from "../product-invoice-card";
import { useRouter } from "next/router";
import { SHOPSTRBUTTONCLASSNAMES } from "../../components/utility/STATIC-VARIABLES";
import { Button, Chip } from "@nextui-org/react";
import { locationAvatar } from "./dropdowns/location-dropdown";
import {
  FaceFrownIcon,
  FaceSmileIcon,
  InformationCircleIcon,
} from "@heroicons/react/24/outline";
import Link from "next/link";
import { ShopMapContext, ReviewsContext } from "@/utils/context/context";
import { ShopSettings } from "../../utils/types/types";
import { sanitizeUrl } from "@braintree/sanitize-url";
import FailureModal from "../utility-components/failure-modal";
import SuccessModal from "../utility-components/success-modal";
import currencySelection from "../../public/currencySelection.json";

export const TOTALPRODUCTCARDWIDTH = 380 + 5;
const SUMMARY_CHARACTER_LIMIT = 100;

export default function CheckoutCard({
  productData,
  setInvoiceIsPaid,
  setInvoiceGenerationFailed,
  setCashuPaymentSent,
  setCashuPaymentFailed,
  uniqueKey,
}: {
  productData: ProductData;
  setInvoiceIsPaid?: (invoiceIsPaid: boolean) => void;
  setInvoiceGenerationFailed?: (invoiceGenerationFailed: boolean) => void;
  setCashuPaymentSent?: (cashuPaymentSent: boolean) => void;
  setCashuPaymentFailed?: (cashuPaymentFailed: boolean) => void;
  uniqueKey?: string;
}) {
  const {
    title,
    images,
    pubkey,
    summary,
    location,
    sizes,
    sizeQuantities,
    condition,
    d: dTag,
  } = productData;

  const { userPubkey } = getLocalStorageData();

  const router = useRouter();

  const [isExpanded, setIsExpanded] = useState(false);
  const [isBeingPaid, setIsBeingPaid] = useState(false);
  const [visibleImages, setVisibleImages] = useState<string[]>([]);
  const [showAllImages, setShowAllImages] = useState(false);
  const [selectedImage, setSelectedImage] = useState(images[0]);
  const [selectedSize, setSelectedSize] = useState<string | undefined>(
    undefined,
  );
  const [hasSizes, setHasSizes] = useState(false);
  const [isAdded, setIsAdded] = useState(false);

  const [shopBannerURL, setShopBannerURL] = useState("");
  const [isFetchingShop, setIsFetchingShop] = useState(false);

  const [merchantReview, setMerchantReview] = useState(0);
  const [productReviews, setProductReviews] =
    useState<Map<string, string[][]>>();
  const [isFetchingReviews, setIsFetchingReviews] = useState(false);

  const [merchantQuality, setMerchantQuality] = useState("");

  const [showFailureModal, setShowFailureModal] = useState(false);
  const [failureText, setFailureText] = useState("");
  const [showSuccessModal, setShowSuccessModal] = useState(false);

  const [cart, setCart] = useState<ProductData[]>([]);

  const reviewsContext = useContext(ReviewsContext);
  const shopMapContext = useContext(ShopMapContext);

  const toggleExpand = () => {
    setIsExpanded(!isExpanded);
  };

  const renderSummary = () => {
    if (summary.length <= SUMMARY_CHARACTER_LIMIT || isExpanded) {
      return summary;
    }
    return `${summary.slice(0, SUMMARY_CHARACTER_LIMIT)}...`;
  };

  const calculateVisibleImages = (containerHeight: number) => {
    const imageHeight = containerHeight / 3;
    const visibleCount = Math.floor(containerHeight / imageHeight);
    setVisibleImages(images.slice(0, visibleCount));
  };

  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (typeof window !== "undefined") {
      let cartList = localStorage.getItem("cart")
        ? JSON.parse(localStorage.getItem("cart") as string)
        : [];
      if (cartList && cartList.length > 0) {
        setCart(cartList);
      }
    }
  }, []);

  useEffect(() => {
    const productExists = cart.some(
      (item: ProductData) => item.id === productData.id,
    );
    if (productExists) {
      setIsAdded(true);
    }
  }, [cart]);

  useEffect(() => {
    setIsFetchingShop(true);
    if (
      pubkey &&
      shopMapContext.shopData.has(pubkey) &&
      typeof shopMapContext.shopData.get(pubkey) != "undefined"
    ) {
      const shopSettings: ShopSettings | undefined =
        shopMapContext.shopData.get(pubkey);
      if (shopSettings) {
        setShopBannerURL(shopSettings.content.ui.banner);
      }
    }
    setIsFetchingShop(false);
  }, [pubkey, shopMapContext, shopBannerURL]);

  useEffect(() => {
    setIsFetchingReviews(true);
    if (
      pubkey &&
      reviewsContext.merchantReviewsData.has(pubkey) &&
      typeof reviewsContext.merchantReviewsData.get(pubkey) != "undefined" &&
      reviewsContext.productReviewsData.has(pubkey) &&
      typeof reviewsContext.productReviewsData.get(pubkey) != "undefined"
    ) {
      const merchantScoresMap = reviewsContext.merchantReviewsData;
      const productReviewScore = reviewsContext.productReviewsData.get(pubkey);
      if (merchantScoresMap && productReviewScore) {
        for (const [productPubkey, scores] of merchantScoresMap.entries()) {
          if (productPubkey === pubkey) {
            const averageScore =
              scores.reduce((a, b) => a + b, 0) / scores.length;
            setMerchantReview(averageScore);
          }
        }
        const productReviewValue = dTag
          ? productReviewScore.get(dTag)
          : undefined;
        setProductReviews(
          productReviewValue !== undefined
            ? productReviewValue
            : new Map<string, string[][]>(),
        );
      }
    }
    setIsFetchingReviews(false);
  }, [pubkey, reviewsContext]);

  useEffect(() => {
    if (containerRef.current) {
      const resizeObserver = new ResizeObserver((entries) => {
        for (let entry of entries) {
          calculateVisibleImages(entry.contentRect.height);
        }
      });

      resizeObserver.observe(containerRef.current);

      return () => {
        resizeObserver.disconnect();
      };
    }
  }, [selectedImage]);

  useEffect(() => {
    setHasSizes(
      !!(
        sizes &&
        sizes.length > 0 &&
        sizes.some((size) => (sizeQuantities?.get(size) || 0) > 0)
      ),
    );
  }, [sizes, sizeQuantities]);

  useEffect(() => {
    if (!reviewsContext.merchantReviewsData.has(pubkey)) {
      setMerchantQuality("");
    } else if (merchantReview >= 0.75) {
      setMerchantQuality("Trustworthy");
    } else if (merchantReview >= 0.5) {
      setMerchantQuality("Solid");
    } else if (merchantReview >= 0.25) {
      setMerchantQuality("Questionable");
    } else {
      setMerchantQuality("Don't trust, don't bother verifying");
    }
  }, [reviewsContext, merchantReview]);

  const toggleBuyNow = () => {
    setIsBeingPaid(!isBeingPaid);
  };

  const handleAddToCart = () => {
    if (
      !currencySelection.hasOwnProperty(productData.currency) ||
      productData.totalCost < 1
    ) {
      setFailureText(
        "The price and/or currency set for this listing was invalid.",
      );
      setShowFailureModal(true);
      return;
    }
    let updatedCart = [];
    if (selectedSize) {
      let productWithSize = { ...productData, selectedSize: selectedSize };
      updatedCart = [...cart, productWithSize];
    } else {
      updatedCart = [...cart, productData];
    }
    setCart(updatedCart);
    localStorage.setItem("cart", JSON.stringify(updatedCart));
  };

  const handleShare = async () => {
    // The content you want to share
    const shareData = {
      title: title,
      url: `${window.location.origin}/listing/${productData.id}`,
    };
    // Check if the Web Share API is available
    if (navigator.share) {
      // Use the share API
      await navigator.share(shareData);
    } else {
      // Fallback for browsers that do not support the Web Share API
      navigator.clipboard.writeText(
        `${window.location.origin}/listing/${productData.id}`,
      );
      setShowSuccessModal(true);
    }
  };

  const handleSendMessage = (pubkeyToOpenChatWith: string) => {
    let { signInMethod } = getLocalStorageData();
    if (!signInMethod) {
      setFailureText("You must be signed in to send an inquiry!");
      setShowFailureModal(true);
      return;
    }
    router.push({
      pathname: "/orders",
      query: { pk: nip19.npubEncode(pubkeyToOpenChatWith), isInquiry: true },
    });
  };

  const renderSizeGrid = () => {
    return (
      <div className="grid grid-cols-3 gap-2 py-1">
        {sizes?.map((size) =>
          (sizeQuantities?.get(size) || 0) > 0 ? (
            <button
              key={size}
              className={`rounded-md border p-2 text-sm ${
                selectedSize === size
                  ? "bg-shopstr-purple text-white dark:bg-shopstr-yellow dark:text-black"
                  : "bg-white text-black dark:bg-black dark:text-white"
              }`}
              onClick={() => setSelectedSize(size)}
            >
              {size}
            </button>
          ) : null,
        )}
      </div>
    );
  };

  return (
    <>
      {!isBeingPaid ? (
        <>
          {shopBannerURL && !isFetchingShop && (
            <div className="flex h-auto w-full items-center justify-center bg-light-bg bg-cover bg-center dark:bg-dark-bg">
              <img
                src={sanitizeUrl(shopBannerURL)}
                alt="Shop Banner"
                className="max-h-[210px] w-full items-center justify-center object-cover"
              />
            </div>
          )}
          <div className="max-w-screen pt-4">
            <div
              className="max-w-screen mx-3 my-3 flex flex-row whitespace-normal break-words"
              key={uniqueKey}
            >
              <div className="w-1/2 pr-4">
                <div className="flex w-full flex-row">
                  <div className="flex w-1/4 flex-col pr-4">
                    <div ref={containerRef} className="flex-1 overflow-hidden">
                      <div
                        className={`flex flex-col space-y-2 ${
                          showAllImages ? "overflow-y-auto" : ""
                        }`}
                      >
                        {(showAllImages ? images : visibleImages).map(
                          (image, index) => (
                            <img
                              key={index}
                              src={image}
                              alt={`Product image ${index + 1}`}
                              className={`w-full cursor-pointer object-cover ${
                                image === selectedImage
                                  ? "border-2 border-shopstr-purple dark:border-shopstr-yellow"
                                  : ""
                              }`}
                              style={{ aspectRatio: "1 / 1" }}
                              onClick={() => setSelectedImage(image)}
                            />
                          ),
                        )}
                      </div>
                    </div>
                    {images.length > visibleImages.length && (
                      <button
                        onClick={() => setShowAllImages(!showAllImages)}
                        className="mt-2 text-sm text-purple-500 hover:text-purple-700 dark:text-yellow-500 dark:hover:text-yellow-700"
                      >
                        {showAllImages ? "∧" : "∨"}
                      </button>
                    )}
                  </div>
                  <div className="w-3/4">
                    <img
                      src={selectedImage}
                      alt="Selected product image"
                      className="w-full object-cover"
                      style={{ aspectRatio: "1 / 1" }}
                    />
                  </div>
                </div>
              </div>
              <div className="w-1/2 px-3">
                <div className="flex w-full flex-col gap-4">
                  <div className="flex flex-wrap items-center gap-4">
                    <ProfileWithDropdown
                      pubkey={pubkey}
                      dropDownKeys={
                        pubkey === userPubkey
                          ? ["shop_settings"]
                          : ["shop", "inquiry"]
                      }
                    />
                    {merchantQuality !== "" && (
                      <div className="inline-flex items-center gap-1 rounded-lg border-2 border-black px-2 dark:border-white">
                        {merchantReview >= 0.5 ? (
                          <>
                            <FaceSmileIcon
                              className={`h-10 w-10 p-1 ${
                                merchantReview >= 0.75
                                  ? "text-green-500"
                                  : "text-green-300"
                              }`}
                            />
                            <span className="mr-2 whitespace-nowrap text-sm text-light-text dark:text-dark-text">
                              {merchantQuality}
                            </span>
                          </>
                        ) : (
                          <>
                            <FaceFrownIcon
                              className={`h-10 w-10 p-1 ${
                                merchantReview >= 0.25
                                  ? "text-red-300"
                                  : "text-red-500"
                              }`}
                            />
                            <span className="mr-2 whitespace-nowrap text-sm text-light-text dark:text-dark-text">
                              {merchantQuality}
                            </span>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                </div>
                <h2 className="mt-4 w-full text-left text-2xl font-bold text-light-text dark:text-dark-text">
                  {title}
                </h2>
                {condition && (
                  <div className="text-left text-xs text-light-text dark:text-dark-text">
                    <span>Condition: {condition}</span>
                  </div>
                )}
                <div className="hidden sm:block">
                  <p className="mt-4 w-full text-left text-lg text-light-text dark:text-dark-text">
                    {renderSummary()}
                  </p>
                  {summary.length > SUMMARY_CHARACTER_LIMIT && (
                    <button
                      onClick={toggleExpand}
                      className="mt-2 text-purple-500 hover:text-purple-700 dark:text-yellow-500 dark:hover:text-yellow-700"
                    >
                      {isExpanded ? "Show less" : "Show more"}
                    </button>
                  )}
                </div>
                <div className="mt-4">
                  <DisplayCheckoutCost monetaryInfo={productData} />
                </div>
                {renderSizeGrid()}
                <div className="py-1">
                  <Chip key={location} startContent={locationAvatar(location)}>
                    {location}
                  </Chip>
                </div>
                <div className="flex w-full flex-col gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      className={`${SHOPSTRBUTTONCLASSNAMES} ${
                        hasSizes && !selectedSize
                          ? "cursor-not-allowed opacity-50"
                          : ""
                      }`}
                      onClick={toggleBuyNow}
                      disabled={hasSizes && !selectedSize}
                    >
                      Buy Now
                    </Button>
                    <Button
                      className={`${SHOPSTRBUTTONCLASSNAMES} ${
                        isAdded || (hasSizes && !selectedSize)
                          ? "cursor-not-allowed opacity-50"
                          : ""
                      }`}
                      onClick={handleAddToCart}
                      disabled={isAdded || (hasSizes && !selectedSize)}
                    >
                      Add To Cart
                    </Button>
                    <Button
                      type="submit"
                      className={SHOPSTRBUTTONCLASSNAMES}
                      onClick={handleShare}
                    >
                      Share
                    </Button>
                  </div>
                </div>
                {pubkey !== userPubkey && (
                  <span
                    onClick={() => {
                      handleSendMessage(productData.pubkey);
                    }}
                    className="cursor-pointer text-gray-500"
                  >
                    or{" "}
                    <span className="underline hover:text-light-text dark:hover:text-dark-text">
                      contact
                    </span>{" "}
                    seller
                  </span>
                )}
              </div>
            </div>
            <div className="max-w-screen mx-3 my-3 max-w-full overflow-hidden whitespace-normal break-words sm:hidden">
              <p className="break-words-all w-full text-left text-lg text-light-text dark:text-dark-text">
                {renderSummary()}
              </p>
              {summary.length > SUMMARY_CHARACTER_LIMIT && (
                <button
                  onClick={toggleExpand}
                  className="mt-2 text-purple-500 hover:text-purple-700 dark:text-yellow-500 dark:hover:text-yellow-700"
                >
                  {isExpanded ? "Show less" : "Show more"}
                </button>
              )}
            </div>
            {!isFetchingReviews && productReviews && (
              <div className="mt-4 max-w-full p-4 pt-4">
                <h3 className="mb-3 text-lg font-semibold text-light-text dark:text-dark-text">
                  Product Reviews
                </h3>
                <div className="space-y-3">
                  {Array.from(productReviews.entries()).map(
                    ([reviewerPubkey, reviewData]) => (
                      <div
                        key={reviewerPubkey}
                        className="rounded-lg border-2 border-black p-3 dark:border-white"
                      >
                        <div className="mb-2 flex items-center gap-2">
                          <ProfileWithDropdown
                            pubkey={reviewerPubkey}
                            dropDownKeys={
                              reviewerPubkey === userPubkey
                                ? ["shop_settings"]
                                : ["shop", "inquiry"]
                            }
                          />
                        </div>
                        <div className="flex flex-col">
                          <div className="mb-1 flex flex-wrap gap-2">
                            {reviewData.map(([_, value, category], index) => {
                              if (category === undefined) {
                                // Don't render the comment here; we'll show it later.
                                return null;
                              } else if (category === "thumb") {
                                return (
                                  <Chip
                                    key={index}
                                    className={`text-light-text dark:text-dark-text ${
                                      value === "1"
                                        ? "bg-green-500"
                                        : "bg-red-500"
                                    }`}
                                  >
                                    {`overall: ${value === "1" ? "👍" : "👎"}`}
                                  </Chip>
                                );
                              } else {
                                // Render chips for other categories
                                return (
                                  <Chip
                                    key={index}
                                    className={`text-light-text dark:text-dark-text ${
                                      value === "1"
                                        ? "bg-green-500"
                                        : "bg-red-500"
                                    }`}
                                  >
                                    {`${category}: ${
                                      value === "1" ? "👍" : "👎"
                                    }`}
                                  </Chip>
                                );
                              }
                            })}
                          </div>
                          {reviewData.map(([category, value], index) => {
                            if (category === "comment" && value !== "") {
                              // Render the comment text below the chips
                              return (
                                <p
                                  key={index}
                                  className="italic text-light-text dark:text-dark-text"
                                >
                                  &ldquo;{value}&rdquo;
                                </p>
                              );
                            }
                            return null;
                          })}
                        </div>
                      </div>
                    ),
                  )}
                </div>
              </div>
            )}
          </div>
        </>
      ) : (
        <>
          <div className="p-4 text-light-text dark:text-dark-text">
            <h2 className="mb-4 text-2xl font-bold">{title}</h2>
            {selectedSize && (
              <p className="mb-4 text-lg">Size: {selectedSize}</p>
            )}
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
          </div>
          <div className="flex flex-col items-center">
            <ProductInvoiceCard
              productData={productData}
              setInvoiceIsPaid={setInvoiceIsPaid}
              setInvoiceGenerationFailed={setInvoiceGenerationFailed}
              setCashuPaymentSent={setCashuPaymentSent}
              setCashuPaymentFailed={setCashuPaymentFailed}
              selectedSize={selectedSize}
            />
          </div>
        </>
      )}
      <FailureModal
        bodyText={failureText}
        isOpen={showFailureModal}
        onClose={() => setShowFailureModal(false)}
      />
      <SuccessModal
        bodyText="Listing URL copied to clipboard!"
        isOpen={showSuccessModal}
        onClose={() => setShowSuccessModal(false)}
      />
    </>
  );
}
