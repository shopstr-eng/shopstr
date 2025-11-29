import { ShippingOptionsType } from "@/utils/STATIC-VARIABLES";
import { calculateTotalCost } from "@/components/utility-components/display-monetary-info";
import { NostrEvent } from "@/utils/types/types";

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
  d?: string;
  contentWarning?: boolean;
  quantity?: number;
  sizes?: string[];
  sizeQuantities?: Map<string, number>;
  volumes?: string[];
  volumePrices?: Map<string, number>;
  condition?: string;
  status?: string;
  selectedSize?: string;
  selectedQuantity?: number;
  selectedVolume?: string;
  volumePrice?: number;
  required?: string;
  restrictions?: string;
  pickupLocations?: string[];
  expiration?: number;
};

export const parseTags = (productEvent: NostrEvent) => {
  const parsedData: ProductData = {
    id: "",
    pubkey: "",
    createdAt: 0,
    title: "",
    summary: "",
    publishedAt: "",
    images: [],
    categories: [],
    location: "",
    price: 0,
    currency: "",
    totalCost: 0,
  };
  parsedData.pubkey = productEvent.pubkey;
  parsedData.id = productEvent.id;
  parsedData.createdAt = productEvent.created_at;
  const tags = productEvent.tags;
  if (tags === undefined) return;
  tags.forEach((tag) => {
    const [key, ...values] = tag;
    switch (key) {
      case "title":
        parsedData.title = values[0]!;
        break;
      case "summary":
        parsedData.summary = values[0]!;
        break;
      case "published_at":
        parsedData.publishedAt = values[0]!;
        break;
      case "image":
        if (parsedData.images === undefined) parsedData.images = [];
        parsedData.images.push(values[0]!);
        break;
      case "t":
        if (parsedData.categories === undefined) parsedData.categories = [];
        parsedData.categories.push(values[0]!);
        break;
      case "location":
        parsedData.location = values[0]!;
        break;
      case "price":
        const [amount, currency] = values;
        parsedData.price = Number(amount);
        parsedData.currency = currency!;
        break;
      case "shipping":
        if (values.length === 3) {
          const [shippingType, cost, _currency] = values;
          parsedData.shippingType = shippingType as ShippingOptionsType;
          parsedData.shippingCost = Number(cost);
          break;
        }
        // TODO Deprecate Below after 11/07/2023
        else if (values.length === 2) {
          // [cost, currency]
          const [cost, _currency] = values;
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
        parsedData.contentWarning = true;
        break;
      case "L":
        const LValue = values[0];
        if (LValue === "content-warning") {
          parsedData.contentWarning = true;
        }
        break;
      case "l":
        const lValue = values[1];
        if (lValue === "content-warning") {
          parsedData.contentWarning = true;
        }
        break;
      case "quantity":
        parsedData.quantity = Number(values[0]);
        break;
      case "size":
        const [size, quantity] = values;
        if (parsedData.sizes === undefined) parsedData.sizes = [];
        parsedData.sizes?.push(size!);
        if (parsedData.sizeQuantities === undefined)
          parsedData.sizeQuantities = new Map<string, number>();
        parsedData.sizeQuantities.set(size!, Number(quantity));
        break;
      case "volume":
        if (!parsedData.volumes) {
          parsedData.volumes = [];
          parsedData.volumePrices = new Map<string, number>();
        }
        if (values[0]) {
          parsedData.volumes.push(values[0]);
          if (values[1]) {
            parsedData.volumePrices!.set(values[0], parseFloat(values[1]));
          }
        }
        break;
      case "condition":
        parsedData.condition = values[0];
        break;
      case "status":
        parsedData.status = values[0];
        break;
      case "required":
        parsedData.required = values[0];
        break;
      case "restrictions":
        parsedData.restrictions = values[0];
        break;
      case "pickup_location":
        if (parsedData.pickupLocations === undefined)
          parsedData.pickupLocations = [];
        parsedData.pickupLocations.push(values[0]!);
        break;
      case "valid_until":
        parsedData.expiration = Number(values[0]);
        break;
      default:
        return;
    }
  });
  parsedData.totalCost = calculateTotalCost(parsedData);
  return parsedData;
};

export default parseTags;
