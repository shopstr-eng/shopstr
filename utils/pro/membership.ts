// Server-side membership resolution and billing-state application. Wraps the
// DB layer (`utils/db/pro-membership`) with the pure resolver
// (`utils/pro/membership-status`) and the billing mappers.

import type Stripe from "stripe";
import {
  computeLapseTimeline,
  PRO_MANUAL_GRACE_DAYS,
  PRO_STRIPE_GRACE_DAYS,
  PRO_TRIAL_DAYS,
  addDays,
  addTerm,
  type MembershipView,
  type ProBillingHistoryItem,
} from "@/utils/pro/constants";
import { isProEntitled, membershipView } from "@/utils/pro/membership-status";
import {
  applyProStripeState,
  getProMembership,
  getProMembershipBySubscription,
  grantProTrialIfMissing,
  listExistingStallPubkeys,
  listPaidProManualInvoices,
  syncProStripeMeta,
  getProSetting,
  setProSetting,
  type ProManualInvoiceRow,
} from "@/utils/db/pro-membership";
import {
  listProStripeInvoices,
  mapStripeSubscription,
} from "@/utils/pro/stripe-pro";
import { getSellerNotificationEmail } from "@/utils/db/db-service";
import { sendProReceipt } from "@/utils/email/email-service";
import { sendServerSideNostrDM } from "@/utils/nostr/server-nostr-helpers";

export async function getMembershipView(
  pubkey: string
): Promise<MembershipView> {
  const row = await getProMembership(pubkey);
  return membershipView(pubkey, row);
}

export async function isPubkeyProEntitled(pubkey: string): Promise<boolean> {
  const view = await getMembershipView(pubkey);
  return isProEntitled(view.status);
}

/**
 * Apply a Stripe subscription's current state to the membership.
 *
 * We only push the entitlement timeline forward when the subscription is
 * active/trialing with a future period end (i.e. genuinely paid). Incomplete,
 * canceled, past-due and unpaid states only sync metadata so we never grant
 * access prematurely or revoke it early — canceled subs lapse naturally once
 * their already-stored period end passes.
 */
export async function applyStripeSubscriptionToMembership(
  sub: Stripe.Subscription
): Promise<void> {
  const mapped = mapStripeSubscription(sub);

  let pubkey = mapped.pubkey;
  if (!pubkey) {
    const existing = await getProMembershipBySubscription(
      mapped.subscriptionId
    );
    pubkey = existing?.pubkey ?? null;
  }
  if (!pubkey) {
    console.warn(
      "applyStripeSubscriptionToMembership: no pubkey for subscription",
      mapped.subscriptionId
    );
    return;
  }

  const grant =
    (mapped.baseStatus === "active" || mapped.baseStatus === "trialing") &&
    mapped.periodEnd !== null &&
    mapped.periodEnd.getTime() > Date.now();

  if (grant && mapped.periodEnd) {
    const { graceUntil, readonlyUntil } = computeLapseTimeline(
      mapped.periodEnd,
      PRO_STRIPE_GRACE_DAYS
    );
    await applyProStripeState({
      pubkey,
      customerId: mapped.customerId,
      subscriptionId: mapped.subscriptionId,
      baseStatus: mapped.baseStatus,
      term: mapped.term,
      currentPeriodEnd: mapped.periodEnd,
      graceUntil,
      readonlyUntil,
      cancelAtPeriodEnd: mapped.cancelAtPeriodEnd,
    });
  } else {
    await syncProStripeMeta({
      pubkey,
      customerId: mapped.customerId,
      subscriptionId: mapped.subscriptionId,
      baseStatus: mapped.baseStatus,
      term: mapped.term,
      cancelAtPeriodEnd: mapped.cancelAtPeriodEnd,
    });
  }
}

function toIso(value: string | Date | null | undefined): string | null {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  const ms = d.getTime();
  return Number.isFinite(ms) ? d.toISOString() : null;
}

function toDate(value: string | Date | null | undefined): Date | null {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isFinite(d.getTime()) ? d : null;
}

