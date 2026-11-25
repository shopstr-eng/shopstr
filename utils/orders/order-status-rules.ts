// Order status vocabulary and who may set each status. Shared by the API
// and the Orders dashboard so a status is accepted on display under the same
// rules the server enforces on write. MCP orders use their own vocabulary
// (mcp/tools/order-status-auth.ts).

export const ORDER_STATUSES = [
  "pending",
  "confirmed",
  "shipped",
  "completed",
  "canceled",
] as const;

export type OrderStatus = (typeof ORDER_STATUSES)[number];

export type OrderRole = "buyer" | "seller";

const SELLER_MANAGED_STATUSES: ReadonlySet<OrderStatus> = new Set([
  "confirmed",
  "shipped",
  "completed",
]);
const BUYER_MANAGED_STATUSES: ReadonlySet<OrderStatus> = new Set(["canceled"]);
const PARTICIPANT_MANAGED_STATUSES: ReadonlySet<OrderStatus> = new Set([
  "pending",
]);

export function isOrderStatus(value: unknown): value is OrderStatus {
  return (
    typeof value === "string" &&
    (ORDER_STATUSES as readonly string[]).includes(value)
  );
}

export function getOrderRole(
  actorPubkey: string,
  participants: { buyerPubkey: string; sellerPubkey: string }
): OrderRole | null {
  if (actorPubkey === participants.sellerPubkey) return "seller";
  if (actorPubkey === participants.buyerPubkey) return "buyer";
  return null;
}

export function canActorSetOrderStatus(
  actorPubkey: string,
  participants: { buyerPubkey: string; sellerPubkey: string },
  status: string
): boolean {
  if (!isOrderStatus(status)) return false;

  const role = getOrderRole(actorPubkey, participants);
  if (role === "seller") {
    return (
      SELLER_MANAGED_STATUSES.has(status) ||
      PARTICIPANT_MANAGED_STATUSES.has(status)
    );
  }
  if (role === "buyer") {
    return (
      BUYER_MANAGED_STATUSES.has(status) ||
      PARTICIPANT_MANAGED_STATUSES.has(status)
    );
  }
  return false;
}

// Higher wins when several messages or the server report a status for the
// same order.
const ORDER_STATUS_PRIORITY: Record<OrderStatus, number> = {
  pending: 1,
  confirmed: 2,
  shipped: 3,
  completed: 4,
  canceled: 5,
};

export function getOrderStatusPriority(status: string | undefined): number {
  return isOrderStatus(status) ? ORDER_STATUS_PRIORITY[status] : 0;
}

// The status an order message may apply, or null when it must not change the
// order: the sender is not allowed to set that status, or the order's
// participants are not known from a trusted source. Message timestamps and
// tags (including `b`) play no part, since the sender controls them.
export function getTrustedOrderStatus(
  senderPubkey: string,
  status: string,
  participants: { buyerPubkey: string; sellerPubkey: string } | undefined
): OrderStatus | null {
  if (!participants || !isOrderStatus(status)) return null;
  return canActorSetOrderStatus(senderPubkey, participants, status)
    ? status
    : null;
}
