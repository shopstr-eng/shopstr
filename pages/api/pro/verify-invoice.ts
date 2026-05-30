import type { NextApiRequest, NextApiResponse } from "next";
import { applyRateLimit } from "@/utils/rate-limit";
import {
  buildProVerifyInvoiceProof,
  extractSignedEventFromRequest,
  verifySignedHttpRequestProof,
} from "@/utils/nostr/request-auth";
import {
  getProManualInvoice,
  settleProManualInvoiceAtomic,
} from "@/utils/db/pro-membership";
import { verifyBitcoinInvoicePaid } from "@/utils/pro/lightning-pro";
import {
  getMembershipView,
  sendProManualReceiptEmail,
} from "@/utils/pro/membership";

// Poll a Bitcoin manual invoice for payment. On confirmation, mark it paid and
// extend the membership. Fiat invoices are confirmed by an operator instead.
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }
  if (
    !applyRateLimit(req, res, "pro-verify-invoice", {
      limit: 60,
      windowMs: 60_000,
    })
  )
    return;

  const { pubkey, invoiceId } = req.body || {};
  if (!pubkey || !invoiceId) {
    return res.status(400).json({ error: "pubkey and invoiceId are required" });
  }

  const verification = verifySignedHttpRequestProof(
    extractSignedEventFromRequest(req),
    buildProVerifyInvoiceProof({ pubkey, invoiceId })
  );
  if (!verification.ok) {
    return res.status(verification.status).json({ error: verification.error });
  }

  try {
    const invoice = await getProManualInvoice(invoiceId);
    if (!invoice || invoice.pubkey !== pubkey) {
      return res.status(404).json({ error: "Invoice not found" });
    }

    // Fully settled already (membership extension applied) — return current view.
    if (invoice.membership_applied_at) {
      const view = await getMembershipView(pubkey);
      return res.status(200).json({ paid: true, view });
    }

    if (invoice.method !== "bitcoin") {
      return res.status(200).json({
        paid: false,
        message:
          "Fiat invoices are confirmed manually by the Milk Market team.",
      });
    }

    const paid = await verifyBitcoinInvoicePaid(
      invoice.bolt11 ?? "",
      invoice.verify_url
    );
    if (!paid) {
      return res.status(200).json({ paid: false });
    }

    // Atomic + idempotent: flips paid, stamps applied, and extends membership in
    // one transaction. A partial failure rolls back so a retry settles cleanly.
    const { outcome, invoice: settled } = await settleProManualInvoiceAtomic({
      invoiceId,
    });
    if (outcome === "not_settleable" || outcome === "not_found") {
      return res.status(409).json({
        paid: false,
        message:
          "This invoice can no longer be settled. Please start a new upgrade.",
      });
    }

    // Email a receipt only on a fresh settle, not on a re-poll of an
    // already-settled invoice, so the seller isn't emailed twice.
    if (outcome === "settled" && settled) {
      await sendProManualReceiptEmail(settled);
    }

    const view = await getMembershipView(pubkey);
    return res.status(200).json({ paid: true, view });
  } catch (error) {
    console.error("pro verify-invoice failed:", error);
    return res.status(500).json({
      error:
        error instanceof Error ? error.message : "Failed to verify invoice",
    });
  }
}
