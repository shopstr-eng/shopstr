import CryptoJS from "crypto-js";
import { randomBytes } from "crypto";

const RECOVERY_KEY_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const RECOVERY_TOKEN_CHARS = "abcdefghijklmnopqrstuvwxyz0123456789";
const RECOVERY_PBKDF2_ITERATIONS = 600000;
const LEGACY_PBKDF2_ITERATIONS = 1000;

function secureRandomIndex(max: number): number {
  const bytes = randomBytes(4);
  const value = bytes.readUInt32BE(0);
  return value % max;
}

export function generateRecoveryKey(): string {
  const segments: string[] = [];
  for (let s = 0; s < 6; s++) {
    let segment = "";
    for (let i = 0; i < 4; i++) {
      segment +=
        RECOVERY_KEY_CHARS[secureRandomIndex(RECOVERY_KEY_CHARS.length)];
    }
    segments.push(segment);
  }
  return segments.join("-");
}

export function hashRecoveryKey(recoveryKey: string): string {
  const normalized = recoveryKey.replace(/-/g, "").toUpperCase();
  return CryptoJS.SHA256(normalized).toString();
}

export function encryptNsecWithRecoveryKey(
  nsec: string,
  recoveryKey: string
): string {
  const normalized = recoveryKey.replace(/-/g, "").toUpperCase();
  const encryptionKey = CryptoJS.PBKDF2(normalized, "milk-market-recovery", {
    keySize: 256 / 32,
    iterations: RECOVERY_PBKDF2_ITERATIONS,
  }).toString();
  return CryptoJS.AES.encrypt(nsec, encryptionKey).toString();
}

export function decryptNsecWithRecoveryKey(
  encryptedNsec: string,
  recoveryKey: string
): string {
  const normalized = recoveryKey.replace(/-/g, "").toUpperCase();

  const newKey = CryptoJS.PBKDF2(normalized, "milk-market-recovery", {
    keySize: 256 / 32,
    iterations: RECOVERY_PBKDF2_ITERATIONS,
  }).toString();
  const attempt = CryptoJS.AES.decrypt(encryptedNsec, newKey).toString(
    CryptoJS.enc.Utf8
  );
  if (attempt) return attempt;

  const legacyKey = CryptoJS.PBKDF2(normalized, "milk-market-recovery", {
    keySize: 256 / 32,
    iterations: LEGACY_PBKDF2_ITERATIONS,
  }).toString();
  const legacyAttempt = CryptoJS.AES.decrypt(encryptedNsec, legacyKey).toString(
    CryptoJS.enc.Utf8
  );
  if (legacyAttempt) return legacyAttempt;

  throw new Error("Invalid recovery key");
}

export function generateRecoveryToken(): string {
  let token = "";
  for (let i = 0; i < 64; i++) {
    token +=
      RECOVERY_TOKEN_CHARS[secureRandomIndex(RECOVERY_TOKEN_CHARS.length)];
  }
  return token;
}

export function generateVerificationCode(): string {
  const bytes = randomBytes(4);
  const num = bytes.readUInt32BE(0) % 1000000;
  return num.toString().padStart(6, "0");
}
