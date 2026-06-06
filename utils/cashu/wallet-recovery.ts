import { Proof } from "@cashu/cashu-ts";
import {
  getLocalStorageData,
  publishProofEvent,
} from "@/utils/nostr/nostr-helper-functions";

type EncryptedPayload = {
  v: 1;
  alg: "AES-GCM";
  salt: string;
  iv: string;
  data: string;
};

const encoder = new TextEncoder();

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  bytes.forEach((b) => {
    binary += String.fromCharCode(b);
  });
  return btoa(binary);
}

async function deriveAesKeyFromPassphrase(
  passphrase: string,
  salt: Uint8Array
): Promise<CryptoKey> {
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    encoder.encode(passphrase),
    "PBKDF2",
    false,
    ["deriveKey"]
  );
  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt,
      iterations: 310000,
      hash: "SHA-256",
    },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt"]
  );
}

async function encryptJsonForStorage(
  value: unknown,
  passphrase: string
): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await deriveAesKeyFromPassphrase(passphrase, salt);
  const plaintext = encoder.encode(JSON.stringify(value));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    plaintext
  );

  const payload: EncryptedPayload = {
    v: 1,
    alg: "AES-GCM",
    salt: bytesToBase64(salt),
    iv: bytesToBase64(iv),
    data: bytesToBase64(new Uint8Array(ciphertext)),
  };

  return JSON.stringify(payload);
}

type Nostr = Parameters<typeof publishProofEvent>[0];
type Signer = Parameters<typeof publishProofEvent>[1];

/**
 * Persist freshly-minted proofs into the buyer's local wallet when the
 * downstream seller-DM hand-off fails. Mirrors the wallet-top-up bookkeeping
 * done by the mint-button claim path: localStorage `tokens`, history entry,
 * and a kind-7375 wallet event so other devices can sync.
 *
 * Idempotency: callers must only invoke this once per failed claim. The
 * pending-mint-store should be transitioned to `claimed` immediately after
 * a successful call so boot recovery does not re-attempt the (already issued)
 * mint quote.
 */
export async function recoverProofsToBuyerWallet(
  nostr: Nostr,
  signer: Signer,
  mintUrl: string,
  proofs: Proof[],
  amount: number
): Promise<void> {
  if (typeof window === "undefined") return;
  if (!proofs || proofs.length === 0) return;

  const { tokens, history } = getLocalStorageData();
  const proofArray = [...tokens, ...proofs];
  const storagePassphrase =
    (typeof process !== "undefined" &&
      process.env &&
      process.env.NEXT_PUBLIC_WALLET_ENCRYPTION_KEY) ||
    "";
  if (!storagePassphrase) {
    throw new Error(
      "Wallet encryption key is not configured; refusing to store proofs in clear text."
    );
  }
  const encryptedTokens = await encryptJsonForStorage(
    proofArray,
    storagePassphrase
  );
  window.localStorage.setItem("tokens", encryptedTokens);
  window.localStorage.setItem(
    "history",
    JSON.stringify([
      {
        type: 3,
        amount,
        date: Math.floor(Date.now() / 1000),
      },
      ...history,
    ])
  );

  // Best-effort wallet event publish; localStorage is the source of truth and
  // sendGiftWrappedMessageEvent / publishProofEvent already cache to DB first
  // so durability does not depend on relay reachability here.
  try {
    await publishProofEvent(
      nostr,
      signer,
      mintUrl,
      proofs,
      "in",
      amount.toString()
    );
  } catch (err) {
    console.warn(
      "[wallet-recovery] proof event publish failed; tokens are safe in localStorage:",
      err
    );
  }
}

/**
 * Race a promise against a deadline. On timeout the returned promise rejects
 * with a Error tagged `__timeout = true`, which callers can branch on to
 * distinguish a genuine throw from an unbounded hang.
 *
 * The original work is NOT cancelled (JS has no general cancellation) — but
 * the caller's UI is unblocked and any in-flight proofs have already been
 * captured by the caller before the race begins.
 */
export interface TimeoutError extends Error {
  __timeout: true;
}

export function isTimeoutError(err: unknown): err is TimeoutError {
  return (
    typeof err === "object" &&
    err !== null &&
    (err as { __timeout?: unknown }).__timeout === true
  );
}

export async function withDeadline<T>(
  work: () => Promise<T>,
  timeoutMs: number,
  label = "operation"
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      const err = new Error(
        `${label} timed out after ${timeoutMs}ms`
      ) as TimeoutError;
      err.__timeout = true;
      reject(err);
    }, timeoutMs);
  });
  try {
    return await Promise.race([work(), timeoutPromise]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
