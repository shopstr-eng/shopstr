import React from "react";
import Head from "next/head";
import { ProductData } from "./utility/product-parser-functions";
import { Divider } from "@nextui-org/react";
import ProductCard from "./utility-components/product-card";
import InvoiceCard from "./invoice-card";

export default function ListingPage({
  productData,
}: {
  productData: ProductData;
}) {
  if (!productData) return null;
  const {
    createdAt,
    title,
    summary,
    publishedAt,
    images,
    categories,
    location,
    price,
    currency,
    shippingType,
    shippingCost,
    totalCost,
  } = productData;

  const invoiceDisplay = () => {
    return (
      <div className="flex w-full flex-col items-center">
        <Divider />
        <InvoiceCard productData={productData} />
      </div>
    );
  };
  return (
    <div className="">
      <Head>
        <title>Shopstr</title>
        <meta name="description" content={title} />

        <meta
          property="og:url"
          content={`https://shopstr.store/listing/${productData.id}`}
        />
        <meta property="og:type" content="website" />
        <meta property="og:title" content="Shopstr" />
        <meta property="og:description" content={title} />
        <meta property="og:image" content={images[0]} />

        <meta name="twitter:card" content="summary_large_image" />
        <meta property="twitter:domain" content="shopstr.store" />
        <meta
          property="twitter:url"
          content={`https://shopstr.store/listing/${productData.id}`}
        />
        <meta name="twitter:title" content="Shopstr" />
        <meta name="twitter:description" content={title} />
        <meta name="twitter:image" content={images[0]} />
      </Head>
      <div className="flex w-full items-center justify-center bg-light-bg dark:bg-dark-bg">
        <div className="flex w-[50%] flex-col sm:w-full ">
          <ProductCard
            productData={productData}
            isReview
            footerContent={invoiceDisplay()}
          />
        </div>
      </div>
    </div>
  );
}
