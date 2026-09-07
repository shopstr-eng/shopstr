import type { PoolClient } from "pg";
import { getHodlPolicy } from "./hodl-policy";
import { assertHodlCheckoutReady } from "./hodl-checkout-readiness";
import { computeCartPricing } from "@/utils/payments/cart-pricing";
const respond = (statusCode: number, body: Record<string, unknown>) => ({
  statusCode,
  body,
});
import {
  parseHodlFulfillment,
  type HodlFulfillment,
  type HodlOrderDetails,
} from "@/utils/lightning/hodl-order-details";
import { getHodlStorageKey } from "@/utils/lightning/hodl-storage";
import { randomBytes } from "crypto";
import { getConfiguredArbiterNostrPubkey } from "@/utils/nostr/arbiter-pubkey";
import { paymentHashFromPreimage } from "@/utils/lightning/payment-hash";
import {
  getHodlInvoiceProvider,
  HodlInvoiceProviderUnavailableError,
} from "@/utils/lightning/hodl-invoice-provider-registry";
import {
  DatabaseUnavailableError,
  fetchProductByIdFromDb,
  registerHodlEscrowOrder,
} from "@/utils/db/db-service";
import {
  assertClientAmountMatchesAuthoritative,
  resolveListingOrderAmount,
} from "@/utils/payments/listing-order-amount";
import { PricingValidationError } from "@/utils/payments/listing-pricing";
import { ListingNotFoundError } from "@/utils/payments/listing-resolution";

const HEX_32_BYTE = /^[0-9a-f]{64}$/i;
const PREIMAGE_BYTES = 32;
// Passed to the provider explicitly rather than leaning on its default, so
// the stored expires_at describes the invoice that was actually created
// instead of guessing at whatever backend happens to be installed.
const INVOICE_EXPIRY_SECONDS = 60 * 60;

// The buyer supplies which listing, how much, and which price-affecting
// selections were made; nothing else. Every field the commitment binds an
// identity to is derived server-side:
//   buyer   — the NIP-98 signature on this request
//   seller  — the signer of the listing event
//   arbiter — ARBITER_NOSTR_PUBKEY
//   payment hash / preimage — generated here, per request
// A body naming any of those is either a stale client or an attempt to choose
// one, so unknown keys are rejected rather than ignored: silently dropping
// `arbiterNostrPubkey` would hand back a 201 for a row the caller did not ask
// for.
//
// `amountSats` is NOT taken on the buyer's word. It is an untrusted claim: the
// handler re-prices the listing from `productId` plus the selection fields
// below — through the same server-side pricing path `/api/listing/mint-quote`
// uses — and rejects the request before any invoice exists if the claim does
// not match. The selection fields exist only to feed that recomputation; they
// are the same inputs the checkout mint-quote call already sends.
export type HodlOrderRequestBody = {
  /** Nostr event id of the listing (kind 30402), 32 bytes of hex. */
  productId: string;
  checkoutId?: string;
  quantity?: number;
  amountSats: number;
  formType?: "shipping" | "contact";
  selectedSize?: string;
  selectedVolume?: string;
  selectedWeight?: string;
  selectedBulkOption?: number;
  discountCode?: string;
  fulfillment?: HodlFulfillment;
};

const ALLOWED_BODY_KEYS = new Set([
  "productId",
  "checkoutId",
  "quantity",
  "amountSats",
  "formType",
  "selectedSize",
  "selectedVolume",
  "selectedWeight",
  "selectedBulkOption",
  "discountCode",
  "fulfillment",
]);

/** An optional body field that, when present, must be a non-empty string. */
function readOptionalString(value: unknown): string | null | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string") return null;
  return value.trim() || undefined;
}

