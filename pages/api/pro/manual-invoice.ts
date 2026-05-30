import type { NextApiRequest, NextApiResponse } from "next";
import { randomBytes } from "crypto";
import { applyRateLimit } from "@/utils/rate-limit";
import {
  buildProManualInvoiceProof,
  extractSignedEventFromRequest,
  verifySignedHttpRequestProof,
} from "@/utils/nostr/request-auth";
import {
  addDays,
  isProManualMethod,
  isProTerm,
  PRO_MANUAL_GRACE_DAYS,
  proPriceCents,
  proPriceUsd,
} from "@/utils/pro/constants";
import { createProManualInvoice } from "@/utils/db/pro-membership";
import { createPlatformBitcoinInvoice } from "@/utils/pro/lightning-pro";

// Issue a manual Pro invoice (one week to pay). Bitcoin invoices route to the
// Milk Market Lightning address and auto-verify; fiat returns the platform's
// payment handles and is confirmed by an operator.
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }
  if (
    !applyRateLimit(req, res, "pro-manual-invoice", {
      limit: 20,
      windowMs: 60_000,
    })
  )
    return;

  const { pubkey, term, method } = req.body || {};
  if (!pubkey || !isProTerm(term) || !isProManualMethod(method)) {
    return res.status(400).json({
      error:
        "pubkey, a valid term (monthly|yearly), and method (bitcoin|fiat) are required",
    });
  }

  const verification = verifySignedHttpRequestProof(
    extractSignedEventFromRequest(req),
    buildProManualInvoiceProof({ pubkey, term, method })
  );
  if (!verification.ok) {
    return res.status(verification.status).json({ error: verification.error });
  }

  try {
    const invoiceId = `pmi_${randomBytes(12).toString("hex")}`;
    const amountUsdCents = proPriceCents(term);
    const amountUsd = proPriceUsd(term);
    const dueAt = addDays(new Date(), PRO_MANUAL_GRACE_DAYS);

    if (method === "bitcoin") {
      const invoice = await createPlatformBitcoinInvoice(
        amountUsd,
        `Milk Market Pro (${term})`
      );
      if (!invoice) {
        return res
          .status(503)
          .json({ error: "Bitcoin payments are not available right now." });
      }

      await createProManualInvoice({
        invoiceId,
        pubkey,
        term,
        method,
        amountUsdCents,
        amountSats: invoice.sats,
        bolt11: invoice.bolt11,
        verifyUrl: invoice.verify,
        paymentHash: invoice.paymentHash,
        dueAt,
      });

      return res.status(200).json({
        invoiceId,
        method,
        term,
        amountUsd,
        amountSats: invoice.sats,
        bolt11: invoice.bolt11,
        dueAt: dueAt.toISOString(),
      });
    }

    // Manual fiat — return the platform's payment handles (if configured).
    const fiatHandles = process.env.MILK_MARKET_FIAT_HANDLES || "";
    await createProManualInvoice({
      invoiceId,
      pubkey,
      term,
      method,
      amountUsdCents,
      dueAt,
    });

    return res.status(200).json({
      invoiceId,
      method,
      term,
      amountUsd,
      fiatHandles,
      dueAt: dueAt.toISOString(),
      note: "After paying, the Milk Market team will confirm your payment and activate Pro.",
    });
  } catch (error) {
    console.error("pro manual-invoice failed:", error);
    return res.status(500).json({
      error:
        error instanceof Error ? error.message : "Failed to create invoice",
    });
  }
}
