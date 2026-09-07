/** Recover escrow state and owed payouts on startup and while the server is alive. */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.HODL_INVOICE_PROVIDER?.trim().toLowerCase() !== "lnd") return;
  const { startHodlRecovery } = await import("@/utils/lightning/hodl-recovery");
  startHodlRecovery();
}
