import { nip44, nip19, generateSecretKey, getPublicKey } from "nostr-tools";
import type { NostrSigner } from "@/utils/nostr/signers/nostr-signer";

const MAX_CHUNK_SIZE = 60000;

export interface DigitalContentPublicPayloadV1 {
  url: string;
  nsec: string;
  mimeType?: string;
  fileName?: string;
}

export interface DigitalContentPublicPayloadV2 {
  v: 2;
  url: string;
  sellerEncryptedFileNsec: string;
  mimeType?: string;
  fileName?: string;
}

interface LegacyDigitalContentPublicPayloadV2 {
  v: 2;
  url: string;
  keyEnvelope: string;
  mimeType?: string;
  fileName?: string;
}

export type DigitalContentPublicPayload =
  | DigitalContentPublicPayloadV1
  | DigitalContentPublicPayloadV2;

export interface DigitalContentDeliveryPayloadV1 {
  listingId?: string;
  payload: string;
}

export interface DigitalContentDeliveryPayloadV2 {
  v: 2;
  url: string;
  nsec: string;
  mimeType?: string;
  fileName?: string;
  listingId?: string;
}

export type DigitalContentDeliveryPayload =
  | DigitalContentDeliveryPayloadV1
  | DigitalContentDeliveryPayloadV2;

export function isDigitalContentPublicPayloadV2(
  payload: DigitalContentPublicPayload
): payload is DigitalContentPublicPayloadV2 {
  return (
    typeof payload === "object" &&
    payload !== null &&
    "v" in payload &&
    payload.v === 2 &&
    "sellerEncryptedFileNsec" in payload
  );
}

function isLegacyDigitalContentPublicPayloadV2(
  payload: unknown
): payload is LegacyDigitalContentPublicPayloadV2 {
  return (
    typeof payload === "object" &&
    payload !== null &&
    "v" in payload &&
    (payload as LegacyDigitalContentPublicPayloadV2).v === 2 &&
    "keyEnvelope" in payload
  );
}

export function isDigitalContentDeliveryPayloadV2(
  payload: DigitalContentDeliveryPayload
): payload is DigitalContentDeliveryPayloadV2 {
  return (
    typeof payload === "object" &&
    payload !== null &&
    "v" in payload &&
    payload.v === 2 &&
    "nsec" in payload
  );
}

