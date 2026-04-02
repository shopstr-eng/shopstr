import type { NextApiRequest, NextApiResponse } from "next";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  let { nip05, pubkey } = req.query;

  if (Array.isArray(nip05)) nip05 = nip05[0];
  if (Array.isArray(pubkey)) pubkey = pubkey[0];

  if (typeof nip05 !== "string" || typeof pubkey !== "string") {
    return res.status(400).json({ error: "Missing nip05 or pubkey" });
  }

  // According to NIP-05 spec, if there is no username (no '@'), we assume '_@domain'
  if (!nip05.includes("@")) {
    nip05 = `_@${nip05}`;
  }

  try {
    const parts = nip05.split("@");
    if (parts.length !== 2) {
      return res.status(400).json({ verified: false, error: "Invalid format" });
    }

    const [username, domain] = parts;
    if (!username || !domain) {
      return res
        .status(400)
        .json({ verified: false, error: "Invalid username or domain" });
    }

    const url = `https://${domain}/.well-known/nostr.json?name=${username}`;

    // Server-side fetch (bypasses browser CORS policy)
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);

    let response: Response;
    try {
      response = await fetch(url, { signal: controller.signal });
    } finally {
      clearTimeout(timeoutId);
    }

    if (!response.ok) {
      return res.status(200).json({ verified: false });
    }

    const data = await response.json();
    if (!data || typeof data !== "object") {
      return res.status(200).json({ verified: false });
    }

    const names = data.names || {};
    const verified =
      names[username] === pubkey || names[username.toLowerCase()] === pubkey;

    // Cache the result briefly to avoid spamming the target domain
    res.setHeader("Cache-Control", "s-maxage=60, stale-while-revalidate=300");
    return res.status(200).json({ verified });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      console.warn(`NIP-05 verification proxy timeout for ${nip05}`);
    } else {
      console.error("NIP-05 verification proxy error:", error);
    }
    // Return 200 with verified: false so fetching logic cleanly handles it without throwing
    return res.status(200).json({ verified: false });
  }
}