export function parseRequestBody(body: unknown): HodlOrderRequestBody | null {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return null;
  }
  for (const key of Object.keys(body)) {
    if (!ALLOWED_BODY_KEYS.has(key)) return null;
  }

  const value = body as Record<string, unknown>;
  if (
    typeof value.productId !== "string" ||
    !HEX_32_BYTE.test(value.productId)
  ) {
    return null;
  }
  if (
    typeof value.amountSats !== "number" ||
    !Number.isSafeInteger(value.amountSats) ||
    value.amountSats <= 0
  ) {
    return null;
  }

  if (
    value.formType !== undefined &&
    value.formType !== "shipping" &&
    value.formType !== "contact"
  ) {
    return null;
  }

  if (
    value.checkoutId !== undefined &&
    (typeof value.checkoutId !== "string" ||
      !/^[0-9a-f-]{36}$/.test(value.checkoutId))
  )
    return null;
  if (
    value.quantity !== undefined &&
    (typeof value.quantity !== "number" ||
      !Number.isSafeInteger(value.quantity) ||
      value.quantity < 1 ||
      value.quantity > 10000)
  )
    return null;
  const selectedSize = readOptionalString(value.selectedSize);
  const selectedVolume = readOptionalString(value.selectedVolume);
  const selectedWeight = readOptionalString(value.selectedWeight);
  const discountCode = readOptionalString(value.discountCode);
  if (
    selectedSize === null ||
    selectedVolume === null ||
    selectedWeight === null ||
    discountCode === null
  ) {
    return null;
  }

  if (
    value.selectedBulkOption !== undefined &&
    (typeof value.selectedBulkOption !== "number" ||
      !Number.isSafeInteger(value.selectedBulkOption) ||
      value.selectedBulkOption < 1)
  ) {
    return null;
  }

  let fulfillment;
  try {
    fulfillment = parseHodlFulfillment(value.fulfillment);
  } catch {
    return null;
  }
  return {
    fulfillment,
    ...(value.checkoutId !== undefined && {
      checkoutId: value.checkoutId as string,
    }),
    ...(value.quantity !== undefined && { quantity: value.quantity as number }),
    productId: value.productId.toLowerCase(),
    amountSats: value.amountSats,
    ...(value.formType !== undefined && { formType: value.formType }),
    ...(selectedSize !== undefined && { selectedSize }),
    ...(selectedVolume !== undefined && { selectedVolume }),
    ...(selectedWeight !== undefined && { selectedWeight }),
    ...(value.selectedBulkOption !== undefined && {
      selectedBulkOption: value.selectedBulkOption,
    }),
    ...(discountCode !== undefined && { discountCode }),
  };
}

/**
 * The retryable answer, matching the wording the mint-quote routes already
 * return for {@link DatabaseUnavailableError} via
 * utils/payments/listing-resolution.ts.
 */
const DATABASE_UNAVAILABLE_RESPONSE = {
  status: 503 as const,
  error: "Service temporarily unavailable. Please try again.",
  reason: "database_unavailable" as const,
};

type SellerResolution =
  | { ok: true; sellerNostrPubkey: string }
  | {
      ok: false;
      status: 404 | 500 | 503;
      error: string;
      /** Only set on the 503 path. */
      reason?: string;
    };

// The seller is taken from the listing event's own pubkey — an event whose
// signature was verified before it was cached — rather than from a body
// field, so a buyer cannot name someone else as the counterparty on an order
// that later releases funds.
async function resolveSellerFromListing(
  productId: string
): Promise<SellerResolution> {
  let listing;
  try {
    // rethrow so a database outage is never a "listing not found" that would
    // send the buyer off to fix a listing that is perfectly fine.
    listing = await fetchProductByIdFromDb(productId, { rethrow: true });
  } catch (error) {
    console.error("Failed to look up listing for hodl escrow order:", error);
    // 503 rather than 500: the listing was never read, so the buyer's next
    // attempt is the one that works. Only a genuinely unknown failure — which
    // this route has no account of — stays a 500.
    if (error instanceof DatabaseUnavailableError) {
      return { ok: false, ...DATABASE_UNAVAILABLE_RESPONSE };
    }
    return { ok: false, status: 500, error: "Failed to look up listing" };
  }

  if (!listing) {
    return { ok: false, status: 404, error: "Listing not found" };
  }
  if (typeof listing.pubkey !== "string" || !HEX_32_BYTE.test(listing.pubkey)) {
    return { ok: false, status: 500, error: "Listing has no valid seller" };
  }

  return { ok: true, sellerNostrPubkey: listing.pubkey.toLowerCase() };
}

