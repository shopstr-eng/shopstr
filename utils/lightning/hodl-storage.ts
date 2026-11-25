import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

export class HodlStorageUnavailableError extends Error {
  constructor() {
    super("Escrow storage encryption is unavailable");
    this.name = "HodlStorageUnavailableError";
  }
}

export function getHodlStorageKey(): Buffer {
  const key = process.env.HODL_ESCROW_ENCRYPTION_KEY?.trim();
  if (!key || !/^[0-9a-f]{64}$/i.test(key))
    throw new HodlStorageUnavailableError();
  return Buffer.from(key, "hex");
}

/** AES-GCM binds each value to its order and purpose, preventing row swapping. */
export function encryptHodlValue(
  value: string,
  paymentHash: string,
  purpose: "preimage" | "order" | "fulfillment"
): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", getHodlStorageKey(), iv);
  cipher.setAAD(
    Buffer.from(`shopstr:hodl:v1:${paymentHash.toLowerCase()}:${purpose}`)
  );
  const ciphertext = Buffer.concat([
    cipher.update(value, "utf8"),
    cipher.final(),
  ]);
  return [
    "v1",
    iv.toString("hex"),
    cipher.getAuthTag().toString("hex"),
    ciphertext.toString("hex"),
  ].join(":");
}

export function decryptHodlValue(
  value: string,
  paymentHash: string,
  purpose: "preimage" | "order" | "fulfillment"
): string {
  try {
    const [version, iv, tag, ciphertext, extra] = value.split(":");
    if (
      version !== "v1" ||
      extra !== undefined ||
      !/^[0-9a-f]{24}$/.test(iv ?? "") ||
      !/^[0-9a-f]{32}$/.test(tag ?? "") ||
      !/^(?:[0-9a-f]{2})*$/.test(ciphertext ?? "!")
    )
      throw new Error();
    const decipher = createDecipheriv(
      "aes-256-gcm",
      getHodlStorageKey(),
      Buffer.from(iv!, "hex")
    );
    decipher.setAAD(
      Buffer.from(`shopstr:hodl:v1:${paymentHash.toLowerCase()}:${purpose}`)
    );
    decipher.setAuthTag(Buffer.from(tag!, "hex"));
    return Buffer.concat([
      decipher.update(Buffer.from(ciphertext!, "hex")),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    throw new HodlStorageUnavailableError();
  }
}
