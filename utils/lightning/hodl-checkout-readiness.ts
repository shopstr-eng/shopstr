import { getLndPaymentClient, LndPaymentError } from "./lnd-payment-client";
import { LightningAddress } from "@getalby/lightning-tools";
import { resolveHodlSellerAddress } from "./hodl-seller-payout";
import { getHodlInvoiceProvider } from "./hodl-invoice-provider-registry";
import { getServerArbiterGiftWrapDecryptor } from "@/utils/nostr/server-hodl-arbiter-decryptor";
import { getHodlStorageKey } from "./hodl-storage";
import { getHodlPolicy } from "./hodl-policy";
/** Only reads node/profile/LNURL metadata; it never sends a payment. */
export async function assertHodlCheckoutReady(
  seller: string,
  arbiter: string,
  amount: number
) {
  getHodlPolicy();
  getHodlStorageKey();
  getServerArbiterGiftWrapDecryptor(arbiter);
  if (!/^(?:[a-f0-9]{2})+$/i.test(process.env.LND_PAYMENT_MACAROON_HEX ?? ""))
    throw new Error("Payout credentials unavailable");
  const provider = getHodlInvoiceProvider();
  const node = await provider.getNodeInfo?.();
  if (!node?.synced) throw new Error("Lightning node is not synced");
  // A read-only nonexistent-payment lookup verifies Router connectivity and credentials.
  try {
    await getLndPaymentClient().trackPayment({ paymentHash: "0".repeat(64) });
  } catch (error) {
    if (!(error instanceof LndPaymentError && error.grpcCode === 5))
      throw error;
  }
  const address = await resolveHodlSellerAddress(seller);
  if (!address) throw new Error("Seller needs a Lightning address");
  const ln = new LightningAddress(address);
  let timer: ReturnType<typeof setTimeout>;
  try {
    await Promise.race([
      ln.fetch(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error("Seller address unavailable")),
          15000
        );
      }),
    ]);
    const data = ln.lnurlpData?.rawData;
    if (
      !data ||
      !Number.isFinite(data.minSendable) ||
      !Number.isFinite(data.maxSendable) ||
      amount * 1000 < data.minSendable ||
      amount * 1000 > data.maxSendable
    )
      throw new Error("Seller address cannot receive this amount");
  } finally {
    clearTimeout(timer!);
  }
}
