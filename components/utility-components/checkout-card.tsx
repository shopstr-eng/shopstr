import React, { useEffect, useRef, useState } from "react";
import { ProductData } from "../utility/product-parser-functions";
import { ProfileWithDropdown } from "./profile/profile-dropdown";
import { getLocalStorageData } from "../utility/nostr-helper-functions";
import CompactPriceDisplay, {
  DisplayCostBreakdown,
} from "./display-monetary-info";
import InvoiceCard from "../invoice-card";
import { SHOPSTRBUTTONCLASSNAMES } from "../../components/utility/STATIC-VARIABLES";
import { Button } from "@nextui-org/react";
import { InformationCircleIcon } from "@heroicons/react/24/outline";
import Link from "next/link";

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
  setCashuPaymentFailed?: (cashuPaymentFailef: boolean) => void;
  uniqueKey?: string;
}) {
  if (!productData) return null;
  const { title, images, pubkey, summary } = productData;

  const [isExpanded, setIsExpanded] = useState(false);
  const [isBeingPaid, setIsBeingPaid] = useState(false);
  const [visibleImages, setVisibleImages] = useState<string[]>([]);
  const [showAllImages, setShowAllImages] = useState(false);
  const [selectedImage, setSelectedImage] = useState(images[0]);

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

  const toggleBuyNow = () => {
    setIsBeingPaid(!isBeingPaid);
  };

  return (
    <>
      {!isBeingPaid ? (
        <div className="h-[100%] w-[100%]">
          <div
            className="max-w-screen mx-3 my-3 flex flex-row whitespace-normal break-words"
            key={uniqueKey}
          >
            <div className="w-2/3 pr-4">
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
            <div className="w-1/3 p-3">
              <ProfileWithDropdown
                pubkey={pubkey}
                dropDownKeys={
                  pubkey === getLocalStorageData().userPubkey
                    ? ["shop_settings"]
                    : ["shop", "message"]
                }
              />
              <h2 className="mt-4 w-full text-left text-2xl font-bold text-light-text dark:text-dark-text">
                {title}
              </h2>
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
                <CompactPriceDisplay monetaryInfo={productData} />
              </div>
              <Button
                className={SHOPSTRBUTTONCLASSNAMES}
                onClick={toggleBuyNow}
              >
                Buy Now
              </Button>
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
      ) : (
        <>
          <div className="p-4 text-light-text dark:text-dark-text">
            <h2 className="mb-4 text-2xl font-bold">{title}</h2>
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
          </div>
          <div className="flex flex-col items-center">
            <InvoiceCard
              productData={productData}
              setInvoiceIsPaid={setInvoiceIsPaid}
              setInvoiceGenerationFailed={setInvoiceGenerationFailed}
              setCashuPaymentSent={setCashuPaymentSent}
              setCashuPaymentFailed={setCashuPaymentFailed}
            />
          </div>
        </>
      )}
    </>
  );
}
