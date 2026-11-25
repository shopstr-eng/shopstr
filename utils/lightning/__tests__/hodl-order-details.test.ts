import { parseHodlFulfillment } from "../hodl-order-details";
it("normalizes empty and surrounding whitespace", () => {
  expect(
    parseHodlFulfillment({ address: "  42 Test St  ", contact: " " })
  ).toEqual({ address: "42 Test St" });
});
it.each([
  null,
  [],
  { admin: "true" },
  { address: 42 },
  { address: "x".repeat(4001) },
])("rejects malformed or oversized fulfillment data", (value) => {
  expect(() => parseHodlFulfillment(value)).toThrow();
});
