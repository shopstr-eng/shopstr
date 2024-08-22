import React, { useState } from "react";
import { ProductData } from "../utility/product-parser-functions";
import { ProfileWithDropdown } from "./profile/profile-dropdown";
import { getLocalStorageData } from "../utility/nostr-helper-functions";
import CompactPriceDisplay, {
  DisplayCostBreakdown,
} from "./display-monetary-info";
import InvoiceCard from "../invoice-card";
import ImageCarousel from "./image-carousel";
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
  const [isExpanded, setIsExpanded] = useState(false);
  const [isBeingPaid, setIsBeingPaid] = useState(false);
  const [expandedImageSrc, setExpandedImageSrc] = useState<string | null>(null);

  if (!productData) return null;
  const { title, images, pubkey, summary } = productData;

  const toggleExpand = () => {
    setIsExpanded(!isExpanded);
  };

  const renderSummary = () => {
    if (summary.length <= SUMMARY_CHARACTER_LIMIT || isExpanded) {
      return summary;
    }
    return `${summary.slice(0, SUMMARY_CHARACTER_LIMIT)}...`;
  };

  const toggleBuyNow = () => {
    setIsBeingPaid(!isBeingPaid);
  };

  const handleImageClick = (src: string) => {
    setExpandedImageSrc(src);
  };

  const closeModal = () => {
    setExpandedImageSrc(null);
  };

  return (
    <>
      {expandedImageSrc && (
        <div
          className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-75 z-50"
          onClick={closeModal}
        >
          <img src={expandedImageSrc} alt="Expanded product" className="max-w-full max-h-full" />
        </div>
      )}
      {!isBeingPaid ? (
        <div className="mx-[2.5px] my-3 flex w-full flex-row" key={uniqueKey}>
          <div className="mb-4 w-full pr-0 sm:mb-0 sm:w-1/2 sm:pr-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {images.map((image, index) => (
                <img
                  key={index}
                  src={image}
                  alt={`Product image ${index + 1}`}
                  className="w-full object-cover"
                  style={{ aspectRatio: "1 / 1" }}
                  onClick={() => handleImageClick(image)}
                />
              ))}
            </div>
          </div>
          <div className="mt-4 flex w-full flex-col items-start sm:w-1/2 md:mt-0">
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
            <p className="mt-4 w-full text-left text-lg text-light-text dark:text-dark-text">
              {renderSummary()}
            </p>
            {summary.length > SUMMARY_CHARACTER_LIMIT && (
              <button
                onClick={toggleExpand}
                className="mt-2 text-yellow-500 hover:text-yellow-700 dark:text-purple-500 dark:hover:text-purple-700"
              >
                {isExpanded ? "Show less" : "Show more"}
              </button>
            )}
            <div className="mt-4">
              <CompactPriceDisplay monetaryInfo={productData} />
            </div>
            <Button className={SHOPSTRBUTTONCLASSNAMES} onClick={toggleBuyNow}>
              Buy Now
            </Button>
          </div>
        </div>
      ) : (
        <>
          <div className="text-light-text dark:text-dark-text">
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
          <InvoiceCard
            productData={productData}
            setInvoiceIsPaid={setInvoiceIsPaid}
            setInvoiceGenerationFailed={setInvoiceGenerationFailed}
            setCashuPaymentSent={setCashuPaymentSent}
            setCashuPaymentFailed={setCashuPaymentFailed}
          />
        </>
      )}
    </>
  );
}
