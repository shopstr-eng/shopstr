import { nip19 } from "nostr-tools";
import { generateKeys } from "@/utils/nostr/key-utilities";
import {
  constructGiftWrappedEvent,
  constructMessageGiftWrap,
  constructMessageSeal,
  sendGiftWrappedMessageEvent,
} from "@/utils/nostr/gift-wrap";
import type { NostrManager } from "@/utils/nostr/nostr-manager";
import type { NostrSigner } from "@/utils/nostr/signers/nostr-signer";
import {
  buildDelayedLightningPaymentMessage,
  buildLightningPaymentMessage,
  buildPaymentEventOptions,
} from "./checkout-messages";
import type { PendingSellerLightningPayout } from "./pending-lightning-payouts";

const MAX_ATTEMPTS = 3;

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

  let lastError: unknown;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    try {
      // Ephemeral sender/receiver keys per attempt, mirroring the checkout
      // path — the buyer's real identity travels in the "b" tag only.
      const { nsec: senderNsec, npub: senderNpub } = await generateKeys();
      const { nsec: receiverNsec, npub: receiverNpub } = await generateKeys();
      const senderPubkey = nip19.decode(senderNpub).data as string;
      const senderPrivkey = nip19.decode(senderNsec).data as Uint8Array;
      const receiverPubkey = nip19.decode(receiverNpub).data as string;
      const receiverPrivkey = nip19.decode(receiverNsec).data as Uint8Array;

      const giftWrappedMessageEvent = await constructGiftWrappedEvent(
        senderPubkey,
        record.sellerPubkey,
        message,
        "order-payment",
        messageOptions
      );
      const sealedEvent = await constructMessageSeal(
        signer,
        giftWrappedMessageEvent,
        senderPubkey,
        record.sellerPubkey,
        senderPrivkey
      );
      const giftWrappedEvent = await constructMessageGiftWrap(
        sealedEvent,
        receiverPubkey,
        receiverPrivkey,
        record.sellerPubkey
      );
      // Verifiable delivery: the strict cache write throws when the event
      // cannot be persisted, and requireRelayDelivery throws when no relay
      // accepts it — the seller's chat loader reads from relays, so an
      // unaccepted event would silently never reach them. A throw here
      // triggers a retry and ultimately keeps the pending payout record.
      await sendGiftWrappedMessageEvent(nostr, giftWrappedEvent, signer, {
        requireDurableCache: true,
        requireRelayDelivery: true,
      });
      return;
    } catch (error) {
      lastError = error;
      console.warn(
        `Seller payout notification attempt ${attempt + 1} failed:`,
        error
      );
      if (attempt < MAX_ATTEMPTS - 1) {
        // Exponential backoff, matching the checkout retry cadence.
        await new Promise((resolve) =>
          setTimeout(resolve, Math.pow(2, attempt) * 1000)
        );
      }
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new Error("Seller notification failed.");
}
