import { decryptFileWithNip44 } from "./file-encryption";
import { nip19 } from "nostr-tools";

async function decryptFileWithSigner(
  encryptedData: string | ArrayBuffer,
  sellerNpub: string,
  signer: any
): Promise<Uint8Array> {
  try {
    // Get seller's pubkey
    let sellerPubkey: string;
    if (sellerNpub.startsWith("npub1")) {
      const { data } = nip19.decode(sellerNpub);
      sellerPubkey = data as string;
    } else {
      sellerPubkey = sellerNpub;
    }

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
      const chunks = [];
      for (let i = 0; i < chunkLines.length; i++) {
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

    // Decrypt and reconstruct chunks using signer
    let decryptedBase64 = "";
    for (let i = 0; i < parsedData.chunks.length; i++) {
      try {
        const decryptedChunk = await signer.decrypt(
          sellerPubkey,
          parsedData.chunks[i]
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

      const binaryString = atob(cleanBase64);

      const uint8Array = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        uint8Array[i] = binaryString.charCodeAt(i);
      }

      return uint8Array;
    } catch (base64Error) {
      console.error("Error decoding base64:", base64Error);
      throw new Error("Invalid base64 data in encrypted content");
    }
  } catch (error) {
    console.error("Error decrypting file with signer:", error);
    throw new Error("Failed to decrypt file");
  }
}

export async function viewEncryptedAgreement(
  encryptedFileUrl: string,
  sellerNpub: string,
  signer?: any
): Promise<Blob> {
  try {
    // Fetch the encrypted file
    const response = await fetch(encryptedFileUrl);
    if (!response.ok) {
      throw new Error(`Failed to fetch encrypted file: ${response.statusText}`);
    }

    // Determine format based on content type and URL, then read accordingly
    let encryptedData: string | ArrayBuffer;
    const contentType = response.headers.get("content-type");

    if (
      contentType?.includes("application/octet-stream") ||
      encryptedFileUrl.includes(".enc")
    ) {
      // New binary format
      encryptedData = await response.arrayBuffer();
    } else {
      // Read as text first to check format
      const textContent = await response.text();

      // Check if this is the old text-based encrypted format
      if (
        textContent.includes("Encrypted Herdshare Agreement") &&
        textContent.includes("Metadata:") &&
        textContent.includes("Chunk-")
      ) {
        encryptedData = textContent;
      } else {
        // Convert text back to binary for processing
        const encoder = new TextEncoder();
        encryptedData = encoder.encode(textContent).buffer;
      }
    }

    // Decrypt the file using the signer if provided, otherwise fall back to server-side keys
    let decryptedBytes: Uint8Array;

    if (signer) {
      // Use signer for peer-to-peer chat decryption
      decryptedBytes = await decryptFileWithSigner(
        encryptedData,
        sellerNpub,
        signer
      );
    } else {
      // Fall back to server-side encryption approach
      decryptedBytes = await decryptFileWithNip44(encryptedData, sellerNpub);
    }

    // Validate that we got valid PDF data
    if (decryptedBytes.length < 4) {
      throw new Error("Decrypted data is too small to be a valid PDF");
    }

    // Check for PDF header
    const pdfHeader = String.fromCharCode(...decryptedBytes.slice(0, 4));
    if (pdfHeader !== "%PDF") {
      console.error("PDF header check failed. Expected %PDF, got:", pdfHeader);
      console.error(
        "First 20 bytes as array:",
        Array.from(decryptedBytes.slice(0, 20))
      );
      console.error(
        "First 20 bytes as string:",
        String.fromCharCode(...decryptedBytes.slice(0, 20))
      );
      throw new Error(
        `Decrypted data does not appear to be a valid PDF file. Header: ${pdfHeader}`
      );
    }

    // Additional validation - check for PDF version
    const versionCheck = String.fromCharCode(...decryptedBytes.slice(0, 8));
    if (!versionCheck.startsWith("%PDF-1.")) {
      console.error("Invalid PDF version:", versionCheck);
      throw new Error(`Invalid PDF version: ${versionCheck}`);
    }

    // Create a blob from the decrypted data
    const decryptedBlob = new Blob([decryptedBytes.buffer as ArrayBuffer], {
      type: "application/pdf",
    });

    return decryptedBlob;
  } catch (error) {
    console.error("Error viewing encrypted agreement:", error);
    throw new Error(
      `Failed to decrypt and view agreement: ${
        error instanceof Error ? error.message : "Unknown error"
      }`
    );
  }
}

export function downloadDecryptedAgreement(
  blob: Blob,
  filename: string = "decrypted-agreement.pdf"
) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
