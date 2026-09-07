export type HodlFulfillmentUpdate = {
  address?: string;
  status?: "shipped";
  tracking?: string;
  carrier?: string;
  eta?: string;
};

export function hodlDisplayStatus(
  payment: string,
  fulfillment?: string | null
) {
  if (payment === "open") return "pending";
  if (payment === "cancelled") return "canceled";
  if (payment === "settled") return "completed";
  return fulfillment === "shipped" ? "shipped" : "confirmed";
}

export function validateFulfillmentUpdate(
  input: unknown,
  role: string,
  payment: string,
  fulfillment?: string | null
): HodlFulfillmentUpdate {
  if (!input || typeof input !== "object" || Array.isArray(input))
    throw new Error("Invalid fulfillment update");
  const update = input as Record<string, unknown>;
  const allowed =
    role === "buyer"
      ? ["address"]
      : role === "seller"
        ? ["status", "tracking", "carrier", "eta"]
        : [];
  if (
    !Object.keys(update).length ||
    Object.keys(update).some((key) => !allowed.includes(key))
  )
    throw new Error("This update is not permitted");
  if (payment !== "accepted" && !(role === "buyer" && payment === "open"))
    throw new Error("Order cannot be changed in its current payment state");
  if (role === "buyer" && fulfillment === "shipped")
    throw new Error("Contact the seller to change an address after shipment");
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(update)) {
    if (typeof value !== "string" || !value.trim() || value.length > 4000)
      throw new Error("Invalid fulfillment details");
    result[key] = value.trim();
  }
  if (role === "seller" && result.status !== "shipped")
    throw new Error("Shipment status is required");
  return result as HodlFulfillmentUpdate;
}
