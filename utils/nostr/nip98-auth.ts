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
  method: string
): Promise<string> {
  const authEvent = await signer.sign({
    kind: NIP98_KIND,
    created_at: Math.floor(Date.now() / 1000),
    tags: [
      ["u", url],
      ["method", method.toUpperCase()],
    ],
    content: "",
  });

  return `Nostr ${toBase64(JSON.stringify(authEvent))}`;
}

export function verifyNip98Request(
  req: NextApiRequest,
  expectedMethod: string
): { ok: true; pubkey: string } | { ok: false; error: string } {
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

    return { ok: true, pubkey: parsed.pubkey };
  } catch {
    return { ok: false, error: "Malformed NIP-98 authorization" };
  }
}
