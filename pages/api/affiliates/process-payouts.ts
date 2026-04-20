import type { NextApiRequest, NextApiResponse } from "next";
import { assertAffiliateUnsubscribeSecretConfigured } from "@/utils/email/unsubscribe-tokens";
import { createHash } from "crypto";
import Stripe from "stripe";
import { LightningAddress } from "@getalby/lightning-tools";
import {
  clearPayoutFailure,
  createPayoutAndSettle,
  getAffiliateById,
  getPayableReferralBundle,
  getSellerEmailForPubkey,
  MAX_PAYOUT_FAILURES,
  markReferralsPayableBySchedule,
  PayoutSchedule,
  recordPayoutFailure,
  tryAdvisoryLock,
} from "@/utils/db/affiliates";
import {
  sendAffiliatePaidEmail,
  sendAffiliatePausedToAffiliate,
  sendAffiliatePausedToSeller,
} from "@/utils/email/email-service";
import { buildAffiliateUnsubscribeUrl } from "@/utils/email/unsubscribe-tokens";

function publicBaseUrl(): string {
  return (
    process.env.NEXT_PUBLIC_BASE_URL ||
    (process.env.REPLIT_DEV_DOMAIN
      ? `https://${process.env.REPLIT_DEV_DOMAIN}`
      : "http://localhost:3000")
  );
}

function unsubUrlFor(affiliateId: number): string | null {
  try {
    return buildAffiliateUnsubscribeUrl(publicBaseUrl(), affiliateId);
  } catch {
    // Missing AFFILIATE_UNSUBSCRIBE_SECRET — skip the header; mail still
    // sends but without a one-click unsubscribe footer.
    return null;
  }
}

// Stable Stripe idempotency key for a (affiliate, currency, bundle) tuple so
// that retries after a transient failure don't double-pay. We hash the sorted
// referral IDs along with the amount + currency: any two runs that try to
// settle the exact same set of referrals will produce the exact same key,
// which makes Stripe return the original transfer instead of creating a new
// one. We deliberately *don't* include a timestamp here.
function stableStripePayoutIdempotencyKey(params: {
  affiliateId: number;
  currency: string;
  amountSmallest: number;
  referralIds: number[];
}): string {
  const ids = [...params.referralIds].sort((a, b) => a - b).join(",");
  const digest = createHash("sha256")
    .update(
      `${params.affiliateId}|${params.currency.toLowerCase()}|${params.amountSmallest}|${ids}`
    )
    .digest("hex")
    .slice(0, 32);
  return `aff-payout-${params.affiliateId}-${digest}`;
}

// Per-affiliate advisory-lock key: stable namespace at 92_000_000+id so it
// can't collide with the per-schedule keys (91_00x).
function affiliateLockKey(affiliateId: number): number {
  return 92_000_000 + affiliateId;
}

// Stable advisory-lock keys per schedule so concurrent cron invocations on
// the same cadence cannot double-pay. Picked arbitrarily; just need to be
// distinct integers that no other lock holder uses.
const ADVISORY_LOCK_KEYS: Record<PayoutSchedule, number> = {
  weekly: 91_001,
  biweekly: 91_002,
  monthly: 91_003,
};

// Defensive minimum payout per currency. Sub-cent / sub-sat payouts cost
// more in fees and noise than they're worth and small rebates pile up
// quickly when codes are spammed.
const MIN_PAYOUT_SMALLEST: Record<string, number> = {
  sats: 100, // 100 sats
};
function minPayoutFor(currency: string): number {
  return MIN_PAYOUT_SMALLEST[currency.toLowerCase()] ?? 50; // 50 cents fiat
}
import { getDbPool } from "@/utils/db/db-service";
import { applyRateLimit } from "@/utils/rate-limit";

// Fail the deploy fast if the unsubscribe secret is missing in prod —
// otherwise affiliate emails go out without `List-Unsubscribe` headers and
// Gmail/Yahoo will start spam-foldering them silently.
assertAffiliateUnsubscribeSecretConfigured();

const RATE_LIMIT = { limit: 12, windowMs: 60 * 1000 };

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "", {
  apiVersion: "2025-09-30.clover",
});

