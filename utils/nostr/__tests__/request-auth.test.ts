const verifyEventMock = jest.fn();

jest.mock("nostr-tools", () => {
  const actual = jest.requireActual("nostr-tools");
  return {
    ...actual,
    verifyEvent: (event: any) => verifyEventMock(event),
  };
});

import {
  SIGNED_EVENT_HEADER,
  SIGNED_HTTP_REQUEST_KIND,
  SIGNED_HTTP_REQUEST_MAX_AGE_SECONDS,
  buildClearFailedRelayPublishProof,
  buildCustomDomainCreateProof,
  buildCustomDomainDeleteProof,
  buildDeleteCachedEventsProof,
  buildDiscountCodeCreateProof,
  buildDiscountCodeDeleteProof,
  buildDiscountCodesListProof,
  buildListFailedRelayPublishesProof,
  buildMessagesListProof,
  buildSignedHttpRequestProofTemplate,
  buildStorefrontSlugCreateProof,
  buildStorefrontSlugDeleteProof,
  buildTrackFailedRelayPublishProof,
  extractSignedEventFromRequest,
  isSignedHttpRequestFresh,
  matchesSignedHttpRequestProof,
  parseSignedEventHeader,
  verifySignedHttpRequestProof,
} from "@/utils/nostr/request-auth";

