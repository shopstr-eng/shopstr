import { getHodlInvoiceProvider } from "./hodl-invoice-provider-registry";
import {
  getHodlEscrowOrderStatus,
  updateHodlEscrowOrderStatusIfAdvancing,
  listPendingHodlEscrowOrderPaymentHashes,
  type HodlEscrowOrderStatus,
} from "@/utils/db/db-service";

/**
 * Keeps `hodl_escrow_orders.status` in sync with what the Lightning provider
 * actually thinks a hold invoice's state is.
 *
 * The settle endpoint (step 5) and the resolve-dispute endpoint (step 6) are
 * the only two places that move a row to `settled` or `cancelled` today, and
 * both do so only after they themselves called the provider. Neither one,
 * however, ever learns about a buyer paying (`open` → `accepted`) or an
 * invoice expiring unclaimed (`open`/`accepted` → `cancelled` at the provider
 * level, with nobody having called this app's settle/resolve endpoints at
 * all) — those transitions happen inside the provider with no webhook or
 * event to tell this app about them. This module is the poll-based fallback
 * that catches up.
 *
 * There is no relay involvement anywhere in this file: this is purely a
 * database-to-provider sync, one row and one `lookupInvoice` call at a time.
 */

// Not exported. All direction/terminal-state enforcement lives in
// updateHodlEscrowOrderStatusIfAdvancing so there is exactly one place that
// decides a transition is legal — this module only decides *whether there is
// a transition to propose at all*.
async function applyProviderStatus(
  paymentHash: string,
  currentStatus: HodlEscrowOrderStatus,
  providerStatus: HodlEscrowOrderStatus
): Promise<HodlEscrowOrderStatus> {
  if (providerStatus === currentStatus) return currentStatus;

  const result = await updateHodlEscrowOrderStatusIfAdvancing(
    paymentHash,
    providerStatus
  );
  // "not-found" here means the row was deleted between the read at the top of
  // syncHodlOrderStatus and this write — vanishingly unlikely, and the caller
  // already has the pre-sync status to fall back on, which is a truer answer
  // than claiming a row exists when it just stopped existing.
  return result === "not-found" ? currentStatus : result;
}

/**
 * Syncs a single order's stored status against the provider's view of its
 * hold invoice.
 *
 * Always calls the provider, even for a row already `settled` or
 * `cancelled` — a terminal row is trusted to stay that way not because this
 * function special-cases it, but because
 * {@link updateHodlEscrowOrderStatusIfAdvancing} refuses to move it. That
 * keeps the "never downgrade a terminal row" guarantee in the one place that
 * writes the database, rather than duplicated as a skip-check here.
 *
 * @returns the row's status after the sync, or null when no commitment row
 * exists for this payment hash.
 */
export async function syncHodlOrderStatus(
  paymentHash: string
): Promise<HodlEscrowOrderStatus | null> {
  const normalizedHash = paymentHash.toLowerCase();

  const currentStatus = await getHodlEscrowOrderStatus(normalizedHash);
  if (!currentStatus) return null;

  const provider = getHodlInvoiceProvider();
  const { status: providerStatus } =
    await provider.lookupInvoice(normalizedHash);

  return applyProviderStatus(normalizedHash, currentStatus, providerStatus);
}

export type HodlOrderSyncOutcome =
  | { paymentHash: string; ok: true; status: HodlEscrowOrderStatus | null }
  | { paymentHash: string; ok: false };

/**
 * Syncs every order still in a non-terminal state (`open` or `accepted`).
 *
 * Each order is synced independently and a failure on one — a provider
 * timeout, say — is caught and logged rather than aborting the sweep, so one
 * bad lookup cannot stop the rest of the batch from being checked. Safe to
 * call repeatedly or concurrently: an order with nothing to change makes no
 * write ({@link syncHodlOrderStatus} short-circuits on equal statuses), and
 * two overlapping sweeps race only at
 * {@link updateHodlEscrowOrderStatusIfAdvancing}'s row lock, which resolves
 * the race rather than corrupting anything.
 */
export async function syncAllPendingHodlOrders(): Promise<
  HodlOrderSyncOutcome[]
> {
  const paymentHashes = await listPendingHodlEscrowOrderPaymentHashes();

  return Promise.all(
    paymentHashes.map(async (paymentHash) => {
      try {
        const status = await syncHodlOrderStatus(paymentHash);
        return { paymentHash, ok: true, status };
      } catch (error) {
        console.error(
          `Failed to sync hodl escrow order ${paymentHash}: ${
            error instanceof Error ? error.message : String(error)
          }`
        );
        return { paymentHash, ok: false };
      }
    })
  );
}
