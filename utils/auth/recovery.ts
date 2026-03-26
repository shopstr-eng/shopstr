import CryptoJS from "crypto-js";

const RECOVERY_KEY_LENGTH = 24;
const RECOVERY_KEY_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function generateRecoveryKey(): string {
  const segments: string[] = [];
  for (let s = 0; s < 6; s++) {
    let segment = "";
    for (let i = 0; i < 4; i++) {
      const randomIndex = Math.floor(Math.random() * RECOVERY_KEY_CHARS.length);
      segment += RECOVERY_KEY_CHARS[randomIndex];
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
    iterations: 1000,
  }).toString();
  return CryptoJS.AES.encrypt(nsec, encryptionKey).toString();
}

export function decryptNsecWithRecoveryKey(
  encryptedNsec: string,
  recoveryKey: string
): string {
  const normalized = recoveryKey.replace(/-/g, "").toUpperCase();
  const encryptionKey = CryptoJS.PBKDF2(normalized, "milk-market-recovery", {
    keySize: 256 / 32,
    iterations: 1000,
  }).toString();
  const decrypted = CryptoJS.AES.decrypt(encryptedNsec, encryptionKey).toString(
    CryptoJS.enc.Utf8
  );
  if (!decrypted) throw new Error("Invalid recovery key");
  return decrypted;
}

export function generateRecoveryToken(): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let token = "";
  for (let i = 0; i < 64; i++) {
    token += chars[Math.floor(Math.random() * chars.length)];
  }
  return token;
}
