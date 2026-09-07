import {
  serializeHodlCheckout,
  type HodlFulfillment,
} from "./hodl-order-details";
import type { NostrSigner } from "@/utils/nostr/signers/nostr-signer";
import { createNip98AuthorizationHeader } from "@/utils/nostr/nip98-auth";
import type { HodlEscrowOrderStatus } from "@/utils/db/db-service";

/**
 * Browser-side calls into the hold-invoice escrow routes.
 *
 * Deliberately the only place in the client that knows these URLs, so the
 * NIP-98 details below live in one file rather than at every call site.
 *
 * Note this module imports only a *type* from db-service. Importing anything
 * executable from there would drag `pg` into the browser bundle.
 */

export type { HodlEscrowOrderStatus };

export type HodlOrderRole = "buyer" | "seller";

export type HodlOrderStatusResult = {
  status: HodlEscrowOrderStatus;
  role: HodlOrderRole;
  payoutStatus?: string | null;
  arbiterPubkey?: string;
};

export type RegisteredHodlOrder = {
  invoice: string;
  paymentHash: string;
  reused?: boolean;
};

/**
 * Whether to offer hold-invoice escrow at checkout.
 *
 * Follows the P2PK precedent (`isP2pkEscrowFeatureEnabled`): opt-in, off by
 * default. Enable only after configuring a real provider and encrypted storage.
 *
 * `process.env.NEXT_PUBLIC_HODL_ESCROW_ENABLED` is written out in full because
 * Next.js inlines these at build time by literal match; a computed key reads as
 * undefined in the browser.
 */
export function isHodlEscrowFeatureEnabled(): boolean {
  return process.env.NEXT_PUBLIC_HODL_ESCROW_ENABLED === "true";
}

/** The arbiter's Nostr identity, or null when escrow is not configured. */
export function getClientArbiterNostrPubkey(): string | null {
  const configured = process.env.NEXT_PUBLIC_ARBITER_NOSTR_PUBKEY;
  if (typeof configured !== "string" || !/^[0-9a-f]{64}$/i.test(configured)) {
    return null;
  }
  return configured.toLowerCase();
}

async function readError(response: Response, fallback: string): Promise<Error> {
  const payload = await response.json().catch(() => null);
  const error = new Error(
    typeof payload?.error === "string" ? payload.error : fallback
  );
  // Carried through so callers can branch on the machine-readable reason —
  // `no_confirmation` and `dispute_not_yet_actionable` are both expected states
  // a UI should explain, not failures to report as errors.
  if (typeof payload?.reason === "string") {
    (error as HodlRequestError).reason = payload.reason;
  }
  if (typeof payload?.remainingSeconds === "number") {
    (error as HodlRequestError).remainingSeconds = payload.remainingSeconds;
  }
  (error as HodlRequestError).status = response.status;
  return error;
}

export type HodlRequestError = Error & {
  status?: number;
  reason?: string;
  remainingSeconds?: number;
};

/** Sign exactly the bytes sent; private reads never use the browser cache. */
async function signedHodlRequest(
  signer: NostrSigner,
  path: string,
  method: "GET" | "POST",
  fallback: string,
  body?: string
): Promise<Response> {
  const authorization = await createNip98AuthorizationHeader(
    signer,
    `${window.location.origin}${path}`,
    method,
    body
  );
  const response = await fetch(path, {
    method,
    headers: {
      Authorization: authorization,
      ...(body !== undefined && { "Content-Type": "application/json" }),
    },
    cache: "no-store",
    ...(body !== undefined && { body }),
  });
  if (!response.ok) throw await readError(response, fallback);
  return response;
}

/**
 * The price-affecting selections for a listing order. These are forwarded to
 * the escrow route so it can recompute the authoritative amount server-side
 * and reject an `amountSats` that does not match — the same inputs the
 * checkout mint-quote call already sends.
 */
export type HodlOrderPricingInputs = {
  checkoutId?: string;
  quantity?: number;
  formType?: "shipping" | "contact" | null;
  selectedSize?: string;
  selectedVolume?: string;
  selectedWeight?: string;
  selectedBulkOption?: number;
  discountCode?: string;
  fulfillment?: HodlFulfillment;
};

/**
 * Registers a hold-invoice escrow order and returns the invoice to pay.
 *
 * The signer's identity *is* the buyer — the route reads it off the NIP-98
 * signature and there is no field to supply it. `amountSats` is treated by the
 * route as an untrusted claim: it re-prices the listing from the forwarded
 * selection inputs and rejects the request if the two do not match, so the
 * amount still cannot be chosen in the browser.
 */
export async function registerHodlOrder(
  signer: NostrSigner,
  params: { productId: string; amountSats: number } & HodlOrderPricingInputs
): Promise<RegisteredHodlOrder> {
  const body = JSON.stringify({
    productId: params.productId,
    ...(params.quantity !== undefined && { quantity: params.quantity }),
    checkoutId: params.checkoutId ?? (await getCheckoutId(signer, params)),
    ...(params.fulfillment && { fulfillment: params.fulfillment }),
    amountSats: params.amountSats,
    ...(params.formType != null && { formType: params.formType }),
    ...(params.selectedSize?.trim() && {
      selectedSize: params.selectedSize.trim(),
    }),
    ...(params.selectedVolume?.trim() && {
      selectedVolume: params.selectedVolume.trim(),
    }),
    ...(params.selectedWeight?.trim() && {
      selectedWeight: params.selectedWeight.trim(),
    }),
    ...(params.selectedBulkOption !== undefined && {
      selectedBulkOption: params.selectedBulkOption,
    }),
    ...(params.discountCode?.trim() && {
      discountCode: params.discountCode.trim(),
    }),
  });
  const response = await signedHodlRequest(
    signer,
    "/api/db/register-hodl-order",
    "POST",
    "Failed to create the escrow invoice",
    body
  );
  return response.json();
}

