import {
  hodlDisplayStatus,
  validateFulfillmentUpdate,
} from "../hodl-fulfillment";

it("preserves shipping independently of held payment across recovery", () => {
  expect(hodlDisplayStatus("accepted", "shipped")).toBe("shipped");
  expect(hodlDisplayStatus("accepted", null)).toBe("confirmed");
  expect(hodlDisplayStatus("cancelled", "shipped")).toBe("canceled");
  expect(hodlDisplayStatus("settled", "shipped")).toBe("completed");
});
it("only the seller can record shipment on a funded order", () => {
  const update = {
    status: "shipped",
    tracking: "TRACK123",
    carrier: "Carrier",
  };
  expect(validateFulfillmentUpdate(update, "seller", "accepted", null)).toEqual(
    update
  );
  expect(() =>
    validateFulfillmentUpdate(update, "buyer", "accepted", null)
  ).toThrow();
  expect(() =>
    validateFulfillmentUpdate(update, "seller", "open", null)
  ).toThrow();
  expect(() =>
    validateFulfillmentUpdate(update, "seller", "cancelled", null)
  ).toThrow();
});
it("allows buyer address correction before shipment but never identity or payment changes", () => {
  expect(
    validateFulfillmentUpdate(
      { address: " New address " },
      "buyer",
      "accepted",
      null
    )
  ).toEqual({ address: "New address" });
  expect(() =>
    validateFulfillmentUpdate({ address: "x" }, "buyer", "accepted", "shipped")
  ).toThrow();
  expect(() =>
    validateFulfillmentUpdate({ amountSats: 1 }, "buyer", "accepted", null)
  ).toThrow();
  expect(() =>
    validateFulfillmentUpdate({ address: "x" }, "seller", "accepted", null)
  ).toThrow();
});
