import {
  decryptCredential,
  encryptCredential,
  MIN_CREDENTIAL_PASSPHRASE_LENGTH,
} from "@/utils/nostr/credential-encryption";

const ENCRYPTION_CONTEXT = "shopstr:nip46:v1";

export const NIP46_MIN_PASSPHRASE_LENGTH = MIN_CREDENTIAL_PASSPHRASE_LENGTH;

export type NIP46SignerCredentials = {
  type: "nip46";
  bunker: string;
  appPrivKey: string;
};

type NIP46CredentialPayload = {
  version: 1;
  bunker: string;
  appPrivKey: string;
};

function sanitizeBunkerUrl(bunker: string): string {
  const url = new URL(bunker);
  if (url.protocol !== "bunker:" || !/^[0-9a-f]{64}$/i.test(url.hostname)) {
    throw new Error("Invalid NIP-46 signer credentials.");
  }

  url.searchParams.delete("secret");
  return url.toString();
}

function isPayload(value: unknown): value is NIP46CredentialPayload {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const payload = value as Partial<NIP46CredentialPayload>;
  return (
    payload.version === 1 &&
    typeof payload.bunker === "string" &&
    typeof payload.appPrivKey === "string" &&
    /^[0-9a-f]{64}$/i.test(payload.appPrivKey)
  );
}

export async function encryptNIP46SignerCredentials(
  credentials: NIP46SignerCredentials,
  passphrase: string
): Promise<{ encryptedSigner: string; runtimeSigner: NIP46SignerCredentials }> {
  if (!/^[0-9a-f]{64}$/i.test(credentials.appPrivKey)) {
    throw new Error("Invalid NIP-46 signer credentials.");
  }

  const runtimeSigner: NIP46SignerCredentials = {
    type: "nip46",
    bunker: sanitizeBunkerUrl(credentials.bunker),
    appPrivKey: credentials.appPrivKey,
  };
  const payload: NIP46CredentialPayload = {
    version: 1,
    bunker: runtimeSigner.bunker,
    appPrivKey: runtimeSigner.appPrivKey,
  };

  return {
    encryptedSigner: await encryptCredential(
      JSON.stringify(payload),
      passphrase,
      ENCRYPTION_CONTEXT
    ),
    runtimeSigner,
  };
}

export async function decryptNIP46SignerCredentials(
  encryptedSigner: string,
  passphrase: string
): Promise<NIP46SignerCredentials> {
  try {
    const plaintext = await decryptCredential(
      encryptedSigner,
      passphrase,
      ENCRYPTION_CONTEXT
    );
    const payload: unknown = JSON.parse(plaintext);
    if (!isPayload(payload)) {
      throw new Error("Invalid NIP-46 signer credentials.");
    }

    return {
      type: "nip46",
      bunker: sanitizeBunkerUrl(payload.bunker),
      appPrivKey: payload.appPrivKey,
    };
  } catch {
    throw new Error("Incorrect passphrase or invalid NIP-46 connection.");
  }
}
