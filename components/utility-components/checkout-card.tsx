/* eslint-disable @next/next/no-img-element */

import React, { useContext, useEffect, useRef, useState } from "react";
import { nip19 } from "nostr-tools";
import { ProductData } from "@/utils/parsers/product-parser-functions";
import { ProfileWithDropdown } from "./profile/profile-dropdown";
import { DisplayCheckoutCost } from "./display-monetary-info";
import ProductInvoiceCard from "../product-invoice-card";
import { useRouter } from "next/router";
import { SHOPSTRBUTTONCLASSNAMES } from "@/utils/STATIC-VARIABLES";
import { Button, Chip, Input, useDisclosure } from "@nextui-org/react";
import { locationAvatar } from "./dropdowns/location-dropdown";
import {
  FaceFrownIcon,
  FaceSmileIcon,
  ArrowLongDownIcon,
  ArrowLongUpIcon,
} from "@heroicons/react/24/outline";
import { ReviewsContext } from "@/utils/context/context";
import FailureModal from "../utility-components/failure-modal";
import SuccessModal from "../utility-components/success-modal";
import SignInModal from "../sign-in/SignInModal";
import currencySelection from "../../public/currencySelection.json";
import { SignerContext } from "@/components/utility-components/nostr-context-provider";
import VolumeSelector from "./volume-selector";

const SUMMARY_CHARACTER_LIMIT = 100;

