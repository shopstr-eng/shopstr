import { type Event } from "nostr-tools";
import { NostrEventTemplate } from "@/utils/nostr/nostr-manager";

export const MCP_SIGNED_EVENT_HEADER = "x-mcp-signed-event";
export const MCP_REQUEST_PROOF_KIND = 27235;
export const MCP_REQUEST_PROOF_MAX_AGE_SECONDS = 300;

type ProofValue = string | number | null | undefined;
type ProofMethod = "GET" | "POST" | "DELETE";

export type McpRequestProof = {
  action: string;
  method: ProofMethod;
  path: string;
  pubkey: string;
  fields?: Record<string, ProofValue>;
};

function serializeProofValue(value: ProofValue): string | undefined {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }

  return String(value);
}

function sortedProofFields(
  fields: Record<string, ProofValue> = {}
): Array<[string, string]> {
  return Object.entries(fields)
    .flatMap(([key, value]) => {
      const normalizedValue = serializeProofValue(value);
      return normalizedValue === undefined
        ? []
        : ([[key, normalizedValue]] as Array<[string, string]>);
    })
    .sort(([left], [right]) => left.localeCompare(right));
}

export function buildMcpRequestProofTags(
  proof: McpRequestProof
): Array<[string, string]> {
  return [
    ["action", proof.action],
    ["method", proof.method],
    ["path", proof.path],
    ["pubkey", proof.pubkey],
    ...sortedProofFields(proof.fields),
  ];
}

export function buildMcpRequestProofTemplate(
  proof: McpRequestProof
): NostrEventTemplate {
  return {
    kind: MCP_REQUEST_PROOF_KIND,
    created_at: Math.floor(Date.now() / 1000),
    content: "",
    tags: buildMcpRequestProofTags(proof),
  };
}

function getTagValue(event: Event, tagName: string): string | undefined {
  return event.tags.find((tag) => tag[0] === tagName)?.[1];
}

export function matchesMcpRequestProof(
  event: Event,
  proof: McpRequestProof
): boolean {
  if (event.kind !== MCP_REQUEST_PROOF_KIND || event.content !== "") {
    return false;
  }

  const expectedTags = buildMcpRequestProofTags(proof);
  return expectedTags.every(
    ([tagName, tagValue]) => getTagValue(event, tagName) === tagValue
  );
}

export function isMcpRequestProofFresh(
  event: Event,
  nowSeconds = Math.floor(Date.now() / 1000)
): boolean {
  return (
    Math.abs(nowSeconds - event.created_at) <= MCP_REQUEST_PROOF_MAX_AGE_SECONDS
  );
}

export function parseSignedEventHeader(headerValue: string): Event | null {
  try {
    return JSON.parse(headerValue) as Event;
  } catch {
    return null;
  }
}

export function normalizeApiKeysPermission(
  permission: string | undefined | null
): "read" | "read_write" {
  return permission === "read_write" ? "read_write" : "read";
}

export function normalizeOnboardPermission(
  permission: string | undefined | null
): "read" | "read_write" | "full_access" {
  if (permission === "full_access") return "full_access";
  if (permission === "read_write") return "read_write";
  return "read";
}

export function buildApiKeysListProof(pubkey: string): McpRequestProof {
  return {
    action: "list_api_keys",
    method: "GET",
    path: "/api/mcp/api-keys",
    pubkey,
  };
}

export function buildApiKeyCreateProof({
  name,
  permissions,
  pubkey,
}: {
  name: string;
  permissions: "read" | "read_write";
  pubkey: string;
}): McpRequestProof {
  return {
    action: "create_api_key",
    method: "POST",
    path: "/api/mcp/api-keys",
    pubkey,
    fields: {
      name,
      permissions,
    },
  };
}

export function buildApiKeyRevokeProof({
  id,
  pubkey,
}: {
  id: number | string;
  pubkey: string;
}): McpRequestProof {
  return {
    action: "revoke_api_key",
    method: "DELETE",
    path: "/api/mcp/api-keys",
    pubkey,
    fields: {
      id,
    },
  };
}

export function buildOnboardExistingPubkeyProof({
  name,
  permissions,
  contact,
  pubkey,
}: {
  name: string;
  permissions: "read" | "read_write" | "full_access";
  contact?: string;
  pubkey: string;
}): McpRequestProof {
  return {
    action: "onboard_existing_pubkey",
    method: "POST",
    path: "/api/mcp/onboard",
    pubkey,
    fields: {
      name,
      permissions,
      contact,
    },
  };
}
