/* eslint-disable @next/next/no-img-element */

import { useContext, useEffect, useRef, useState } from "react";
import { Event, nip19 } from "nostr-tools";
import parseTags, {
  ProductData,
} from "@/utils/parsers/product-parser-functions";
import { getListingSlug } from "@/utils/url-slugs";
import { ProfileWithDropdown } from "./profile/profile-dropdown";
import { DisplayCheckoutCost } from "./display-monetary-info";
import ProductInvoiceCard from "../product-invoice-card";
import { useRouter } from "next/router";
import {
  Button,
  Chip,
  Input,
  useDisclosure,
  Dropdown,
  DropdownTrigger,
  DropdownMenu,
  DropdownItem,
} from "@nextui-org/react";
import { locationAvatar } from "./dropdowns/location-dropdown";
import {
  ArrowLongDownIcon,
  ArrowLongUpIcon,
  EllipsisVerticalIcon,
} from "@heroicons/react/24/outline";
import BeefInitiativeBadge from "./beef-initiative-badge";
import {
  ReviewsContext,
  ProductContext,
  ShopMapContext,
} from "@/utils/context/context";
import FreeShippingNotification from "../free-shipping-notification";
import FailureModal from "../utility-components/failure-modal";
import SuccessModal from "../utility-components/success-modal";
import SignInModal from "../sign-in/SignInModal";
import currencySelection from "../../public/currencySelection.json";
import { SignerContext } from "@/components/utility-components/nostr-context-provider";
import VolumeSelector from "./volume-selector";
import WeightSelector from "./weight-selector";
import { BLUEBUTTONCLASSNAMES } from "@/utils/STATIC-VARIABLES";
import BulkSelector from "./bulk-selector";
import ZapsnagButton from "@/components/ZapsnagButton";
import { RawEventModal, EventIdModal } from "./modals/event-modals";
import SubscriptionPricingCards from "./subscription-pricing-cards";

const SUMMARY_CHARACTER_LIMIT = 200;

