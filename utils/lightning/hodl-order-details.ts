/** Snapshot bound to the invoice at registration, before the buyer can pay. */
export type HodlOrderDetails = {
  productId: string;
  quantity?: number;
  productAddress: string;
  productTitle: string;
  selectedSize?: string;
  selectedVolume?: string;
  selectedWeight?: string;
  selectedBulkOption?: number;
  fulfillment?: HodlFulfillment;
};
export type HodlFulfillment = {
  address?: string;
  pickupLocation?: string;
  contact?: string;
  additionalInfo?: string;
};
export function parseHodlFulfillment(
  value: unknown
): HodlFulfillment | undefined {
  if (value === undefined) return undefined;
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Invalid fulfillment details");
  const result: HodlFulfillment = {};
  for (const [key, item] of Object.entries(value)) {
    if (
      !["address", "pickupLocation", "contact", "additionalInfo"].includes(
        key
      ) ||
      typeof item !== "string" ||
      item.length > 4000
    )
      throw new Error("Invalid fulfillment details");
    if (item.trim()) result[key as keyof HodlFulfillment] = item.trim();
  }
  return result;
}

/** Stable JSON for validated checkout fields; shared by browser retries and DB commitments. */
export function serializeHodlCheckout(value: unknown): string {
  if (Array.isArray(value))
    return `[${value.map(serializeHodlCheckout).join(",")}]`;
  if (value && typeof value === "object")
    return `{${Object.entries(value)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${JSON.stringify(k)}:${serializeHodlCheckout(v)}`)
      .join(",")}}`;
  return JSON.stringify(value);
}