/**
 * Reconstruct the coverage window each settled manual invoice paid for.
 *
 * Manual extensions stack from GREATEST(now, current_period_end, trial_end) at
 * settle time (see `MANUAL_EXTEND_SQL`), so an early renewal extends the prior
 * term rather than restarting "now". We don't persist the resulting window, so
 * we replay the same stacking here in paid order: each invoice's coverage
 * starts at the max of its paid time, the running period end so far, and the
 * trial end, and runs one term forward. Returns a map keyed by invoice_id.
 */
function computeManualCoverage(
  manual: ProManualInvoiceRow[],
  trialEnd: Date | null
): Map<string, { start: Date; end: Date }> {
  // Replay oldest-first so each renewal stacks on the prior period end. Tie-
  // break on created_at then id for a stable order when paid_at matches.
  const sorted = [...manual].sort((a, b) => {
    const at = (toDate(a.paid_at) ?? toDate(a.created_at))?.getTime() ?? 0;
    const bt = (toDate(b.paid_at) ?? toDate(b.created_at))?.getTime() ?? 0;
    if (at !== bt) return at - bt;
    const ac = toDate(a.created_at)?.getTime() ?? 0;
    const bc = toDate(b.created_at)?.getTime() ?? 0;
    if (ac !== bc) return ac - bc;
    return a.id - b.id;
  });

  const trialMs = trialEnd ? trialEnd.getTime() : null;
  const coverage = new Map<string, { start: Date; end: Date }>();
  let runningEnd: Date | null = null;

  for (const inv of sorted) {
    const paidAt = toDate(inv.paid_at) ?? toDate(inv.created_at);
    if (!paidAt) continue;
    let baseMs = paidAt.getTime();
    if (runningEnd) baseMs = Math.max(baseMs, runningEnd.getTime());
    if (trialMs !== null) baseMs = Math.max(baseMs, trialMs);
    const start = new Date(baseMs);
    const end = addTerm(start, inv.term);
    coverage.set(inv.invoice_id, { start, end });
    runningEnd = end;
  }

  return coverage;
}

interface ProReceiptDetails {
  amountCents: number;
  currency: string;
  term: "monthly" | "yearly" | null;
  method: "stripe" | "bitcoin" | "fiat";
  paidAt: string | null;
  receiptUrl?: string | null;
}

function formatReceiptAmount(amountCents: number, currency: string): string {
  const c = currency.toUpperCase();
  const major = (amountCents / 100).toFixed(2);
  return c === "USD" ? `$${major}` : `${major} ${c}`;
}

