import { executeHodlResolution } from "./resolve-hodl-dispute";
import { executeHodlSettlement } from "./settle-hodl-invoice";
import { syncAllPendingHodlOrders } from "./hodl-status-sync";
import { reconcileHodlPayouts } from "./hodl-seller-payout";
let timer: ReturnType<typeof setInterval> | undefined;
let running = false;

export async function reconcileHodlEscrows(): Promise<void> {
  if (running) return;
  running = true;
  try {
    const outcomes = await syncAllPendingHodlOrders();
    await Promise.all([
      reconcileHodlPayouts(),
      reconcileHodlDecisions(outcomes),
    ]);
  } finally {
    running = false;
  }
}

export function startHodlRecovery(): void {
  if (timer) return;
  const tick = () => {
    void reconcileHodlEscrows().catch(() =>
      console.error("HODL reconciliation failed; will retry")
    );
  };
  tick();
  timer = setInterval(tick, 30_000);
  timer.unref();
}

export async function reconcileHodlDecisions(
  outcomes: Awaited<ReturnType<typeof syncAllPendingHodlOrders>>
): Promise<void> {
  const accepted = outcomes.filter((o) => o.ok && o.status === "accepted");
  for (let i = 0; i < accepted.length; i += 4) {
    await Promise.allSettled(
      accepted.slice(i, i + 4).map(async ({ paymentHash }) => {
        const ruling = await executeHodlResolution(paymentHash);
        // Unrelated signed events have no authority to block a genuine buyer confirmation.
        // A valid pending ruling or an incomplete lookup must still fail closed.
        if (
          ruling.statusCode === 403 &&
          ["no_release_event", "pubkey_mismatch", "order_mismatch"].includes(
            String(ruling.body.reason)
          )
        )
          await executeHodlSettlement(paymentHash);
      })
    );
  }
}
