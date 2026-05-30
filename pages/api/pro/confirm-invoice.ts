import type { NextApiRequest, NextApiResponse } from "next";
import { applyRateLimit } from "@/utils/rate-limit";
import { requireAdmin } from "@/utils/admin/auth";
import {
  getProManualInvoice,
  settleProManualInvoiceAtomic,
} from "@/utils/db/pro-membership";
import {
  getMembershipView,
  sendProManualReceiptEmail,
} from "@/utils/pro/membership";

// Operator endpoint to confirm a manual FIAT payment (Venmo/Zelle/etc.) and
// activate Pro — mirrors the manual-fiat order confirmation flow.
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }
  if (
    !applyRateLimit(req, res, "pro-confirm-invoice", {
      limit: 30,
      windowMs: 60_000,
    })
  )
    return;

  const { invoiceId } = req.body || {};
  if (!invoiceId) {
    return res.status(400).json({ error: "invoiceId is required" });
  }

  const admin = requireAdmin(req, res, "confirm_pro_invoice", {
    method: "POST",
    path: "/api/pro/confirm-invoice",
    fields: { invoiceId },
  });
  if (!admin) return; // requireAdmin already sent the response

  try {
    const invoice = await getProManualInvoice(invoiceId);
    if (!invoice) {
      return res.status(404).json({ error: "Invoice not found" });
    }

    // Atomic + idempotent: confirming an already-settled invoice is a no-op,
    // and a partial failure rolls back so re-confirming completes the extension.
    const { outcome, invoice: settled } = await settleProManualInvoiceAtomic({
      invoiceId,
    });
    if (outcome === "not_settleable" || outcome === "not_found") {
      return res.status(409).json({
        error: "Invoice cannot be confirmed (it is expired or canceled).",
      });
    }

    // Email a receipt only on a fresh settle (not on re-confirm of an
    // already-settled invoice) so the seller isn't emailed twice.
    if (outcome === "settled" && settled) {
      await sendProManualReceiptEmail(settled);
    }

    const view = await getMembershipView(invoice.pubkey);
    return res.status(200).json({ ok: true, view });
  } catch (error) {
    console.error("pro confirm-invoice failed:", error);
    return res.status(500).json({
      error:
        error instanceof Error ? error.message : "Failed to confirm invoice",
    });
  }
}
