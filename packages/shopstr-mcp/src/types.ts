import type { Event, Filter } from "nostr-tools";

export type NostrEvent = Event;
export type NostrFilter = Filter;

export type ShippingOptionsType =
  | "N/A"
  | "Free"
  | "Pickup"
  | "Free/Pickup"
  | "Added Cost";

export type PricingBlock = {
  amount: number;
  currency: string;
  unit: "per item";
  shippingCost: number | null;
  shippingType: ShippingOptionsType | "N/A";
  totalEstimate: number;
  paymentMethods: string[];
};

export type PriceStatus = "known" | "missing" | "invalid";

export type ProductImage = {
  url: string;
  dimensions?: string;
  order?: number;
};

export type ShippingOptionRef = {
  reference: string;
  extraCost?: number;
};

export type ProductResponse = {
  id: string;
  pubkey: string;
  d?: string;
  title: string;
  summary: string;
  publishedAt?: string;
  images: ProductImage[];
  categories: string[];
  location: string;
  price?: number;
  currency?: string;
  priceStatus: PriceStatus;
  productType?: "simple" | "variable" | "variation";
  productFormat?: "digital" | "physical";
  visibility?: "hidden" | "on-sale" | "pre-order";
  shippingType?: ShippingOptionsType;
  shippingCost?: number;
  shippingOptions?: ShippingOptionRef[];
  stock?: number;
  quantity?: number;
  condition?: string;
  status?: string;
  sizes?: Array<{ size: string; quantity?: number }>;
  volumes?: Array<{ volume: string; price?: number }>;
  weights?: Array<{ weight: string; price?: number }>;
  bulk?: Array<{ units: number; price: number }>;
  pickupLocations?: string[];
  requiredCustomerInfo?: string;
  required?: string;
  restrictions?: string;
  expiration?: number;
  contentWarning?: boolean;
  createdAt: number;
  pricing?: PricingBlock;
  subscription: {
    enabled: boolean;
    discount?: number;
    frequencies: string[];
  };
};

export type ProfileResponse = {
  pubkey: string;
  kind: number;
  name: string;
  about: string;
  picture: string;
  banner: string;
  lud16: string;
  nip05: string;
  createdAt: number;
  website?: string;
  fiat_options?: unknown;
  payment_preference?: unknown;
  paymentMethodDiscounts?: unknown;
  freeShippingThreshold?: unknown;
  freeShippingCurrency?: string;
  storefront?: unknown;
  storefrontUrl?: string;
};

export type ReviewResponse = {
  id: string;
  pubkey: string;
  d?: string;
  content: string;
  ratings: Record<string, number>;
  createdAt: number;
};

export type RelayFailure = {
  url: string;
  error: string;
};

export type RelayFetchMeta = {
  relaysQueried: string[];
  relaysSucceeded: string[];
  relaysFailed: RelayFailure[];
  degraded: boolean;
  coverage: number;
  responseTimeMs: number;
  eventCount: number;
};
