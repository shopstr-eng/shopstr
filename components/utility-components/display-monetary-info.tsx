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

  const formatter = new Intl.NumberFormat("en-GB", {
    notation: "compact",
    compactDisplay: "short",
  });

  const getShippingLabel = () => {
    if (shippingType === "Added Cost")
      return `+ ${formatter.format(Number(shippingCost))} ${currency}`;
    else if (shippingType === "Free") return "Free Ship";
    else if (shippingType === "Pickup") return "Pickup Only";
    else if (shippingType == "Free/Pickup") return "Free/Pickup";
    else if (shippingType == "Added Cost/Pickup")
      return `+ ${formatter.format(Number(shippingCost))} ${currency}`;
    else return "";
  };

  return (
    <div className="flex min-w-0 flex-col items-start gap-1">
      <div className="shadow-neo inline-flex items-center rounded-md border-2 border-black bg-black px-2 py-1">
        <span className="text-xs font-bold whitespace-nowrap text-white">
          {formatter.format(Number(price))} {currency}
        </span>
      </div>
      {monetaryInfo.shippingType && (
        <div className="w-full max-w-[120px] text-left text-[10px] font-semibold text-black">
          <span className="block truncate px-1">{getShippingLabel()}</span>
        </div>
      )}
    </div>
  );
}

export function DisplayCheckoutCost({
  monetaryInfo,
  satsEstimate,
}: {
  monetaryInfo: ProductMonetaryInfo;
  satsEstimate?: number | null;
}) {
  const { shippingType, price, currency } = monetaryInfo;

  const formattedPrice = formatWithCommas(price, currency);
  const isSats =
    currency.toLowerCase() === "sats" || currency.toLowerCase() === "sat";

  return (
    <div className="shadow-neo rounded-md border-2 border-black bg-white p-4">
      <p className="text-2xl font-bold text-black">{formattedPrice}</p>
      {!isSats && satsEstimate != null && (
        <p className="mt-1 text-sm text-gray-500">
          ≈ {formatWithCommas(satsEstimate, "sats")}
        </p>
      )}
      {shippingType && (
        <p className="mt-1 text-sm font-semibold text-blue-600">
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

const SATS_CURRENCIES = new Set(["sats", "sat", "satoshi"]);
const ZERO_DECIMAL_FIAT = new Set([
  "bif",
  "clp",
  "djf",
  "gnf",
  "jpy",
  "kmf",
  "krw",
  "mga",
  "pyg",
  "rwf",
  "ugx",
  "vnd",
  "vuv",
  "xaf",
  "xof",
  "xpf",
]);

export function formatWithCommas(amount: number, currency: string) {
  const cur = (currency || "").toLowerCase();
  const isWholeUnit = SATS_CURRENCIES.has(cur) || ZERO_DECIMAL_FIAT.has(cur);
  const isBtc = cur === "btc";

  if (!amount || amount === 0) {
    return `0 ${currency}`;
  }

  let normalized: number;
  if (isWholeUnit) {
    normalized = Math.ceil(amount);
  } else if (isBtc) {
    // BTC has 1-satoshi precision (8 decimals)
    normalized = Math.ceil(amount * 100000000) / 100000000;
  } else {
    normalized = Math.ceil(amount * 100) / 100;
  }

  const fixed = isWholeUnit
    ? normalized.toString()
    : isBtc
      ? normalized.toFixed(8).replace(/\.?0+$/, "")
      : normalized.toFixed(2);

  const [integerPart, fractionalPart] = fixed.split(".");
  const integerWithCommas = integerPart!.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const formattedAmount = fractionalPart
    ? `${integerWithCommas}.${fractionalPart}`
    : integerWithCommas;
  return `${formattedAmount} ${currency}`;
}
