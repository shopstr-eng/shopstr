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
};

export type RegisteredHodlOrder = {
  invoice: string;
  paymentHash: string;
};

/**
 * Whether to offer hold-invoice escrow at checkout.
 *
 * Follows the P2PK precedent (`isP2pkEscrowFeatureEnabled`): opt-in, off by
 * default. That matters more here than there — the only provider currently
 * implemented hands out invoices no wallet can pay, so an unflagged deployment
 * would show buyers a payment method that cannot complete.
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

/**
 * Registers a hold-invoice escrow order and returns the invoice to pay.
 *
 * The signer's identity *is* the buyer — the route reads it off the NIP-98
 * signature and there is no field to supply it. `amountSats` should come from
 * a server-validated price quote, not from a number computed in the browser:
 * this route does no option or discount validation of its own.
 */
export async function registerHodlOrder(
  signer: NostrSigner,
  params: { productId: string; amountSats: number }
): Promise<RegisteredHodlOrder> {
  const body = JSON.stringify({
    productId: params.productId,
    amountSats: params.amountSats,
  });
  const path = "/api/db/register-hodl-order";
  const url = `${window.location.origin}${path}`;
  const authorization = await createNip98AuthorizationHeader(
    signer,
    url,
    "POST",
    body
  );

  const response = await fetch(path, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: authorization,
    },
    body,
  });

  if (!response.ok) {
    throw await readError(response, "Failed to create the escrow invoice");
  }

  return (await response.json()) as RegisteredHodlOrder;
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
  const url = `${window.location.origin}${path}`;
  const authorization = await createNip98AuthorizationHeader(
    signer,
    url,
    "GET"
  );

  const response = await fetch(path, {
    method: "GET",
    headers: { Authorization: authorization },
  });

  if (!response.ok) {
    throw await readError(response, "Failed to read the escrow order status");
  }

  return (await response.json()) as HodlOrderStatusResult;
}

/**
 * Settles the hold invoice, paying the seller.
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
