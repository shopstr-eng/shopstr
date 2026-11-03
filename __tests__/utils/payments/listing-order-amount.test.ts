// The module under test pulls in the listing-resolution graph at import time
// (db-service -> pg, cashu-ts, the rate lookup). Only pure code is exercised
// here, so those are stubbed to keep the import light.
jest.mock("@/utils/db/db-service", () => ({
  DatabaseUnavailableError: class extends Error {},
  fetchProductByIdFromDb: jest.fn(),
  fetchProductByDTagAndPubkey: jest.fn(),
  fetchProductByDTagAndPubkeyFromDb: jest.fn(),
  validateDiscountCode: jest.fn(),
}));
jest.mock("@getalby/lightning-tools", () => ({ getSatoshiValue: jest.fn() }));
jest.mock("@cashu/cashu-ts", () => ({
  HttpResponseError: class extends Error {},
  RateLimitError: class extends Error {},
}));

import { assertClientAmountMatchesAuthoritative } from "@/utils/payments/listing-order-amount";
import { PricingValidationError } from "@/utils/payments/listing-pricing";

const call = (
  requestedAmountSats: number,
  authoritativeAmountSats: number,
  currency: string
) =>
  assertClientAmountMatchesAuthoritative({
    requestedAmountSats,
    authoritativeAmountSats,
    currency,
  });

describe("assertClientAmountMatchesAuthoritative", () => {
  describe("sats-denominated listings", () => {
    it.each(["sats", "SATS", "sat"])(
      "accepts only an exact match (%s)",
      (currency) => {
        expect(() => call(1000, 1000, currency)).not.toThrow();
      }
    );

    it.each([999, 1001, 0, 2000])(
      "rejects any difference at all (%s vs 1000)",
      (requested) => {
        expect(() => call(requested, 1000, "sats")).toThrow(
          PricingValidationError
        );
      }
    );

    it("uses a message that does not leak the authoritative figure", () => {
      expect(() => call(1, 999999, "sats")).toThrow(
        "Amount does not match the current listing price"
      );
    });
  });

  describe("fiat-denominated listings", () => {
    // tolerance = max(2 sats, ceil(1% of authoritative)); 1% of 20000 = 200.
    it("accepts an exact match", () => {
      expect(() => call(20000, 20000, "USD")).not.toThrow();
    });

    it.each([19800, 20200, 19801, 20199])(
      "accepts drift within the band (%s vs 20000)",
      (requested) => {
        expect(() => call(requested, 20000, "USD")).not.toThrow();
      }
    );

    it.each([19799, 20201, 1, 1_000_000])(
      "rejects drift past the band (%s vs 20000)",
      (requested) => {
        expect(() => call(requested, 20000, "eur")).toThrow(
          PricingValidationError
        );
      }
    );

    it("uses a 2-sat floor for tiny amounts", () => {
      // 1% of 100 = 1, floored to 2.
      expect(() => call(102, 100, "USD")).not.toThrow();
      expect(() => call(98, 100, "USD")).not.toThrow();
      expect(() => call(103, 100, "USD")).toThrow(PricingValidationError);
      expect(() => call(97, 100, "USD")).toThrow(PricingValidationError);
    });
  });
});
