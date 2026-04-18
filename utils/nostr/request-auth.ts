import type { Event } from "nostr-tools";
import { verifyEvent } from "nostr-tools";
import type { NextApiRequest } from "next";
import { NostrEventTemplate } from "@/utils/nostr/nostr-manager";

export const SIGNED_EVENT_HEADER = "x-signed-event";
export const SIGNED_HTTP_REQUEST_KIND = 27235;
export const SIGNED_HTTP_REQUEST_MAX_AGE_SECONDS = 300;

type ProofValue = string | number | null | undefined;
type ProofMethod = "GET" | "POST" | "DELETE";

export type SignedHttpRequestProof = {
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

function getTagValue(event: Event, tagName: string): string | undefined {
  return event.tags.find((tag) => tag[0] === tagName)?.[1];
}

function normalizeEventIdsForProof(eventIds: string[]): string {
  return [...new Set(eventIds.map((id) => id.trim()).filter(Boolean))]
    .sort()
    .join(",");
}

export function buildSignedHttpRequestProofTemplate(
  proof: SignedHttpRequestProof
): NostrEventTemplate {
  return {
    kind: SIGNED_HTTP_REQUEST_KIND,
    created_at: Math.floor(Date.now() / 1000),
    content: "",
    tags: [
      ["action", proof.action],
      ["method", proof.method],
      ["path", proof.path],
      ["pubkey", proof.pubkey],
      ...sortedProofFields(proof.fields),
    ],
  };
}

export function parseSignedEventHeader(headerValue: string): Event | null {
  try {
    return JSON.parse(headerValue) as Event;
  } catch {
    return null;
  }
}

export function extractSignedEventFromRequest(
  req: NextApiRequest
): Event | undefined {
  const headerValue = req.headers[SIGNED_EVENT_HEADER];
  const normalizedHeaderValue = Array.isArray(headerValue)
    ? headerValue[0]
    : headerValue;

  if (typeof normalizedHeaderValue !== "string") {
    return undefined;
  }

  return parseSignedEventHeader(normalizedHeaderValue) ?? undefined;
}

export function matchesSignedHttpRequestProof(
  event: Event,
  proof: SignedHttpRequestProof
): boolean {
  if (event.kind !== SIGNED_HTTP_REQUEST_KIND || event.content !== "") {
    return false;
  }

  const expectedTemplate = buildSignedHttpRequestProofTemplate(proof);
  return expectedTemplate.tags.every((tag) => {
    const [tagName, tagValue] = tag;
    return (
      typeof tagName === "string" &&
      typeof tagValue === "string" &&
      getTagValue(event, tagName) === tagValue
    );
  });
}

export function isSignedHttpRequestFresh(
  event: Event,
  nowSeconds = Math.floor(Date.now() / 1000)
): boolean {
  return (
    Math.abs(nowSeconds - event.created_at) <=
    SIGNED_HTTP_REQUEST_MAX_AGE_SECONDS
  );
}

export function verifySignedHttpRequestProof(
  signedEvent: Event | undefined,
  proof: SignedHttpRequestProof
): { ok: boolean; status: number; error?: string } {
  if (!signedEvent) {
    return {
      ok: false,
      status: 401,
      error:
        "A signed Nostr request proof is required to prove pubkey ownership.",
    };
  }

  if (!verifyEvent(signedEvent) || signedEvent.pubkey !== proof.pubkey) {
    return {
      ok: false,
      status: 401,
      error: "Invalid signed request proof or pubkey mismatch.",
    };
  }

  if (!matchesSignedHttpRequestProof(signedEvent, proof)) {
    return {
      ok: false,
      status: 401,
      error: "Signed request proof does not match this operation.",
    };
  }

  if (!isSignedHttpRequestFresh(signedEvent)) {
    return {
      ok: false,
      status: 401,
      error: "Signed request proof has expired. Please sign the request again.",
    };
  }

  return { ok: true, status: 200 };
}

export function buildDiscountCodesListProof(
  pubkey: string
): SignedHttpRequestProof {
  return {
    action: "list_discount_codes",
    method: "GET",
    path: "/api/db/discount-codes",
    pubkey,
  };
}

export function buildDiscountCodeCreateProof({
  code,
  pubkey,
  discountPercentage,
  expiration,
}: {
  code: string;
  pubkey: string;
  discountPercentage: number;
  expiration?: number;
}): SignedHttpRequestProof {
  return {
    action: "create_discount_code",
    method: "POST",
    path: "/api/db/discount-codes",
    pubkey,
    fields: {
      code,
      discountPercentage,
      expiration,
    },
  };
}

export function buildDiscountCodeDeleteProof({
  code,
  pubkey,
}: {
  code: string;
  pubkey: string;
}): SignedHttpRequestProof {
  return {
    action: "delete_discount_code",
    method: "DELETE",
    path: "/api/db/discount-codes",
    pubkey,
    fields: {
      code,
    },
  };
}

export function buildStorefrontSlugCreateProof({
  pubkey,
  slug,
}: {
  pubkey: string;
  slug: string;
}): SignedHttpRequestProof {
  return {
    action: "register_storefront_slug",
    method: "POST",
    path: "/api/storefront/register-slug",
    pubkey,
    fields: {
      slug,
    },
  };
}

export function buildStorefrontSlugDeleteProof(
  pubkey: string
): SignedHttpRequestProof {
  return {
    action: "delete_storefront_slug",
    method: "DELETE",
    path: "/api/storefront/register-slug",
    pubkey,
  };
}

export function buildCustomDomainCreateProof({
  pubkey,
  domain,
}: {
  pubkey: string;
  domain: string;
}): SignedHttpRequestProof {
  return {
    action: "set_storefront_custom_domain",
    method: "POST",
    path: "/api/storefront/custom-domain",
    pubkey,
    fields: {
      domain,
    },
  };
}

export function buildCustomDomainDeleteProof(
  pubkey: string
): SignedHttpRequestProof {
  return {
    action: "delete_storefront_custom_domain",
    method: "DELETE",
    path: "/api/storefront/custom-domain",
    pubkey,
  };
}

export function buildDeleteEventsProof({
  pubkey,
  eventIds,
}: {
  pubkey: string;
  eventIds: string[];
}): SignedHttpRequestProof {
  return {
    action: "delete_cached_events",
    method: "POST",
    path: "/api/db/delete-events",
    pubkey,
    fields: {
      eventIds: normalizeEventIdsForProof(eventIds),
    },
  };
}
