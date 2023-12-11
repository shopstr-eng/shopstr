import { ShippingOptionsType } from "./STATIC-VARIABLES";
import { calculateTotalCost } from "../utility-components/display-monetary-info";
import { NostrEvent } from "@/pages/components/utility/nostr-helper-functions";

export type ProductData = {
  id: string;
  pubkey: string;
  createdAt: number;
  title: string;
  summary: string;
  publishedAt: string;
  images: string[];
  categories: string[];
  location: string;
  price: number;
  currency: string;
  shippingType?: ShippingOptionsType;
  shippingCost?: number;
  totalCost: number;
};

export const parseTags = (productEvent: NostrEvent) => {
  let parsedData: ProductData = {};
  parsedData.pubkey = productEvent.pubkey;
  parsedData.id = productEvent.id;
  parsedData.createdAt = productEvent.created_at;
  const tags = productEvent.tags;
  if (tags === undefined) return;
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
        if (parsedData.categories === undefined) parsedData.categories = [];
        parsedData.categories.push(values[0]);
        break;
      case "location":
        parsedData.location = values[0];
        break;
      case "price":
        const [amount, currency] = values;
        parsedData.price = Number(amount);
        parsedData.currency = currency;
        break;
      case "shipping":
        if (values.length === 3) {
          const [type, cost, currency] = values;
          parsedData.shippingType = type;
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
          const [type] = values;
          parsedData.shippingType = type;
          parsedData.shippingCost = 0;
          break;
        }
        break;
      default:
        return;
    }
  });
  parsedData.totalCost = calculateTotalCost(parsedData);
  return parsedData;
};

export default parseTags;
