import type { NextApiRequest, NextApiResponse } from "next";
import { randomBytes } from "crypto";
import { applyRateLimit } from "@/utils/rate-limit";
import { verifyNip98Request } from "@/utils/nostr/nip98-auth";
import { getConfiguredArbiterNostrPubkey } from "@/utils/nostr/arbiter-pubkey";
import { paymentHashFromPreimage } from "@/utils/lightning/payment-hash";
import {
  getHodlInvoiceProvider,
  HodlInvoiceProviderUnavailableError,
} from "@/utils/lightning/hodl-invoice-provider-registry";
import { addOrderToWatcher } from "@/utils/lightning/hodl-invoice-watcher";
import {
  DatabaseUnavailableError,
  fetchProductByIdFromDb,
  registerHodlEscrowOrder,
} from "@/utils/db/db-service";

const RATE_LIMIT = { limit: 30, windowMs: 60 * 1000 };
const HEX_32_BYTE = /^[0-9a-f]{64}$/i;
const PREIMAGE_BYTES = 32;
// Passed to the provider explicitly rather than leaning on its default, so
// the stored expires_at describes the invoice that was actually created
// instead of guessing at whatever backend happens to be installed.
const INVOICE_EXPIRY_SECONDS = 60 * 60;

// The buyer supplies which listing and how much; nothing else. Every field
// the commitment binds an identity to is derived server-side:
//   buyer   — the NIP-98 signature on this request
//   seller  — the signer of the listing event
//   arbiter — ARBITER_NOSTR_PUBKEY
//   payment hash / preimage — generated here, per request
// A body naming any of those is either a stale client or an attempt to choose
// one, so unknown keys are rejected rather than ignored: silently dropping
// `arbiterNostrPubkey` would hand back a 201 for a row the caller did not ask
// for. The amount is the buyer's own money to lock, and the seller sees the
// invoice amount before parting with goods, so it is safe to take on their
// word.
type HodlOrderRequestBody = {
  /** Nostr event id of the listing (kind 30402), 32 bytes of hex. */
  productId: string;
  amountSats: number;
};

const ALLOWED_BODY_KEYS = new Set(["productId", "amountSats"]);

function parseRequestBody(body: unknown): HodlOrderRequestBody | null {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return null;
  }
  for (const key of Object.keys(body)) {
    if (!ALLOWED_BODY_KEYS.has(key)) return null;
  }

  const value = body as Partial<HodlOrderRequestBody>;
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

  return {
    productId: value.productId.toLowerCase(),
    amountSats: value.amountSats,
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

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }
  if (!applyRateLimit(req, res, "register-hodl-order", RATE_LIMIT)) return;

  const auth = await verifyNip98Request(req, "POST");
  if (!auth.ok) {
    return res.status(401).json({ error: auth.error });
  }

  const body = parseRequestBody(req.body);
  if (!body) {
    return res.status(400).json({ error: "Invalid hodl escrow order request" });
  }

  // Checked here, before any invoice exists, as well as inside the write
  // itself: creating a hold invoice we then cannot record would leave the
  // buyer able to pay into an order with no arbiter on it.
  const arbiterNostrPubkey = getConfiguredArbiterNostrPubkey();
  if (!arbiterNostrPubkey) {
    console.error("ARBITER_NOSTR_PUBKEY is not configured");
    return res.status(500).json({ error: "Escrow arbiter is not configured" });
  }

  let provider;
  try {
    provider = getHodlInvoiceProvider();
  } catch (error) {
    if (error instanceof HodlInvoiceProviderUnavailableError) {
      console.error("No hodl invoice provider available:", error);
      return res
        .status(503)
        .json({ error: "Lightning escrow is not available" });
    }
    throw error;
  }

  const seller = await resolveSellerFromListing(body.productId);
  if (!seller.ok) {
    // `reason` is omitted rather than sent as undefined, so the 404 and 500
    // bodies stay exactly the single-key shape they have always been.
    return res
      .status(seller.status)
      .json(
        seller.reason === undefined
          ? { error: seller.error }
          : { error: seller.error, reason: seller.reason }
      );
  }

  const buyerNostrPubkey = auth.pubkey;
  // Three distinct parties is what makes this escrow rather than a payment:
  // if the arbiter is also a counterparty, the party who can settle is also a
  // party with a stake in the outcome.
  if (
    seller.sellerNostrPubkey === buyerNostrPubkey ||
    arbiterNostrPubkey === buyerNostrPubkey ||
    arbiterNostrPubkey === seller.sellerNostrPubkey
  ) {
    return res
      .status(400)
      .json({ error: "Escrow requires a distinct buyer, seller, and arbiter" });
  }

  // 32 CSPRNG bytes, generated server-side and never sent anywhere. This is
  // the secret that releases the funds, so its unpredictability is also what
  // makes the payment hash unguessable and the row unsquattable.
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
    return res.status(502).json({ error: "Failed to create hold invoice" });
  }

  try {
    const result = await registerHodlEscrowOrder({
      paymentHash,
      preimage,
      buyerNostrPubkey,
      sellerNostrPubkey: seller.sellerNostrPubkey,
      invoice,
      amountSats: body.amountSats,
      expiresAt: new Date(Date.now() + INVOICE_EXPIRY_SECONDS * 1000),
    });

    if (result === "conflict") {
      return res.status(409).json({
        error: "Hodl escrow order is already registered with different details",
      });
    }

    // Hands the new order to the push-based watcher, so a buyer paying it is
    // recorded the moment it happens rather than at the next sweep.
    //
    // Deliberately not awaited, and its result is deliberately ignored: this
    // is a latency optimization on a row that is already committed, and the
    // buyer's 201 must not wait on — or be failed by — a gRPC subscription.
    // `addOrderToWatcher` never throws and reports every failure itself.
    //
    // In most deployments this is a no-op returning "watcher-not-running":
    // the watcher only exists in a process started with
    // `HODL_INVOICE_WATCHER=1` (see instrumentation.ts), and only that
    // process's own registrations reach its pool. When the API server is that
    // process, this saves the new order a full sweep interval; when it is
    // not, the sweep picks the order up exactly as before.
    void addOrderToWatcher(paymentHash);

    // Only ever these two fields. The preimage stays on the server: handing
    // it to the buyer would let them settle their own escrow, which is the
    // whole thing the hold invoice exists to prevent.
    return res
      .status(result === "created" ? 201 : 200)
      .json({ invoice, paymentHash });
  } catch (error) {
    // The invoice outlives the failed write, but it is `open`, unpaid, and
    // its payment request was never returned to anyone — nobody can pay into
    // it, and it expires on its own.
    console.error("Failed to register hodl escrow order:", error);
    return res
      .status(500)
      .json({ error: "Failed to register hodl escrow order" });
  }
}
