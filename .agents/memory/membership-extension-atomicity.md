---
name: Paid-time extension must be atomic, not read-modify-write
description: Stacking a new paid term onto a membership must compute the new end in a single SQL statement from GREATEST(now, current end), or concurrent settles drop a term.
---

# Membership/period extension must be atomic

When a confirmed payment extends a membership so paying early _stacks_ (new
period starts from the later of now and any remaining entitlement), do NOT read
the current end into JS, add the term, and write it back. Two payments settling
concurrently (e.g. the buyer-polling verify path and an operator confirm path,
or two invoices paid near-simultaneously) both read the same prior end and the
last write wins — silently dropping a purchased term.

**Rule:** do it in one statement — `INSERT ... ON CONFLICT (pubkey) DO UPDATE SET
current_period_end = GREATEST(now(), <existing end>, <existing trial end>) +
$interval`, computing the lapse timeline (grace/read-only) in the same SQL from
that base.

**Why:** the Pro manual rail has two independent settle paths (Bitcoin
auto-verify polling and operator fiat confirm), so concurrent settles are
realistic, not theoretical.

**Settle must be atomic AND idempotent, not just the extension.** Flipping the
invoice to paid and extending the membership must happen in ONE transaction with
a row lock (`SELECT ... FOR UPDATE`) and a dedicated "membership applied" guard
column. If you flip status to paid first and extend second, an extension failure
leaves a paid-but-unentitled invoice and retries short-circuit on the paid
status — the seller pays and never gets Pro. Roll back the whole txn on any
throw so retries re-run; the applied guard makes the extension run exactly once.

**Guard the settle by state.** Only settle from a still-open invoice (or a
paid-but-not-yet-applied one, for partial-failure recovery). Never let an
expired/canceled invoice be resurrected into a paid membership.

**How to apply:** keep the term→interval mapping and grace/readonly day counts
sourced from the shared constants module so the SQL path can't drift from the JS
lapse math.