/**
 * Maps a failure from the server-side re-pricing step to a response, using the
 * wording this route already uses elsewhere. {@link PricingValidationError}
 * carries a safe, user-facing message — a bad selection, an invalid discount,
 * or the amount mismatch itself — so it is returned as-is. Every other error
 * is treated as internal and its message is never sent to the client.
 */
function respondForPricingError(error: unknown) {
  if (error instanceof PricingValidationError) {
    return respond(400, { error: error.message });
  }
  if (error instanceof ListingNotFoundError) {
    return respond(404, { error: "Listing not found" });
  }
  if (error instanceof DatabaseUnavailableError) {
    return respond(503, {
      error: DATABASE_UNAVAILABLE_RESPONSE.error,
      reason: DATABASE_UNAVAILABLE_RESPONSE.reason,
    });
  }
  console.error("Failed to re-price hodl escrow order:", error);
  return respond(500, { error: "Failed to price the escrow order" });
}

export async function createHodlOrder(
  buyerNostrPubkey: string,
  body: HodlOrderRequestBody,
  transactionClient?: PoolClient
) {
  if (body.formType === "shipping" && !getHodlPolicy().allowShipping)
    return respond(400, {
      error:
        "Lightning escrow is available for pickup/contact orders completed within the hold window.",
    });
  // Checked here, before any invoice exists, as well as inside the write
  // itself: creating a hold invoice we then cannot record would leave the
  // buyer able to pay into an order with no arbiter on it.
  const arbiterNostrPubkey = getConfiguredArbiterNostrPubkey();
  if (!arbiterNostrPubkey) {
    console.error("ARBITER_NOSTR_PUBKEY is not configured");
    return respond(500, { error: "Escrow arbiter is not configured" });
  }

  let provider;
  try {
    provider = getHodlInvoiceProvider();
  } catch (error) {
    if (error instanceof HodlInvoiceProviderUnavailableError) {
      console.error("No hodl invoice provider available:", error);
      return respond(503, { error: "Lightning escrow is not available" });
    }
    throw error;
  }

  const seller = await resolveSellerFromListing(body.productId);
  if (!seller.ok) {
    // `reason` is omitted rather than sent as undefined, so the 404 and 500
    // bodies stay exactly the single-key shape they have always been.
    return respond(
      seller.status,
      seller.reason === undefined
        ? { error: seller.error }
        : { error: seller.error, reason: seller.reason }
    );
  }

  // Three distinct parties is what makes this escrow rather than a payment:
  // if the arbiter is also a counterparty, the party who can settle is also a
  // party with a stake in the outcome.
  if (
    seller.sellerNostrPubkey === buyerNostrPubkey ||
    arbiterNostrPubkey === buyerNostrPubkey ||
    arbiterNostrPubkey === seller.sellerNostrPubkey
  ) {
    return respond(400, {
      error: "Escrow requires a distinct buyer, seller, and arbiter",
    });
  }

  // amountSats is the buyer's claim, not an input we act on. Re-price the
  // listing here — through the same server-side path `/api/listing/mint-quote`
  // uses — and reject before any invoice exists if the claim does not match.
  // This runs regardless of how the request was formed, so a caller that skips
  // the checkout UI and posts an arbitrary amount is rejected exactly like one
  // that tampered with the UI's value.
  let details: HodlOrderDetails;
  try {
    const authoritative = await quoteHodlOrder(body);
    details = {
      productId: authoritative.product.id,
      quantity: body.quantity ?? 1,
      productAddress: `30402:${authoritative.product.pubkey}:${authoritative.product.d}`,
      productTitle: authoritative.product.title,
      selectedSize: authoritative.pricing.selectedSize,
      selectedVolume: authoritative.pricing.selectedVolume,
      selectedWeight: authoritative.pricing.selectedWeight,
      selectedBulkOption: authoritative.pricing.selectedBulkOption,
      fulfillment: body.fulfillment,
    };
    assertClientAmountMatchesAuthoritative({
      requestedAmountSats: body.amountSats,
      authoritativeAmountSats: authoritative.amountSats,
      currency: authoritative.pricing.currency,
    });
  } catch (error) {
    return respondForPricingError(error);
  }

  // 32 CSPRNG bytes, generated server-side and never sent anywhere. This is
  // the secret that releases the funds, so its unpredictability is also what
  // makes the payment hash unguessable and the row unsquattable.
  try {
    getHodlStorageKey();
  } catch {
    return respond(503, {
      error: "Escrow storage is not configured",
      reason: "storage_unavailable",
    });
  }
  try {
    await assertHodlCheckoutReady(
      seller.sellerNostrPubkey,
      arbiterNostrPubkey,
      body.amountSats
    );
  } catch {
    return respond(503, {
      error:
        "Lightning escrow is not ready. The seller must have a reachable Lightning address that can receive this amount, and the escrow service must be configured and synced.",
      reason: "escrow_not_ready",
    });
  }
  const preimage = randomBytes(PREIMAGE_BYTES).toString("hex");
  const paymentHash = paymentHashFromPreimage(preimage);

  let invoice: string;
  try {
    const created = await provider.createHoldInvoice({
      paymentHash,
      amountSats: body.amountSats,
      memo: "Shopstr escrow order",
      expirySeconds: INVOICE_EXPIRY_SECONDS,
    });
    invoice = created.invoice;
  } catch (error) {
    // Nothing has been written yet, and nothing will be: the row is a record
    // of an invoice that exists. The buyer retries and gets a fresh preimage.
    console.error("Failed to create hold invoice:", error);
    return respond(502, { error: "Failed to create hold invoice" });
  }

  try {
    const result = await registerHodlEscrowOrder(
      {
        paymentHash,
        preimage,
        details,
        buyerNostrPubkey,
        sellerNostrPubkey: seller.sellerNostrPubkey,
        invoice,
        amountSats: body.amountSats,
        expiresAt: new Date(Date.now() + INVOICE_EXPIRY_SECONDS * 1000),
      },
      transactionClient
    );

    if (result === "conflict") {
      return respond(409, {
        error: "Hodl escrow order is already registered with different details",
      });
    }

    // Only ever these two fields. The preimage stays on the server: handing
    // it to the buyer would let them settle their own escrow, which is the
    // whole thing the hold invoice exists to prevent.
    return respond(result === "created" ? 201 : 200, { invoice, paymentHash });
  } catch {
    // The invoice outlives the failed write, but it is `open`, unpaid, and
    // its payment request was never returned to anyone — nobody can pay into
    // it, and it expires on its own.
    console.error("Failed to register hodl escrow order");
    return respond(500, { error: "Failed to register hodl escrow order" });
  }
}

export async function quoteHodlOrder(body: HodlOrderRequestBody) {
  if (body.formType === "shipping" && !getHodlPolicy().allowShipping)
    throw new PricingValidationError(
      "Lightning escrow supports pickup/contact orders only."
    );
  const authoritative = await resolveListingOrderAmount(body.productId, {
    formType: body.formType,
    selectedSize: body.selectedSize,
    selectedVolume: body.selectedVolume,
    selectedWeight: body.selectedWeight,
    selectedBulkOption: body.selectedBulkOption,
    discountCode: body.discountCode,
  });
  if (body.quantity !== undefined) {
    const quantity = body.quantity;
    const available = body.selectedSize
      ? authoritative.product.sizeQuantities?.get(body.selectedSize)
      : authoritative.product.quantity;
    if (available !== undefined && quantity > available)
      throw new PricingValidationError("Insufficient stock for this quantity");
    const priced = await computeCartPricing({
      items: [{ ...body, quantity }],
      formType: body.formType!,
      discountCodes: body.discountCode
        ? { [authoritative.product.pubkey]: body.discountCode }
        : undefined,
    });
    authoritative.amountSats = priced.amount;
  }
  return authoritative;
}
