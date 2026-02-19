export type EncryptedPayload = {
  encryptedBlob: Blob;
  keyBase64: string;
  ivBase64: string;
};

const toBase64 = (bytes: Uint8Array) => {
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary);
};

const fromBase64 = (base64: string) => {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
};

export async function encryptFileContent(
  file: File
): Promise<EncryptedPayload> {
  const key = await crypto.subtle.generateKey(
    {
      name: "AES-GCM",
      length: 256,
    },
    true,
    ["encrypt", "decrypt"]
  );

  const iv = crypto.getRandomValues(new Uint8Array(12));
  const fileBuffer = await file.arrayBuffer();

  const encrypted = await crypto.subtle.encrypt(
    {
      name: "AES-GCM",
      iv,
    },
    key,
    fileBuffer
  );

  const exportedKey = await crypto.subtle.exportKey("raw", key);

  return {
    encryptedBlob: new Blob([encrypted], {
      type: "application/octet-stream",
    }),
    keyBase64: toBase64(new Uint8Array(exportedKey)),
    ivBase64: toBase64(iv),
  };
}

export async function decryptFileContent(
  encryptedBlob: Blob,
  keyBase64: string,
  ivBase64: string
): Promise<Blob> {
  const key = await crypto.subtle.importKey(
    "raw",
    fromBase64(keyBase64),
    {
      name: "AES-GCM",
    },
    false,
    ["decrypt"]
  );

  const decryptedBuffer = await crypto.subtle.decrypt(
    {
      name: "AES-GCM",
      iv: fromBase64(ivBase64),
    },
    key,
    await encryptedBlob.arrayBuffer()
  );

  return new Blob([decryptedBuffer]);
}

export function encodeDigitalContentPayload(payload: {
  url: string;
  key: string;
  iv: string;
  mimeType?: string;
  fileName?: string;
}) {
  const jsonString = JSON.stringify(payload);
  const utf8String = encodeURIComponent(jsonString).replace(
    /%([0-9A-F]{2})/g,
    function toSolidBytes(_match, p1) {
      return String.fromCharCode(Number("0x" + p1));
    }
  );
  return btoa(utf8String);
}

export function decodeDigitalContentPayload(encodedPayload: string): {
  url: string;
  key: string;
  iv: string;
  mimeType?: string;
  fileName?: string;
} {
  const utf8String = atob(encodedPayload);
  const jsonString = decodeURIComponent(
    utf8String
      .split("")
      .map(function (c) {
        return "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2);
      })
      .join("")
  );
  return JSON.parse(jsonString);
}
