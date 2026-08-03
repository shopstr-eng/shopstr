import CryptoJS from "crypto-js";
import { HodlInvoiceError } from "./hodl-invoice-provider";

/** Lightning preimages and payment hashes are both exactly 32 bytes. */
const PREIMAGE_BYTES = 32;
const HEX_CHARS = PREIMAGE_BYTES * 2;

const HEX_32_BYTES = /^[0-9a-f]{64}$/i;

/**
 * Derive a payment hash from a preimage: `sha256(preimage_bytes)`.
 *
 * The hash is taken over the *decoded* 32 bytes, not over the 64-character
 * hex text — hashing the string produces a different, wrong digest that no
 * Lightning node would ever match.
 *
 * Needed because `settleInvoice` receives only the raw preimage, so the
 * provider has to recover the payment hash itself to find the invoice.
 *
 * @param preimage 32 bytes of hex (case-insensitive).
 * @returns The payment hash as 64 lowercase hex characters.
 * @throws {HodlInvoiceError} code `invalid_preimage` if not 32 bytes of hex.
 */
export function paymentHashFromPreimage(preimage: string): string {
  assertHex32Bytes(preimage, "invalid_preimage", "Preimage");
  // enc.Hex.parse decodes the hex into a byte buffer, so SHA256 runs over the
  // 32 raw bytes rather than the ASCII of the hex string.
  const bytes = CryptoJS.enc.Hex.parse(preimage.toLowerCase());
  return CryptoJS.SHA256(bytes).toString(CryptoJS.enc.Hex);
}

/**
 * Validate that a value is 32 bytes of hex, throwing a typed error if not.
 * Shared by the preimage and payment-hash entry points so both reject the
 * same malformed input the same way.
 */
export function assertHex32Bytes(
  value: unknown,
  code: "invalid_preimage" | "invalid_payment_hash",
  label: string
): asserts value is string {
  if (typeof value !== "string" || !HEX_32_BYTES.test(value)) {
    throw new HodlInvoiceError(
      code,
      `${label} must be ${PREIMAGE_BYTES} bytes of hex (${HEX_CHARS} characters)`
    );
  }
}

/**
 * Normalize a payment hash to the lowercase-hex form used as the provider's
 * map key, so callers can pass either case and hit the same invoice.
 *
 * @throws {HodlInvoiceError} code `invalid_payment_hash`.
 */
export function normalizePaymentHash(paymentHash: string): string {
  assertHex32Bytes(paymentHash, "invalid_payment_hash", "Payment hash");
  return paymentHash.toLowerCase();
}
