// Stripe helpers for the Pro subscription rail. The seller is the CUSTOMER and
// Milk Market is the merchant on the PLATFORM Stripe account — deliberately
// separate from the Connect "Subscribe & Save" subscriptions that charge
// buyers on seller accounts. Keep customer/price/webhook handling isolated.

import Stripe from "stripe";
import {
  withStripeRetry,
  stableIdempotencyKey,
} from "@/utils/stripe/retry-service";
import {
  PRO_ANNUAL_LOOKUP_KEY,
  PRO_MONTHLY_LOOKUP_KEY,
  PRO_PRICE_CURRENCY,
  proPriceCents,
  type ProTerm,
} from "@/utils/pro/constants";

let stripeSingleton: Stripe | null = null;

export function getProStripe(): Stripe {
  if (!stripeSingleton) {
    stripeSingleton = new Stripe(process.env.STRIPE_SECRET_KEY || "", {
      apiVersion: "2025-09-30.clover",
    });
  }
  return stripeSingleton;
}

function lookupKeyForTerm(term: ProTerm): string {
  return term === "yearly" ? PRO_ANNUAL_LOOKUP_KEY : PRO_MONTHLY_LOOKUP_KEY;
}

/**
 * Find-or-create the recurring Price for a Pro term on the platform account.
 * Keyed by a stable `lookup_key` so we never create duplicate prices and no
 * manual dashboard setup is required.
 */
export async function ensureProPrice(term: ProTerm): Promise<string> {
  const stripe = getProStripe();
  const key = lookupKeyForTerm(term);

  const existing = await withStripeRetry(() =>
    stripe.prices.list({ lookup_keys: [key], active: true, limit: 1 })
  );
  if (existing.data[0]) return existing.data[0].id;

  // Reuse a single "Milk Market Pro" product across both terms.
  let productId: string | null = null;
  try {
    const products = await withStripeRetry(() =>
      stripe.products.search({
        query: "metadata['mm_pro']:'true'",
        limit: 1,
      })
    );
    productId = products.data[0]?.id ?? null;
  } catch {
    productId = null;
  }

  if (!productId) {
    const product = await withStripeRetry(() =>
      stripe.products.create(
        {
          name: "Milk Market Pro",
          metadata: { mm_pro: "true" },
        },
        { idempotencyKey: stableIdempotencyKey("pro-product", { v: 1 }) }
      )
    );
    productId = product.id;
  }

  const price = await withStripeRetry(() =>
    stripe.prices.create(
      {
        product: productId!,
        unit_amount: proPriceCents(term),
        currency: PRO_PRICE_CURRENCY,
        recurring: { interval: term === "yearly" ? "year" : "month" },
        lookup_key: key,
        metadata: { mm_pro: "true", term },
      },
      { idempotencyKey: stableIdempotencyKey("pro-price", { key }) }
    )
  );
  return price.id;
}

/**
 * Find-or-create the platform-account customer for a seller pubkey. Tagged
 * with `mm_pro_pubkey` metadata so we can reconcile back to the seller.
 */
export async function getOrCreateProCustomer(
  pubkey: string,
  email?: string | null
): Promise<string> {
  const stripe = getProStripe();

  try {
    const found = await withStripeRetry(() =>
      stripe.customers.search({
        query: `metadata['mm_pro_pubkey']:'${pubkey}'`,
        limit: 1,
      })
    );
    if (found.data[0]) return found.data[0].id;
  } catch {
    // Search index may lag right after creation; fall through to create.
  }

  const customer = await withStripeRetry(() =>
    stripe.customers.create(
      {
        ...(email ? { email } : {}),
        metadata: { mm_pro_pubkey: pubkey },
      },
      { idempotencyKey: stableIdempotencyKey("pro-cust", { pubkey }) }
    )
  );
  return customer.id;
}

export interface MappedProSubscription {
  pubkey: string | null;
  customerId: string;
  subscriptionId: string;
  baseStatus: Stripe.Subscription.Status;
  periodEnd: Date | null;
  term: ProTerm;
  cancelAtPeriodEnd: boolean;
}

/**
 * Normalize a Stripe subscription into the fields our membership layer needs.
 */
export function mapStripeSubscription(
  sub: Stripe.Subscription
): MappedProSubscription {
  const anySub = sub as any;
  const item = sub.items?.data?.[0];
  const interval = item?.price?.recurring?.interval;
  const term: ProTerm = interval === "year" ? "yearly" : "monthly";
  const periodEndUnix =
    anySub.current_period_end ?? item?.current_period_end ?? null;
  const periodEnd =
    typeof periodEndUnix === "number" ? new Date(periodEndUnix * 1000) : null;
  const customerId =
    typeof sub.customer === "string" ? sub.customer : (sub.customer?.id ?? "");
  const pubkey = (sub.metadata && (sub.metadata.mmProPubkey as string)) || null;

  return {
    pubkey,
    customerId,
    subscriptionId: sub.id,
    baseStatus: sub.status,
    periodEnd,
    term,
    cancelAtPeriodEnd: !!sub.cancel_at_period_end,
  };
}

export function isProMembershipSubscription(sub: Stripe.Subscription): boolean {
  return sub.metadata?.proMembership === "true";
}

export interface ProStripeInvoice {
  id: string;
  paidAt: Date | null;
  amountCents: number;
  currency: string;
  term: ProTerm | null;
  // The billing period this invoice line covered (from Stripe's line period).
  coverageStart: Date | null;
  coverageEnd: Date | null;
  receiptUrl: string | null;
  invoicePdfUrl: string | null;
}

/**
 * List a Pro customer's paid Stripe invoices (newest first), normalized for the
 * billing-history view. Each entry carries the hosted invoice page and direct
 * PDF link so the seller can open or download their receipt.
 */
export async function listProStripeInvoices(
  customerId: string
): Promise<ProStripeInvoice[]> {
  const stripe = getProStripe();
  const res = await withStripeRetry(() =>
    stripe.invoices.list({ customer: customerId, status: "paid", limit: 100 })
  );

  return res.data.map((inv) => {
    const line = inv.lines?.data?.[0] as any;
    const interval =
      line?.price?.recurring?.interval ??
      line?.plan?.interval ??
      line?.pricing?.price_details?.recurring?.interval ??
      null;
    const term: ProTerm | null =
      interval === "year" ? "yearly" : interval === "month" ? "monthly" : null;

    const paidUnix =
      (inv.status_transitions && inv.status_transitions.paid_at) || inv.created;

    const periodStartUnix = line?.period?.start ?? null;
    const periodEndUnix = line?.period?.end ?? null;

    return {
      id: inv.id ?? "",
      paidAt: typeof paidUnix === "number" ? new Date(paidUnix * 1000) : null,
      amountCents: inv.amount_paid,
      currency: inv.currency,
      term,
      coverageStart:
        typeof periodStartUnix === "number"
          ? new Date(periodStartUnix * 1000)
          : null,
      coverageEnd:
        typeof periodEndUnix === "number"
          ? new Date(periodEndUnix * 1000)
          : null,
      receiptUrl: inv.hosted_invoice_url ?? null,
      invoicePdfUrl: inv.invoice_pdf ?? null,
    };
  });
}
