import { ShippingOptionsType } from "@/utils/STATIC-VARIABLES";
import { calculateTotalCost } from "@/components/utility-components/display-monetary-info";
import { NostrEvent } from "@/utils/types/types";

type NostrMarketplaceShipping = {
  id?: string;
  cost?: number;
};

type NostrMarketplaceProductContent = {
  id?: string;
  stall_id?: string;
  name?: string;
  description?: string;
  images?: string[];
  currency?: string;
  price?: number;
  quantity?: number | null;
  specs?: [string, string][];
  shipping?: NostrMarketplaceShipping[];
};

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
  bulkPrices?: Map<number, number>;
  selectedBulkOption?: number;
  bulkPrice?: number;
  required?: string;
  restrictions?: string;
  pickupLocations?: string[];
  expiration?: number;
  rawEvent?: NostrEvent;
};

export function getMarketplaceEventDTag(event: NostrEvent): string | undefined {
  return event.tags?.find((tag: string[]) => tag[0] === "d")?.[1];
}

export function getMarketplaceEventKey(event: NostrEvent): string {
  if (event.kind === 30402 || event.kind === 30018) {
    const dTag = getMarketplaceEventDTag(event);
    if (dTag) return `${event.pubkey}:${dTag}`;
  }

  return event.id;
}

function mapNip15ShippingToShopstrShipping(
  shipping?: NostrMarketplaceShipping[]
): Pick<ProductData, "shippingType" | "shippingCost"> {
  if (!shipping?.length) {
    return {
      shippingType: "N/A",
      shippingCost: 0,
    };
  }

  const firstZone = shipping[0];
  const shippingCost = Number(firstZone?.cost || 0);

  if (shippingCost <= 0) {
    return {
      shippingType: "Free",
      shippingCost: 0,
    };
  }

  return {
    shippingType: "Added Cost",
    shippingCost,
  };
}

function applyNip15Specs(
  parsedData: ProductData,
  specs: [string, string][] = []
) {
  specs.forEach(([key, value]) => {
    switch (key) {
      case "location":
        parsedData.location = value;
        break;
      case "condition":
        parsedData.condition = value;
        break;
      case "status":
        parsedData.status = value;
        break;
      case "required":
        parsedData.required = value;
        break;
      case "restrictions":
        parsedData.restrictions = value;
        break;
      case "size":
        if (!parsedData.sizes) parsedData.sizes = [];
        parsedData.sizes.push(value);
        break;
      case "size_quantity": {
        const [size, quantity] = value.split(":");
        if (size && quantity) {
          if (!parsedData.sizeQuantities) {
            parsedData.sizeQuantities = new Map<string, number>();
          }
          parsedData.sizeQuantities.set(size, Number(quantity));
        }
        break;
      }
      case "volume": {
        const [volume, price] = value.split(":");
        if (!parsedData.volumes) parsedData.volumes = [];
        if (!parsedData.volumePrices) {
          parsedData.volumePrices = new Map<string, number>();
        }
        if (volume) {
          parsedData.volumes.push(volume);
          if (price) {
            parsedData.volumePrices.set(volume, Number(price));
          }
        }
        break;
      }
      case "bulk": {
        const [units, price] = value.split(":");
        if (units && price) {
          if (!parsedData.bulkPrices) {
            parsedData.bulkPrices = new Map<number, number>();
          }
          parsedData.bulkPrices.set(Number(units), Number(price));
        }
        break;
      }
      case "pickup_location":
        if (!parsedData.pickupLocations) parsedData.pickupLocations = [];
        parsedData.pickupLocations.push(value);
        break;
      case "expiration":
        parsedData.expiration = Number(value);
        break;
      default:
        break;
    }
  });
}

function parseNip15ProductEvent(productEvent: NostrEvent) {
  let content: NostrMarketplaceProductContent;
  try {
    content = JSON.parse(productEvent.content || "{}");
  } catch {
    return undefined;
  }

  const tags = productEvent.tags || [];

  const parsedData: ProductData = {
    id: productEvent.id,
    pubkey: productEvent.pubkey,
    createdAt: productEvent.created_at,
    title: content.name || "",
    summary: content.description || "",
    publishedAt: String(productEvent.created_at),
    images: content.images || [],
    categories: tags
      .filter((tag) => tag[0] === "t" && tag[1])
      .map((tag) => tag[1]!),
    location: "",
    price: Number(content.price || 0),
    currency: content.currency || "",
    totalCost: 0,
    d: getMarketplaceEventDTag(productEvent) || content.id,
    quantity:
      typeof content.quantity === "number" ? content.quantity : undefined,
    rawEvent: productEvent,
  };

  const shipping = mapNip15ShippingToShopstrShipping(content.shipping);
  parsedData.shippingType = shipping.shippingType;
  parsedData.shippingCost = shipping.shippingCost;

  applyNip15Specs(parsedData, content.specs);

  parsedData.totalCost = calculateTotalCost(parsedData);
  return parsedData;
}

export const parseTags = (productEvent: NostrEvent) => {
  if (productEvent.kind === 30018) {
    return parseNip15ProductEvent(productEvent);
  }

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
    rawEvent: productEvent,
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
      case "bulk":
        if (!parsedData.bulkPrices) {
          parsedData.bulkPrices = new Map<number, number>();
        }
        if (values[0] && values[1]) {
          parsedData.bulkPrices.set(parseInt(values[0]), parseFloat(values[1]));
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
