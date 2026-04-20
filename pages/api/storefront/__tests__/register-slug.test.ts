import type { NextApiRequest, NextApiResponse } from "next";

const queryMock = jest.fn();
const extractSignedEventFromRequestMock = jest.fn();
const verifySignedHttpRequestProofMock = jest.fn();

jest.mock("@/utils/db/db-service", () => ({
  getDbPool: () => ({
    query: (...args: unknown[]) => queryMock(...args),
  }),
}));

jest.mock("@/utils/nostr/request-auth", () => ({
  extractSignedEventFromRequest: (...args: unknown[]) =>
    extractSignedEventFromRequestMock(...args),
  verifySignedHttpRequestProof: (...args: unknown[]) =>
    verifySignedHttpRequestProofMock(...args),
  buildStorefrontSlugCreateProof: (payload: unknown) => payload,
  buildStorefrontSlugDeleteProof: (pubkey: string) => ({ pubkey }),
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

function createRequest(method: string, body: unknown): NextApiRequest {
  return {
    method,
    body,
    headers: {},
    socket: { remoteAddress: "127.0.0.1" },
  } as unknown as NextApiRequest;
}

describe("/api/storefront/register-slug", () => {
  beforeEach(() => {
    queryMock.mockReset();
    extractSignedEventFromRequestMock.mockReset();
    verifySignedHttpRequestProofMock.mockReset();
    __resetRateLimitBuckets();
  });

  it("rejects unsigned slug registration attempts", async () => {
    verifySignedHttpRequestProofMock.mockReturnValue({
      ok: false,
      status: 401,
      error:
        "A signed Nostr request proof is required to prove pubkey ownership.",
    });

    const req = createRequest("POST", {
      pubkey: "victim-pubkey",
      slug: "victim-shop",
    });
    const res = createResponse();

    await handler(req, res as unknown as NextApiResponse);

    expect(queryMock).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(401);
    expect(res.jsonBody).toEqual({
      error:
        "A signed Nostr request proof is required to prove pubkey ownership.",
    });
  });

  it("allows signed slug registration for the matching owner", async () => {
    extractSignedEventFromRequestMock.mockReturnValue({
      pubkey: "owner-pubkey",
    });
    verifySignedHttpRequestProofMock.mockReturnValue({
      ok: true,
      status: 200,
    });
    queryMock.mockResolvedValue({ rows: [] });

    const req = createRequest("POST", {
      pubkey: "body-pubkey-is-ignored",
      slug: "Owner Shop!!",
    });
    const res = createResponse();

    await handler(req, res as unknown as NextApiResponse);

    expect(queryMock).toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO shop_slugs"),
      ["owner-pubkey", "owner-shop"]
    );
    expect(res.statusCode).toBe(200);
    expect(res.jsonBody).toEqual({ slug: "owner-shop" });
  });

  it("uses the signed event pubkey, ignoring the body pubkey", async () => {
    extractSignedEventFromRequestMock.mockReturnValue({
      pubkey: "owner-pubkey",
    });
    verifySignedHttpRequestProofMock.mockReturnValue({
      ok: true,
      status: 200,
    });
    queryMock.mockResolvedValue({ rows: [] });

    const req = createRequest("DELETE", {
      pubkey: "attacker-pubkey",
    });
    const res = createResponse();

    await handler(req, res as unknown as NextApiResponse);

    expect(queryMock).toHaveBeenCalledWith(
      "DELETE FROM shop_slugs WHERE pubkey = $1",
      ["owner-pubkey"]
    );
    expect(queryMock).toHaveBeenCalledWith(
      "DELETE FROM custom_domains WHERE pubkey = $1",
      ["owner-pubkey"]
    );
    expect(res.statusCode).toBe(200);
  });
});
