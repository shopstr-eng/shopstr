import { nip44, nip19 } from "nostr-tools";

export interface EncryptionKeys {
  encryptionPubkey: string;
  encryptionNsec: string;
}

export async function getEncryptionKeys(
  encryptionNpub: string
): Promise<EncryptionKeys> {
  // Get user's pubkey from npub or use as pubkey directly if it's already in hex format
  let encryptionPubkey: string;
  if (encryptionNpub.startsWith("npub1")) {
    const { data } = nip19.decode(encryptionNpub);
    encryptionPubkey = data as string;
  } else {
    // Assume it's already a hex pubkey
    encryptionPubkey = encryptionNpub;
  }

  // Fetch encryption nsec from API
  const response = await fetch("/api/get-encryption-nsec", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    throw new Error("Failed to get encryption key");
  }

  const { value: encryptionNsec } = await response.json();

  return {
    encryptionPubkey,
    encryptionNsec,
  };
}

export async function encryptFileWithNip44(
  file: File,
  encryptionNpub: string,
  isSigned?: boolean,
  signer?: any
): Promise<File> {
  try {
    // Convert to base64 safely using FileReader
    const base64Data = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        // Remove the data URL prefix (data:application/pdf;base64,)
        const base64 = result.split(",")[1];
        resolve(base64 as string);
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });

    // Encrypt in chunks due to NIP-44 size limits (max ~65KB per message)
    const maxChunkSize = 60000; // Use 60KB to be safe with base64 encoding overhead
    const encryptedChunks: string[] = [];

    let encryptedMetadata: string;

    if (isSigned) {
      if (!signer) {
        throw new Error("No signer provided for signed file encryption");
      }

      // Get seller's pubkey
      let sellerPubkey: string;
      if (encryptionNpub.startsWith("npub1")) {
        const { data } = nip19.decode(encryptionNpub);
        sellerPubkey = data as string;
      } else {
        sellerPubkey = encryptionNpub;
      }

      // Encrypt chunks using signer's encrypt method
      for (let i = 0; i < base64Data.length; i += maxChunkSize) {
        const chunk = base64Data.slice(i, i + maxChunkSize);
        const encryptedChunk = await signer.encrypt(sellerPubkey, chunk);
        encryptedChunks.push(encryptedChunk);
      }

      // Create metadata for reconstruction
      const metadata = {
        totalChunks: encryptedChunks.length,
        originalFileName: file.name,
        originalSize: file.size,
        chunkSize: maxChunkSize,
      };

      encryptedMetadata = await signer.encrypt(
        sellerPubkey,
        JSON.stringify(metadata)
      );
    } else {
      // Original encryption logic using ENCRYPTION_NSEC
      const { encryptionPubkey, encryptionNsec } =
        await getEncryptionKeys(encryptionNpub);

      // Decode the encryption private key
      const { data: encryptionPrivKey } = nip19.decode(encryptionNsec);

      // Generate conversation key
      const conversationKey = nip44.getConversationKey(
        encryptionPrivKey as Uint8Array,
        encryptionPubkey
      );

      for (let i = 0; i < base64Data.length; i += maxChunkSize) {
        const chunk = base64Data.slice(i, i + maxChunkSize);
        const encryptedChunk = nip44.encrypt(chunk, conversationKey);
        encryptedChunks.push(encryptedChunk);
      }

      // Create metadata for reconstruction
      const metadata = {
        totalChunks: encryptedChunks.length,
        originalFileName: file.name,
        originalSize: file.size,
        chunkSize: maxChunkSize,
      };

      encryptedMetadata = nip44.encrypt(
        JSON.stringify(metadata),
        conversationKey
      );
    }

    // Create a structured format for the encrypted data
    const encryptedData = {
      header: "Encrypted Herdshare Agreement",
      metadata: encryptedMetadata,
      chunks: encryptedChunks,
      originalFileName: file.name,
      timestamp: new Date().toISOString(),
    };

    // Convert to JSON string and then to binary
    const jsonString = JSON.stringify(encryptedData);
    const encoder = new TextEncoder();
    const binaryData = encoder.encode(jsonString);

    const blob = new Blob([binaryData], { type: "application/octet-stream" });

    // Create new file with encrypted content - use .enc extension to indicate it's encrypted
    const encryptedFile = new File(
      [blob],
      `encrypted-${file.name.replace(".pdf", ".enc")}`,
      { type: "application/octet-stream" }
    );

    return encryptedFile;
  } catch (error) {
    console.error("Error encrypting file:", error);
    throw new Error("Failed to encrypt file");
  }
}

