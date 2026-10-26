---
name: Agent wallet melt-change recovery invariants
description: Invariants the MCP agent Cashu wallet (utils/mcp/agent-cashu-wallet.ts) and melt-retry-service must keep to avoid losing melt change or double-counting proofs.
---

# Agent wallet melt-change recovery invariants

Established over a multi-round architect review of the change-recovery design; each round found a distinct money-loss or double-count hole. Any change to `utils/mcp/agent-cashu-wallet.ts`, `utils/cashu/melt-retry-service.ts`, or wallet proof-event storage must preserve all of these:

1. **Persist NUT-08 blanks before melting.** Serialized `OutputData` blanks live inside the staged kind-7375 event (`pendingChange[]`, alongside the swap outputs) so a crash or failed final write never strands change. Blanks are **zero-amount**, count `ceil(log2(excess)) || 1`, where **excess = sum(swap.send) − quote amount** — never `feeReserve` (`wallet.send({includeFees:true})` inflates send inputs beyond the reserve; feeReserve=0 still needs blanks). This mirrors cashu-ts's own melt preparation.
2. **A resolved melt response is not necessarily settled.** `safeMeltProofs` must map `meltResponse.quote.state`: PENDING → "pending", UNPAID → "unpaid", only PAID/absent → "paid". Labeling a pending async melt "paid" retires its recovery data while inputs are locked at the mint.
3. **Quarantine unresolved melts' inputs.** `PendingChange.inputs` (melt input secrets) are excluded from later payment selection until the quote resolves; on PAID reconcile they are dropped from the rewritten event (mint consumed them).
4. **Dedupe at load.** `replaceProofEvents` saves before retiring, and retirement failures are swallowed by design — stale events linger. `loadProofEvents` must dedupe proof secrets and pendingChange quote ids across events (first occurrence wins); reconcile must not re-append change proofs already held elsewhere. Without this, balance doubles and swaps get duplicate inputs.
5. **Paid-but-unpersisted is still "paid" to the caller.** If the final write fails after a PAID melt, return `paid: true, persisted: false, eventId: null` — the caller must never retry the invoice (double-pay), and recovery happens via the staged event on the next payment.

**Why:** five consecutive review rounds each surfaced a separate hole (lost change, mislabeled pending melts, under-sized blanks, zero-proof event data loss, duplicate recovery). These are coupled invariants, not independent checks.

**How to apply:** when touching the payment flow, melt retry, or wallet event schema, check the change-recovery tests in `utils/mcp/__tests__/agent-cashu-wallet.test.ts` still encode these cases, and extend them rather than weakening assertions.
