import { nip19 } from "nostr-tools";
import type { NostrManager } from "@/utils/nostr/nostr-manager";
import type { NostrSigner } from "@/utils/nostr/signers/nostr-signer";
import {
  buildDelayedLightningPaymentMessage,
  buildLightningPaymentMessage,
  buildPaymentEventOptions,
} from "./checkout-messages";
import type { PendingSellerLightningPayout } from "./pending-lightning-payouts";
import { sendOrderMessageWithRetries } from "./send-order-message";

/**
 * Sends the seller the same order-payment DM the normal checkout path sends
 * after a successful Lightning payout (subject "order-payment", type 2,
 * payment tag "lightning" + lnurl), for a pending payout that only confirmed
 * later via wallet-page recovery.
 *
 * Records written before order context was captured fall back to a generic
 * message that still names the order id. Throws after all retries so the
 * caller can keep the pending record and surface the failure — the seller
 * must never be silently left unaware of a paid order.
 */
export async function notifySellerOfCompletedPayout({
  nostr,
  signer,
  record,
  buyerPubkey,
}: {
  nostr: NostrManager;
  signer: NostrSigner;
  record: PendingSellerLightningPayout;
  buyerPubkey: string;
}): Promise<void> {
  const buyerNpub = nip19.npubEncode(buyerPubkey);
  const message = record.productTitle
    ? buildLightningPaymentMessage({
        buyerNpub,
        title: record.productTitle,
        productDetails: record.productDetails ?? "",
        lnurl: record.lnurl,
        quantity: record.quantity,
      })
    : buildDelayedLightningPaymentMessage({
        buyerNpub,
        orderId: record.orderId,
        lnurl: record.lnurl,
      });

  const messageOptions = buildPaymentEventOptions({
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
  });

  // Verifiable delivery: strict delivery throws when the event cannot be
  // persisted or no relay accepts it — the seller's chat loader reads from
  // relays, so an unaccepted event would silently never reach them. A throw
  // here triggers a retry and ultimately keeps the pending payout record.
  await sendOrderMessageWithRetries({
    nostr,
    signer,
    recipientPubkey: record.sellerPubkey,
    message,
    subject: "order-payment",
    messageOptions,
    strictDelivery: true,
    failureLabel: "Seller payout notification",
    fallbackErrorMessage: "Seller notification failed.",
  });
}