describe("verifySignedHttpRequestProof", () => {
  beforeEach(() => {
    verifyEventMock.mockReset();
    verifyEventMock.mockReturnValue(true);
  });

  it("builds sorted proof templates and skips empty field values", () => {
    const proof = {
      action: "create_discount_code",
      method: "POST" as const,
      path: "/api/db/discount-codes",
      pubkey: "f".repeat(64),
      fields: {
        zeta: "last",
        alpha: "first",
        empty: "",
        nil: null,
        missing: undefined,
        count: 3,
      },
    };

    const template = buildSignedHttpRequestProofTemplate(proof as any);

    expect(template.kind).toBe(SIGNED_HTTP_REQUEST_KIND);
    expect(template.content).toBe("");
    expect(template.tags).toEqual([
      ["action", "create_discount_code"],
      ["method", "POST"],
      ["path", "/api/db/discount-codes"],
      ["pubkey", "f".repeat(64)],
      ["alpha", "first"],
      ["count", "3"],
      ["zeta", "last"],
    ]);
  });

  it("builds proof templates without fields", () => {
    const template = buildSignedHttpRequestProofTemplate({
      action: "list_discount_codes",
      method: "GET",
      path: "/api/db/discount-codes",
      pubkey: "f".repeat(64),
    } as any);

    expect(template.tags).toEqual([
      ["action", "list_discount_codes"],
      ["method", "GET"],
      ["path", "/api/db/discount-codes"],
      ["pubkey", "f".repeat(64)],
    ]);
  });

  it("parses signed event headers and extracts signed events from requests", () => {
    const event = {
      id: "event-1",
      kind: SIGNED_HTTP_REQUEST_KIND,
      pubkey: "f".repeat(64),
    };

    expect(parseSignedEventHeader(JSON.stringify(event))).toEqual(event);
    expect(parseSignedEventHeader("not-json")).toBeNull();

    expect(
      extractSignedEventFromRequest({
        headers: {
          [SIGNED_EVENT_HEADER]: JSON.stringify(event),
        },
      } as any)
    ).toEqual(event);

    expect(
      extractSignedEventFromRequest({
        headers: {
          [SIGNED_EVENT_HEADER]: [JSON.stringify(event), "ignored"],
        },
      } as any)
    ).toEqual(event);

    expect(
      extractSignedEventFromRequest({
        headers: {
          [SIGNED_EVENT_HEADER]: 123,
        },
      } as any)
    ).toBeUndefined();

    expect(
      extractSignedEventFromRequest({
        headers: {
          [SIGNED_EVENT_HEADER]: "not-json",
        },
      } as any)
    ).toBeUndefined();
  });

  it("matches and rejects signed request proofs by event shape", () => {
    const proof = buildDiscountCodeCreateProof({
      code: "SUMMER20",
      pubkey: "f".repeat(64),
      discountPercentage: 20,
    });
    const template = buildSignedHttpRequestProofTemplate(proof);
    const matchingEvent = {
      id: "proof-1",
      pubkey: proof.pubkey,
      kind: template.kind,
      created_at: template.created_at,
      tags: template.tags,
      content: "",
      sig: "valid",
    } as any;

    expect(matchesSignedHttpRequestProof(matchingEvent, proof)).toBe(true);
    expect(
      matchesSignedHttpRequestProof({ ...matchingEvent, kind: 1 }, proof)
    ).toBe(false);
    expect(
      matchesSignedHttpRequestProof({ ...matchingEvent, content: "x" }, proof)
    ).toBe(false);
    expect(
      matchesSignedHttpRequestProof(
        {
          ...matchingEvent,
          tags: template.tags.filter(([tagName]) => tagName !== "action"),
        },
        proof
      )
    ).toBe(false);
  });

  it("checks signed request freshness at the configured boundary", () => {
    const createdAt = 1_000;
    expect(
      isSignedHttpRequestFresh({ created_at: createdAt } as any, createdAt)
    ).toBe(true);
    expect(
      isSignedHttpRequestFresh(
        {
          created_at: createdAt - SIGNED_HTTP_REQUEST_MAX_AGE_SECONDS - 1,
        } as any,
        createdAt
      )
    ).toBe(false);
  });

  it("builds the remaining proof templates", () => {
    expect(buildDiscountCodesListProof("f".repeat(64))).toEqual({
      action: "list_discount_codes",
      method: "GET",
      path: "/api/db/discount-codes",
      pubkey: "f".repeat(64),
    });

    expect(buildMessagesListProof("f".repeat(64))).toEqual({
      action: "list_messages",
      method: "GET",
      path: "/api/db/fetch-messages",
      pubkey: "f".repeat(64),
    });

    expect(
      buildDiscountCodeDeleteProof({
        code: "SUMMER20",
        pubkey: "f".repeat(64),
      })
    ).toEqual({
      action: "delete_discount_code",
      method: "DELETE",
      path: "/api/db/discount-codes",
      pubkey: "f".repeat(64),
      fields: { code: "SUMMER20" },
    });

    expect(
      buildDeleteCachedEventsProof({
        pubkey: "f".repeat(64),
        eventIds: ["event-c", "event-a", "event-b"],
      })
    ).toEqual({
      action: "delete_cached_events",
      method: "POST",
      path: "/api/db/delete-events",
      pubkey: "f".repeat(64),
      fields: { eventIds: "event-a,event-b,event-c" },
    });

    expect(
      buildStorefrontSlugCreateProof({
        pubkey: "f".repeat(64),
        slug: "my-shop",
      })
    ).toEqual({
      action: "register_storefront_slug",
      method: "POST",
      path: "/api/storefront/register-slug",
      pubkey: "f".repeat(64),
      fields: { slug: "my-shop" },
    });

    expect(buildStorefrontSlugDeleteProof("f".repeat(64))).toEqual({
      action: "delete_storefront_slug",
      method: "DELETE",
      path: "/api/storefront/register-slug",
      pubkey: "f".repeat(64),
    });

    expect(
      buildCustomDomainCreateProof({
        pubkey: "f".repeat(64),
        domain: "shop.example",
      })
    ).toEqual({
      action: "set_storefront_custom_domain",
      method: "POST",
      path: "/api/storefront/custom-domain",
      pubkey: "f".repeat(64),
      fields: { domain: "shop.example" },
    });

    expect(buildCustomDomainDeleteProof("f".repeat(64))).toEqual({
      action: "delete_storefront_custom_domain",
      method: "DELETE",
      path: "/api/storefront/custom-domain",
      pubkey: "f".repeat(64),
    });

    expect(
      buildTrackFailedRelayPublishProof({
        pubkey: "f".repeat(64),
        eventId: "event-1",
      })
    ).toEqual({
      action: "track_failed_relay_publish",
      method: "POST",
      path: "/api/db/track-failed-publish",
      pubkey: "f".repeat(64),
      fields: { eventId: "event-1" },
    });

    expect(buildListFailedRelayPublishesProof("f".repeat(64))).toEqual({
      action: "list_failed_relay_publishes",
      method: "GET",
      path: "/api/db/get-failed-publishes",
      pubkey: "f".repeat(64),
    });

    expect(
      buildClearFailedRelayPublishProof({
        pubkey: "f".repeat(64),
        eventId: "event-1",
      })
    ).toEqual({
      action: "clear_failed_relay_publish",
      method: "POST",
      path: "/api/db/clear-failed-publish",
      pubkey: "f".repeat(64),
      fields: { eventId: "event-1" },
    });

    expect(
      buildClearFailedRelayPublishProof({
        pubkey: "f".repeat(64),
        eventId: "event-1",
        incrementRetry: true,
      })
    ).toEqual({
      action: "increment_failed_relay_publish_retry",
      method: "POST",
      path: "/api/db/clear-failed-publish",
      pubkey: "f".repeat(64),
      fields: { eventId: "event-1", incrementRetry: "true" },
    });
  });

  it("rejects missing signed proofs", () => {
    const proof = buildDiscountCodeCreateProof({
      code: "SUMMER20",
      pubkey: "f".repeat(64),
      discountPercentage: 20,
    });

    expect(verifySignedHttpRequestProof(undefined, proof)).toEqual({
      ok: false,
      status: 401,
      error:
        "A signed Nostr request proof is required to prove pubkey ownership.",
    });
  });

  it("accepts a fresh matching signed proof", () => {
    const proof = buildDiscountCodeCreateProof({
      code: "SUMMER20",
      pubkey: "f".repeat(64),
      discountPercentage: 20,
      expiration: 1710000000,
    });
    const template = buildSignedHttpRequestProofTemplate(proof);
    const signedEvent = {
      id: "proof-1",
      pubkey: proof.pubkey,
      kind: template.kind,
      created_at: Math.floor(Date.now() / 1000),
      tags: template.tags,
      content: "",
      sig: "valid",
    };

    expect(verifySignedHttpRequestProof(signedEvent as any, proof)).toEqual({
      ok: true,
      status: 200,
    });
  });

  it("rejects proofs that do not match the requested operation", () => {
    const proof = buildDiscountCodeCreateProof({
      code: "SUMMER20",
      pubkey: "f".repeat(64),
      discountPercentage: 20,
    });
    const wrongProof = buildDiscountCodeCreateProof({
      code: "SPRING20",
      pubkey: proof.pubkey,
      discountPercentage: 20,
    });
    const template = buildSignedHttpRequestProofTemplate(wrongProof);
    const signedEvent = {
      id: "proof-2",
      pubkey: proof.pubkey,
      kind: template.kind,
      created_at: Math.floor(Date.now() / 1000),
      tags: template.tags,
      content: "",
      sig: "valid",
    };

    expect(verifySignedHttpRequestProof(signedEvent as any, proof)).toEqual({
      ok: false,
      status: 401,
      error: "Signed request proof does not match this operation.",
    });
  });

  it("rejects signed proofs with invalid signatures", () => {
    verifyEventMock.mockReturnValue(false);

    const proof = buildDiscountCodeCreateProof({
      code: "SUMMER20",
      pubkey: "f".repeat(64),
      discountPercentage: 20,
    });
    const template = buildSignedHttpRequestProofTemplate(proof);
    const signedEvent = {
      id: "proof-invalid-signature",
      pubkey: proof.pubkey,
      kind: template.kind,
      created_at: Math.floor(Date.now() / 1000),
      tags: template.tags,
      content: "",
      sig: "invalid",
    };

    expect(verifySignedHttpRequestProof(signedEvent as any, proof)).toEqual({
      ok: false,
      status: 401,
      error: "Invalid signed request proof or pubkey mismatch.",
    });
  });

  it("rejects signed proofs whose pubkey does not match the proof pubkey", () => {
    const proof = buildDiscountCodeCreateProof({
      code: "SUMMER20",
      pubkey: "f".repeat(64),
      discountPercentage: 20,
    });
    const template = buildSignedHttpRequestProofTemplate(proof);
    const signedEvent = {
      id: "proof-pubkey-mismatch",
      pubkey: "e".repeat(64),
      kind: template.kind,
      created_at: Math.floor(Date.now() / 1000),
      tags: template.tags,
      content: "",
      sig: "valid",
    };

    expect(verifySignedHttpRequestProof(signedEvent as any, proof)).toEqual({
      ok: false,
      status: 401,
      error: "Invalid signed request proof or pubkey mismatch.",
    });
  });

  it("rejects stale signed proofs", () => {
    const proof = buildDiscountCodeCreateProof({
      code: "SUMMER20",
      pubkey: "e".repeat(64),
      discountPercentage: 20,
    });
    const template = buildSignedHttpRequestProofTemplate(proof);
    const signedEvent = {
      id: "proof-3",
      pubkey: proof.pubkey,
      kind: template.kind,
      created_at: Math.floor(Date.now() / 1000) - 3600,
      tags: template.tags,
      content: "",
      sig: "valid",
    };

    expect(verifySignedHttpRequestProof(signedEvent as any, proof)).toEqual({
      ok: false,
      status: 401,
      error: "Signed request proof has expired. Please sign the request again.",
    });
  });
});
