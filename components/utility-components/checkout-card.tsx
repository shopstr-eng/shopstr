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
import { InformationCircleIcon } from "@heroicons/react/24/outline";
import Link from "next/link";
import { ShopMapContext } from "@/utils/context/context";
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

  const [showFailureModal, setShowFailureModal] = useState(false);
  const [failureText, setFailureText] = useState("");
  const [showSuccessModal, setShowSuccessModal] = useState(false);

  const [cart, setCart] = useState<ProductData[]>([]);

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
      setFailureText("You must be signed in to send a message!");
      setShowFailureModal(true);
      return;
    }
    router.push({
      pathname: "/messages",
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
                <ProfileWithDropdown
                  pubkey={pubkey}
                  dropDownKeys={
                    pubkey === userPubkey
                      ? ["shop_settings"]
                      : ["shop", "message"]
                  }
                />
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
                <div className="flex w-full gap-2">
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
        onClose={() => setShowSuccessModal(true)}
      />
    </>
  );
}
