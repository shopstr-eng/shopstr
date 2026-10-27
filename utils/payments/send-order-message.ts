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

/** The inner kind-14 rumor produced for an order message send. */
export type OrderMessageRumor = Awaited<
  ReturnType<typeof constructGiftWrappedEvent>
>;

export type OrderMessageOptions = Parameters<
  typeof constructGiftWrappedEvent
>[4];

/** Ephemeral sender/receiver keypair set used for one order-message send. */
export type OrderMessageEphemeralKeys = {
  senderPubkey: string;
  senderPrivkey: Uint8Array;
  receiverPubkey: string;
  receiverPrivkey: Uint8Array;
};

/**
 * Generates a fresh ephemeral sender/receiver keypair set. The buyer's real
 * identity travels only in the rumor's "b" tag; these keys exist purely to
 * carry the gift wrap.
 */
export async function generateOrderMessageKeys(): Promise<OrderMessageEphemeralKeys> {
  const { nsec: senderNsec, npub: senderNpub } = await generateKeys();
  const { nsec: receiverNsec, npub: receiverNpub } = await generateKeys();
  return {
    senderPubkey: nip19.decode(senderNpub).data as string,
    senderPrivkey: nip19.decode(senderNsec).data as Uint8Array,
    receiverPubkey: nip19.decode(receiverNpub).data as string,
    receiverPrivkey: nip19.decode(receiverNsec).data as Uint8Array,
  };
}

export type SendOrderMessageParams = {
  nostr: NostrManager;
  signer?: NostrSigner;
  recipientPubkey: string;
  message: string;
  subject: string;
  messageOptions?: OrderMessageOptions;
  /**
   * Pre-generated ephemeral keys. When omitted, a fresh set is generated for
   * this call — callers that retry should omit it so every attempt gets new
   * keys.
   */
  keys?: OrderMessageEphemeralKeys;
  /**
   * When true (the default), the send throws unless the event is durably
   * cached AND at least one relay accepts it. Use for messages that must
   * never be silently lost (order payments, receipts sent from recovery).
   * The checkout invoice cards pass false to preserve their fire-and-forget
   * delivery semantics.
   */
  strictDelivery?: boolean;
};

/**
 * Builds the gift-wrapped order message (rumor -> seal -> gift wrap) and
 * sends it exactly once. Returns the inner rumor so callers can file it into
 * local chat history. Throws on any construction or delivery failure.
 */
export async function sendOrderMessage({
  nostr,
  signer,
  recipientPubkey,
  message,
  subject,
  messageOptions,
  keys,
  strictDelivery = true,
}: SendOrderMessageParams): Promise<OrderMessageRumor> {
  const ephemeralKeys = keys ?? (await generateOrderMessageKeys());

  const giftWrappedMessageEvent = await constructGiftWrappedEvent(
    ephemeralKeys.senderPubkey,
    recipientPubkey,
    message,
    subject,
    messageOptions
  );
  const sealedEvent = await constructMessageSeal(
    // The seal is encrypted/signed with the ephemeral sender privkey, so the
    // signer is only a formality here — mirror the checkout path's fallback.
    signer ?? ({} as NostrSigner),
    giftWrappedMessageEvent,
    ephemeralKeys.senderPubkey,
    recipientPubkey,
    ephemeralKeys.senderPrivkey
  );
  const giftWrappedEvent = await constructMessageGiftWrap(
    sealedEvent,
    ephemeralKeys.receiverPubkey,
    ephemeralKeys.receiverPrivkey,
    recipientPubkey
  );
  await sendGiftWrappedMessageEvent(
    nostr,
    giftWrappedEvent,
    signer,
    strictDelivery
      ? { requireDurableCache: true, requireRelayDelivery: true }
      : undefined
  );
  return giftWrappedMessageEvent;
}

export type SendOrderMessageWithRetriesParams = SendOrderMessageParams & {
  /** Total send attempts before giving up. Defaults to 3. */
  maxAttempts?: number;
  /** Label used in per-attempt failure logs, e.g. "Seller payout notification". */
  failureLabel?: string;
  /** Error message used when every attempt failed without an Error instance. */
  fallbackErrorMessage?: string;
  /**
   * Runs inside the attempt right after a successful send (e.g. filing the
   * rumor into local chat history). A throw here fails the attempt and is
   * retried, matching the checkout cards' existing behavior.
   */
  onSuccess?: (rumor: OrderMessageRumor) => void | Promise<void>;
};

/**
 * Sends an order message with exponential-backoff retries (1s, 2s, ...).
 * Unless `keys` is provided, every attempt uses fresh ephemeral keys. Throws
 * the last error after all attempts so callers keep their own recovery path
 * (pending records, failure surfaces) alive.
 */
export async function sendOrderMessageWithRetries({
  maxAttempts = 3,
  failureLabel = "Order message",
  fallbackErrorMessage = "Order message failed.",
  onSuccess,
  ...sendParams
}: SendOrderMessageWithRetriesParams): Promise<OrderMessageRumor> {
  let lastError: unknown;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const rumor = await sendOrderMessage(sendParams);
      await onSuccess?.(rumor);
      return rumor;
    } catch (error) {
      lastError = error;
      console.warn(`${failureLabel} attempt ${attempt + 1} failed:`, error);
      if (attempt < maxAttempts - 1) {
        // Exponential backoff, matching the checkout retry cadence.
        await new Promise((resolve) =>
          setTimeout(resolve, Math.pow(2, attempt) * 1000)
        );
      }
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new Error(fallbackErrorMessage);
}
