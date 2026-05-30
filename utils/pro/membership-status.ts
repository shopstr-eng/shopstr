// Pure membership-status resolver. No server-only imports so it can run on
// the client (membership context) and the server (API routes) identically.

import type {
  MembershipStatus,
  MembershipView,
  ProBillingMethod,
  ProMembershipRow,
  ProTerm,
} from "@/utils/pro/constants";

function toMs(value: string | Date | null | undefined): number | null {
  if (!value) return null;
  const t = value instanceof Date ? value.getTime() : new Date(value).getTime();
  return Number.isFinite(t) ? t : null;
}

function toIso(value: string | Date | null | undefined): string | null {
  const ms = toMs(value);
  return ms === null ? null : new Date(ms).toISOString();
}

/**
 * Turn the stored membership timestamps into a single effective status.
 *
 * The row carries a forward-looking lapse timeline (entitlement end → grace →
 * read-only → hidden) that billing actions and the lifecycle cron maintain, so
 * this function is a pure comparison against `now`:
 *
 *   now < proUntil                  → active / trialing
 *   proUntil ≤ now < graceUntil     → grace (still entitled)
 *   graceUntil ≤ now < readonlyUntil→ readonly (public, locked)
 *   readonlyUntil ≤ now             → hidden
 *   no timeline at all              → free
 */
export function resolveMembershipStatus(
  row: ProMembershipRow | null | undefined,
  nowMs: number = Date.now()
): MembershipStatus {
  if (!row) return "free";

  const trialEnd = toMs(row.trial_end);
  const periodEnd = toMs(row.current_period_end);
  const graceUntil = toMs(row.grace_until);
  const readonlyUntil = toMs(row.readonly_until);

  const proUntil = Math.max(trialEnd ?? 0, periodEnd ?? 0);

  if (proUntil > 0 && nowMs < proUntil) {
    if (periodEnd && nowMs < periodEnd) return "active";
    return "trialing";
  }

  if (graceUntil && nowMs < graceUntil) return "grace";
  if (readonlyUntil && nowMs < readonlyUntil) return "readonly";

  // A lapse timeline existed and has fully elapsed → hidden. Otherwise the
  // seller never had Pro at all → free.
  if (readonlyUntil || graceUntil || proUntil > 0) return "hidden";
  return "free";
}

export function isProEntitled(status: MembershipStatus): boolean {
  return status === "trialing" || status === "active" || status === "grace";
}

export function isReadOnlyStatus(status: MembershipStatus): boolean {
  return status === "readonly";
}

export function isHiddenStatus(status: MembershipStatus): boolean {
  return status === "hidden";
}

export function isPubliclyVisible(status: MembershipStatus): boolean {
  return status !== "hidden";
}

export function canEditProContent(status: MembershipStatus): boolean {
  return isProEntitled(status);
}

export function membershipView(
  pubkey: string,
  row: ProMembershipRow | null | undefined,
  nowMs: number = Date.now()
): MembershipView {
  const status = resolveMembershipStatus(row, nowMs);
  return {
    pubkey,
    status,
    isPro: isProEntitled(status),
    canEdit: canEditProContent(status),
    isTrialing: status === "trialing",
    isReadOnly: isReadOnlyStatus(status),
    isHidden: isHiddenStatus(status),
    isPubliclyVisible: isPubliclyVisible(status),
    billingMethod: (row?.billing_method as ProBillingMethod | null) ?? null,
    term: (row?.term as ProTerm | null) ?? null,
    trialEnd: toIso(row?.trial_end),
    currentPeriodEnd: toIso(row?.current_period_end),
    graceUntil: toIso(row?.grace_until),
    readonlyUntil: toIso(row?.readonly_until),
    cancelAtPeriodEnd: !!row?.cancel_at_period_end,
  };
}

export function freeMembershipView(pubkey: string): MembershipView {
  return membershipView(pubkey, null);
}
