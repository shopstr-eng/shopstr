import { CurrencyType, ShippingOptionsType } from "./STATIC-VARIABLES";
import { calculateTotalCost } from "../utility-components/display-monetary-info";
import { NostrEvent } from "@/utils/types/types";

export type ProductData = {
  id: string;
  pubkey: string;
  createdAt: number;
  title: string;
  summary: string;
  publishedAt: string;
  images: string[];
  categories: Set<string>;
  location: {
    displayName: string;
    countryName: string;
    countryCode: string;
    regionName: string;
    regionCode: string;
  };
  price: number;
  currency: CurrencyType;
  shippingType?: ShippingOptionsType;
  shippingCost?: number;
  totalCost: number;
  d?: string;
  warning: boolean;
};

export const parseTags = (productEvent: NostrEvent) => {
  let parsedData: ProductData = {
    id: "",
    pubkey: "",
    createdAt: 0,
    title: "",
    summary: "",
    publishedAt: "",
    images: [],
    categories: new Set<string>(),
    location: {
      displayName: "",
      countryName: "",
      countryCode: "",
      regionName: "",
      regionCode: "",
    },
    price: 0,
    currency: "SATS",
    totalCost: 0,
    warning: false,
  };
  parsedData.pubkey = productEvent.pubkey;
  parsedData.id = productEvent.id;
  parsedData.createdAt = productEvent.created_at;
  const tags = productEvent.tags;
  tags.forEach((tag) => {
    const [key, ...values] = tag;
    switch (key) {
      case "title":
        parsedData.title = values[0];
        break;
      case "summary":
        parsedData.summary = values[0];
        break;
      case "published_at":
        parsedData.publishedAt = values[0];
        break;
      case "image":
        if (parsedData.images === undefined) parsedData.images = [];
        parsedData.images.push(values[0]);
        break;
      case "t":
        if (parsedData.categories === undefined)
          parsedData.categories = new Set<string>();
        parsedData.categories.add(values[0]);
        break;
      case "location":
        parsedData.location.displayName = values[0];
        break;
      case "g":
        if (values[1] === "countryName") {
          parsedData.location.countryName = values[0];
        } else if (values[1] === "countryCode") {
          parsedData.location.countryCode = values[0];
        } else if (values[1] === "regionName") {
          parsedData.location.regionName = values[0];
        } else if (values[1] === "regionCode") {
          parsedData.location.regionCode = values[0];
        }
        break;
      case "price":
        const [amount, currency] = values;
        parsedData.price = Number(amount);
        parsedData.currency = currency as CurrencyType;
        break;
      case "shipping":
        if (values.length === 3) {
          const [shippingType, cost, currency] = values;
          parsedData.shippingType = shippingType as ShippingOptionsType;
          parsedData.shippingCost = Number(cost);
          break;
        }
        // TODO Deprecate Below after 11/07/2023
        else if (values.length === 2) {
          // [cost, currency]
          const [cost, currency] = values;
          parsedData.shippingType = "Added Cost";
          parsedData.shippingCost = Number(cost);
          break;
        } else if (values.length === 1) {
          // [type]
          const [shippingType] = values;
          parsedData.shippingType = shippingType as ShippingOptionsType;
          parsedData.shippingCost = 0;
          break;
        }
        break;
      case "d":
        parsedData.d = values[0];
        break;
      case "content-warning":
        parsedData.warning = values[0].length > 0;
        break;
      default:
        return;
    }
  });
  parsedData.totalCost = calculateTotalCost(parsedData);
  return parsedData;
};

export default parseTags;
