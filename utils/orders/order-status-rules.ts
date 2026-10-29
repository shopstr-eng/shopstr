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
