import { NostrManager, NostrEvent } from "./nostr-manager";
import { verifyEvent } from "nostr-tools";

export interface ZapReceiptValidationResult {
  valid: boolean;
  amountSats: number;
  payerPubkey?: string;
  receiptId?: string;
  errors: string[];
}

interface ValidateOptions {
  skipFreshnessCheck?: boolean;
  expectedPreimage?: string;
}

function getTagValue(tags: string[][], tagName: string): string | undefined {
  for (const tag of tags) {
    if (tag[0] === tagName) {
      return tag[1];
    }
  }
  return undefined;
}

export function validateSingleReceipt(
  receipt: NostrEvent,
  productId: string,
  sellerPubkey: string,
  expectedAmountSats: number,
  minTimestamp: number,
  options?: ValidateOptions
): ZapReceiptValidationResult {
  const errors: string[] = [];
  const skipFreshnessCheck = options?.skipFreshnessCheck ?? false;
  const expectedPreimage = options?.expectedPreimage;

  if (!verifyEvent(receipt)) {
    errors.push("Invalid signature on zap receipt");
    return { valid: false, amountSats: 0, errors };
  }

  if (receipt.kind !== 9735) {
    errors.push(`Expected kind 9735, got ${receipt.kind}`);
    return { valid: false, amountSats: 0, errors };
  }

  const pTag = getTagValue(receipt.tags, "p");
  if (pTag !== sellerPubkey) {
    errors.push("Receipt 'p' tag does not match seller");
    return { valid: false, amountSats: 0, errors };
  }

  const eTag = getTagValue(receipt.tags, "e");
  if (eTag !== productId) {
    errors.push("Receipt 'e' tag does not match product");
    return { valid: false, amountSats: 0, errors };
  }

  const amountTag = getTagValue(receipt.tags, "amount");
  if (amountTag === undefined || !/^\d+$/.test(amountTag)) {
    errors.push("Missing or invalid 'amount' tag in zap receipt");
    return { valid: false, amountSats: 0, errors };
  }
  const amountMsat = parseInt(amountTag, 10);
  if (!Number.isSafeInteger(amountMsat) || amountMsat <= 0) {
    errors.push("Invalid amount value in zap receipt");
    return { valid: false, amountSats: 0, errors };
  }
  const amountSats = Math.round(amountMsat / 1000);
  if (Math.abs(amountSats - expectedAmountSats) > 1) {
    errors.push(
      `Zap receipt amount ${amountSats} sats does not match expected ${expectedAmountSats} sats`
    );
    return { valid: false, amountSats: 0, errors };
  }

  if (expectedPreimage !== undefined) {
    const preimageTag = getTagValue(receipt.tags, "preimage");
    if (preimageTag === undefined) {
      errors.push("Missing 'preimage' tag in zap receipt (required for verification)");
      return { valid: false, amountSats: 0, errors };
    }
    if (preimageTag !== expectedPreimage) {
      errors.push("Preimage mismatch between receipt and payment");
      return { valid: false, amountSats: 0, errors };
    }
  }

  const descTag = getTagValue(receipt.tags, "description");
  if (descTag === undefined) {
    errors.push("Missing 'description' tag (zap request) in zap receipt");
    return { valid: false, amountSats: 0, errors };
  }

  let zapRequest: NostrEvent;
  try {
    zapRequest = JSON.parse(descTag) as NostrEvent;
  } catch {
    errors.push("Failed to parse 'description' tag as event JSON");
    return { valid: false, amountSats: 0, errors };
  }

  if (zapRequest.kind !== 9734) {
    errors.push(`Embedded zap request has kind ${zapRequest.kind}, expected 9734`);
    return { valid: false, amountSats: 0, errors };
  }

  if (!verifyEvent(zapRequest)) {
    errors.push("Invalid signature on embedded zap request");
    return { valid: false, amountSats: 0, errors };
  }

  const reqPTag = getTagValue(zapRequest.tags, "p");
  if (reqPTag !== sellerPubkey) {
    errors.push("Zap request 'p' tag does not match seller");
    return { valid: false, amountSats: 0, errors };
  }

  const reqETag = getTagValue(zapRequest.tags, "e");
  if (reqETag !== productId) {
    errors.push("Zap request 'e' tag missing or does not match product");
    return { valid: false, amountSats: 0, errors };
  }

  const reqAmount = getTagValue(zapRequest.tags, "amount");
  if (reqAmount !== undefined) {
    const reqMsat = parseInt(reqAmount, 10);
    if (Number.isSafeInteger(reqMsat) && Math.abs(reqMsat - amountMsat) > 1000) {
      errors.push("Zap request amount does not match receipt amount");
      return { valid: false, amountSats: 0, errors };
    }
  }

  if (!skipFreshnessCheck) {
    const WINDOW = 120;
    const lowerBound = minTimestamp - WINDOW;
    const upperBound = minTimestamp + WINDOW;
    if (receipt.created_at < lowerBound || receipt.created_at > upperBound) {
      errors.push("Receipt timestamp is outside acceptable window");
      return { valid: false, amountSats: 0, errors };
    }
  }

  return {
    valid: true,
    amountSats,
    payerPubkey: zapRequest.pubkey,
    receiptId: receipt.id,
    errors: [],
  };
}

export async function validateZapReceipt(
  nostr: NostrManager,
  productId: string,
  minTimestamp: number,
  sellerPubkey: string,
  expectedAmountSats: number,
  expectedPreimage?: string
): Promise<ZapReceiptValidationResult> {
  const filter = {
    kinds: [9735],
    "#e": [productId],
    since: minTimestamp,
  };

  const maxRetries = 5;
  const delayMs = 1000;

  for (let i = 0; i < maxRetries; i++) {
    const events = await nostr.fetch([filter]);
    for (const event of events) {
      const result = validateSingleReceipt(
        event,
        productId,
        sellerPubkey,
        expectedAmountSats,
        minTimestamp,
        { expectedPreimage }
      );
      if (result.valid) {
        return result;
      }
    }
    if (i < maxRetries - 1) {
      await new Promise<void>((resolve) => setTimeout(resolve, delayMs));
    }
  }

  return {
    valid: false,
    amountSats: 0,
    errors: ["No valid zap receipt found after all retries"],
  };
}
