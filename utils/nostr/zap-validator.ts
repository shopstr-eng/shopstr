import { NostrManager, NostrEvent } from "./nostr-manager";
import { verifyEvent } from "nostr-tools";
import {
  decodeInvoice,
  validatePreimage,
} from "@getalby/lightning-tools/bolt11";

export interface ZapReceiptValidationResult {
  valid: boolean;
  amountSats: number;
  payerPubkey?: string;
  receiptId?: string;
  errors: string[];
}

export interface ZapReceiptValidationOptions {
  productId: string;
  expectedRecipientPubkey: string;
  expectedReceiptSignerPubkey: string;
  expectedAmountSats: number;
  minTimestamp: number;
  skipFreshnessCheck?: boolean;
  expectedPreimage?: string;
  expectedLnurl?: string;
  /**
   * Additional pubkeys accepted in the receipt/zap-request 'p' tag besides
   * expectedRecipientPubkey. Most NIP-57 clients put the seller's own nostr
   * pubkey in 'p' (not the LNURL provider's signing key), so inventory
   * counting passes the seller pubkey here to count zaps made outside
   * Shopstr's own purchase flow.
   */
  alternateRecipientPubkeys?: string[];
  /**
   * Treat expectedAmountSats as a minimum instead of an exact match. Used
   * for inventory counting, where a buyer may have tipped above the listed
   * price. Requiring at least the product price keeps sold-out griefing
   * expensive (a forged "sale" costs a real zap of the full price), unlike
   * skipping the amount check entirely. Internal consistency checks
   * (receipt/request amount tags vs the invoice) still apply.
   */
  allowOverpayment?: boolean;
}

const FRESHNESS_WINDOW_SECONDS = 120;

function invalid(errors: string[]): ZapReceiptValidationResult {
  return { valid: false, amountSats: 0, errors };
}

function getTagValue(tags: unknown, tagName: string): string | undefined {
  if (!Array.isArray(tags)) {
    return undefined;
  }

  for (const tag of tags) {
    if (
      Array.isArray(tag) &&
      tag[0] === tagName &&
      typeof tag[1] === "string"
    ) {
      return tag[1];
    }
  }

  return undefined;
}

function parsePositiveMillisats(
  value: string | undefined,
  label: string,
  errors: string[]
): number | undefined {
  if (value === undefined || !/^\d+$/.test(value)) {
    errors.push(`Invalid '${label}' tag in zap receipt`);
    return undefined;
  }

  const millisats = Number(value);
  if (!Number.isSafeInteger(millisats) || millisats <= 0) {
    errors.push(`Invalid '${label}' value in zap receipt`);
    return undefined;
  }

  return millisats;
}

function parsePositiveZapRequestMillisats(
  value: string,
  errors: string[]
): number | undefined {
  if (!/^\d+$/.test(value)) {
    errors.push("Invalid 'amount' tag in zap request");
    return undefined;
  }

  const millisats = Number(value);
  if (!Number.isSafeInteger(millisats) || millisats <= 0) {
    errors.push("Invalid 'amount' value in zap request");
    return undefined;
  }

  return millisats;
}

function parseZapRequest(
  description: string,
  errors: string[]
): NostrEvent | undefined {
  try {
    return JSON.parse(description) as NostrEvent;
  } catch {
    errors.push("Failed to parse 'description' tag as event JSON");
    return undefined;
  }
}