/**
 * Cron-driven affiliate payout processor.
 *
 * Trigger by cron (e.g. once per hour) with `?schedule=daily|weekly|monthly`.
 * `every_sale` is normally handled inline by the Stripe transfer hook, but
 * any leftover (e.g. bitcoin orders without an inline LN payout) will also
 * be picked up here.
 *
 * Authorization: requires the `AFFILIATE_PAYOUT_CRON_SECRET` env to match
 * an `Authorization: Bearer ...` header. This keeps the endpoint usable from
 * scheduler infrastructure without requiring a Nostr signature.
 */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }
  if (!applyRateLimit(req, res, "affiliates-process-payouts", RATE_LIMIT))
    return;

  const expected = process.env.AFFILIATE_PAYOUT_CRON_SECRET;
  if (!expected) {
    return res
      .status(500)
      .json({ error: "AFFILIATE_PAYOUT_CRON_SECRET not configured" });
  }
  const authHeader = req.headers.authorization || "";
  if (authHeader !== `Bearer ${expected}`) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  let lock: { release: () => Promise<void> } | null = null;
  try {
    const schedule = (req.query.schedule as string) || "monthly";
    if (!["weekly", "biweekly", "monthly"].includes(schedule)) {
      return res.status(400).json({ error: "Invalid schedule" });
    }
    const dryRun = req.query.dryRun === "1" || req.query.dryRun === "true";

    // Per-schedule advisory lock: refuse the run if another worker is
    // already inside this cadence's payout loop.
    lock = await tryAdvisoryLock(
      ADVISORY_LOCK_KEYS[schedule as PayoutSchedule]
    );
    if (!lock) {
      return res.status(409).json({
        error: "Another payout run is already in progress for this schedule",
      });
    }

    // 1. Promote all pending referrals on this schedule to "payable" so they
    //    show up in the bundle. Skipped in dry-run so we don't change state.
    if (!dryRun) {
      await markReferralsPayableBySchedule(schedule as PayoutSchedule);
    }

    // 2. Walk every affiliate that has any payable balance and try to settle.
    const pool = getDbPool();
    const client = await pool.connect();
    let affiliateIds: number[] = [];
    try {
      const r = await client.query(
        `SELECT DISTINCT affiliate_id FROM affiliate_referrals WHERE status = 'payable'`
      );
      affiliateIds = r.rows.map((row) => row.affiliate_id as number);
    } finally {
      client.release();
    }

    const results: Array<{
      affiliateId: number;
      currency: string;
      method: string;
      success: boolean;
      amountSmallest?: number;
      payoutId?: number;
      error?: string;
    }> = [];

    for (const affiliateId of affiliateIds) {
      const affiliate = await getAffiliateById(affiliateId);
      if (!affiliate) continue;

      // Honor the seller's kill-switch + the auto-disable from repeated
      // failures. The seller can re-enable from the dashboard once they've
      // fixed the underlying issue (wrong LN address, dead Stripe account).
      if (!affiliate.payouts_enabled) {
        results.push({
          affiliateId,
          currency: "*",
          method: "manual",
          success: false,
          error: affiliate.last_payout_failure_reason
            ? `Payouts disabled (last failure: ${affiliate.last_payout_failure_reason})`
            : "Payouts disabled by seller",
        });
        continue;
      }

      // Per-affiliate lock so two cron invocations attacking different
      // schedules can't both try to settle the same affiliate's bundles
      // concurrently. Skip cleanly if another worker is already in this
      // affiliate's loop.
      const affLock = await tryAdvisoryLock(affiliateLockKey(affiliateId));
      if (!affLock) {
        results.push({
          affiliateId,
          currency: "*",
          method: "manual",
          success: false,
          error: "Affiliate is being processed by another worker",
        });
        continue;
      }

      try {
        const bundles = await getPayableReferralBundle(affiliateId);
        for (const bundle of bundles) {
          const total = Number(bundle.total_smallest);
          if (total <= 0) continue;
          if (total < minPayoutFor(bundle.currency)) {
            results.push({
              affiliateId,
              currency: bundle.currency,
              method: "manual",
              success: false,
              amountSmallest: total,
              error: `Below minimum payout (${minPayoutFor(bundle.currency)})`,
            });
            continue;
          }

          // Pick the right rail per bundle currency. Sats stay on lightning.
          // Fiat goes through Stripe Connect when configured.
          const isSats = bundle.currency.toLowerCase() === "sats";
          const useLightning = isSats && !!affiliate.lightning_address;
          const useStripe =
            !isSats &&
            !!affiliate.stripe_account_id &&
            !!process.env.STRIPE_SECRET_KEY;

          if (dryRun) {
            results.push({
              affiliateId,
              currency: bundle.currency,
              method: useLightning
                ? "lightning"
                : useStripe
                  ? "stripe"
                  : "manual",
              success: true,
              amountSmallest: total,
            });
            continue;
          }

          if (useLightning) {
            try {
              const ln = new LightningAddress(affiliate.lightning_address!);
              await ln.fetch();
              const invoice = await ln.requestInvoice({ satoshi: total });
              // The platform itself does not (yet) hold a hot wallet here; we
              // record the invoice id as the external_ref and mark the payout
              // as paid only when the seller's NWC actually settles it. For
              // now, store the bolt11 and let the seller pay it out-of-band
              // by clicking "Mark paid" with the invoice as a note. We do
              // NOT count this as a failure for the auto-disable counter —
              // the invoice was successfully fetched, settlement is just
              // out-of-band.
              results.push({
                affiliateId,
                currency: bundle.currency,
                method: "lightning",
                success: false,
                error: `Lightning payout requires manual settlement; invoice: ${invoice.paymentRequest}`,
              });
            } catch (err) {
              const reason =
                err instanceof Error
                  ? err.message
                  : "Lightning invoice fetch failed";
              await recordPayoutFailure(affiliateId, reason);
              results.push({
                affiliateId,
                currency: bundle.currency,
                method: "lightning",
                success: false,
                error: reason,
              });
            }
          } else if (useStripe) {
            try {
              // Precheck the connected account is actually able to receive
              // payouts before initiating a transfer that would otherwise be
              // captured into Stripe limbo. We swallow lookup errors so a
              // transient Stripe outage doesn't permanently block payouts.
              try {
                const acct = await stripe.accounts.retrieve(
                  affiliate.stripe_account_id!
                );
                if (!acct.charges_enabled || !acct.payouts_enabled) {
                  results.push({
                    affiliateId,
                    currency: bundle.currency,
                    method: "stripe",
                    success: false,
                    amountSmallest: total,
                    error:
                      "Stripe account not ready (payouts_enabled is false)",
                  });
                  continue;
                }
              } catch (acctErr) {
                console.warn(
                  `Affiliate ${affiliateId} stripe account lookup failed:`,
                  acctErr
                );
              }
              const transfer = await stripe.transfers.create(
                {
                  amount: total,
                  currency: bundle.currency.toLowerCase(),
                  destination: affiliate.stripe_account_id!,
                  metadata: {
                    affiliateId: String(affiliateId),
                    scheduledPayout: "true",
                    schedule,
                    // Embedding the bundle digest in metadata lets a human
                    // operator find the matching DB row from a Stripe transfer.
                    bundleKey: stableStripePayoutIdempotencyKey({
                      affiliateId,
                      currency: bundle.currency,
                      amountSmallest: total,
                      referralIds: bundle.referral_ids,
                    }),
                  },
                },
                {
                  // Stable per-bundle key. If the cron crashes between a
                  // successful transfer and the DB write below, the next run
                  // will compute the same key, Stripe returns the original
                  // transfer (no double-charge) and we then settle the
                  // referrals locally on the retry.
                  idempotencyKey: stableStripePayoutIdempotencyKey({
                    affiliateId,
                    currency: bundle.currency,
                    amountSmallest: total,
                    referralIds: bundle.referral_ids,
                  }),
                }
              );
              const { payoutId } = await createPayoutAndSettle({
                affiliateId,
                sellerPubkey: bundle.seller_pubkey,
                method: "stripe",
                amountSmallest: total,
                currency: bundle.currency,
                externalRef: transfer.id,
                referralIds: bundle.referral_ids,
              });
              // Reset the failure counter on a clean success so a previously
              // flaky affiliate doesn't stay one strike away from auto-off.
              await clearPayoutFailure(affiliateId);
              // Notify the affiliate by email (best-effort, non-blocking).
              if (
                affiliate.email &&
                affiliate.email_notifications_enabled !== false
              ) {
                sendAffiliatePaidEmail(affiliate.email, {
                  affiliateName: affiliate.name,
                  amountSmallest: total,
                  currency: bundle.currency,
                  method: "stripe",
                  externalRef: transfer.id,
                  unsubscribeUrl: unsubUrlFor(affiliateId),
                }).catch((e) =>
                  console.warn(
                    `affiliate paid email send failed for ${affiliateId}:`,
                    e
                  )
                );
              }
              results.push({
                affiliateId,
                currency: bundle.currency,
                method: "stripe",
                success: true,
                amountSmallest: total,
                payoutId,
              });
            } catch (err) {
              const reason =
                err instanceof Error ? err.message : "Stripe transfer failed";
              await recordPayoutFailure(affiliateId, reason);
              // After recording, check whether this failure pushed us over
              // the auto-pause threshold and notify both the affiliate and
              // the seller exactly once at the moment of pause.
              try {
                const after = await getAffiliateById(affiliateId);
                if (
                  after &&
                  !after.payouts_enabled &&
                  after.payout_failure_count >= MAX_PAYOUT_FAILURES
                ) {
                  if (
                    after.email &&
                    after.email_notifications_enabled !== false
                  ) {
                    sendAffiliatePausedToAffiliate(after.email, {
                      affiliateName: after.name,
                      reason,
                      unsubscribeUrl: unsubUrlFor(affiliateId),
                    }).catch(() => {});
                  }
                  const sellerEmail = await getSellerEmailForPubkey(
                    after.seller_pubkey
                  );
                  if (sellerEmail) {
                    sendAffiliatePausedToSeller(sellerEmail, {
                      affiliateName: after.name,
                      reason,
                      failureCount: after.payout_failure_count,
                    }).catch(() => {});
                  }
                }
              } catch (notifyErr) {
                console.warn(
                  `affiliate ${affiliateId} pause notification failed:`,
                  notifyErr
                );
              }
              results.push({
                affiliateId,
                currency: bundle.currency,
                method: "stripe",
                success: false,
                error: reason,
              });
            }
          } else {
            // No payout method connected — accrue silently for the seller to
            // settle out-of-band. Leave referrals in 'payable' so they show up
            // on the seller dashboard as "ready to pay".
            results.push({
              affiliateId,
              currency: bundle.currency,
              method: "manual",
              success: true,
              amountSmallest: total,
            });
          }
        }
      } finally {
        try {
          await affLock.release();
        } catch (e) {
          console.warn(`affiliate ${affiliateId} lock release failed:`, e);
        }
      }
    }

    // Structured summary line so log aggregation / alerting can spot
    // failure spikes without parsing the per-row JSON blob.
    const successCount = results.filter((r) => r.success).length;
    const failureCount = results.length - successCount;
    const totalSettled = results
      .filter((r) => r.success && typeof r.amountSmallest === "number")
      .reduce((acc, r) => acc + (r.amountSmallest ?? 0), 0);
    console.log(
      `AFFILIATE_PAYOUT_RUN schedule=${schedule} dryRun=${dryRun} ` +
        `affiliates=${affiliateIds.length} bundles=${results.length} ` +
        `success=${successCount} failure=${failureCount} ` +
        `totalSettled=${totalSettled}`
    );
    for (const r of results.filter((x) => !x.success)) {
      console.warn(
        `AFFILIATE_PAYOUT_FAILURE affiliateId=${r.affiliateId} ` +
          `currency=${r.currency} method=${r.method} ` +
          `amount=${r.amountSmallest ?? 0} reason=${JSON.stringify(
            r.error ?? ""
          )}`
      );
    }

    return res.status(200).json({
      schedule,
      dryRun,
      processed: results,
      summary: {
        affiliates: affiliateIds.length,
        bundles: results.length,
        success: successCount,
        failure: failureCount,
        totalSettled,
      },
    });
  } catch (err) {
    console.error("affiliates/process-payouts error:", err);
    return res.status(500).json({ error: "Internal error" });
  } finally {
    if (lock) {
      try {
        await lock.release();
      } catch (e) {
        console.warn("advisory lock release failed:", e);
      }
    }
  }
}
