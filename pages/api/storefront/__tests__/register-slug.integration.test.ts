import type { NextApiRequest, NextApiResponse } from "next";
import {
  finalizeEvent,
  generateSecretKey,
  getPublicKey,
} from "nostr-tools/pure";
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
  } as unknown as NextApiRequest;
}

describe("/api/storefront/register-slug (integration)", () => {
  beforeEach(() => {
    queryMock.mockReset();
    queryMock.mockResolvedValue({ rows: [] });
  });

  it("accepts a POST with a genuinely signed proof", async () => {
    const sk = generateSecretKey();
    const pk = getPublicKey(sk);
    const slug = "owner-shop";

    const template = buildSignedHttpRequestProofTemplate(
      buildStorefrontSlugCreateProof({ pubkey: pk, slug })
    );
    const signed = finalizeEvent(template, sk);

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
    const sk = generateSecretKey();
    const attackerPk = getPublicKey(sk);
    const victimPk = "f".repeat(64);

    const template = buildSignedHttpRequestProofTemplate(
      buildStorefrontSlugCreateProof({ pubkey: victimPk, slug: "victim" })
    );
    template.tags = template.tags.map((tag) =>
      tag[0] === "pubkey" ? ["pubkey", victimPk] : tag
    );
    const signed = finalizeEvent(template, sk);
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
    const sk = generateSecretKey();
    const pk = getPublicKey(sk);

    const template = buildSignedHttpRequestProofTemplate(
      buildStorefrontSlugCreateProof({ pubkey: pk, slug: "owner-shop" })
    );
    const signed = finalizeEvent(template, sk);
    const tampered = {
      ...signed,
      sig: signed.sig.replace(/^.{2}/, "00"),
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
    const sk = generateSecretKey();
    const pk = getPublicKey(sk);

    const template = buildSignedHttpRequestProofTemplate(
      buildStorefrontSlugCreateProof({ pubkey: pk, slug: "shop-a" })
    );
    const signed = finalizeEvent(template, sk);

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
    const sk = generateSecretKey();
    const pk = getPublicKey(sk);

    const template = buildSignedHttpRequestProofTemplate(
      buildStorefrontSlugCreateProof({ pubkey: pk, slug: "owner-shop" })
    );
    template.created_at = Math.floor(Date.now() / 1000) - 60 * 60;
    const signed = finalizeEvent(template, sk);

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
    const sk = generateSecretKey();
    const pk = getPublicKey(sk);

    const template = buildSignedHttpRequestProofTemplate(
      buildStorefrontSlugDeleteProof(pk)
    );
    const signed = finalizeEvent(template, sk);

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
