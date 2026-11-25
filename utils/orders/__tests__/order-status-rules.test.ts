import {
  canActorSetOrderStatus,
  getOrderRole,
  getOrderStatusPriority,
  getTrustedOrderStatus,
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

  it("ranks statuses with unknown values lowest", () => {
    expect(getOrderStatusPriority("canceled")).toBeGreaterThan(
      getOrderStatusPriority("completed")
    );
    expect(getOrderStatusPriority("completed")).toBeGreaterThan(
      getOrderStatusPriority("shipped")
    );
    expect(getOrderStatusPriority("shipped")).toBeGreaterThan(
      getOrderStatusPriority("confirmed")
    );
    expect(getOrderStatusPriority("confirmed")).toBeGreaterThan(
      getOrderStatusPriority("pending")
    );
    expect(getOrderStatusPriority("paid")).toBe(0);
    expect(getOrderStatusPriority(undefined)).toBe(0);
  });

  // Alice (buyer) orders from Bob (seller); Mallory is an attacker.
  describe("getTrustedOrderStatus", () => {
    const order = { buyerPubkey: "alice", sellerPubkey: "bob" };

    it("ignores a third party's forged cancellation", () => {
      expect(getTrustedOrderStatus("mallory", "canceled", order)).toBeNull();
    });

    it("applies the buyer's genuine cancellation", () => {
      expect(getTrustedOrderStatus("alice", "canceled", order)).toBe(
        "canceled"
      );
    });

    it("ignores the buyer marking their own order shipped", () => {
      expect(getTrustedOrderStatus("alice", "shipped", order)).toBeNull();
    });

    it("ignores the seller canceling on the buyer's behalf", () => {
      expect(getTrustedOrderStatus("bob", "canceled", order)).toBeNull();
    });

    it("applies seller fulfilment statuses", () => {
      expect(getTrustedOrderStatus("bob", "shipped", order)).toBe("shipped");
      expect(getTrustedOrderStatus("bob", "completed", order)).toBe(
        "completed"
      );
    });

    it("ignores the buyer's own receipt claiming confirmed", () => {
      expect(getTrustedOrderStatus("alice", "confirmed", order)).toBeNull();
    });

    it("ignores every status when participants are unresolved", () => {
      expect(getTrustedOrderStatus("alice", "canceled", undefined)).toBeNull();
      expect(getTrustedOrderStatus("bob", "shipped", undefined)).toBeNull();
    });

    it("ignores unknown status values", () => {
      expect(getTrustedOrderStatus("bob", "delivered", order)).toBeNull();
    });
  });
});
