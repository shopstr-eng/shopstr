import type { McpOrder } from "./purchase-tools";

const SELLER_MANAGED_ORDER_STATUSES = new Set([
  "confirmed",
  "shipped",
  "delivered",
  "completed",
]);

const BUYER_MANAGED_ORDER_STATUSES = new Set(["cancelled"]);

type OrderParticipants = Pick<McpOrder, "buyer_pubkey" | "seller_pubkey">;

export function canActorUpdateMcpOrderStatus(
  order: OrderParticipants,
  orderStatus: string,
  actorPubkey: string
): boolean {
  if (actorPubkey === order.seller_pubkey) {
    return SELLER_MANAGED_ORDER_STATUSES.has(orderStatus);
  }

  if (actorPubkey === order.buyer_pubkey) {
    return BUYER_MANAGED_ORDER_STATUSES.has(orderStatus);
  }

  return false;
}

export function canActorSendShippingUpdate(
  order: OrderParticipants,
  actorPubkey: string,
  buyerPubkey: string
): boolean {
  return (
    actorPubkey === order.seller_pubkey &&
    buyerPubkey === order.buyer_pubkey &&
    canActorUpdateMcpOrderStatus(order, "shipped", actorPubkey)
  );
}