export default function CheckoutCard({
  productData,
  setFiatOrderIsPlaced,
  setFiatOrderFailed,
  setInvoiceIsPaid,
  setInvoiceGenerationFailed,
  setCashuPaymentSent,
  setCashuPaymentFailed,
  uniqueKey,
}: {
  productData: ProductData;
  setFiatOrderIsPlaced?: (fiatOrderIsPlaced: boolean) => void;
  setFiatOrderFailed?: (fiatOrderFailed: boolean) => void;
  setInvoiceIsPaid?: (invoiceIsPaid: boolean) => void;
  setInvoiceGenerationFailed?: (invoiceGenerationFailed: boolean) => void;
  setCashuPaymentSent?: (cashuPaymentSent: boolean) => void;
  setCashuPaymentFailed?: (cashuPaymentFailed: boolean) => void;
  uniqueKey?: string;
}) {
  const { pubkey: userPubkey, isLoggedIn } = useContext(SignerContext);
  const { isOpen, onOpen, onClose } = useDisclosure();

  const router = useRouter();

  const [isExpanded, setIsExpanded] = useState(false);
  const [isBeingPaid, setIsBeingPaid] = useState(false);
  const [visibleImages, setVisibleImages] = useState<string[]>([]);
  const [showAllImages, setShowAllImages] = useState(false);
  const [selectedImage, setSelectedImage] = useState(productData.images[0]);
  const [selectedSize, setSelectedSize] = useState<string | undefined>(
    undefined
  );
  const [hasSizes, setHasSizes] = useState(false);
  const [isAdded, setIsAdded] = useState(false);

  const [merchantReview, setMerchantReview] = useState(0);
  const [productReviews, setProductReviews] =
    useState<Map<string, string[][]>>();
  const [isFetchingReviews, setIsFetchingReviews] = useState(false);

  const [merchantQuality, setMerchantQuality] = useState("");

  const [showFailureModal, setShowFailureModal] = useState(false);
  const [failureText, setFailureText] = useState("");
  const [showSuccessModal, setShowSuccessModal] = useState(false);

  const [cart, setCart] = useState<ProductData[]>([]);
  const [selectedVolume, setSelectedVolume] = useState<string>("");
  const [currentPrice, setCurrentPrice] = useState(productData.price);
  const [discountCode, setDiscountCode] = useState("");
  const [appliedDiscount, setAppliedDiscount] = useState<number>(0);
  const [discountError, setDiscountError] = useState("");

  const reviewsContext = useContext(ReviewsContext);

  const hasVolumes = productData.volumes && productData.volumes.length > 0;

  const isExpired = productData.expiration
    ? Date.now() / 1000 > productData.expiration
    : false;

  useEffect(() => {
    if (selectedVolume && productData.volumePrices) {
      const volumePrice = productData.volumePrices.get(selectedVolume);
      if (volumePrice !== undefined) {
        setCurrentPrice(volumePrice);
      }
    } else {
      setCurrentPrice(productData.price);
    }
  }, [selectedVolume, productData.price, productData.volumePrices]);

  const toggleExpand = () => {
    setIsExpanded(!isExpanded);
  };

  const renderSummary = () => {
    if (productData.summary.length <= SUMMARY_CHARACTER_LIMIT || isExpanded) {
      return productData.summary;
    }
    return `${productData.summary.slice(0, SUMMARY_CHARACTER_LIMIT)}...`;
  };

  const calculateVisibleImages = (containerHeight: number) => {
    const imageHeight = containerHeight / 3;
    const visibleCount = Math.max(3, Math.floor(containerHeight / imageHeight));
    setVisibleImages(productData.images.slice(0, visibleCount));
  };

  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const cartList = localStorage.getItem("cart")
        ? JSON.parse(localStorage.getItem("cart") as string)
        : [];
      if (cartList && cartList.length > 0) {
        setCart(cartList);
      }
    }
  }, []);

  useEffect(() => {
    const productExists = cart.some(
      (item: ProductData) => item.id === productData.id
    );
    if (productExists) {
      setIsAdded(true);
    }
  }, [cart, productData.id]);

  useEffect(() => {
    setIsFetchingReviews(true);
    if (
      productData.pubkey &&
      reviewsContext.merchantReviewsData.has(productData.pubkey) &&
      typeof reviewsContext.merchantReviewsData.get(productData.pubkey) !=
        "undefined" &&
      reviewsContext.productReviewsData.has(productData.pubkey) &&
      typeof reviewsContext.productReviewsData.get(productData.pubkey) !=
        "undefined"
    ) {
      const merchantScoresMap = reviewsContext.merchantReviewsData;
      const productReviewScore = reviewsContext.productReviewsData.get(
        productData.pubkey
      );
      if (merchantScoresMap && productReviewScore) {
        for (const [productPubkey, scores] of merchantScoresMap.entries()) {
          if (productPubkey === productData.pubkey) {
            const averageScore =
              scores.reduce((a, b) => a + b, 0) / scores.length;
            setMerchantReview(averageScore);
          }
        }
        const productReviewValue = productData.d
          ? productReviewScore.get(productData.d)
          : undefined;
        setProductReviews(
          productReviewValue !== undefined
            ? productReviewValue
            : new Map<string, string[][]>()
        );
      }
    }
    setIsFetchingReviews(false);
  }, [productData.pubkey, reviewsContext, productData.d]);

  useEffect(() => {
    if (containerRef.current) {
      const resizeObserver = new ResizeObserver((entries) => {
        for (const entry of entries) {
          calculateVisibleImages(entry.contentRect.height);
        }
      });

      resizeObserver.observe(containerRef.current);

      return () => {
        resizeObserver.disconnect();
      };
    }
    return;
  }, [selectedImage, isBeingPaid]);

  useEffect(() => {
    setHasSizes(
      !!(
        productData.sizes &&
        productData.sizes.length > 0 &&
        productData.sizes.some(
          (size) => (productData.sizeQuantities?.get(size) || 0) > 0
        )
      )
    );
  }, [productData.sizes, productData.sizeQuantities]);

  useEffect(() => {
    if (!reviewsContext.merchantReviewsData.has(productData.pubkey)) {
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
  }, [reviewsContext, merchantReview, productData.pubkey]);

  const toggleBuyNow = () => {
    if (isLoggedIn) {
      setIsBeingPaid(!isBeingPaid);
    } else {
      onOpen();
    }
  };

  const handleAddToCart = () => {
    if (isLoggedIn) {
      if (
        !currencySelection.hasOwnProperty(productData.currency.toUpperCase()) ||
        productData.totalCost < 1
      ) {
        setFailureText(
          "The price and/or currency set for this listing was invalid."
        );
        setShowFailureModal(true);
        return;
      }
      let updatedCart = [];
      const productToAdd = { ...productData };

      if (selectedSize) {
        productToAdd.selectedSize = selectedSize;
      }
      if (selectedVolume) {
        productToAdd.selectedVolume = selectedVolume;
        // Set the volume price if one exists
        if (productData.volumePrices) {
          const volumePrice = productData.volumePrices.get(selectedVolume);
          if (volumePrice !== undefined) {
            productToAdd.volumePrice = volumePrice;
          }
        }
      }

      updatedCart = [...cart, productToAdd];
      setCart(updatedCart);
      localStorage.setItem("cart", JSON.stringify(updatedCart));

      // Store discount code if applied
      if (appliedDiscount > 0 && discountCode) {
        const storedDiscounts = localStorage.getItem("cartDiscounts");
        const discounts = storedDiscounts ? JSON.parse(storedDiscounts) : {};
        discounts[productData.pubkey] = {
          code: discountCode,
          percentage: appliedDiscount,
        };
        localStorage.setItem("cartDiscounts", JSON.stringify(discounts));
      }
    } else {
      onOpen();
    }
  };

  const handleShare = async () => {
    const naddr = nip19.naddrEncode({
      identifier: productData.d as string,
      pubkey: productData.pubkey,
      kind: 30402,
    });
    // The content you want to share
    const shareData = {
      title: productData.title,
      url: `${window.location.origin}/listing/${naddr}`,
    };
    // Check if the Web Share API is available
    if (navigator.share) {
      // Use the share API
      await navigator.share(shareData);
    } else {
      // Fallback for browsers that do not support the Web Share API
      navigator.clipboard.writeText(
        `${window.location.origin}/listing/${naddr}`
      );
      setShowSuccessModal(true);
    }
  };

  const handleSendMessage = (pubkeyToOpenChatWith: string) => {
    if (isLoggedIn) {
      router.push({
        pathname: "/orders",
        query: { pk: nip19.npubEncode(pubkeyToOpenChatWith), isInquiry: true },
      });
    } else {
      onOpen();
    }
  };

  const handleApplyDiscount = async () => {
    if (!discountCode.trim()) {
      setDiscountError("Please enter a discount code");
      return;
    }

    try {
      const response = await fetch(
        `/api/db/discount-codes?validate=true&code=${encodeURIComponent(
          discountCode
        )}&pubkey=${productData.pubkey}`
      );

      if (!response.ok) {
        setDiscountError("Failed to validate discount code");
        return;
      }

      const result = await response.json();

      if (result.valid && result.discount_percentage) {
        setAppliedDiscount(result.discount_percentage);
        setDiscountError("");
      } else {
        setDiscountError("Invalid or expired discount code");
        setAppliedDiscount(0);
      }
    } catch (error) {
      console.error("Failed to apply discount:", error);
      setDiscountError("Failed to apply discount code");
      setAppliedDiscount(0);
    }
  };

  const handleRemoveDiscount = () => {
    setDiscountCode("");
    setAppliedDiscount(0);
    setDiscountError("");
  };

  const renderSizeGrid = () => {
    return (
      <div className="grid grid-cols-3 gap-2 py-1">
        {productData.sizes?.map((size) =>
          (productData.sizeQuantities?.get(size) || 0) > 0 ? (
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
          ) : null
        )}
      </div>
    );
  };

  // Calculate discounted price with proper rounding
  const discountAmount =
    appliedDiscount > 0
      ? Math.ceil(((currentPrice * appliedDiscount) / 100) * 100) / 100
      : 0;

  const discountedPrice =
    appliedDiscount > 0 ? currentPrice - discountAmount : currentPrice;

  const discountedTotal = discountedPrice + (productData.shippingCost ?? 0);

  // Create updated product data with selected volume price and discount
  const updatedProductData = {
    ...productData,
    price: discountedPrice,
    totalCost: discountedTotal,
    originalPrice: currentPrice,
    discountPercentage: appliedDiscount,
    volumePrice:
      selectedVolume && productData.volumePrices
        ? productData.volumePrices.get(selectedVolume)
        : undefined,
  };

  return (
    <div className="flex w-full items-center justify-center bg-light-bg dark:bg-dark-bg">
      <div className="mx-auto flex w-full flex-col">
        {!isBeingPaid ? (
          <>
            <div className="max-w-screen pt-4">
              <div
                className="max-w-screen mx-3 my-3 flex flex-row whitespace-normal break-words"
                key={uniqueKey}
              >
                <div className="w-1/2 pr-4">
                  <div className="flex w-full flex-row">
                    <div className="flex w-1/4 flex-col pr-4">
                      <div
                        ref={containerRef}
                        className="flex-1 overflow-hidden"
                      >
                        <div
                          className={`flex flex-col space-y-2 ${
                            showAllImages ? "overflow-y-auto" : ""
                          }`}
                        >
                          {(showAllImages
                            ? productData.images
                            : visibleImages
                          ).map((image, index) => (
                            <img
                              key={index}
                              src={image}
                              alt={`Product image ${index + 1}`}
                              className={`w-full cursor-pointer rounded-xl object-cover ${
                                image === selectedImage
                                  ? "border-2 border-shopstr-purple dark:border-shopstr-yellow"
                                  : ""
                              }`}
                              style={{ aspectRatio: "1 / 1" }}
                              onClick={() => setSelectedImage(image)}
                            />
                          ))}
                        </div>
                      </div>
                      {productData.images.length > 3 && (
                        <button
                          onClick={() => setShowAllImages(!showAllImages)}
                          className="mt-2 flex flex-col items-center text-sm text-purple-500 hover:text-purple-700 dark:text-yellow-500 dark:hover:text-yellow-700"
                        >
                          {showAllImages ? (
                            <ArrowLongUpIcon className="h-5 w-5" />
                          ) : (
                            <ArrowLongDownIcon className="h-5 w-5" />
                          )}
                        </button>
                      )}
                    </div>
                    <div className="w-3/4">
                      <img
                        src={selectedImage}
                        alt="Selected product image"
                        className="w-full rounded-xl object-cover"
                        style={{ aspectRatio: "1 / 1" }}
                      />
                    </div>
                  </div>
                </div>
                <div className="w-1/2 px-3">
                  <div className="flex w-full flex-col gap-4">
                    <div className="flex flex-wrap items-center gap-4">
                      <ProfileWithDropdown
                        pubkey={productData.pubkey}
                        dropDownKeys={
                          productData.pubkey === userPubkey
                            ? ["shop_profile"]
                            : ["shop", "inquiry", "copy_npub"]
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
                    {productData.title}
                    {isExpired && (
                      <Chip color="warning" variant="flat" className="ml-2">
                        Outdated
                      </Chip>
                    )}
                  </h2>
                  {productData.expiration && (
                    <p
                      className={`mt-1 text-left text-sm ${
                        isExpired ? "font-medium text-red-500" : "text-gray-500"
                      }`}
                    >
                      {isExpired ? "Expired on: " : "Valid until: "}{" "}
                      {new Date(
                        productData.expiration * 1000
                      ).toLocaleDateString()}
                    </p>
                  )}
                  {productData.condition && (
                    <div className="text-left text-xs text-light-text dark:text-dark-text">
                      <span>Condition: {productData.condition}</span>
                    </div>
                  )}
                  {productData.restrictions && (
                    <div className="text-left text-xs text-light-text dark:text-dark-text">
                      <span>Restrictions: </span>
                      <span className="text-red-500">
                        {productData.restrictions}
                      </span>
                    </div>
                  )}
                  <div className="hidden sm:block">
                    <p className="mt-4 w-full text-left text-lg text-light-text dark:text-dark-text">
                      {renderSummary()}
                    </p>
                    {productData.summary.length > SUMMARY_CHARACTER_LIMIT && (
                      <button
                        onClick={toggleExpand}
                        className="mt-2 text-purple-500 hover:text-purple-700 dark:text-yellow-500 dark:hover:text-yellow-700"
                      >
                        {isExpanded ? "Show less" : "Show more"}
                      </button>
                    )}
                  </div>
                  {hasVolumes && (
                    <VolumeSelector
                      volumes={productData.volumes!}
                      volumePrices={productData.volumePrices!}
                      currency={productData.currency}
                      selectedVolume={selectedVolume}
                      onVolumeChange={setSelectedVolume}
                      isRequired={true}
                    />
                  )}
                  <div className="mt-4">
                    <DisplayCheckoutCost monetaryInfo={updatedProductData} />
                  </div>

                  {productData.pubkey !== userPubkey && (
                    <div className="mt-4 space-y-2">
                      <div className="flex gap-2">
                        <Input
                          label="Discount Code"
                          placeholder="Enter code"
                          value={discountCode}
                          onChange={(e) =>
                            setDiscountCode(e.target.value.toUpperCase())
                          }
                          className="flex-1 text-light-text dark:text-dark-text"
                          disabled={appliedDiscount > 0}
                          isInvalid={!!discountError}
                          errorMessage={discountError}
                        />
                        {appliedDiscount > 0 ? (
                          <Button
                            color="warning"
                            onClick={handleRemoveDiscount}
                          >
                            Remove
                          </Button>
                        ) : (
                          <Button
                            className={SHOPSTRBUTTONCLASSNAMES}
                            onClick={handleApplyDiscount}
                          >
                            Apply
                          </Button>
                        )}
                      </div>
                      {appliedDiscount > 0 && (
                        <p className="text-sm text-green-600 dark:text-green-400">
                          {appliedDiscount}% discount applied! You save{" "}
                          {Math.ceil((discountAmount / 100) * 100) / 100}{" "}
                          {productData.currency}
                        </p>
                      )}
                    </div>
                  )}

                  <div className="pb-1">
                    <Chip
                      key={productData.location}
                      startContent={locationAvatar(productData.location)}
                      className="min-h-fit max-w-full"
                      classNames={{
                        base: "h-auto py-1",
                        content: "whitespace-normal break-words text-wrap",
                      }}
                    >
                      {productData.location}
                    </Chip>
                  </div>
                  {renderSizeGrid()}
                  <div className="flex w-full flex-col gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      {productData.status !== "sold" ? (
                        <>
                          <Button
                            className={`min-w-fit bg-gradient-to-tr from-purple-700 via-purple-500 to-purple-700 text-dark-text shadow-lg dark:from-yellow-700 dark:via-yellow-500 dark:to-yellow-700 dark:text-light-text ${
                              (hasSizes && !selectedSize) ||
                              (hasVolumes && !selectedVolume)
                                ? "cursor-not-allowed opacity-50"
                                : ""
                            }`}
                            onClick={toggleBuyNow}
                            disabled={
                              (hasSizes && !selectedSize) ||
                              (hasVolumes && !selectedVolume) ||
                              isExpired
                            }
                          >
                            Buy Now
                          </Button>
                          <Button
                            className={`${SHOPSTRBUTTONCLASSNAMES} ${
                              isAdded ||
                              (hasSizes && !selectedSize) ||
                              (hasVolumes && !selectedVolume)
                                ? "cursor-not-allowed opacity-50"
                                : ""
                            }`}
                            onClick={handleAddToCart}
                            disabled={
                              isAdded ||
                              (hasSizes && !selectedSize) ||
                              (hasVolumes && !selectedVolume) ||
                              isExpired
                            }
                          >
                            Add To Cart
                          </Button>
                        </>
                      ) : (
                        <>
                          <Button
                            className={`${SHOPSTRBUTTONCLASSNAMES} cursor-not-allowed opacity-50`}
                            disabled
                          >
                            Sold Out
                          </Button>
                        </>
                      )}
                      <Button
                        type="submit"
                        className={SHOPSTRBUTTONCLASSNAMES}
                        onClick={handleShare}
                      >
                        Share
                      </Button>
                    </div>
                  </div>
                  {productData.pubkey !== userPubkey && (
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
                {productData.summary.length > SUMMARY_CHARACTER_LIMIT && (
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
                  {productReviews.size > 0 ? (
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
                                    ? ["shop_profile"]
                                    : ["shop", "inquiry", "copy_npub"]
                                }
                              />
                            </div>
                            <div className="flex flex-col">
                              <div className="mb-1 flex flex-wrap gap-2">
                                {reviewData.map(
                                  ([_, value, category], index) => {
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
                                          {`overall: ${
                                            value === "1" ? "👍" : "👎"
                                          }`}
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
                                  }
                                )}
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
                        )
                      )}
                    </div>
                  ) : (
                    <div className="flex justify-center">
                      <div className="w-full max-w-xl rounded-lg bg-light-fg p-10 text-center shadow-lg dark:bg-dark-fg">
                        <span className="block text-5xl text-light-text dark:text-dark-text">
                          No reviews . . . yet!
                        </span>
                        <div className="flex flex-col items-center justify-center gap-3 pt-5 opacity-80">
                          <span className="text-2xl text-light-text dark:text-dark-text">
                            Be the first to leave a review!
                          </span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="flex flex-col items-center">
            <ProductInvoiceCard
              productData={updatedProductData}
              setIsBeingPaid={setIsBeingPaid}
              setFiatOrderIsPlaced={setFiatOrderIsPlaced}
              setFiatOrderFailed={setFiatOrderFailed}
              setInvoiceIsPaid={setInvoiceIsPaid}
              setInvoiceGenerationFailed={setInvoiceGenerationFailed}
              setCashuPaymentSent={setCashuPaymentSent}
              setCashuPaymentFailed={setCashuPaymentFailed}
              selectedSize={selectedSize}
              selectedVolume={selectedVolume}
              discountCode={appliedDiscount > 0 ? discountCode : undefined}
              discountPercentage={
                appliedDiscount > 0 ? appliedDiscount : undefined
              }
              originalPrice={currentPrice}
            />
          </div>
        )}
        <SignInModal isOpen={isOpen} onClose={onClose} />
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
      </div>
    </div>
  );
}