export async function encryptFileWithNip44(
  file: File
): Promise<{ encryptedFile: File; fileNsec: string }> {
  // Each upload gets its own file key instead of sharing one app-wide nsec.
  const sk = generateSecretKey();
  const pk = getPublicKey(sk);
  const fileNsec = nip19.nsecEncode(sk);

  const conversationKey = nip44.getConversationKey(sk, pk);

  const base64Data = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () =>
      resolve((reader.result as string).split(",")[1] as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

  const encryptedChunks: string[] = [];
  for (let i = 0; i < base64Data.length; i += MAX_CHUNK_SIZE) {
    const chunk = base64Data.slice(i, i + MAX_CHUNK_SIZE);
    encryptedChunks.push(nip44.encrypt(chunk, conversationKey));
  }

  const metadata = {
    totalChunks: encryptedChunks.length,
    originalFileName: file.name,
    originalSize: file.size,
    chunkSize: MAX_CHUNK_SIZE,
  };
  const encryptedMetadata = nip44.encrypt(
    JSON.stringify(metadata),
    conversationKey
  );

  const encryptedData = {
    header: "Encrypted Shopstr Digital Content",
    metadata: encryptedMetadata,
    chunks: encryptedChunks,
    originalFileName: file.name,
    timestamp: new Date().toISOString(),
  };

  const binaryData = new TextEncoder().encode(JSON.stringify(encryptedData));
  const encryptedFile = new File(
    [new Blob([binaryData])],
    `encrypted-${file.name}.enc`,
    {
      type: "application/octet-stream",
    }
  );

  return { encryptedFile, fileNsec };
}

export async function createDigitalContentPublicPayload({
  url,
  fileNsec,
  mimeType,
  fileName,
  sellerPubkey,
  signer,
}: {
  url: string;
  fileNsec: string;
  mimeType?: string;
  fileName?: string;
  sellerPubkey: string;
  signer: Pick<NostrSigner, "encrypt">;
}): Promise<DigitalContentPublicPayloadV2> {
  // The listing keeps only the seller-encrypted copy of the file key.
  const sellerEncryptedFileNsec = await signer.encrypt(sellerPubkey, fileNsec);

  return {
    v: 2,
    url,
    sellerEncryptedFileNsec,
    mimeType,
    fileName,
  };
}

export async function unwrapDigitalContentSellerKey({
  payload,
  signer,
  sellerPubkey,
}: {
  payload: DigitalContentPublicPayload;
  signer: Pick<NostrSigner, "decrypt">;
  sellerPubkey: string;
}): Promise<string> {
  if (!isDigitalContentPublicPayloadV2(payload)) {
    return payload.nsec;
  }

  // The raw file key only gets handed to the buyer in the delivery message.
  return await signer.decrypt(sellerPubkey, payload.sellerEncryptedFileNsec);
}

export async function decryptFileWithNip44(
  encryptedData: ArrayBuffer,
  fileNsec: string
): Promise<Blob> {
  try {
    const { data: sk } = nip19.decode(fileNsec);
    const pk = getPublicKey(sk as Uint8Array);
    const conversationKey = nip44.getConversationKey(sk as Uint8Array, pk);

    const jsonString = new TextDecoder().decode(encryptedData);
    const parsedData = JSON.parse(jsonString);

    if (!parsedData.chunks || parsedData.chunks.length === 0) {
      throw new Error("Invalid encrypted file format: missing chunks");
    }

    let decryptedBase64 = "";
    for (let i = 0; i < parsedData.chunks.length; i++) {
      try {
        decryptedBase64 += nip44.decrypt(parsedData.chunks[i], conversationKey);
      } catch (chunkError) {
        console.error(`Failed to decrypt chunk ${i}:`, chunkError);
        throw new Error(`Failed to decrypt chunk ${i}`);
      }
    }

    try {
      const cleanBase64 = decryptedBase64.replace(/[^A-Za-z0-9+/=]/g, "");
      if (cleanBase64.length % 4 !== 0) {
        throw new Error(`Invalid base64 length: ${cleanBase64.length}`);
      }
      const binaryString = atob(cleanBase64);
      const uint8Array = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        uint8Array[i] = binaryString.charCodeAt(i);
      }
      return new Blob([uint8Array]);
    } catch (base64Error) {
      console.error("Error decoding base64:", base64Error);
      throw new Error("Invalid base64 data in encrypted content");
    }
  } catch (error) {
    console.error("Error decrypting file:", error);
    throw new Error("Failed to decrypt file");
  }
}

function encodeUtf8Base64(jsonString: string): string {
  const utf8String = encodeURIComponent(jsonString).replace(
    /%([0-9A-F]{2})/g,
    function toSolidBytes(_match, p1) {
      return String.fromCharCode(Number("0x" + p1));
    }
  );
  return btoa(utf8String);
}

function decodeUtf8Base64(encodedPayload: string): string {
  const utf8String = atob(encodedPayload);
  return decodeURIComponent(
    utf8String
      .split("")
      .map(function (c) {
        return "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2);
      })
      .join("")
  );
}

export function encodeDigitalContentPayload(
  payload: DigitalContentPublicPayload
) {
  return encodeUtf8Base64(JSON.stringify(payload));
}

export function decodeDigitalContentPayload(
  encodedPayload: string
): DigitalContentPublicPayload {
  const jsonString = decodeUtf8Base64(encodedPayload);
  const parsedPayload = JSON.parse(jsonString) as
    | DigitalContentPublicPayload
    | LegacyDigitalContentPublicPayloadV2;

  if (isLegacyDigitalContentPublicPayloadV2(parsedPayload)) {
    const { keyEnvelope, ...rest } = parsedPayload;
    return {
      ...rest,
      sellerEncryptedFileNsec: keyEnvelope,
    };
  }

  return parsedPayload as DigitalContentPublicPayload;
}

export function encodeDigitalContentDeliveryPayload(
  payload: DigitalContentDeliveryPayload
) {
  return encodeUtf8Base64(JSON.stringify(payload));
}

export function decodeDigitalContentDeliveryPayload(
  encodedPayload: string
): DigitalContentDeliveryPayload {
  const jsonString = decodeUtf8Base64(encodedPayload);
  return JSON.parse(jsonString);
}
