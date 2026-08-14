import type { NextApiRequest, NextApiResponse } from "next";
import { applyRateLimit } from "@/utils/rate-limit";
import { syncHodlOrderStatus } from "@/utils/lightning/hodl-status-sync";
import { MockHodlInvoiceProvider } from "@/utils/lightning/mock-hodl-invoice-provider";
import {
  getHodlInvoiceProvider,
  HodlInvoiceProviderUnavailableError,
} from "@/utils/lightning/hodl-invoice-provider-registry";
import { isHodlInvoiceError } from "@/utils/lightning/hodl-invoice-provider";
import { DatabaseUnavailableError } from "@/utils/db/db-service";

const RATE_LIMIT = { limit: 30, windowMs: 60 * 1000 };
const HEX_32_BYTE = /^[0-9a-f]{64}$/i;

const ALLOWED_BODY_KEYS = new Set(["paymentHash"]);

function parseRequestBody(body: unknown): { paymentHash: string } | null {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return null;
  }
  for (const key of Object.keys(body)) {
    if (!ALLOWED_BODY_KEYS.has(key)) return null;
  }

  const value = body as { paymentHash?: unknown };
  if (
    typeof value.paymentHash !== "string" ||
    !HEX_32_BYTE.test(value.paymentHash)
  ) {
    return null;
  }

  return { paymentHash: value.paymentHash.toLowerCase() };
}

/**
 * Stands in for a buyer's wallet paying the hold invoice, in development only.
 *
 * The mock provider hands out `lnmock1…` strings that no wallet can pay — that
 * is deliberate, so a fake invoice can never be mistaken for a real one. The
 * consequence is that without this route nothing can move an order past
 * `open`, and every downstream step (confirm, collect, dispute, resolve) is
 * unreachable.
 *
 * Two independent guards, because this route makes an unpaid invoice look
 * paid:
 *   1. It does not exist outside development — a production build answers 404,
 *      not 403, so its presence cannot even be detected.
 *   2. It refuses any provider that is not the in-memory mock. Once a real
 *      Lightning backend is registered, `simulatePayment` is not part of the
 *      {@link HodlInvoiceProvider} interface and there is nothing to call.
 *
 * Deliberately unauthenticated past those two: it is a local testing affordance
 * on a server that, by guard 1, only ever runs on a developer's machine.
 */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  // Guard 1. Checked before the method check so the route is indistinguishable
  // from a route that was never deployed.
  if (process.env.NODE_ENV === "production") {
    return res.status(404).json({ error: "Not found" });
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }
  if (!applyRateLimit(req, res, "dev-pay-hodl-invoice", RATE_LIMIT)) return;

  const body = parseRequestBody(req.body);
  if (!body) {
    return res.status(400).json({ error: "Invalid payment hash" });
  }

  let provider;
  try {
    provider = getHodlInvoiceProvider();
  } catch (error) {
    if (error instanceof HodlInvoiceProviderUnavailableError) {
      return res
        .status(503)
        .json({ error: "Lightning escrow is not available" });
    }
    throw error;
  }

  // Guard 2.
  if (!(provider instanceof MockHodlInvoiceProvider)) {
    return res.status(409).json({
      error:
        "Simulated payments require the mock hold-invoice provider. A real Lightning backend is installed.",
    });
  }

  try {
    provider.simulatePayment(body.paymentHash);
  } catch (error) {
    // The mock throws when the hash is unknown to it, or when the invoice has
    // already left `open`. Both are the caller's mistake, not a server fault.
    if (isHodlInvoiceError(error)) {
      return res.status(409).json({ error: error.message, reason: error.code });
    }
    throw error;
  }

  // The provider now says `accepted`; the row still says `open`. Syncing here
  // is what stamps `accepted_at`, which the seller dispute timeout is measured
  // from — leaving it to the sweep would make the timeout start whenever the
  // sweep next happened to run.
  let status;
  try {
    status = await syncHodlOrderStatus(body.paymentHash);
  } catch (error) {
    if (error instanceof DatabaseUnavailableError) {
      return res.status(503).json({
        error: "Service temporarily unavailable. Please try again.",
        reason: "database_unavailable",
      });
    }
    console.error(
      `Failed to sync simulated payment for ${body.paymentHash}:`,
      error instanceof Error ? error.message : String(error)
    );
    return res.status(500).json({ error: "Failed to sync escrow order" });
  }

  // The invoice was paid at the provider either way; a null status just means
  // no commitment row exists for it, which is worth telling the caller.
  if (!status) {
    return res.status(404).json({ error: "No such escrow order" });
  }

  return res.status(200).json({ status });
}
