import { nip19 } from "nostr-tools";
import type { NostrManager } from "@/utils/nostr/nostr-manager";
import type { NostrSigner } from "@/utils/nostr/signers/nostr-signer";
import {
  buildDelayedOrderReceiptMessage,
  buildOrderProcessedReceiptMessage,
  buildThankYouReceiptMessage,
} from "./checkout-messages";
import type { PendingSellerLightningPayout } from "./pending-lightning-payouts";
import {
  sendOrderMessageWithRetries,
  type OrderMessageRumor,
} from "./send-order-message";

/** The inner kind-14 rumor, returned so the caller can add it to the buyer's
 * local chat context exactly like the checkout receipt path does. */
export type BuyerOrderReceiptEvent = OrderMessageRumor;

/**
 * Sends the buyer the same order-receipt DM the normal checkout path sends
 * after a successful purchase (subject "order-receipt", type 4, status
 * "confirmed"), for a pending payout that only confirmed later via
 * wallet-page recovery.
 *
 * Records with captured order context get the shipping/pickup receipt when
 * fulfillment details exist and the plain thank-you receipt otherwise;
 * records written before order context was captured fall back to a generic
 * receipt that still names the order id.
 *
 * Unlike the seller notification, a receipt failure is not critical — the
 * seller DM is what must never be lost. Callers should catch a throw here,
 * surface it separately, and still clear the pending record. Delivery is
 * still verified (durable cache + at-least-one-relay publish) so that a
 * resolved promise means the receipt actually left this device.
 */
export async function sendBuyerOrderReceipt({
  nostr,
  signer,
  record,
  buyerPubkey,
}: {
  nostr: NostrManager;
  signer: NostrSigner;
  record: PendingSellerLightningPayout;
  buyerPubkey: string;
}): Promise<BuyerOrderReceiptEvent> {
  const sellerNpub = nip19.npubEncode(record.sellerPubkey);
  const message = record.productTitle
    ? record.address || record.pickup
      ? buildOrderProcessedReceiptMessage(
          record.productTitle,
          record.productDetails ?? "",
          sellerNpub
        )
      : buildThankYouReceiptMessage(
          record.productTitle,
          record.productDetails ?? "",
          sellerNpub
        )
    : buildDelayedOrderReceiptMessage({
        orderId: record.orderId,
        sellerNpub,
      });

  // Mirrors the isReceipt branch of sendPaymentAndContactMessage in the
  // invoice cards, with productAddress standing in for full ProductData.
  const messageOptions = {
    isOrder: true,
    type: 4,
    status: "confirmed",
    orderId: record.orderId,
    orderAmount: record.sellerAmount,
    productAddress: record.productAddress,
    quantity: record.quantity ?? 1,
    paymentType: "lightning",
    paymentReference: record.lnurl,
    address: record.address,
    pickup: record.pickup,
    buyerPubkey,
    donationAmount: record.donationAmount,
    donationPercentage: record.donationPercentage,
  };

  return sendOrderMessageWithRetries({
    nostr,
    signer,
    recipientPubkey: buyerPubkey,
    message,
    subject: "order-receipt",
    messageOptions,
    strictDelivery: true,
    failureLabel: "Buyer order receipt",
    fallbackErrorMessage: "Buyer order receipt failed.",
  });
}
