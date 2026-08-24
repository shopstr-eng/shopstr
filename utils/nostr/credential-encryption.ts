const ENVELOPE_VERSION = 1;
const PBKDF2_ITERATIONS = 600_000;
const SALT_BYTES = 16;
const IV_BYTES = 12;
const AES_KEY_LENGTH = 256;
const AUTH_TAG_LENGTH = 128;

export const MIN_CREDENTIAL_PASSPHRASE_LENGTH = 12;

type CredentialEncryptionEnvelope = {
  version: typeof ENVELOPE_VERSION;
  kdf: "PBKDF2-SHA-256";
  iterations: typeof PBKDF2_ITERATIONS;
  cipher: "AES-256-GCM";
  salt: string;
  iv: string;
  ciphertext: string;
};

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder("utf-8", { fatal: true });

function getWebCrypto(): Crypto {
  if (!globalThis.crypto?.subtle) {
    throw new Error("Secure credential encryption is unavailable.");
  }
  return globalThis.crypto;
}

function normalizePassphrase(passphrase: string): string {
  const normalized = passphrase.trim();
  if (normalized.length < MIN_CREDENTIAL_PASSPHRASE_LENGTH) {
    throw new Error(
      `Passphrase must be at least ${MIN_CREDENTIAL_PASSPHRASE_LENGTH} characters.`
    );
  }
  return normalized;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function base64ToBytes(value: string): Uint8Array {
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(value) || value.length % 4 !== 0) {
    throw new Error("Invalid encrypted credential data.");
  }

  const binary = atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

function isEnvelope(value: unknown): value is CredentialEncryptionEnvelope {
  if (!value || typeof value !== "object") return false;
  const envelope = value as Partial<CredentialEncryptionEnvelope>;
  return (
    envelope.version === ENVELOPE_VERSION &&
    envelope.kdf === "PBKDF2-SHA-256" &&
    envelope.iterations === PBKDF2_ITERATIONS &&
    envelope.cipher === "AES-256-GCM" &&
    typeof envelope.salt === "string" &&
    typeof envelope.iv === "string" &&
    typeof envelope.ciphertext === "string"
  );
}

async function deriveKey(
  passphrase: string,
  salt: Uint8Array,
  usages: KeyUsage[]
): Promise<CryptoKey> {
  const crypto = getWebCrypto();
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    textEncoder.encode(normalizePassphrase(passphrase)),
    "PBKDF2",
    false,
    ["deriveKey"]
  );

  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      hash: "SHA-256",
      salt: toArrayBuffer(salt),
      iterations: PBKDF2_ITERATIONS,
    },
    keyMaterial,
    { name: "AES-GCM", length: AES_KEY_LENGTH },
    false,
    usages
  );
}

export async function encryptCredential(
  plaintext: string,
  passphrase: string,
  context: string
): Promise<string> {
  const crypto = getWebCrypto();
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const key = await deriveKey(passphrase, salt, ["encrypt"]);
  const ciphertext = await crypto.subtle.encrypt(
    {
      name: "AES-GCM",
      iv,
      additionalData: textEncoder.encode(context),
      tagLength: AUTH_TAG_LENGTH,
    },
    key,
    textEncoder.encode(plaintext)
  );

  const envelope: CredentialEncryptionEnvelope = {
    version: ENVELOPE_VERSION,
    kdf: "PBKDF2-SHA-256",
    iterations: PBKDF2_ITERATIONS,
    cipher: "AES-256-GCM",
    salt: bytesToBase64(salt),
    iv: bytesToBase64(iv),
    ciphertext: bytesToBase64(new Uint8Array(ciphertext)),
  };

  return JSON.stringify(envelope);
}

export async function decryptCredential(
  encryptedCredential: string,
  passphrase: string,
  context: string
): Promise<string> {
  const parsed: unknown = JSON.parse(encryptedCredential);
  if (!isEnvelope(parsed)) throw new Error("Invalid encryption envelope.");

  const salt = base64ToBytes(parsed.salt);
  const iv = base64ToBytes(parsed.iv);
  const ciphertext = base64ToBytes(parsed.ciphertext);
  if (
    salt.length !== SALT_BYTES ||
    iv.length !== IV_BYTES ||
    ciphertext.length <= AUTH_TAG_LENGTH / 8
  ) {
    throw new Error("Invalid encryption envelope.");
  }

  const crypto = getWebCrypto();
  const key = await deriveKey(passphrase, salt, ["decrypt"]);
  const plaintext = await crypto.subtle.decrypt(
    {
      name: "AES-GCM",
      iv: toArrayBuffer(iv),
      additionalData: textEncoder.encode(context),
      tagLength: AUTH_TAG_LENGTH,
    },
    key,
    toArrayBuffer(ciphertext)
  );
  return textDecoder.decode(plaintext);
}
