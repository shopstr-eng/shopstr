import { calculateTotalCost } from "@/components/utility-components/display-monetary-info";
import { ProductData } from "@/utils/parsers/product-types";
import { NostrEvent } from "@/utils/types/types";

import { CanonicalProductData } from "./base-parser";

export function toUiProductData(
  canonical: CanonicalProductData,
  rawEvent: NostrEvent
): ProductData {
  const {
    sizes,
    volumes,
    weights,
    bulk,
    requiredCustomerInfo: _requiredCustomerInfo,
    subscriptionEnabled: _subscriptionEnabled,
    subscriptionDiscount: _subscriptionDiscount,
    subscriptionFrequencies: _subscriptionFrequencies,
    ...uiCompatibleFields
  } = canonical;

  const parsedData: ProductData = {
    ...uiCompatibleFields,
    title: canonical.title ?? "",
    summary: canonical.summary ?? "",
    publishedAt: canonical.publishedAt ?? "",
    images: [...(canonical.images ?? [])],
    categories: [...(canonical.categories ?? [])],
    location: canonical.location ?? "",
    currency: canonical.currency ?? "",
    totalCost: 0,
    contentWarning: canonical.contentWarning || undefined,
    pickupLocations:
      canonical.pickupLocations && canonical.pickupLocations.length > 0
        ? [...canonical.pickupLocations]
        : undefined,
    rawEvent,
  };

  if (sizes && sizes.length > 0) {
    parsedData.sizes = sizes.map((s) => s.size);
    parsedData.sizeQuantities = new Map<string, number>();
    sizes.forEach((s) => {
      parsedData.sizeQuantities?.set(s.size, Number(s.quantity));
    });
  }

  if (volumes && volumes.length > 0) {
    parsedData.volumes = volumes.map((v) => v.volume);
    parsedData.volumePrices = new Map<string, number>();
    volumes.forEach((v) => {
      if (v.price !== undefined) {
        parsedData.volumePrices?.set(v.volume, v.price);
      }
    });
  }

  if (weights && weights.length > 0) {
    parsedData.weights = weights.map((w) => w.weight);
    parsedData.weightPrices = new Map<string, number>();
    weights.forEach((w) => {
      if (w.price !== undefined) {
        parsedData.weightPrices?.set(w.weight, w.price);
      }
    });
  }

  if (bulk && bulk.length > 0) {
    parsedData.bulkPrices = new Map<number, number>();
    bulk.forEach((tier) => {
      parsedData.bulkPrices?.set(tier.units, tier.price);
    });
  }

  parsedData.totalCost = calculateTotalCost(parsedData);
  return parsedData;
}
