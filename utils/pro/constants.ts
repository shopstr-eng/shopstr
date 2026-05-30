// Shared constants and types for the paid "Pro" seller tier.
//
// This module is intentionally free of any server-only imports (no DB, no
// Stripe, no Node built-ins) so it can be imported from both API routes and
// client components/contexts.

export type ProTerm = "monthly" | "yearly";
export type ProBillingMethod = "stripe" | "manual";
export type ProManualMethod = "bitcoin" | "fiat";

// Effective, resolved membership status used everywhere in the app.
export type MembershipStatus =
  | "free"
  | "trialing"
  | "active"
  | "grace"
  | "readonly"
  | "hidden";

export const PRO_PRICE_CURRENCY = "usd";
export const PRO_MONTHLY_PRICE_CENTS = 2100; // $21.00 / month
export const PRO_ANNUAL_PRICE_CENTS = 16800; // $168.00 / year

export const PRO_TRIAL_DAYS = 90; // 3-month grandfathered trial
export const PRO_MANUAL_GRACE_DAYS = 7; // one week to pay a manual invoice
export const PRO_STRIPE_GRACE_DAYS = 3; // small buffer for dunning/webhook lag
export const PRO_READONLY_DAYS = 30; // read-only month before hiding

// Stripe Price lookup keys (find-or-create on the platform account).
export const PRO_MONTHLY_LOOKUP_KEY = "milkmarket_pro_monthly_v1";
export const PRO_ANNUAL_LOOKUP_KEY = "milkmarket_pro_annual_v1";

export const DAY_MS = 24 * 60 * 60 * 1000;

export function proPriceCents(term: ProTerm): number {
  return term === "yearly" ? PRO_ANNUAL_PRICE_CENTS : PRO_MONTHLY_PRICE_CENTS;
}

export function proPriceUsd(term: ProTerm): number {
  return proPriceCents(term) / 100;
}

export function isProTerm(value: unknown): value is ProTerm {
  return value === "monthly" || value === "yearly";
}

export function isProManualMethod(value: unknown): value is ProManualMethod {
  return value === "bitcoin" || value === "fiat";
}

export function addDays(from: Date, days: number): Date {
  return new Date(from.getTime() + days * DAY_MS);
}

// Calendar-accurate term advance (handles month/year rollover).
export function addTerm(from: Date, term: ProTerm): Date {
  const d = new Date(from.getTime());
  if (term === "yearly") {
    d.setFullYear(d.getFullYear() + 1);
  } else {
    d.setMonth(d.getMonth() + 1);
  }
  return d;
}

// Given an entitlement end (period/trial end), compute the lapse timeline:
// grace window first, then a read-only month, after which content is hidden.
export function computeLapseTimeline(
  periodEnd: Date,
  graceDays: number
): { graceUntil: Date; readonlyUntil: Date } {
  const graceUntil = addDays(periodEnd, graceDays);
  const readonlyUntil = addDays(graceUntil, PRO_READONLY_DAYS);
  return { graceUntil, readonlyUntil };
}

// Raw membership row shape (as stored in `pro_memberships`). Timestamps may
// arrive as Date (pg) or string (serialized) depending on the caller.
export interface ProMembershipRow {
  pubkey: string;
  billing_method: ProBillingMethod | null;
  term: ProTerm | null;
  status: string;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  trial_end: string | Date | null;
  current_period_end: string | Date | null;
  grace_until: string | Date | null;
  readonly_until: string | Date | null;
  cancel_at_period_end: boolean;
  trial_reminder_sent_at?: string | Date | null;
  due_reminder_sent_at?: string | Date | null;
  readonly_notice_sent_at?: string | Date | null;
  hidden_notice_sent_at?: string | Date | null;
  created_at?: string | Date | null;
  updated_at?: string | Date | null;
}

// Resolved, client-friendly view of a seller's membership.
export interface MembershipView {
  pubkey: string;
  status: MembershipStatus;
  isPro: boolean; // entitled to use & edit Pro features (trialing/active/grace)
  canEdit: boolean; // can edit Pro content (same as isPro today)
  isTrialing: boolean;
  isReadOnly: boolean; // content live but locked for editing
  isHidden: boolean; // content hidden from the public
  isPubliclyVisible: boolean; // anything except hidden
  billingMethod: ProBillingMethod | null;
  term: ProTerm | null;
  trialEnd: string | null;
  currentPeriodEnd: string | null;
  graceUntil: string | null;
  readonlyUntil: string | null;
  cancelAtPeriodEnd: boolean;
}

// How a single past charge was paid. Stripe charges come from the recurring
// subscription; manual charges are one-off Bitcoin or fiat invoices.
export type ProBillingHistoryMethod = "stripe" | "bitcoin" | "fiat";

// A single past Pro charge, unified across Stripe and manual rails so the UI
// can render one chronological list. Amounts are in the smallest currency unit
// (cents for USD). Receipt links are populated for Stripe charges only.
export interface ProBillingHistoryItem {
  id: string;
  source: ProBillingMethod; // "stripe" | "manual"
  paidAt: string | null; // ISO timestamp of payment
  amountCents: number;
  currency: string; // lowercase ISO code, e.g. "usd"
  term: ProTerm | null;
  method: ProBillingHistoryMethod;
  // The coverage window this charge actually paid for (ISO timestamps). For
  // manual renewals this stacks from the prior period end (early renewals
  // extend rather than start "now"); for Stripe it comes from the invoice line
  // period. Null when it can't be determined.
  coverageStart: string | null;
  coverageEnd: string | null;
  // Stripe-hosted invoice/receipt page and direct PDF; null for manual charges.
  receiptUrl: string | null;
  invoicePdfUrl: string | null;
}
