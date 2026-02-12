import React from "react";
import { ShippingOptionsType } from "@/utils/STATIC-VARIABLES";

type ProductMonetaryInfo = {
  shippingType?: ShippingOptionsType;
  shippingCost?: number;
  price: number;
  currency: string;
};

export default function CompactPriceDisplay({
  monetaryInfo,
}: {
  monetaryInfo: ProductMonetaryInfo;
}) {
  const { shippingType, shippingCost, price, currency } = monetaryInfo;

  const getShippingLabel = () => {
    if (shippingType === "Added Cost")
      return `+ ${formatter.format(Number(shippingCost))} ${currency} Shipping`;
    else if (shippingType === "Free") return "- Free Shipping";
    else if (shippingType === "Pickup") return "- Pickup Only";
    else if (shippingType == "Free/Pickup") return "- Free / Pickup";
    else return "";
  };

  const formatter = new Intl.NumberFormat("en-GB", {
    notation: "compact",
    compactDisplay: "short",
  });
  return (
    <span className="whitespace-nowrap font-bold">
      {formatter.format(Number(price))} {currency}{" "}
      {monetaryInfo.shippingType ? getShippingLabel() : ""}{" "}
    </span>
  );
}

export function DisplayCheckoutCost({
  monetaryInfo,
}: {
  monetaryInfo: ProductMonetaryInfo;
}) {
  const { shippingType, price, currency } = monetaryInfo;

  const formattedPrice = formatWithCommas(price, currency);

  return (
    <div className="flex flex-col gap-0.5">
      <p className="text-xl md:text-2xl font-black tracking-tight text-white">
        {formattedPrice}
      </p>
      {shippingType && (
        <p className="mb-2 text-xs md:text-sm font-bold uppercase tracking-wider text-zinc-500">
          Shipping: {shippingType}
        </p>
      )}
    </div>
  );
}

export const calculateTotalCost = (
  productMonetaryInfo: ProductMonetaryInfo
) => {
  const { price, shippingCost } = productMonetaryInfo;
  let total = price;
  total += shippingCost ? shippingCost : 0;
  return total;
};

export function formatWithCommas(amount: number, currency: string) {
  if (!amount || amount === 0) {
    // If the amount is 0, directly return "0" followed by the currency
    return `0 ${currency}`;
  }
  const [integerPart, fractionalPart] = amount.toString().split(".");
  // Add commas to the integer part
  const integerWithCommas = integerPart!.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  // Concatenate the fractional part if it exists
  const formattedAmount = fractionalPart
    ? `${integerWithCommas}.${fractionalPart}`
    : integerWithCommas;
  return `${formattedAmount} ${currency}`;
}