export function validateSingleReceipt(
  receipt: NostrEvent,
  options: ZapReceiptValidationOptions
): ZapReceiptValidationResult {
  const errors: string[] = [];
  const {
    productId,
    expectedRecipientPubkey,
    expectedReceiptSignerPubkey,
    expectedAmountSats,
    minTimestamp,
    skipFreshnessCheck = false,
    expectedPreimage,
    expectedLnurl,
    alternateRecipientPubkeys = [],
    allowOverpayment = false,
  } = options;

  const acceptedRecipientPubkeys = new Set<string>([
    expectedRecipientPubkey,
    ...alternateRecipientPubkeys,
  ]);

  if (!verifyEvent(receipt)) {
    errors.push("Invalid signature on zap receipt");
    return invalid(errors);
  }

  if (receipt.kind !== 9735) {
    errors.push(`Expected kind 9735, got ${receipt.kind}`);
    return invalid(errors);
  }

  if (receipt.pubkey !== expectedReceiptSignerPubkey) {
    errors.push("Receipt signer does not match LNURL provider nostrPubkey");
    return invalid(errors);
  }

  const pTag = getTagValue(receipt.tags, "p");
  if (pTag === undefined || !acceptedRecipientPubkeys.has(pTag)) {
    errors.push("Receipt 'p' tag does not match an accepted zap recipient");
    return invalid(errors);
  }

  const eTag = getTagValue(receipt.tags, "e");
  if (eTag !== productId) {
    errors.push("Receipt 'e' tag does not match product");
    return invalid(errors);
  }

  const bolt11 = getTagValue(receipt.tags, "bolt11");
  if (bolt11 === undefined) {
    errors.push("Missing 'bolt11' tag in zap receipt");
    return invalid(errors);
  }

  const decodedInvoice = decodeInvoice(bolt11);
  if (
    !decodedInvoice ||
    !Number.isSafeInteger(decodedInvoice.millisatoshi) ||
    decodedInvoice.millisatoshi <= 0 ||
    typeof decodedInvoice.paymentHash !== "string" ||
    decodedInvoice.paymentHash.length === 0
  ) {
    errors.push("Invalid 'bolt11' invoice in zap receipt");
    return invalid(errors);
  }

  const invoiceAmountMsat = decodedInvoice.millisatoshi;
  const invoiceAmountSats = invoiceAmountMsat / 1000;
  const expectedAmountMsat = expectedAmountSats * 1000;
  if (!Number.isSafeInteger(expectedAmountMsat) || expectedAmountMsat <= 0) {
    errors.push("Invalid expected zap amount");
    return invalid(errors);
  }

  if (allowOverpayment) {
    if (invoiceAmountMsat < expectedAmountMsat) {
      errors.push(
        `Invoice amount ${invoiceAmountSats} sats is below expected minimum ${expectedAmountSats} sats`
      );
      return invalid(errors);
    }
  } else if (invoiceAmountMsat !== expectedAmountMsat) {
    errors.push(
      `Invoice amount ${invoiceAmountSats} sats does not match expected ${expectedAmountSats} sats`
    );
    return invalid(errors);
  }

  const receiptAmountTag = getTagValue(receipt.tags, "amount");
  if (receiptAmountTag !== undefined) {
    const receiptAmountMsat = parsePositiveMillisats(
      receiptAmountTag,
      "amount",
      errors
    );
    if (receiptAmountMsat === undefined) {
      return invalid(errors);
    }
    if (receiptAmountMsat !== invoiceAmountMsat) {
      errors.push("Zap receipt amount does not match invoice amount");
      return invalid(errors);
    }
  }

  if (expectedPreimage !== undefined) {
    if (!validatePreimage(expectedPreimage, decodedInvoice.paymentHash)) {
      errors.push("Preimage does not match invoice payment hash");
      return invalid(errors);
    }

    const receiptPreimage = getTagValue(receipt.tags, "preimage");
    if (receiptPreimage !== undefined && receiptPreimage !== expectedPreimage) {
      errors.push("Preimage mismatch between receipt and payment");
      return invalid(errors);
    }
  }

  const descTag = getTagValue(receipt.tags, "description");
  if (descTag === undefined) {
    errors.push("Missing 'description' tag (zap request) in zap receipt");
    return invalid(errors);
  }

  const zapRequest = parseZapRequest(descTag, errors);
  if (zapRequest === undefined) {
    return invalid(errors);
  }

  if (zapRequest.kind !== 9734) {
    errors.push(
      `Embedded zap request has kind ${zapRequest.kind}, expected 9734`
    );
    return invalid(errors);
  }

  if (!verifyEvent(zapRequest)) {
    errors.push("Invalid signature on embedded zap request");
    return invalid(errors);
  }

  const reqPTag = getTagValue(zapRequest.tags, "p");
  if (reqPTag === undefined || !acceptedRecipientPubkeys.has(reqPTag)) {
    errors.push("Zap request 'p' tag does not match an accepted zap recipient");
    return invalid(errors);
  }

  const reqETag = getTagValue(zapRequest.tags, "e");
  if (reqETag !== productId) {
    errors.push("Zap request 'e' tag missing or does not match product");
    return invalid(errors);
  }

  const reqAmountTag = getTagValue(zapRequest.tags, "amount");
  if (reqAmountTag !== undefined) {
    const reqAmount = parsePositiveZapRequestMillisats(reqAmountTag, errors);
    if (reqAmount === undefined) {
      return invalid(errors);
    }
    if (reqAmount !== invoiceAmountMsat) {
      errors.push("Zap request amount does not match invoice amount");
      return invalid(errors);
    }
  }

  const reqLnurl = getTagValue(zapRequest.tags, "lnurl");
  if (
    expectedLnurl !== undefined &&
    reqLnurl !== undefined &&
    reqLnurl !== expectedLnurl
  ) {
    errors.push("Zap request 'lnurl' tag does not match expected LNURL");
    return invalid(errors);
  }

  if (!skipFreshnessCheck) {
    // Lower bound: the receipt must not predate the payment attempt (modulo
    // clock skew) — this blocks replays of receipts from earlier purchases.
    // Upper bound: only guard against future-dated events. A slow payer can
    // legitimately settle the invoice minutes after the flow started, and
    // replay protection already comes from the lower bound plus the
    // preimage/payment-hash binding above.
    const lowerBound = minTimestamp - FRESHNESS_WINDOW_SECONDS;
    const upperBound = Math.floor(Date.now() / 1000) + FRESHNESS_WINDOW_SECONDS;
    if (receipt.created_at < lowerBound || receipt.created_at > upperBound) {
      errors.push("Receipt timestamp is outside acceptable window");
      return invalid(errors);
    }
  }

  return {
    valid: true,
    amountSats: invoiceAmountSats,
    payerPubkey: zapRequest.pubkey,
    receiptId: receipt.id,
    errors: [],
  };
}

export async function validateZapReceipt(
  nostr: NostrManager,
  options: ZapReceiptValidationOptions
): Promise<ZapReceiptValidationResult> {
  const filter = {
    kinds: [9735],
    "#e": [options.productId],
    since: options.minTimestamp - FRESHNESS_WINDOW_SECONDS,
  };

  const maxRetries = 5;
  const delayMs = 1000;

  for (let i = 0; i < maxRetries; i++) {
    const events = await nostr.fetch([filter]);
    for (const event of events) {
      const result = validateSingleReceipt(event, options);
      if (result.valid) {
        return result;
      }
    }
    if (i < maxRetries - 1) {
      await new Promise<void>((resolve) => setTimeout(resolve, delayMs));
    }
  }

  return invalid(["No valid zap receipt found after all retries"]);
}
