import { HodlInvoiceError } from "@/utils/lightning/hodl-invoice-provider";
import {
  normalizePaymentHash,
  paymentHashFromPreimage,
} from "@/utils/lightning/payment-hash";

const ZERO_PREIMAGE = "00".repeat(32);
/** sha256 over 32 zero *bytes* — the canonical vector for this. */
const ZERO_PREIMAGE_HASH =
  "66687aadf862bd776c8fc18b8e9f8e20089714856ee233b3902a591d0d5f2925";

describe("paymentHashFromPreimage", () => {
  it("hashes the decoded bytes, not the hex string", () => {
    expect(paymentHashFromPreimage(ZERO_PREIMAGE)).toBe(ZERO_PREIMAGE_HASH);
  });

  it("does not hash the hex text by mistake", () => {
    // sha256 of the ASCII "0000...", which is what a naive implementation
    // would return. Guards against a regression to string hashing.
    expect(paymentHashFromPreimage(ZERO_PREIMAGE)).not.toBe(
      "60e05bd1b195af2f94112fa7197a5c88289058840ce7c6df9693756bc6250f55"
    );
  });

  it("returns a 32-byte lowercase hex hash", () => {
    const hash = paymentHashFromPreimage("ab".repeat(32));
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("is case-insensitive on input", () => {
    const preimage = "ab".repeat(32);
    expect(paymentHashFromPreimage(preimage.toUpperCase())).toBe(
      paymentHashFromPreimage(preimage)
    );
  });

  it("is deterministic and distinct per preimage", () => {
    const a = paymentHashFromPreimage("11".repeat(32));
    const b = paymentHashFromPreimage("22".repeat(32));
    expect(a).toBe(paymentHashFromPreimage("11".repeat(32)));
    expect(a).not.toBe(b);
  });

  it.each([
    ["too short", "ab".repeat(31)],
    ["too long", "ab".repeat(33)],
    ["non-hex characters", "zz".repeat(32)],
    ["empty string", ""],
    ["odd length", "a".repeat(63)],
  ])("rejects a preimage that is %s", (_label, preimage) => {
    expect(() => paymentHashFromPreimage(preimage)).toThrow(HodlInvoiceError);
    try {
      paymentHashFromPreimage(preimage);
    } catch (err) {
      expect((err as HodlInvoiceError).code).toBe("invalid_preimage");
    }
  });

  it("rejects non-string input", () => {
    expect(() => paymentHashFromPreimage(undefined as any)).toThrow(
      HodlInvoiceError
    );
    expect(() => paymentHashFromPreimage(null as any)).toThrow(
      HodlInvoiceError
    );
  });
});

describe("normalizePaymentHash", () => {
  it("lowercases a valid payment hash", () => {
    expect(normalizePaymentHash("AB".repeat(32))).toBe("ab".repeat(32));
  });

  it("throws invalid_payment_hash for malformed input", () => {
    try {
      normalizePaymentHash("nope");
      throw new Error("expected normalizePaymentHash to throw");
    } catch (err) {
      expect(err).toBeInstanceOf(HodlInvoiceError);
      expect((err as HodlInvoiceError).code).toBe("invalid_payment_hash");
    }
  });
});
