import {
  getLocalStorageData,
  setLocalStorageDataOnSignIn,
} from "./nostr-helper-functions";
import { NostrNSecSigner } from "./signers/nostr-nsec-signer";

let migrationAttempted = false;

function findEncryptedKey() {
  const storedData = getLocalStorageData();

  if (storedData.encryptedPrivateKey) {
    return {
      key: storedData.encryptedPrivateKey,
      inSigner: false,
    };
  }

  if (
    storedData.signer?.type === "nsec" &&
    storedData.signer.encryptedPrivKey
  ) {
    return {
      key: storedData.signer.encryptedPrivKey,
      inSigner: true,
      signer: storedData.signer,
    };
  }

  return { key: null, inSigner: false };
}

export function needsMigration(): boolean {
  if (getLocalStorageData().migrationComplete === true) {
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
  } catch (error) {
    migrationAttempted = true;
    return false;
  }
}
