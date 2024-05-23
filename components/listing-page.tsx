import React from "react";
import { ProductData } from "./utility/product-parser-functions";
import { Divider } from "@nextui-org/react";
import ProductCard from "./utility-components/product-card";
import InvoiceCard from "./invoice-card";

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

  const invoiceDisplay = () => {
    return (
      <div className="flex w-full flex-col items-center">
        <Divider />
        <InvoiceCard
          productData={productData}
          setInvoiceIsPaid={setInvoiceIsPaid}
          setInvoiceGenerationFailed={setInvoiceGenerationFailed}
          setCashuPaymentSent={setCashuPaymentSent}
          setCashuPaymentFailed={setCashuPaymentFailed}
        />
      </div>
    );
  };
  return (
    <div className="flex w-full items-center justify-center bg-light-bg dark:bg-dark-bg">
      <div className="flex w-full flex-col md:w-[50%]">
        <ProductCard
          productData={productData}
          isReview
          footerContent={invoiceDisplay()}
        />
      </div>
    </div>
  );
}
