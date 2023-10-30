import React from "react";
import { ShippingOptionsType } from "../utility/STATIC-VARIABLES";

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
    else if (shippingType == "Free/Pickup") return "- Free Shipping / Pickup";
    else return "";
  };

  const formatter = new Intl.NumberFormat("en-GB", {
    notation: "compact",
    compactDisplay: "short",
  });
  return (
    <div className=" bg-black max-w-[70%] h-[30px] text-cyan-50 px-3 rounded-md opacity-50 inline-block overflow-hidden whitespace-nowrap text-ellipsis">
      <span className="font-semibold ">
        {formatter.format(Number(price))} {currency}{" "}
        {monetaryInfo.shippingType ? getShippingLabel() : ""}{" "}
      </span>
    </div>
  );
}

export function DisplayCostBreakdown({
  monetaryInfo,
}: {
  monetaryInfo: ProductMonetaryInfo;
}) {
  const { shippingType, shippingCost, price, currency } = monetaryInfo;
  const totalCost = calculateTotalCost(monetaryInfo);
  return (
    <div>
      <p>
        <strong className="font-semibold">Price:</strong> {price} {currency}
      </p>
      {shippingType && (
        <p>
          <strong className="font-semibold">Shipping:</strong>
          {` ${shippingType} - ${shippingCost} ${currency}`}
        </p>
      )}

      {totalCost && (
        <p>
          <strong className="font-semibold">Total Cost:</strong> {totalCost}{" "}
          {currency}
        </p>
      )}
    </div>
  );
}

export const calculateTotalCost = (
  productMonetaryInfo: ProductMonetaryInfo,
) => {
  const { price, shippingCost } = productMonetaryInfo;
  let total = price;
  total += shippingCost ? shippingCost : 0;
  return total;
};
