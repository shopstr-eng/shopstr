import type { NostrManager } from "@/utils/nostr/nostr-manager";
import type { NostrSigner } from "@/utils/nostr/signers/nostr-signer";
import type { NostrMessageEvent } from "@/utils/types/types";
import { sendOrderMessageWithRetries } from "@/utils/payments/send-order-message";

export type SendListingInquiryParams = {
  nostr: NostrManager;
  signer?: NostrSigner;
  /** The buyer's real pubkey — authors the inquiry rumor. */
  userPubkey?: string;
  sellerPubkey: string;
  productTitle: string;
  /**
   * Files the buyer-copy rumor into local chat history so the buyer sees
   * their own inquiry immediately (the chats context's
   * addNewlyCreatedMessageEvent).
   */
  addNewlyCreatedMessageEvent: (
    messageEvent: NostrMessageEvent,
    sent?: boolean
  ) => void;
};

/**
 * Sends a "listing inquiry" DM after checkout: one copy to the seller and one
 * copy to the buyer's own chat history. This is the single owner of inquiry
 * message text, subject, retry policy, and chat filing — both the cart and
 * product invoice cards route through here so the two checkouts can't drift
 * apart again.
 *
 * Routed through the shared order-message pipeline so inquiries get the same
 * retry cadence as checkout order messages. The rumor is authored by the
 * buyer's real pubkey (sealed with their signer) so the seller can see who is
 * asking — there is no order "b" tag to carry the buyer's identity. Every
 * failure is caught here so an inquiry problem can never escape into payment
 * processing.
 */
export async function sendListingInquiry({
  nostr,
  signer,
  userPubkey,
  sellerPubkey,
  productTitle,
  addNewlyCreatedMessageEvent,
}: SendListingInquiryParams): Promise<void> {
  if (!signer || !nostr || !userPubkey) return;

  const inquiryMessage = `I just placed an order for your ${productTitle} listing on Shopstr! Please check your Shopstr order dashboard for any relevant information.`;

  try {
    // Send to seller
    await sendOrderMessageWithRetries({
      nostr,
      signer,
      senderPubkey: userPubkey,
      recipientPubkey: sellerPubkey,
      message: inquiryMessage,
      subject: "listing-inquiry",
      strictDelivery: false,
      failureLabel: "Listing inquiry to seller",
      fallbackErrorMessage: "Failed to send the listing inquiry.",
    });
  } catch (error) {
    console.error("Failed to send inquiry DM to seller:", error);
  }

  try {
    // Also send a copy to the buyer so it appears in their chat history.
    // Attempted independently so a seller-side failure can't lose it.
    await sendOrderMessageWithRetries({
      nostr,
      signer,
      senderPubkey: userPubkey,
      recipientPubkey: userPubkey,
      message: inquiryMessage,
      subject: "listing-inquiry",
      strictDelivery: false,
      failureLabel: "Listing inquiry copy to buyer",
      fallbackErrorMessage: "Failed to send the listing inquiry copy.",
      onSuccess: (rumor) => {
        // Add to local context for immediate UI feedback
        addNewlyCreatedMessageEvent(
          {
            ...rumor,
            sig: "",
            read: false,
          },
          true
        );
      },
    });
  } catch (error) {
    console.error("Failed to send inquiry DM copy to buyer:", error);
  }
}
