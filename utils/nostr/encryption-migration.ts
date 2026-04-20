import { setLocalStorageDataOnSignIn } from "./nostr-helper-functions";
import { storage, STORAGE_KEYS } from "@/utils/storage";
import { NostrNSecSigner } from "./signers/nostr-nsec-signer";

let migrationAttempted = false;

function findEncryptedKey() {
  const encryptedPrivateKey = storage.getItem(
    STORAGE_KEYS.ENCRYPTED_PRIVATE_KEY
  );
  const signer = storage.getJson<any | null>(STORAGE_KEYS.SIGNER, null);

  if (encryptedPrivateKey) {
    return {
      key: encryptedPrivateKey,
      inSigner: false,
    };
  }

  if (signer?.type === "nsec" && signer.encryptedPrivKey) {
    return {
      key: signer.encryptedPrivKey,
      inSigner: true,
      signer: signer,
    };
  }

  return { key: null, inSigner: false };
}

export function needsMigration(): boolean {
  if (storage.getItem(STORAGE_KEYS.MIGRATION_COMPLETE) === "true") {
    return false;
  }
  const { key } = findEncryptedKey();

  return !!(key && typeof key === "string" && !key.startsWith("ncryptsec"));
}

export async function migrateToNip49(passphrase: string): Promise<boolean> {
  if (migrationAttempted) return true;

  try {
    const { key, inSigner, signer } = findEncryptedKey();

    if (!key || typeof key !== "string" || key.startsWith("ncryptsec")) {
      migrationAttempted = true;
      return true;
    }

    const tempSigner = new NostrNSecSigner(
      {
        encryptedPrivKey: key,
        passphrase: passphrase,
      },
      () => Promise.resolve({ res: "", remind: false })
    );

    const privateKeyBytes = await tempSigner._getPrivKey();
    const { encryptedPrivKey } = NostrNSecSigner.getEncryptedNSEC(
      privateKeyBytes,
      passphrase
    );

    if (inSigner && signer) {
      setLocalStorageDataOnSignIn({
        signer: { ...signer, encryptedPrivKey } as any,
        migrationComplete: true,
      });
    } else {
      setLocalStorageDataOnSignIn({
        encryptedPrivateKey: encryptedPrivKey,
        migrationComplete: true,
      });
    }

    migrationAttempted = true;
    return true;
  } catch {
    migrationAttempted = true;
    return false;
  }
}
