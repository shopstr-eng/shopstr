import { 
  getLocalStorageData, 
  setLocalStorageDataOnSignIn 
} from './nostr-helper-functions';
import { NostrNSecSigner } from './signers/nostr-nsec-signer';

let migrationAttempted = false;

export async function migrateToNip49(passphrase: string): Promise<boolean> {
  if (migrationAttempted) return true;
  
  try {
    const storedData = getLocalStorageData();
    if (
      storedData.encryptedPrivateKey && 
      typeof storedData.encryptedPrivateKey === 'string' &&
      !storedData.encryptedPrivateKey.startsWith('ncryptsec')
    ) {
      try {
        // Create a temporary signer that just needs the encryptedPrivKey
        // We'll handle getting the privkey manually without a challenge handler
        const tempSigner = new NostrNSecSigner({
          encryptedPrivKey: storedData.encryptedPrivateKey,
          passphrase: passphrase
        }, () => Promise.resolve({ res: "", remind: false }));
        const privateKeyBytes = await tempSigner._getPrivKey();
        const { encryptedPrivKey } = NostrNSecSigner.getEncryptedNSEC(
          privateKeyBytes,
          passphrase
        );
        
        setLocalStorageDataOnSignIn({
          encryptedPrivateKey: encryptedPrivKey,
          migrationComplete: true,
          relays: storedData.relays,
          readRelays: storedData.readRelays,
          writeRelays: storedData.writeRelays,
          mints: storedData.mints,
          wot: storedData.wot,
        });
        
        console.log('Successfully migrated to NIP-49 encryption');
        migrationAttempted = true;
        return true;
      } catch (error) {
        console.error('Failed to decrypt with provided passphrase', error);
        throw new Error('Failed to decrypt with provided passphrase');
      }
    }
    
    migrationAttempted = true;
    return true;
  } catch (error) {
    console.error('NIP-49 Migration error:', error);
    migrationAttempted = true;
    return false;
  }
}

export function needsMigration(): boolean {
  const storedData = getLocalStorageData();
  
  console.log("Migration check - migrationComplete flag:", storedData.migrationComplete);
  console.log("Migration check - encryptedPrivateKey exists:", !!storedData.encryptedPrivateKey);
  
  if (storedData.encryptedPrivateKey) {
    console.log("Migration check - key type:", typeof storedData.encryptedPrivateKey);
    console.log("Migration check - key starts with ncryptsec:", storedData.encryptedPrivateKey.startsWith('ncryptsec'));
  }
  
  if (storedData.migrationComplete === true) {
    return false;
  }
  
  return !!(
    storedData.encryptedPrivateKey && 
    typeof storedData.encryptedPrivateKey === 'string' &&
    !storedData.encryptedPrivateKey.startsWith('ncryptsec')
  );
} 