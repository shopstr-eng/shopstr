# Affiliate payout scheduling

The `/api/affiliates/process-payouts` endpoint promotes pending referrals to
"payable" once they pass the configured hold window for their schedule, then
settles each payable bundle (Stripe Connect transfer for fiat, or fetches a
Lightning invoice for sats). It is intentionally cron-driven rather than
inline so refund clawbacks remain deterministic.

## Required environment

- `AFFILIATE_PAYOUT_CRON_SECRET` — a long random string. Required for the
  endpoint to even respond; missing the secret returns a 500.
- `STRIPE_SECRET_KEY` — for fiat transfers. Lightning runs without it.
- `NEXT_PUBLIC_BASE_URL` (or `REPLIT_DEV_DOMAIN`) — used by the cron command
  example below.

## Recommended schedules

The autoscale runtime can't host long-lived crons, so configure each cadence
as a Replit **Scheduled Deployment** (or any external cron) hitting the
endpoint with the cadence in the query string.

| Schedule | Cron (UTC)      | Hold window | Notes                               |
| -------- | --------------- | ----------- | ----------------------------------- |
| weekly   | `0 14 * * 1`    | 7 days      | Mondays at 14:00 UTC                |
| biweekly | `0 14 1,15 * *` | 14 days     | 1st and 15th at 14:00 UTC           |
| monthly  | `0 14 1 * *`    | 30 days     | 1st of month at 14:00 UTC (default) |

Each scheduled job should run a single command:

```sh
curl -fsSL -X POST \
  -H "Authorization: Bearer $AFFILIATE_PAYOUT_CRON_SECRET" \
  "$NEXT_PUBLIC_BASE_URL/api/affiliates/process-payouts?schedule=weekly"
```

Use `?dryRun=1` first to preview which bundles would be settled without
touching state.

## Safety guarantees

- **Per-schedule advisory lock** (Postgres key 91_001..91_003) refuses
  concurrent runs of the same cadence so two crons can't double-pay.
- **Per-affiliate advisory lock** (key 92_000_000 + affiliate_id) refuses
  cross-cadence races on the same affiliate.
- **Stable Stripe idempotency key** is computed from the sorted referral IDs
  so a retry after a crash returns the original transfer instead of creating
  a duplicate.
- **Auto-pause** flips `payouts_enabled = false` after
  `MAX_PAYOUT_FAILURES` (5) consecutive failures and emails both the
  affiliate and the seller exactly once at the moment of pause.
- **Hold window** ensures buyers have at least 7/14/30 days to refund before
  any rebate is settled.

## Reconciliation

Run `pnpm tsx scripts/reconcile-affiliate-balances.ts` periodically (e.g.
daily) to spot orphan paid rows, refund overshoots, and stale payable rows.
Pass `--apply` to demote orphan paid rows back to payable.

## Year-to-date totals (1099 reporting)

`GET /api/affiliates/ytd-payouts?pubkey=<seller>&year=<YYYY>` returns paid
totals per affiliate for the requested year, plus a list of affiliate IDs
flagged for the US 1099-NEC threshold ($600 in non-employee compensation).
The seller is responsible for issuing the actual forms (Stripe Tax 1099 is
the easiest path for US sellers).

## Partial refund accounting

When a single Stripe charge spans multiple sellers and is partially refunded,
Stripe's webhook payload doesn't break the refund down per seller. The
`reverseReferralsForOrder` helper applies the refund ratio globally — it
scales every pending rebate on that order by `refunded / original_gross`. In
the rare case where a buyer refunds only one seller's portion of a
multi-seller cart, the resulting clawback is best-effort and should be
reconciled manually using the Stripe dashboard. This is documented as a
known limitation.