function formatReceiptDate(paidAt: string | null): string {
  if (!paidAt) return "";
  const d = new Date(paidAt);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

/**
 * DM a seller a receipt summary for a just-paid Pro charge over Nostr, mirroring
 * the email + DM pattern used by the Pro lifecycle reminders. Best-effort: never
 * throws, so a relay/DM failure can't roll back the settle or fail the webhook.
 * This complements the email receipt so Nostr-first sellers with no notification
 * email on file still get confirmation.
 */
async function sendProReceiptNostrDM(
  pubkey: string,
  details: ProReceiptDetails
): Promise<void> {
  try {
    const amount = formatReceiptAmount(details.amountCents, details.currency);
    const date = formatReceiptDate(details.paidAt);
    const termLabel =
      details.term === "yearly"
        ? "Annual"
        : details.term === "monthly"
          ? "Monthly"
          : null;
    const methodLabel =
      details.method === "stripe"
        ? "Card (Stripe)"
        : details.method === "bitcoin"
          ? "Bitcoin"
          : "Fiat";

    const lines: string[] = [
      `We received your Milk Market Pro payment of ${amount}. Your Pro features stay active — here are the details for your records:`,
      "",
    ];
    if (date) lines.push(`Date: ${date}`);
    lines.push(`Amount: ${amount}`);
    if (termLabel) lines.push(`Plan: ${termLabel} Pro`);
    lines.push(`Payment method: ${methodLabel}`);
    if (details.receiptUrl) {
      lines.push("");
      lines.push(`Receipt: ${details.receiptUrl}`);
    }
    lines.push("");
    lines.push(
      "You can review your full billing history anytime from your account settings."
    );

    await sendServerSideNostrDM(
      pubkey,
      lines.join("\n"),
      `Milk Market — Pro payment receipt (${amount})`
    );
  } catch (err) {
    console.error("sendProReceiptNostrDM failed:", err);
  }
}

/**
 * Notify a seller of a just-settled manual (Bitcoin/fiat) Pro invoice via both
 * an emailed receipt and a server-side Nostr DM. Best-effort: never throws, so a
 * mail/DM failure can't roll back the settle. Call only on a fresh "settled"
 * outcome to avoid duplicate receipts. (Name kept for historical call sites; now
 * sends over both channels like the Pro lifecycle reminders.)
 */
export async function sendProManualReceiptEmail(
  invoice: ProManualInvoiceRow
): Promise<void> {
  // The settle just happened; the pre-update row's paid_at may still be null, so
  // fall back to now rather than the (older) created_at.
  const paidAt = toIso(invoice.paid_at) ?? new Date().toISOString();
  const details: ProReceiptDetails = {
    amountCents: invoice.amount_usd_cents,
    currency: "usd",
    term: invoice.term,
    method: invoice.method,
    paidAt,
    receiptUrl: null,
  };

  try {
    const email = await getSellerNotificationEmail(invoice.pubkey);
    if (email) {
      await sendProReceipt(email, { ...details, invoicePdfUrl: null });
    }
  } catch (err) {
    console.error("sendProManualReceiptEmail failed:", err);
  }

  await sendProReceiptNostrDM(invoice.pubkey, details);
}

/**
 * Notify a seller of a paid Stripe Pro invoice (renewal or initial charge) via
 * both an emailed receipt and a server-side Nostr DM. Resolves the pubkey from
 * the subscription's membership row, the term from the invoice line item, and
 * includes Stripe's hosted receipt + PDF links. Best-effort: never throws, so a
 * mail/DM failure can't fail the webhook. Skips zero-amount invoices (e.g. $0
 * trial invoices) since there's nothing to receipt. (Name kept for historical
 * call sites; now sends over both channels like the Pro lifecycle reminders.)
 */
export async function sendProStripeReceiptEmail(
  invoice: Stripe.Invoice
): Promise<void> {
  const amountCents = invoice.amount_paid ?? 0;
  if (amountCents <= 0) return;

  const subscriptionId =
    typeof (invoice as any).subscription === "string"
      ? (invoice as any).subscription
      : (invoice as any).subscription?.id;
  if (!subscriptionId) return;

  let pubkey: string | null = null;
  try {
    const membership = await getProMembershipBySubscription(subscriptionId);
    pubkey = membership?.pubkey ?? null;
  } catch (err) {
    console.error("sendProStripeReceiptEmail: membership lookup failed", err);
  }
  if (!pubkey) return;

  const line = invoice.lines?.data?.[0] as any;
  const interval =
    line?.price?.recurring?.interval ??
    line?.plan?.interval ??
    line?.pricing?.price_details?.recurring?.interval ??
    null;
  const term: "monthly" | "yearly" | null =
    interval === "year" ? "yearly" : interval === "month" ? "monthly" : null;

  const paidUnix =
    (invoice.status_transitions && invoice.status_transitions.paid_at) ||
    invoice.created;
  const paidAt =
    typeof paidUnix === "number"
      ? new Date(paidUnix * 1000).toISOString()
      : null;

  const details: ProReceiptDetails = {
    amountCents,
    currency: invoice.currency,
    term,
    method: "stripe",
    paidAt,
    receiptUrl: invoice.hosted_invoice_url ?? null,
  };

  try {
    const email = await getSellerNotificationEmail(pubkey);
    if (email) {
      await sendProReceipt(email, {
        ...details,
        invoicePdfUrl: invoice.invoice_pdf ?? null,
      });
    }
  } catch (err) {
    console.error("sendProStripeReceiptEmail failed:", err);
  }

  await sendProReceiptNostrDM(pubkey, details);
}

/**
 * Unified billing history for a seller: settled manual (Bitcoin/fiat) invoices
 * from our DB plus paid Stripe invoices pulled live from Stripe, merged and
 * sorted newest-first. Stripe entries carry receipt/PDF links. If Stripe is
 * unreachable we still return the manual history rather than failing the view.
 */
export async function getProBillingHistory(
  pubkey: string
): Promise<ProBillingHistoryItem[]> {
  const [membership, manual] = await Promise.all([
    getProMembership(pubkey),
    listPaidProManualInvoices(pubkey),
  ]);

  const manualCoverage = computeManualCoverage(
    manual,
    toDate(membership?.trial_end)
  );

  const items: ProBillingHistoryItem[] = manual.map((inv) => {
    // Prefer the exact window persisted at settle time. Invoices settled before
    // that was stored fall back to the replayed stacking reconstruction.
    const cov = manualCoverage.get(inv.invoice_id);
    const storedStart = toIso(inv.coverage_start);
    const storedEnd = toIso(inv.coverage_end);
    return {
      id: inv.invoice_id,
      source: "manual",
      paidAt: toIso(inv.paid_at) ?? toIso(inv.created_at),
      amountCents: inv.amount_usd_cents,
      currency: "usd",
      term: inv.term,
      method: inv.method,
      coverageStart: storedStart ?? (cov ? cov.start.toISOString() : null),
      coverageEnd: storedEnd ?? (cov ? cov.end.toISOString() : null),
      receiptUrl: null,
      invoicePdfUrl: null,
    };
  });

  if (membership?.stripe_customer_id) {
    try {
      const stripeInvoices = await listProStripeInvoices(
        membership.stripe_customer_id
      );
      for (const inv of stripeInvoices) {
        items.push({
          id: inv.id,
          source: "stripe",
          paidAt: toIso(inv.paidAt),
          amountCents: inv.amountCents,
          currency: inv.currency,
          term: inv.term,
          method: "stripe",
          coverageStart: toIso(inv.coverageStart),
          coverageEnd: toIso(inv.coverageEnd),
          receiptUrl: inv.receiptUrl,
          invoicePdfUrl: inv.invoicePdfUrl,
        });
      }
    } catch (error) {
      console.error("getProBillingHistory: stripe invoice list failed", error);
    }
  }

  items.sort((a, b) => {
    const at = a.paidAt ? new Date(a.paidAt).getTime() : 0;
    const bt = b.paidAt ? new Date(b.paidAt).getTime() : 0;
    return bt - at;
  });

  return items;
}

const TRIAL_BACKFILL_FLAG = "trial_backfill_v1";

/**
 * One-time grandfathering: grant every existing stall a 3-month trial. Guarded
 * by a flag in `pro_settings` so it runs exactly once; new sellers created
 * afterwards default to Free.
 */
export async function backfillProTrialsOnce(): Promise<{
  ran: boolean;
  granted: number;
}> {
  const done = await getProSetting(TRIAL_BACKFILL_FLAG);
  if (done) return { ran: false, granted: 0 };

  const pubkeys = await listExistingStallPubkeys();
  const now = new Date();
  const trialEnd = addDays(now, PRO_TRIAL_DAYS);
  const { graceUntil, readonlyUntil } = computeLapseTimeline(
    trialEnd,
    PRO_MANUAL_GRACE_DAYS
  );

  let granted = 0;
  for (const pubkey of pubkeys) {
    const created = await grantProTrialIfMissing({
      pubkey,
      trialEnd,
      graceUntil,
      readonlyUntil,
    });
    if (created) granted += 1;
  }

  await setProSetting(TRIAL_BACKFILL_FLAG, now.toISOString());
  return { ran: true, granted };
}
