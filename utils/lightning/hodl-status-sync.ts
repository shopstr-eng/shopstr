import { getHodlInvoiceProvider } from "./hodl-invoice-provider-registry";
import {
  getHodlEscrowOrderStatus,
  getInitializedDbPool,
  updateHodlEscrowOrderStatusIfAdvancing,
  listPendingHodlEscrowOrderPaymentHashes,
  type HodlEscrowOrderStatus,
} from "@/utils/db/db-service";

/** Recover accepted, settled and cancelled states from LND, including while clients are offline. */

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

/** Read LND; the database transition guard prevents terminal-state regressions. */
export async function syncHodlOrderStatus(
  paymentHash: string
): Promise<HodlEscrowOrderStatus | null> {
  const normalizedHash = paymentHash.toLowerCase();

  const currentStatus = await getHodlEscrowOrderStatus(normalizedHash);
  if (!currentStatus) return null;

  const provider = getHodlInvoiceProvider();
  const invoice = await provider.lookupInvoice(normalizedHash);
  const status = await applyProviderStatus(
    normalizedHash,
    currentStatus,
    invoice.status
  );
  if (
    invoice.holdExpiryHeight !== undefined &&
    invoice.acceptedAt !== undefined
  ) {
    await (
      await getInitializedDbPool()
    ).query(
      `UPDATE hodl_escrow_orders SET
      accepted_at=to_timestamp($2), hold_expiry_height=$3, observed_block_height=$4,
      deadline_observed_at=CURRENT_TIMESTAMP WHERE payment_hash=$1`,
      [
        normalizedHash,
        invoice.acceptedAt,
        invoice.holdExpiryHeight,
        invoice.observedBlockHeight ?? null,
      ]
    );
  }
  return status;
}

export type HodlOrderSyncOutcome =
  | { paymentHash: string; ok: true; status: HodlEscrowOrderStatus | null }
  | { paymentHash: string; ok: false };

/** Reconcile pending orders independently so a failed lookup cannot abort the sweep. */
export async function syncAllPendingHodlOrders(): Promise<
  HodlOrderSyncOutcome[]
> {
  const paymentHashes = await listPendingHodlEscrowOrderPaymentHashes();

  const outcomes: HodlOrderSyncOutcome[] = [];
  for (let offset = 0; offset < paymentHashes.length; offset += 8) {
    outcomes.push(
      ...(await Promise.all(
        paymentHashes.slice(offset, offset + 8).map(async (paymentHash) => {
          try {
            return {
              paymentHash,
              ok: true as const,
              status: await syncHodlOrderStatus(paymentHash),
            };
          } catch {
            console.error("HODL status lookup failed");
            return { paymentHash, ok: false as const };
          }
        })
      ))
    );
  }
  return outcomes;
}
