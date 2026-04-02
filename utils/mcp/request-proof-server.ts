import type { NextApiRequest } from "next";
import { type Event, verifyEvent } from "nostr-tools";
import { getDbPool } from "@/utils/db/db-service";
import {
  McpRequestProof,
  MCP_SIGNED_EVENT_HEADER,
  isMcpRequestProofFresh,
  matchesMcpRequestProof,
  parseSignedEventHeader,
} from "@/utils/mcp/request-proof";

type ProofVerificationResult = {
  ok: boolean;
  status: number;
  error?: string;
};

export function extractSignedEventFromRequest(
  req: NextApiRequest
): Event | undefined {
  const requestBody = req.body as { signedEvent?: Event } | undefined;
  if (requestBody?.signedEvent && typeof requestBody.signedEvent === "object") {
    return requestBody.signedEvent;
  }

  const headerValue = req.headers[MCP_SIGNED_EVENT_HEADER];
  const normalizedHeaderValue = Array.isArray(headerValue)
    ? headerValue[0]
    : headerValue;

  if (typeof normalizedHeaderValue !== "string") {
    return undefined;
  }

  return parseSignedEventHeader(normalizedHeaderValue) ?? undefined;
}

async function consumeRequestProof(
  eventId: string,
  pubkey: string,
  action: string
): Promise<boolean> {
  const pool = getDbPool();
  let client;

  try {
    client = await pool.connect();
    await client.query(
      `DELETE FROM mcp_request_proofs
       WHERE created_at < NOW() - INTERVAL '1 day'`
    );

    const result = await client.query(
      `INSERT INTO mcp_request_proofs (event_id, pubkey, action)
       VALUES ($1, $2, $3)
       ON CONFLICT DO NOTHING`,
      [eventId, pubkey, action]
    );

    return (result.rowCount ?? 0) > 0;
  } finally {
    if (client) client.release();
  }
}

export async function verifyAndConsumeSignedRequestProof(
  signedEvent: Event | undefined,
  proof: McpRequestProof
): Promise<ProofVerificationResult> {
  if (!signedEvent) {
    return {
      ok: false,
      status: 401,
      error: "A signed Nostr request proof is required to prove pubkey ownership.",
    };
  }

  if (!verifyEvent(signedEvent) || signedEvent.pubkey !== proof.pubkey) {
    return {
      ok: false,
      status: 401,
      error: "Invalid signed request proof or pubkey mismatch.",
    };
  }

  if (!matchesMcpRequestProof(signedEvent, proof)) {
    return {
      ok: false,
      status: 401,
      error: "Signed request proof does not match this operation.",
    };
  }

  if (!isMcpRequestProofFresh(signedEvent)) {
    return {
      ok: false,
      status: 401,
      error: "Signed request proof has expired. Please sign the request again.",
    };
  }

  const consumed = await consumeRequestProof(
    signedEvent.id,
    signedEvent.pubkey,
    proof.action
  );

  if (!consumed) {
    return {
      ok: false,
      status: 401,
      error: "Signed request proof has already been used.",
    };
  }

  return { ok: true, status: 200 };
}