/**
 * Reads an order's current status. Only the committed buyer or seller can;
 * anyone else gets a 404.
 *
 * The signed `u` tag must include the query string, because the server
 * reconstructs the URL it compares against as `${origin}${req.url}`. Note also
 * that no body is passed to the header helper: a GET carries no payload tag,
 * and sending one makes the signature fail to match.
 */
export async function getHodlOrderStatus(
  signer: NostrSigner,
  paymentHash: string
): Promise<HodlOrderStatusResult> {
  const path = `/api/lightning/hodl-order-status?paymentHash=${encodeURIComponent(
    paymentHash
  )}`;
  const response = await signedHodlRequest(
    signer,
    path,
    "GET",
    "Failed to read the escrow order status"
  );
  return response.json();
}

/**
 * Settles the hold invoice and starts the durable seller payout.
 *
 * No authorization header, by design: the route decides using the buyer's
 * signed confirmation event fetched from relays, not using who sent the
 * request. Either party may therefore crank it, and it fails with
 * `403 no_confirmation` until the buyer has actually confirmed.
 */
export async function settleHodlInvoice(paymentHash: string): Promise<void> {
  const response = await fetch("/api/lightning/settle-hodl-invoice", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ paymentHash }),
  });

  if (!response.ok) {
    throw await readError(response, "Failed to release the escrowed payment");
  }
}

/**
 * Acts on an arbiter's ruling, settling or cancelling the hold invoice.
 *
 * Same shape as {@link settleHodlInvoice}: unauthenticated, because the route
 * authorizes against the arbiter's signed release event on relays. Publish
 * that event first or this returns `403 no_release_event`.
 */
export async function resolveHodlDispute(paymentHash: string): Promise<void> {
  const response = await fetch("/api/lightning/resolve-hodl-dispute", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ paymentHash }),
  });

  if (!response.ok) {
    throw await readError(response, "Failed to resolve the dispute");
  }
}

export async function updateHodlOrderFulfillment(
  signer: NostrSigner,
  paymentHash: string,
  fulfillment: import("./hodl-fulfillment").HodlFulfillmentUpdate
) {
  const path = "/api/lightning/hodl-order";
  const body = JSON.stringify({ paymentHash, fulfillment });
  await signedHodlRequest(signer, path, "POST", "Could not update order", body);
}

export async function getHodlOrder(
  signer: NostrSigner,
  paymentHash: string
): Promise<import("@/utils/db/hodl-order-store").StoredHodlOrder> {
  const path = `/api/lightning/hodl-order?paymentHash=${encodeURIComponent(paymentHash)}`;
  const response = await signedHodlRequest(
    signer,
    path,
    "GET",
    "Could not refresh order details"
  );
  return (await response.json()).order;
}
export async function reconcileHodlPayout(
  signer: NostrSigner,
  paymentHash: string
) {
  const path = "/api/lightning/hodl-payout-reconcile",
    body = JSON.stringify({ paymentHash });
  const response = await signedHodlRequest(
    signer,
    path,
    "POST",
    "Could not reconcile seller payout",
    body
  );
  return response.json();
}

async function checkoutStorageKey(
  signer: NostrSigner,
  params: unknown,
  legacy = false
) {
  const {
    amountSats: _amount,
    checkoutId: _id,
    ...stable
  } = params as Record<string, unknown>;
  const bytes = new TextEncoder().encode(
    legacy ? JSON.stringify(stable) : serializeHodlCheckout(stable)
  );
  const digest = Array.from(
    new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))
  )
    .map((n) => n.toString(16).padStart(2, "0"))
    .join("");
  return `hodl-checkout:${await signer.getPubKey()}:${digest}`;
}
async function getCheckoutId(
  signer: NostrSigner,
  params: unknown,
  reset = false
) {
  const key = await checkoutStorageKey(signer, params);
  const legacyKey = await checkoutStorageKey(signer, params, true);
  const save = () => {
    const id = reset
      ? crypto.randomUUID()
      : (localStorage.getItem(key) ??
        localStorage.getItem(legacyKey) ??
        crypto.randomUUID());
    localStorage.setItem(key, id);
    localStorage.setItem(legacyKey, id);
    return id;
  };
  // Use the browser's cross-tab lock instead of inventing a localStorage mutex.
  // Older browsers without Web Locks retain single-tab retry behavior.
  return navigator.locks ? navigator.locks.request(key, save) : save();
}
export async function quoteHodlCheckout(
  signer: NostrSigner,
  params: { productId: string } & HodlOrderPricingInputs
): Promise<number> {
  const path = "/api/lightning/hodl-quote",
    body = JSON.stringify(params);
  const response = await signedHodlRequest(
    signer,
    path,
    "POST",
    "Could not price escrow checkout",
    body
  );
  return (await response.json()).amountSats;
}

/** Only call after the buyer explicitly chooses a separate new purchase. */
export async function startNewHodlCheckout(
  signer: NostrSigner,
  params: unknown
) {
  await getCheckoutId(signer, params, true);
}
