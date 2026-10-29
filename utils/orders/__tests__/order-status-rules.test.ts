import {
  canActorSetOrderStatus,
  getOrderRole,
  isOrderStatus,
  ORDER_STATUSES,
} from "../order-status-rules";

const participants = { buyerPubkey: "buyer", sellerPubkey: "seller" };

describe("order status rules", () => {
  it("recognises only the shared status vocabulary", () => {
    for (const status of ORDER_STATUSES) {
      expect(isOrderStatus(status)).toBe(true);
    }
    expect(isOrderStatus("cancelled")).toBe(false);
    expect(isOrderStatus("delivered")).toBe(false);
    expect(isOrderStatus(undefined)).toBe(false);
  });

  it("resolves the actor's role", () => {
    expect(getOrderRole("buyer", participants)).toBe("buyer");
    expect(getOrderRole("seller", participants)).toBe("seller");
    expect(getOrderRole("someone-else", participants)).toBeNull();
  });

  it.each([
    ["seller", "confirmed", true],
    ["seller", "shipped", true],
    ["seller", "completed", true],
    ["seller", "pending", true],
    ["seller", "canceled", false],
    ["buyer", "canceled", true],
    ["buyer", "pending", true],
    ["buyer", "shipped", false],
    ["buyer", "completed", false],
    ["someone-else", "canceled", false],
    ["someone-else", "shipped", false],
    ["seller", "delivered", false],
  ])("%s setting %s is %s", (actor, status, allowed) => {
    expect(canActorSetOrderStatus(actor, participants, status)).toBe(allowed);
  });
});
