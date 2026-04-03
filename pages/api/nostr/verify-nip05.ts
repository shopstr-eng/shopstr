import type { NextApiRequest, NextApiResponse } from "next";

const REQUEST_TIMEOUT_MS = 10000;

interface NostrJsonResponse {
  names?: Record<string, string>;
}

interface VerifyNip05Response {
  verified: boolean;
}

function parseNip05Identifier(
  nip05: string
): { username: string; url: string } | null {
  if (!nip05) return null;

  const parts = nip05.split("@");
  if (parts.length !== 2) return null;

  const [username, domain] = parts;
  if (!username || !domain) return null;

  try {
    return {
      username,
      url: `https://${domain}/.well-known/nostr.json?name=${username}`,
    };
  } catch {
    return null;
  }
}

function isNip05Match(
  payload: NostrJsonResponse,
  username: string,
  pubkey: string
): boolean {
  if (!payload || typeof payload !== "object") return false;

  const names = payload.names ?? {};
  return names[username] === pubkey || names[username.toLowerCase()] === pubkey;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<VerifyNip05Response | { error: string }>
) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const nip05 =
    typeof req.query.nip05 === "string" ? req.query.nip05.trim() : "";
  const pubkey =
    typeof req.query.pubkey === "string" ? req.query.pubkey.trim() : "";

  if (!nip05 || !pubkey) {
    return res.status(400).json({ error: "nip05 and pubkey are required" });
  }

  const parsedIdentifier = parseNip05Identifier(nip05);
  if (!parsedIdentifier) {
    return res.status(400).json({ error: "Invalid NIP-05 identifier" });
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(parsedIdentifier.url, {
      headers: {
        Accept: "application/json",
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      return res.status(200).json({ verified: false });
    }

    const data = (await response.json()) as NostrJsonResponse;
    return res.status(200).json({
      verified: isNip05Match(data, parsedIdentifier.username, pubkey),
    });
  } catch (error) {
    if ((error as Error).name !== "AbortError") {
      console.error("NIP-05 verification fetch failed:", error);
    }
    return res.status(200).json({ verified: false });
  } finally {
    clearTimeout(timeoutId);
  }
}
