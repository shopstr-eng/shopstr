import CryptoJS from "crypto-js";
import { verifyEvent } from "nostr-tools";
import type { NextApiRequest } from "next";
import type { NostrSigner } from "@/utils/nostr/signers/nostr-signer";

type NostrHttpAuthEvent = {
  id: string;
  pubkey: string;
  created_at: number;
  kind: number;
  tags: string[][];
  content: string;
  sig: string;
};

const NIP98_KIND = 27235;
const MAX_AUTH_AGE_SECONDS = 120;

function sha256Hex(value: string): string {
  return CryptoJS.SHA256(value).toString(CryptoJS.enc.Hex);
}

function toBase64(value: string): string {
  if (typeof window === "undefined") {
    return Buffer.from(value, "utf-8").toString("base64");
  }

  return btoa(value);
}

function fromBase64(value: string): string {
  return Buffer.from(value, "base64").toString("utf-8");
}

function getTagValue(tags: string[][], key: string): string | undefined {
  return tags.find((tag) => tag[0] === key)?.[1];
}

function getRequestOrigin(req: NextApiRequest): string {
  const protoHeader = req.headers["x-forwarded-proto"];
  const proto = Array.isArray(protoHeader)
    ? protoHeader[0]
    : protoHeader || "http";
  const host = req.headers.host;

  return `${proto}://${host}`;
}

export async function createNip98AuthorizationHeader(
  signer: NostrSigner,
  url: string,
  method: string,
  body?: string
): Promise<string> {
  const tags: string[][] = [
    ["u", url],
    ["method", method.toUpperCase()],
  ];

  if (body !== undefined) {
    tags.push(["payload", sha256Hex(body)]);
  }

  const authEvent = await signer.sign({
    kind: NIP98_KIND,
    created_at: Math.floor(Date.now() / 1000),
    tags,
    content: "",
  });

  return `Nostr ${toBase64(JSON.stringify(authEvent))}`;
}

export async function verifyNip98Request(
  req: NextApiRequest,
  expectedMethod: string,
  body?: unknown
): Promise<{ ok: true; pubkey: string } | { ok: false; error: string }> {
  const authorization = req.headers.authorization;
  if (!authorization || !authorization.startsWith("Nostr ")) {
    return { ok: false, error: "Missing NIP-98 authorization header" };
  }

  try {
    const encodedEvent = authorization.substring(6).trim();
    const parsed = JSON.parse(fromBase64(encodedEvent)) as NostrHttpAuthEvent;

    if (parsed.kind !== NIP98_KIND) {
      return { ok: false, error: "Invalid authorization event kind" };
    }

    if (!verifyEvent(parsed as any)) {
      return { ok: false, error: "Invalid authorization signature" };
    }

    const now = Math.floor(Date.now() / 1000);
    if (Math.abs(now - parsed.created_at) > MAX_AUTH_AGE_SECONDS) {
      return { ok: false, error: "Authorization event expired" };
    }

    const methodTag = getTagValue(parsed.tags, "method");
    if (methodTag?.toUpperCase() !== expectedMethod.toUpperCase()) {
      return { ok: false, error: "Authorization method mismatch" };
    }

    const requestUrl = `${getRequestOrigin(req)}${req.url}`;
    const urlTag = getTagValue(parsed.tags, "u");
    if (urlTag !== requestUrl) {
      return { ok: false, error: "Authorization URL mismatch" };
    }

    const requestBody =
      body ?? (expectedMethod.toUpperCase() !== "GET" ? req.body : undefined);
    if (requestBody !== undefined) {
      const payloadTag = getTagValue(parsed.tags, "payload");
      if (!payloadTag) {
        return { ok: false, error: "Missing authorization payload hash" };
      }

      const serializedBody =
        typeof requestBody === "string"
          ? requestBody
          : JSON.stringify(requestBody);
      const expectedPayloadHash = sha256Hex(serializedBody);
      if (payloadTag !== expectedPayloadHash) {
        return { ok: false, error: "Authorization payload mismatch" };
      }
    }

    return { ok: true, pubkey: parsed.pubkey };
  } catch {
    return { ok: false, error: "Malformed NIP-98 authorization" };
  }
}
