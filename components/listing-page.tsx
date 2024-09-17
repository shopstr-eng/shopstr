import React from "react";
import { ProductData } from "./utility/product-parser-functions";
import CheckoutCard from "./utility-components/checkout-card";

export default function ListingPage({
  productData,
  setInvoiceIsPaid,
  setInvoiceGenerationFailed,
  setCashuPaymentSent,
  setCashuPaymentFailed,
}: {
  productData: ProductData;
  setInvoiceIsPaid?: (invoiceIsPaid: boolean) => void;
  setInvoiceGenerationFailed?: (invoiceGenerationFailed: boolean) => void;
  setCashuPaymentSent?: (cashuPaymentSent: boolean) => void;
  setCashuPaymentFailed?: (cashuPaymentFailef: boolean) => void;
}) {
  if (!productData) return null;

  return (
    <div className="flex w-full items-center justify-center bg-light-bg dark:bg-dark-bg">
      <div className="flex flex-col">
        <CheckoutCard
          productData={productData}
          setInvoiceIsPaid={setInvoiceIsPaid}
          setInvoiceGenerationFailed={setInvoiceGenerationFailed}
          setCashuPaymentSent={setCashuPaymentSent}
          setCashuPaymentFailed={setCashuPaymentFailed}
        />
      </div>
    </div>
  );
}
