import CryptoJS from "crypto-js";

if (!process.env.SERVER_ENCRYPTION_KEY) {
  throw new Error("FATAL: SERVER_ENCRYPTION_KEY is not set in environment variables.");
}

const SERVER_KEY = process.env.SERVER_ENCRYPTION_KEY;

export function encryptForServer(data: string): string {
  if (!data) return "";
  return CryptoJS.AES.encrypt(data, SERVER_KEY).toString();
}

export function decryptForServer(encrypted: string): string {
  if (!encrypted) return "";
  const bytes = CryptoJS.AES.decrypt(encrypted, SERVER_KEY);
  return bytes.toString(CryptoJS.enc.Utf8);
}