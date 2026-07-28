import CryptoJS from "crypto-js";

export function hashEscrowToken(token: string): string {
  return CryptoJS.SHA256(token).toString(CryptoJS.enc.Hex);
}