export default function CheckoutCard({
  productData,
  setFiatOrderIsPlaced,
  setFiatOrderFailed,
  setInvoiceIsPaid,
  setInvoiceGenerationFailed,
  setCashuPaymentSent,
  setCashuPaymentFailed,
  rawEvent,
}: {
  productData: ProductData;
  setFiatOrderIsPlaced: (fiatOrderIsPlaced: boolean) => void;
  setFiatOrderFailed: (fiatOrderFailed: boolean) => void;
  setInvoiceIsPaid: (invoiceIsPaid: boolean) => void;
  setInvoiceGenerationFailed: (invoiceGenerationFailed: boolean) => void;
  setCashuPaymentSent: (cashuPaymentSent: boolean) => void;
  setCashuPaymentFailed: (cashuPaymentFailed: boolean) => void;
  rawEvent?: Event;
}) {
  const { pubkey: userPubkey, isLoggedIn } = useContext(SignerContext);
  const productEventContext = useContext(ProductContext);
  const shopMapContext = useContext(ShopMapContext);
  const { isOpen, onOpen, onClose } = useDisclosure();
  const [showFreeShippingNotification, setShowFreeShippingNotification] =
    useState(false);
  const [showRawEventModal, setShowRawEventModal] = useState(false);
  const [showEventIdModal, setShowEventIdModal] = useState(false);

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
  const [selectedWeight, setSelectedWeight] = useState<string>("");
  const [selectedBulkOption, setSelectedBulkOption] = useState<string>("1");
  const [currentPrice, setCurrentPrice] = useState(productData.price);
  const [discountCode, setDiscountCode] = useState("");
  const [appliedDiscount, setAppliedDiscount] = useState<number>(0);
  const [discountError, setDiscountError] = useState("");
  const [satsEstimate, setSatsEstimate] = useState<number | null>(null);

  const hasSubscription = !!(
    productData.subscriptionEnabled &&
    productData.subscriptionDiscount &&
    productData.subscriptionFrequency &&
    productData.subscriptionFrequency.length > 0
  );
  const [isSubscriptionSelected, setIsSubscriptionSelected] =
    useState(hasSubscription);
  const [selectedFrequency, setSelectedFrequency] = useState<string>(
    hasSubscription && productData.subscriptionFrequency?.[0]
      ? productData.subscriptionFrequency[0]
      : ""
  );

  const reviewsContext = useContext(ReviewsContext);

  const containerRef = useRef<HTMLDivElement>(null);

  const hasVolumes = productData.volumes && productData.volumes.length > 0;
  const hasWeights = productData.weights && productData.weights.length > 0;
  const hasBulkPrices =
    productData.bulkPrices && productData.bulkPrices.size > 0;

  const isExpired = productData.expiration
    ? Date.now() / 1000 > productData.expiration
    : false;

  const isZapsnag =
    productData.d === "zapsnag" || productData.categories?.includes("zapsnag");

  useEffect(() => {
    if (
      selectedBulkOption &&
      selectedBulkOption !== "1" &&
      productData.bulkPrices
    ) {
      const bulkPrice = productData.bulkPrices.get(
        parseInt(selectedBulkOption)
      );
      if (bulkPrice !== undefined) {
        setCurrentPrice(bulkPrice);
      }
    } else if (selectedVolume && productData.volumePrices) {
      const volumePrice = productData.volumePrices.get(selectedVolume);
      if (volumePrice !== undefined) {
        setCurrentPrice(volumePrice);
      }
    } else if (selectedWeight && productData.weightPrices) {
      const weightPrice = productData.weightPrices.get(selectedWeight);
      if (weightPrice !== undefined) {
        setCurrentPrice(weightPrice);
      }
    } else {
      setCurrentPrice(productData.price);
    }
  }, [
    selectedVolume,
    productData.price,
    productData.volumePrices,
    selectedWeight,
    productData.weightPrices,
    selectedBulkOption,
    productData.bulkPrices,
  ]);

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
    const imageHeight = containerHeight / 3; // You can adjust this '3' if needed
    const visibleCount = Math.max(3, Math.floor(containerHeight / imageHeight));
    setVisibleImages(productData.images.slice(0, visibleCount));
  };

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
    setIsBeingPaid(!isBeingPaid);
  };

  const handleAddToCart = () => {
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
      if (productData.volumePrices) {
        const volumePrice = productData.volumePrices.get(selectedVolume);
        if (volumePrice !== undefined) {
          productToAdd.volumePrice = volumePrice;
        }
      }
    }
    if (selectedWeight) {
      productToAdd.selectedWeight = selectedWeight;
      if (productData.weightPrices) {
        const weightPrice = productData.weightPrices.get(selectedWeight);
        if (weightPrice !== undefined) {
          productToAdd.weightPrice = weightPrice;
        }
      }
    }
    if (selectedBulkOption && selectedBulkOption !== "1") {
      productToAdd.selectedBulkOption = parseInt(selectedBulkOption);
      if (productData.bulkPrices) {
        const bulkPrice = productData.bulkPrices.get(
          parseInt(selectedBulkOption)
        );
        if (bulkPrice !== undefined) {
          productToAdd.bulkPrice = bulkPrice;
        }
      }
    }

    updatedCart = [...cart, productToAdd];
    setCart(updatedCart);
    localStorage.setItem("cart", JSON.stringify(updatedCart));

    if (appliedDiscount > 0 && discountCode) {
      const storedDiscounts = localStorage.getItem("cartDiscounts");
      const discounts = storedDiscounts ? JSON.parse(storedDiscounts) : {};
      discounts[productData.pubkey] = {
        code: discountCode,
        percentage: appliedDiscount,
      };
      localStorage.setItem("cartDiscounts", JSON.stringify(discounts));
    }

    const sellerShop = shopMapContext.shopData.get(productData.pubkey);
    if (
      sellerShop &&
      sellerShop.content.freeShippingThreshold &&
      sellerShop.content.freeShippingThreshold > 0
    ) {
      setShowFreeShippingNotification(true);
    }
  };

  const handleShare = async () => {
    const allParsed = productEventContext.productEvents
      .filter((e: Event) => e.kind !== 1)
      .map((e: Event) => parseTags(e))
      .filter((p: ProductData | undefined): p is ProductData => !!p);

    const slug = getListingSlug(productData, allParsed);
    const listingPath = slug || productData.id;
    const shareData = {
      title: productData.title,
      url: `${window.location.origin}/listing/${listingPath}`,
    };
    if (navigator.share) {
      await navigator.share(shareData);
    } else {
      navigator.clipboard.writeText(
        `${window.location.origin}/listing/${listingPath}`
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
      <div className="mb-4">
        <p className="mb-2 text-sm font-semibold text-black">Select Size:</p>
        <div className="grid grid-cols-3 gap-2">
          {productData.sizes?.map((size) =>
            (productData.sizeQuantities?.get(size) || 0) > 0 ? (
              <button
                key={size}
                className={`rounded-md border-2 border-black p-2 text-sm font-bold shadow-neo transition-transform hover:-translate-y-0.5 active:translate-y-0.5 ${
                  selectedSize === size
                    ? "bg-primary-yellow text-black"
                    : "bg-white text-black"
                }`}
                onClick={() => setSelectedSize(size)}
              >
                {size}
              </button>
            ) : null
          )}
        </div>
      </div>
    );
  };

  const isSatsCurrency =
    productData.currency.toLowerCase() === "sats" ||
    productData.currency.toLowerCase() === "sat";

  useEffect(() => {
    if (isSatsCurrency) {
      setSatsEstimate(null);
      return;
    }
    const fetchSatsEstimate = async () => {
      try {
        const { fiat } = await import("@getalby/lightning-tools");
        const numSats = await fiat.getSatoshiValue({
          amount: currentPrice,
          currency: productData.currency,
        });
        setSatsEstimate(Math.round(numSats));
      } catch {
        setSatsEstimate(null);
      }
    };
    fetchSatsEstimate();
  }, [currentPrice, productData.currency, isSatsCurrency]);

  // Calculate discounted price with proper rounding
  const discountAmount =
    appliedDiscount > 0
      ? Math.ceil(((currentPrice * appliedDiscount) / 100) * 100) / 100
      : 0;

  const discountedPrice =
    appliedDiscount > 0 ? currentPrice - discountAmount : currentPrice;

  const subscriptionDiscountAmount =
    hasSubscription &&
    isSubscriptionSelected &&
    productData.subscriptionDiscount
      ? Math.ceil(
          ((currentPrice * productData.subscriptionDiscount) / 100) * 100
        ) / 100
      : 0;

  const effectivePrice =
    isSubscriptionSelected && subscriptionDiscountAmount > 0
      ? discountedPrice - subscriptionDiscountAmount
      : discountedPrice;

  const effectiveTotal = effectivePrice + (productData.shippingCost ?? 0);

  const updatedProductData = {
    ...productData,
    price: effectivePrice,
    totalCost: effectiveTotal,
    originalPrice: currentPrice,
    discountPercentage: appliedDiscount,
    weightPrice:
      selectedWeight && productData.weightPrices
        ? productData.weightPrices.get(selectedWeight)
        : undefined,
    volumePrice:
      selectedVolume && productData.volumePrices
        ? productData.volumePrices.get(selectedVolume)
        : undefined,
    selectedBulkOption:
      selectedBulkOption && selectedBulkOption !== "1"
        ? parseInt(selectedBulkOption)
        : undefined,
    bulkPrice:
      selectedBulkOption && selectedBulkOption !== "1" && productData.bulkPrices
        ? productData.bulkPrices.get(parseInt(selectedBulkOption))
        : undefined,
  };

  return (
    <div className="flex w-full items-center justify-center bg-white p-4">
      <div className="flex w-full max-w-7xl flex-col">
        {!isBeingPaid ? (
          <>
            <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
              {/* LEFT COLUMN - Image Gallery */}
              <div className="flex w-full flex-row gap-4">
                {/* Vertical Thumbnails */}
                <div className="flex w-1/4 flex-col gap-2">
                  <div ref={containerRef} className="flex-1 overflow-hidden">
                    <div
                      className={`flex flex-col space-y-2 ${
                        showAllImages ? "overflow-y-auto" : ""
                      }`}
                    >
                      {(showAllImages ? productData.images : visibleImages).map(
                        (image, index) => (
                          <img
                            key={index}
                            src={image}
                            alt={`Product image ${index + 1}`}
                            className={`w-full cursor-pointer rounded-md object-cover ${
                              image === selectedImage
                                ? "border-2 border-primary-yellow"
                                : "border-2 border-transparent"
                            }`}
                            style={{ aspectRatio: "1 / 1" }}
                            onClick={() => setSelectedImage(image)}
                          />
                        )
                      )}
                    </div>
                  </div>
                  {productData.images.length > 3 && (
                    <button
                      onClick={() => setShowAllImages(!showAllImages)}
                      className="flex flex-col items-center rounded-md border-2 border-black bg-white py-1 shadow-neo transition-transform hover:-translate-y-0.5 active:translate-y-0.5"
                    >
                      {showAllImages ? (
                        <ArrowLongUpIcon className="h-5 w-5" />
                      ) : (
                        <ArrowLongDownIcon className="h-5 w-5" />
                      )}
                    </button>
                  )}
                </div>

                {/* Main Image */}
                <div className="w-3/4">
                  <div className="rounded-md border-2 border-black bg-white p-4 shadow-neo">
                    <img
                      src={selectedImage}
                      alt="Selected product image"
                      className="w-full rounded-md object-cover"
                      style={{ aspectRatio: "1 / 1" }}
                    />
                  </div>
                </div>
              </div>

              {/* RIGHT COLUMN - Product Details */}
              <div className="flex flex-col gap-4">
                {/* Profile & Merchant Quality */}
                <div className="flex flex-wrap items-center gap-3">
                  <ProfileWithDropdown
                    pubkey={productData.pubkey}
                    dropDownKeys={
                      productData.pubkey === userPubkey
                        ? ["shop_profile"]
                        : ["shop", "inquiry", "copy_npub"]
                    }
                  />
                  {merchantQuality !== "" && (
                    <div className="inline-flex items-center gap-2 rounded-md border-2 border-black bg-white px-3 py-1 shadow-neo">
                      {merchantReview >= 0.5 ? (
                        <>
                          <span className="text-lg">😀</span>
                          <span className="text-sm font-semibold text-black">
                            {merchantQuality}
                          </span>
                        </>
                      ) : (
                        <>
                          <span className="text-lg">😢</span>
                          <span className="text-sm font-semibold text-black">
                            {merchantQuality}
                          </span>
                        </>
                      )}
                    </div>
                  )}
                </div>

                {/* Product Title */}
                <div className="mt-4 flex w-full items-start justify-between">
                  <h2 className="text-left text-2xl font-bold text-black">
                    {productData.title}
                    {isExpired && (
                      <Chip color="warning" variant="flat" className="ml-2">
                        Outdated
                      </Chip>
                    )}
                  </h2>
                  {rawEvent && (
                    <Dropdown>
                      <DropdownTrigger>
                        <Button
                          isIconOnly
                          variant="light"
                          size="sm"
                          className="min-w-8 h-8"
                        >
                          <EllipsisVerticalIcon className="h-6 w-6 text-gray-500" />
                        </Button>
                      </DropdownTrigger>
                      <DropdownMenu aria-label="Event Actions">
                        <DropdownItem
                          key="view-raw"
                          onPress={() => setShowRawEventModal(true)}
                        >
                          View Raw Event
                        </DropdownItem>
                        <DropdownItem
                          key="view-id"
                          onPress={() => setShowEventIdModal(true)}
                        >
                          View Event ID
                        </DropdownItem>
                      </DropdownMenu>
                    </Dropdown>
                  )}
                </div>

                {productData.beefinit_donation_percentage != null &&
                  productData.beefinit_donation_percentage > 0 && (
                    <div className="mt-2">
                      <BeefInitiativeBadge size="md" />
                    </div>
                  )}

                {/* Description */}
                <div>
                  <p className="text-base text-black">{renderSummary()}</p>
                  {productData.summary.length > SUMMARY_CHARACTER_LIMIT && (
                    <button
                      onClick={toggleExpand}
                      className="mt-2 text-sm font-bold text-black underline hover:text-primary-blue"
                    >
                      {isExpanded ? "show less" : "show more"}
                    </button>
                  )}
                </div>

                {/* Expiration */}
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

                {/* Condition */}
                {productData.condition && (
                  <p className="text-sm text-black">
                    <span className="font-semibold">Condition:</span>{" "}
                    {productData.condition}
                  </p>
                )}

                {/* Restrictions */}
                {productData.restrictions && (
                  <p className="text-sm text-black">
                    <span className="font-semibold">Restrictions:</span>{" "}
                    <span className="text-red-600">
                      {productData.restrictions}
                    </span>
                  </p>
                )}

                {/* Volume Selector */}
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

                {/* Weight Selector */}
                {hasWeights && (
                  <WeightSelector
                    weights={productData.weights!}
                    weightPrices={productData.weightPrices!}
                    currency={productData.currency}
                    selectedWeight={selectedWeight}
                    onWeightChange={setSelectedWeight}
                    isRequired={true}
                  />
                )}

                {/* Size Grid */}
                {hasSizes && renderSizeGrid()}

                {hasBulkPrices && (
                  <BulkSelector
                    bulkPrices={productData.bulkPrices!}
                    basePrice={productData.price}
                    currency={productData.currency}
                    selectedBulkOption={selectedBulkOption}
                    onBulkChange={setSelectedBulkOption}
                  />
                )}
                {hasSubscription && (
                  <div className="mt-4">
                    <SubscriptionPricingCards
                      basePrice={currentPrice}
                      currency={productData.currency}
                      discountPercent={productData.subscriptionDiscount!}
                      frequencies={productData.subscriptionFrequency!}
                      selectedFrequency={selectedFrequency}
                      onFrequencyChange={setSelectedFrequency}
                      isSubscription={isSubscriptionSelected}
                      onSelectionChange={setIsSubscriptionSelected}
                    />
                  </div>
                )}
                {!hasSubscription && (
                  <div className="mt-4">
                    <DisplayCheckoutCost
                      monetaryInfo={updatedProductData}
                      satsEstimate={satsEstimate}
                    />
                    {selectedBulkOption && selectedBulkOption !== "1" && (
                      <p className="mt-1 text-sm text-black">
                        Bundle: {selectedBulkOption} units
                      </p>
                    )}
                  </div>
                )}

                {isZapsnag ? (
                  <div className="mt-4">
                    <ZapsnagButton product={productData} />
                  </div>
                ) : (
                  <>
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
                            className="flex-1 text-white"
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
                              className={BLUEBUTTONCLASSNAMES}
                              onClick={handleApplyDiscount}
                            >
                              Apply
                            </Button>
                          )}
                        </div>
                        {appliedDiscount > 0 && (
                          <p className="text-sm text-green-600">
                            {appliedDiscount}% discount applied! You save{" "}
                            {currentPrice - discountedPrice}{" "}
                            {productData.currency}
                          </p>
                        )}
                      </div>
                    )}

                    {/* Location Chip */}
                    <div className="flex items-center gap-2">
                      <Chip
                        startContent={locationAvatar(productData.location)}
                        className="rounded-full border-2 border-black bg-white px-3 py-1 font-bold shadow-neo"
                      >
                        <span className="text-black">
                          📍 {productData.location}
                        </span>
                      </Chip>
                    </div>

                    {/* Action Buttons */}
                    <div className="flex flex-wrap gap-3">
                      {productData.status !== "sold" ? (
                        <>
                          {/* Buy Now - Solid Yellow */}
                          <Button
                            className={`rounded-md border-2 border-black bg-primary-yellow px-6 py-2 font-bold text-black shadow-neo transition-transform hover:-translate-y-0.5 active:translate-y-0.5 ${
                              (hasSizes && !selectedSize) ||
                              (hasVolumes && !selectedVolume) ||
                              (hasWeights && !selectedWeight)
                                ? "cursor-not-allowed opacity-50"
                                : ""
                            }`}
                            onClick={toggleBuyNow}
                            disabled={
                              (hasSizes && !selectedSize) ||
                              (hasVolumes && !selectedVolume) ||
                              (hasWeights && !selectedWeight) ||
                              isExpired
                            }
                            size="lg"
                          >
                            Buy Now
                          </Button>

                          {/* Add To Cart - Light Blue */}
                          <Button
                            className={`rounded-md border-2 border-black bg-blue-100 px-6 py-2 font-bold text-black shadow-neo transition-transform hover:-translate-y-0.5 hover:bg-blue-200 active:translate-y-0.5 ${
                              isAdded ||
                              (hasSizes && !selectedSize) ||
                              (hasVolumes && !selectedVolume) ||
                              (hasWeights && !selectedWeight)
                                ? "cursor-not-allowed opacity-50"
                                : ""
                            }`}
                            onClick={handleAddToCart}
                            disabled={
                              isAdded ||
                              (hasSizes && !selectedSize) ||
                              (hasVolumes && !selectedVolume) ||
                              (hasWeights && !selectedWeight) ||
                              isExpired
                            }
                            size="lg"
                          >
                            Add To Cart
                          </Button>
                        </>
                      ) : (
                        <Button
                          className="cursor-not-allowed rounded-md border-2 border-black bg-gray-300 px-6 py-2 font-bold text-gray-600 opacity-50 shadow-neo"
                          disabled
                          size="lg"
                        >
                          Sold Out
                        </Button>
                      )}

                      {/* Share - Light Blue */}
                      <Button
                        className="rounded-md border-2 border-black bg-blue-100 px-6 py-2 font-bold text-black shadow-neo transition-transform hover:-translate-y-0.5 hover:bg-blue-200 active:translate-y-0.5"
                        onClick={handleShare}
                        size="lg"
                      >
                        Share
                      </Button>
                    </div>
                  </>
                )}

                {/* Contact Seller */}
                {productData.pubkey !== userPubkey && (
                  <p className="text-sm text-black">
                    or{" "}
                    <span
                      onClick={() => handleSendMessage(productData.pubkey)}
                      className="cursor-pointer font-semibold underline hover:text-primary-blue"
                    >
                      contact seller
                    </span>
                  </p>
                )}
              </div>
            </div>

            {/* Product Reviews Section */}
            {!isFetchingReviews && productReviews && (
              <div className="mt-8">
                <h3 className="mb-4 text-2xl font-bold text-black">
                  Product Reviews
                </h3>
                {productReviews.size > 0 ? (
                  <div className="space-y-4">
                    {Array.from(productReviews.entries()).map(
                      ([reviewerPubkey, reviewData]) => (
                        <div
                          key={reviewerPubkey}
                          className="rounded-md border-2 border-black bg-white p-4 shadow-neo"
                        >
                          <div className="mb-3 flex items-center gap-2">
                            <ProfileWithDropdown
                              pubkey={reviewerPubkey}
                              dropDownKeys={
                                reviewerPubkey === userPubkey
                                  ? ["shop_profile"]
                                  : ["shop", "inquiry", "copy_npub"]
                              }
                            />
                          </div>
                          <div className="flex flex-col gap-2">
                            <div className="flex flex-wrap gap-2">
                              {reviewData.map(([_, value, category], index) => {
                                if (category === undefined) {
                                  return null;
                                } else if (category === "thumb") {
                                  return (
                                    <Chip
                                      key={index}
                                      className={`border-2 border-black font-bold shadow-neo ${
                                        value === "1"
                                          ? "bg-green-400"
                                          : "bg-red-400"
                                      }`}
                                    >
                                      {`overall: ${
                                        value === "1" ? "👍" : "👎"
                                      }`}
                                    </Chip>
                                  );
                                } else {
                                  return (
                                    <Chip
                                      key={index}
                                      className={`border-2 border-black font-bold shadow-neo ${
                                        value === "1"
                                          ? "bg-green-400"
                                          : "bg-red-400"
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
                                return (
                                  <p key={index} className="italic text-black">
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
                  <div className="rounded-md border-2 border-black bg-white p-10 text-center shadow-neo">
                    <p className="text-3xl font-bold text-black">
                      No reviews . . . yet!
                    </p>
                    <p className="mt-3 text-lg text-black">
                      Be the first to leave a review!
                    </p>
                  </div>
                )}
              </div>
            )}
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
              selectedWeight={selectedWeight}
              selectedBulkOption={
                selectedBulkOption ? parseInt(selectedBulkOption) : undefined
              }
              discountCode={appliedDiscount > 0 ? discountCode : undefined}
              discountPercentage={
                appliedDiscount > 0 ? appliedDiscount : undefined
              }
              originalPrice={currentPrice}
              isSubscription={hasSubscription && isSubscriptionSelected}
              subscriptionFrequency={
                hasSubscription && isSubscriptionSelected
                  ? selectedFrequency
                  : undefined
              }
              subscriptionDiscount={
                hasSubscription && isSubscriptionSelected
                  ? productData.subscriptionDiscount
                  : undefined
              }
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
        <RawEventModal
          isOpen={showRawEventModal}
          onClose={() => setShowRawEventModal(false)}
          rawEvent={rawEvent}
        />
        <EventIdModal
          isOpen={showEventIdModal}
          onClose={() => setShowEventIdModal(false)}
          rawEvent={rawEvent}
        />
        <FreeShippingNotification
          isVisible={showFreeShippingNotification}
          onClose={() => setShowFreeShippingNotification(false)}
          shopData={shopMapContext.shopData}
          cart={cart}
        />
      </div>
    </div>
  );
}
