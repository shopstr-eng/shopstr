import { NostrMessageEvent } from "../types/types";

const normalizeKeyPart = (value?: string | null) =>
  value?.trim().toLowerCase() || "__empty__";

const buildTagMap = (messageEvent: NostrMessageEvent) =>
  new Map(
    messageEvent.tags
      .filter((tag): tag is [string, string] => tag.length >= 2)
      .map(([key, value]) => [key, value])
  );

export const buildOrderGroupingKey = (
  messageEvent: NostrMessageEvent
): string => {
  const tagsMap = buildTagMap(messageEvent);
  const itemTag = messageEvent.tags.find(
    (tag): tag is [string, string, string?] => tag[0] === "item"
  );

  // Different lifecycle messages for the same order can carry different subjects
  // and order tags, so we group them by the stable product and fulfillment fields.
  return [
    tagsMap.get("a") || itemTag?.[1] || "",
    itemTag?.[2] || tagsMap.get("quantity") || "",
    tagsMap.get("amount") || "",
    tagsMap.get("address") || "",
    tagsMap.get("pickup") || "",
    tagsMap.get("size") || "",
    tagsMap.get("volume") || "",
    tagsMap.get("weight") || "",
    tagsMap.get("bulk") || "",
    tagsMap.get("donation_amount") || "",
    tagsMap.get("donation_percentage") || "",
    tagsMap.get("subscription") || "",
    tagsMap.get("subscription_frequency") || "",
    tagsMap.get("subscription_id") || "",
  ]
    .map(normalizeKeyPart)
    .join("|");
};

export const getOrderStatusLookupKeys = (messageEvent: NostrMessageEvent) => {
  const tagsMap = buildTagMap(messageEvent);
  return Array.from(
    new Set(
      [tagsMap.get("order"), buildOrderGroupingKey(messageEvent), messageEvent.id]
        .filter((value): value is string => Boolean(value))
    )
  );
};

export const resolveExplicitPaymentMethod = (paymentTag?: string) => {
  if (!paymentTag) return "Not specified";

  switch (paymentTag.toLowerCase()) {
    case "ecash":
      return "Cashu";
    case "lightning":
      return "Lightning";
    default:
      return paymentTag.charAt(0).toUpperCase() + paymentTag.slice(1);
  }
};

export type ShippingInfo = {
  tracking: string;
  carrier: string;
  eta: number;
  missingFields: Array<"tracking" | "carrier">;
};

export const getLatestShippingInfo = (
  messages: NostrMessageEvent[]
): ShippingInfo | null => {
  const shippingMessage = messages
    .slice()
    .reverse()
    .find((messageEvent) => {
      const subject = buildTagMap(messageEvent).get("subject");
      return subject === "shipping-info";
    });

  if (!shippingMessage) return null;

  const tagsMap = buildTagMap(shippingMessage);
  const tracking = tagsMap.get("tracking") || "";
  const carrier = tagsMap.get("carrier") || "";
  const eta = tagsMap.get("eta") ? parseInt(tagsMap.get("eta") || "0") : 0;

  return {
    tracking,
    carrier,
    eta,
    missingFields: [
      ...(tracking ? [] : ["tracking"]),
      ...(carrier ? [] : ["carrier"]),
    ],
  };
};