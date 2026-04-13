import { NostrMessageEvent } from "../types/types";

const normalizeKeyPart = (value?: string | null) =>
  value?.trim().toLowerCase() || "__empty__";

const buildTagMap = (messageEvent: NostrMessageEvent) =>
  new Map(
    messageEvent.tags
      .filter((tag) => tag.length >= 2)
      .map((tag) => [tag[0], tag[1]] as [string, string])
  );

const hasOrderGroupingData = (value?: string | null) => Boolean(value?.trim());

const _buildOrderGroupingKeyFromMap = (
  tagsMap: Map<string, string>,
  messageEvent: NostrMessageEvent
) => {
  const itemTag = messageEvent.tags.find((tag) => tag[0] === "item");
  const productReference = tagsMap.get("a") || itemTag?.[1] || "";
  const amount = tagsMap.get("amount") || "";
  const fulfillmentTarget =
    tagsMap.get("address") || tagsMap.get("pickup") || "";

  if (
    !hasOrderGroupingData(productReference) ||
    !hasOrderGroupingData(amount) ||
    !hasOrderGroupingData(fulfillmentTarget)
  ) {
    return "";
  }

  return [productReference, amount, fulfillmentTarget]
    .map(normalizeKeyPart)
    .join("\0");
};

export const buildOrderGroupingKey = (
  messageEvent: NostrMessageEvent
): string => _buildOrderGroupingKeyFromMap(buildTagMap(messageEvent), messageEvent);

export const getOrderStatusLookupKeys = (messageEvent: NostrMessageEvent) => {
  const tagsMap = buildTagMap(messageEvent);
  const orderTag = tagsMap.get("order");
  const orderGroupKey = _buildOrderGroupingKeyFromMap(tagsMap, messageEvent);

  return Array.from(
    new Set(
      [
        orderTag,
        orderTag ? undefined : orderGroupKey,
        messageEvent.id,
      ]
        .filter((value): value is string => Boolean(value))
    )
  );
};

type OrderConsolidationCandidate = {
  orderId: string;
  orderTag?: string;
  orderGroupKey: string;
};

export const getOrderConsolidationKey = (
  order: OrderConsolidationCandidate,
  taggedOrderGroupKeys: Map<string, string | null>
) => {
  if (order.orderTag) {
    return order.orderTag;
  }

  if (order.orderGroupKey) {
    const matchedTaggedOrderKey = taggedOrderGroupKeys.get(order.orderGroupKey);
    if (matchedTaggedOrderKey) {
      return matchedTaggedOrderKey;
    }
  }

  return order.orderId;
};

export const registerTaggedOrderGroupingKey = (
  order: OrderConsolidationCandidate,
  taggedOrderGroupKeys: Map<string, string | null>,
  consolidationKey: string
) => {
  if (!order.orderTag || !order.orderGroupKey) {
    return;
  }

  const existingTaggedOrderKey = taggedOrderGroupKeys.get(order.orderGroupKey);

  if (typeof existingTaggedOrderKey === "undefined") {
    taggedOrderGroupKeys.set(order.orderGroupKey, consolidationKey);
    return;
  }

  if (existingTaggedOrderKey !== consolidationKey) {
    taggedOrderGroupKeys.set(order.orderGroupKey, null);
  }
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
  const etaValue = tagsMap.get("eta");
  const parsedEta = etaValue ? Number(etaValue.trim()) : 0;
  const eta = Number.isFinite(parsedEta) ? parsedEta : 0;
  const missingFields: ShippingInfo["missingFields"] = [];

  if (!tracking) {
    missingFields.push("tracking");
  }

  if (!carrier) {
    missingFields.push("carrier");
  }

  return {
    tracking,
    carrier,
    eta,
    missingFields,
  };
};
