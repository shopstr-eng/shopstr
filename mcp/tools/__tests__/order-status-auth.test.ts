import {
  canActorSendShippingUpdate,
  canActorUpdateMcpOrderStatus,
} from "@/mcp/tools/order-status-auth";

const order = {
  buyer_pubkey: "buyer-pubkey",
  seller_pubkey: "seller-pubkey",
};

describe("order status auth helpers", () => {
  it.each(["confirmed", "shipped", "delivered", "completed"])(
    "allows the seller to set %s",
    (status) => {
      expect(
        canActorUpdateMcpOrderStatus(order, status, order.seller_pubkey)
      ).toBe(true);
    }
  );

  it.each(["confirmed", "shipped", "delivered", "completed"])(
    "blocks the buyer from setting %s",
    (status) => {
      expect(
        canActorUpdateMcpOrderStatus(order, status, order.buyer_pubkey)
      ).toBe(false);
    }
  );

  it("allows the buyer to cancel", () => {
    expect(
      canActorUpdateMcpOrderStatus(order, "cancelled", order.buyer_pubkey)
    ).toBe(true);
  });

  it("blocks the seller from cancelling", () => {
    expect(
      canActorUpdateMcpOrderStatus(order, "cancelled", order.seller_pubkey)
    ).toBe(false);
  });

  it("allows shipping updates only for the seller and the recorded buyer", () => {
    expect(
      canActorSendShippingUpdate(order, order.seller_pubkey, order.buyer_pubkey)
    ).toBe(true);
    expect(
      canActorSendShippingUpdate(order, order.buyer_pubkey, order.buyer_pubkey)
    ).toBe(false);
    expect(
      canActorSendShippingUpdate(order, order.seller_pubkey, "someone-else")
    ).toBe(false);
  });
});
