import {
  decryptCredential,
  encryptCredential,
  MIN_CREDENTIAL_PASSPHRASE_LENGTH,
} from "@/utils/nostr/credential-encryption";

const ENCRYPTION_CONTEXT = "shopstr:nwc:v1";

export const NWC_MIN_PASSPHRASE_LENGTH = MIN_CREDENTIAL_PASSPHRASE_LENGTH;

export async function encryptNWCString(
  nwcString: string,
  passphrase: string
): Promise<string> {
  return encryptCredential(nwcString, passphrase, ENCRYPTION_CONTEXT);
}

export async function decryptNWCString(
  encryptedNWCString: string,
  passphrase: string
): Promise<string> {
  try {
    const nwcString = await decryptCredential(
      encryptedNWCString,
      passphrase,
      ENCRYPTION_CONTEXT
    );

    if (!nwcString.startsWith("nostr+walletconnect://")) {
      throw new Error("Invalid NWC connection.");
    }
    return nwcString;
  } catch {
    throw new Error("Incorrect passphrase or invalid NWC connection.");
  }
}
