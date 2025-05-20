import React from "react";
import { ProductData } from "@/utils/parsers/product-parser-functions";
import CheckoutCard from "./utility-components/checkout-card";

export default function ListingPage({
  productData,
  setFiatOrderIsPlaced,
  setInvoiceIsPaid,
  setInvoiceGenerationFailed,
  setCashuPaymentSent,
  setCashuPaymentFailed,
}: {
  productData: ProductData;
  setFiatOrderIsPlaced?: (fiatOrderIsPlaced: boolean) => void;
  setInvoiceIsPaid?: (invoiceIsPaid: boolean) => void;
  setInvoiceGenerationFailed?: (invoiceGenerationFailed: boolean) => void;
  setCashuPaymentSent?: (cashuPaymentSent: boolean) => void;
  setCashuPaymentFailed?: (cashuPaymentFailed: boolean) => void;
}) {
  if (!productData) return null;

  return (
    <div className="flex w-full items-center justify-center bg-light-bg dark:bg-dark-bg">
      <div className="flex flex-col">
        <CheckoutCard
          productData={productData}
          setFiatOrderIsPlaced={setFiatOrderIsPlaced}
          setInvoiceIsPaid={setInvoiceIsPaid}
          setInvoiceGenerationFailed={setInvoiceGenerationFailed}
          setCashuPaymentSent={setCashuPaymentSent}
          setCashuPaymentFailed={setCashuPaymentFailed}
        />
      </div>
    </div>
  );
}
