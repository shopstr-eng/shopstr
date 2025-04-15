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
    
    // Check both possible locations for the encrypted key
    let encryptedKey = storedData.encryptedPrivateKey;
    let inSignerObject = false;
    
    // If not found in the standard location, check if it's in the signer object
    if (!encryptedKey && storedData.signer && storedData.signer.type === "nsec") {
      encryptedKey = storedData.signer.encryptedPrivKey;
      inSignerObject = true;
      console.log("Migration - Found key in signer object");
    }
    
    if (
      encryptedKey && 
      typeof encryptedKey === 'string' &&
      !encryptedKey.startsWith('ncryptsec')
    ) {
      try {
        console.log("Starting migration with key:", encryptedKey.substring(0, 10) + "...");
        const tempSigner = new NostrNSecSigner({
          encryptedPrivKey: encryptedKey,
          passphrase: passphrase
        }, () => Promise.resolve({ res: "", remind: false }));
        
        const privateKeyBytes = await tempSigner._getPrivKey();
        console.log("Successfully decrypted legacy key");
        
        const { encryptedPrivKey } = NostrNSecSigner.getEncryptedNSEC(
          privateKeyBytes,
          passphrase
        );
        
        console.log("Re-encrypted with NIP-49, updating storage");
        
        // If the key was in the signer object, update it there too
        if (inSignerObject && storedData.signer) {
          const updatedSigner = {
            ...storedData.signer,
            encryptedPrivKey
          };
          
          setLocalStorageDataOnSignIn({
            signer: updatedSigner as any, // Cast to any to avoid type checking as this is serialized data
            migrationComplete: true
          });
        } else {
          // Standard location update
          setLocalStorageDataOnSignIn({
            encryptedPrivateKey: encryptedPrivKey,
            migrationComplete: true,
            relays: storedData.relays,
            readRelays: storedData.readRelays,
            writeRelays: storedData.writeRelays,
            mints: storedData.mints,
            wot: storedData.wot,
          });
        }
        
        console.log('Successfully migrated to NIP-49 encryption');
        migrationAttempted = true;
        return true;
      } catch (error) {
        console.error('Failed to decrypt with provided passphrase', error);
        throw new Error('Failed to decrypt with provided passphrase');
      }
    } else {
      console.log("No legacy key found that needs migration");
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
  
  // Check directly in localStorage for both possible key names
  let encryptedKey = storedData.encryptedPrivateKey;
  
  // If not found in the standard location, check if it's in the signer object
  if (!encryptedKey && storedData.signer && storedData.signer.type === "nsec") {
    encryptedKey = storedData.signer.encryptedPrivKey;
    console.log("Found key in signer object:", !!encryptedKey);
  }
  
  console.log("Migration check - migrationComplete flag:", storedData.migrationComplete);
  console.log("Migration check - encryptedPrivateKey found:", !!encryptedKey);
  
  if (encryptedKey) {
    console.log("Migration check - key type:", typeof encryptedKey);
    console.log("Migration check - key starts with ncryptsec:", encryptedKey.startsWith('ncryptsec'));
  }
  
  if (storedData.migrationComplete === true) {
    return false;
  }
  
  return !!(
    encryptedKey && 
    typeof encryptedKey === 'string' &&
    !encryptedKey.startsWith('ncryptsec')
  );
} 