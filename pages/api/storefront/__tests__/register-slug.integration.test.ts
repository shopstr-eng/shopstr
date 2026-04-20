import type { NextApiRequest, NextApiResponse } from "next";

const verifyEventMock = jest.fn(
  (event: { sig?: string }) => event.sig === "valid"
);

jest.mock("nostr-tools", () => {
  const actual = jest.requireActual("nostr-tools");
  return {
    ...actual,
    verifyEvent: (event: { sig?: string }) => verifyEventMock(event),
  };
});
import {
  SIGNED_EVENT_HEADER,
  buildSignedHttpRequestProofTemplate,
  buildStorefrontSlugCreateProof,
  buildStorefrontSlugDeleteProof,
} from "@/utils/nostr/request-auth";

const queryMock = jest.fn();

jest.mock("@/utils/db/db-service", () => ({
  getDbPool: () => ({
    query: (...args: unknown[]) => queryMock(...args),
  }),
}));

import handler from "@/pages/api/storefront/register-slug";
import { __resetRateLimitBuckets } from "@/utils/rate-limit";

function createResponse() {
  return {
    statusCode: 200,
    jsonBody: undefined as unknown,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      this.jsonBody = payload;
      return this;
    },
    setHeader() {
      return this;
    },
  };
}

function createRequest(
  method: string,
  body: unknown,
  headers: Record<string, string> = {}
): NextApiRequest {
  return {
    method,
    body,
    headers,
    socket: { remoteAddress: "127.0.0.1" },
  } as unknown as NextApiRequest;
}

describe("/api/storefront/register-slug (integration)", () => {
  beforeEach(() => {
    queryMock.mockReset();
    queryMock.mockResolvedValue({ rows: [] });
    __resetRateLimitBuckets();
    verifyEventMock.mockClear();
  });

  it("accepts a POST with a genuinely signed proof", async () => {
    const pk = "a".repeat(64);
    const slug = "owner-shop";

    const template = buildSignedHttpRequestProofTemplate(
      buildStorefrontSlugCreateProof({ pubkey: pk, slug })
    );
    const signed = {
      id: "proof-post-valid",
      pubkey: pk,
      kind: template.kind,
      created_at: template.created_at,
      tags: template.tags,
      content: template.content,
      sig: "valid",
    };

    const req = createRequest(
      "POST",
      { slug },
      { [SIGNED_EVENT_HEADER]: JSON.stringify(signed) }
    );
    const res = createResponse();

    await handler(req, res as unknown as NextApiResponse);

    expect(res.statusCode).toBe(200);
    expect(res.jsonBody).toEqual({ slug });
    expect(queryMock).toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO shop_slugs"),
      [pk, slug]
    );
  });

  it("rejects a POST whose signature is for a different pubkey than the proof claims", async () => {
    const attackerPk = "b".repeat(64);
    const victimPk = "f".repeat(64);

    const template = buildSignedHttpRequestProofTemplate(
      buildStorefrontSlugCreateProof({ pubkey: victimPk, slug: "victim" })
    );
    template.tags = template.tags.map((tag) =>
      tag[0] === "pubkey" ? ["pubkey", victimPk] : tag
    );
    const signed = {
      id: "proof-post-mismatch",
      pubkey: attackerPk,
      kind: template.kind,
      created_at: template.created_at,
      tags: template.tags,
      content: template.content,
      sig: "valid",
    };
    expect(signed.pubkey).toBe(attackerPk);

    const req = createRequest(
      "POST",
      { slug: "victim" },
      { [SIGNED_EVENT_HEADER]: JSON.stringify(signed) }
    );
    const res = createResponse();

    await handler(req, res as unknown as NextApiResponse);

    expect(res.statusCode).toBe(401);
    expect(queryMock).not.toHaveBeenCalled();
  });

  it("rejects a POST with a tampered signature", async () => {
    const pk = "c".repeat(64);

    const template = buildSignedHttpRequestProofTemplate(
      buildStorefrontSlugCreateProof({ pubkey: pk, slug: "owner-shop" })
    );
    const tampered = {
      id: "proof-post-tampered",
      pubkey: pk,
      kind: template.kind,
      created_at: template.created_at,
      tags: template.tags,
      content: template.content,
      sig: "tampered",
    };

    const req = createRequest(
      "POST",
      { slug: "owner-shop" },
      { [SIGNED_EVENT_HEADER]: JSON.stringify(tampered) }
    );
    const res = createResponse();

    await handler(req, res as unknown as NextApiResponse);

    expect(res.statusCode).toBe(401);
    expect(queryMock).not.toHaveBeenCalled();
  });

  it("rejects a POST whose signed proof is for a different slug", async () => {
    const pk = "d".repeat(64);

    const template = buildSignedHttpRequestProofTemplate(
      buildStorefrontSlugCreateProof({ pubkey: pk, slug: "shop-a" })
    );
    const signed = {
      id: "proof-post-wrong-slug",
      pubkey: pk,
      kind: template.kind,
      created_at: template.created_at,
      tags: template.tags,
      content: template.content,
      sig: "valid",
    };

    const req = createRequest(
      "POST",
      { slug: "shop-b" },
      { [SIGNED_EVENT_HEADER]: JSON.stringify(signed) }
    );
    const res = createResponse();

    await handler(req, res as unknown as NextApiResponse);

    expect(res.statusCode).toBe(401);
    expect(queryMock).not.toHaveBeenCalled();
  });

  it("rejects a POST whose signed proof is stale", async () => {
    const pk = "e".repeat(64);

    const template = buildSignedHttpRequestProofTemplate(
      buildStorefrontSlugCreateProof({ pubkey: pk, slug: "owner-shop" })
    );
    template.created_at = Math.floor(Date.now() / 1000) - 60 * 60;
    const signed = {
      id: "proof-post-stale",
      pubkey: pk,
      kind: template.kind,
      created_at: template.created_at,
      tags: template.tags,
      content: template.content,
      sig: "valid",
    };

    const req = createRequest(
      "POST",
      { slug: "owner-shop" },
      { [SIGNED_EVENT_HEADER]: JSON.stringify(signed) }
    );
    const res = createResponse();

    await handler(req, res as unknown as NextApiResponse);

    expect(res.statusCode).toBe(401);
    expect(queryMock).not.toHaveBeenCalled();
  });

  it("accepts a DELETE with a genuinely signed proof and uses the signed pubkey", async () => {
    const pk = "1".repeat(64);

    const template = buildSignedHttpRequestProofTemplate(
      buildStorefrontSlugDeleteProof(pk)
    );
    const signed = {
      id: "proof-delete-valid",
      pubkey: pk,
      kind: template.kind,
      created_at: template.created_at,
      tags: template.tags,
      content: template.content,
      sig: "valid",
    };

    const req = createRequest(
      "DELETE",
      { pubkey: "something-else-from-body" },
      { [SIGNED_EVENT_HEADER]: JSON.stringify(signed) }
    );
    const res = createResponse();

    await handler(req, res as unknown as NextApiResponse);

    expect(res.statusCode).toBe(200);
    expect(queryMock).toHaveBeenCalledWith(
      "DELETE FROM shop_slugs WHERE pubkey = $1",
      [pk]
    );
    expect(queryMock).toHaveBeenCalledWith(
      "DELETE FROM custom_domains WHERE pubkey = $1",
      [pk]
    );
  });
});