export async function decryptFileWithNip44(
  encryptedData: string | ArrayBuffer,
  encryptionNpub: string
): Promise<Uint8Array> {
  try {
    // Get encryption keys
    const { encryptionPubkey, encryptionNsec } =
      await getEncryptionKeys(encryptionNpub);

    // Decode the encryption private key
    const { data: encryptionPrivKey } = nip19.decode(encryptionNsec);

    // Generate conversation key
    const conversationKey = nip44.getConversationKey(
      encryptionPrivKey as Uint8Array,
      encryptionPubkey
    );

    let parsedData;

    // Handle both binary and text formats for backwards compatibility
    if (typeof encryptedData === "string") {
      // Old text-based format
      const lines = encryptedData.split("\n");
      const metadataLine = lines.find((line) => line.startsWith("Metadata: "));
      const chunkLines = lines.filter((line) => line.startsWith("Chunk-"));

      if (!metadataLine || chunkLines.length === 0) {
        throw new Error("Invalid encrypted file format");
      }

      const encryptedMetadata = metadataLine.replace("Metadata: ", "");
      const metadataJson = nip44.decrypt(encryptedMetadata, conversationKey);
      const metadata = JSON.parse(metadataJson);

      const chunks = [];
      for (let i = 0; i < metadata.totalChunks; i++) {
        const chunkLine = chunkLines.find((line) =>
          line.startsWith(`Chunk-${i}: `)
        );
        if (!chunkLine) {
          throw new Error(`Missing chunk ${i}`);
        }
        const encryptedChunk = chunkLine.replace(`Chunk-${i}: `, "");
        chunks.push(encryptedChunk);
      }

      parsedData = { metadata: encryptedMetadata, chunks };
    } else {
      // New binary format
      const decoder = new TextDecoder();
      const jsonString = decoder.decode(encryptedData);
      parsedData = JSON.parse(jsonString);
    }

    // Decrypt and reconstruct chunks
    let decryptedBase64 = "";
    for (let i = 0; i < parsedData.chunks.length; i++) {
      try {
        const decryptedChunk = nip44.decrypt(
          parsedData.chunks[i],
          conversationKey
        );
        decryptedBase64 += decryptedChunk;
      } catch (chunkError) {
        console.error(`Failed to decrypt chunk ${i}:`, chunkError);
        throw new Error(`Failed to decrypt chunk ${i}`);
      }
    }

    // Convert back from base64 to binary safely
    try {
      // Clean up the base64 string - remove any whitespace or invalid characters
      const cleanBase64 = decryptedBase64.replace(/[^A-Za-z0-9+/=]/g, "");

      // Validate base64 format
      if (cleanBase64.length % 4 !== 0) {
        console.error("Invalid base64 length:", cleanBase64.length);
        throw new Error(`Invalid base64 length: ${cleanBase64.length}`);
      }

      // Test if base64 is valid by trying to decode a small portion first
      try {
        atob(cleanBase64.substring(0, Math.min(100, cleanBase64.length)));
      } catch (testError) {
        console.error("Base64 test decode failed:", testError);
        throw new Error("Invalid base64 characters detected");
      }

      const binaryString = atob(cleanBase64);

      const uint8Array = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        uint8Array[i] = binaryString.charCodeAt(i);
      }

      return uint8Array;
    } catch (base64Error) {
      console.error("Error decoding base64:", base64Error);
      console.error("Base64 data length:", decryptedBase64.length);
      console.error(
        "First 100 chars of base64:",
        decryptedBase64.substring(0, 100)
      );
      throw new Error("Invalid base64 data in encrypted content");
    }
  } catch (error) {
    console.error("Error decrypting file:", error);
    throw new Error("Failed to decrypt file");
  }
}
