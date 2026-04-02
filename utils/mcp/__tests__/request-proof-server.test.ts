const verifyEventMock = jest.fn();
const mockConnect = jest.fn();

jest.mock("nostr-tools", () => {
  const actual = jest.requireActual("nostr-tools");
  return {
    ...actual,
    verifyEvent: (event: any) => verifyEventMock(event),
  };
});

jest.mock("@/utils/db/db-service", () => ({
  getDbPool: jest.fn(() => ({
    connect: mockConnect,
  })),
}));

import {
  buildApiKeyCreateProof,
  buildMcpRequestProofTemplate,
} from "@/utils/mcp/request-proof";
import { verifyAndConsumeSignedRequestProof } from "@/utils/mcp/request-proof-server";

describe("verifyAndConsumeSignedRequestProof", () => {
  const usedProofIds = new Set<string>();
  const mockRelease = jest.fn();
  const mockQuery = jest.fn(async (query: string, params?: any[]) => {
    if (query.includes("DELETE FROM mcp_request_proofs")) {
      return { rowCount: 0 };
    }

    if (query.includes("INSERT INTO mcp_request_proofs")) {
      const eventId = params?.[0];
      if (usedProofIds.has(eventId)) {
        return { rowCount: 0 };
      }

      usedProofIds.add(eventId);
      return { rowCount: 1 };
    }

    throw new Error(`Unexpected query: ${query}`);
  });

  beforeEach(() => {
    usedProofIds.clear();
    mockQuery.mockClear();
    mockRelease.mockClear();
    mockConnect.mockResolvedValue({
      query: mockQuery,
      release: mockRelease,
    });
    verifyEventMock.mockReset();
    verifyEventMock.mockReturnValue(true);
  });

  it("accepts a fresh matching signed proof and rejects replay", async () => {
    const pubkey = "f".repeat(64);
    const proof = buildApiKeyCreateProof({
      name: "Shopstr Agent",
      permissions: "read",
      pubkey,
    });
    const signedEvent = {
      id: "proof-1",
      pubkey,
      kind: buildMcpRequestProofTemplate(proof).kind,
      created_at: Math.floor(Date.now() / 1000),
      tags: buildMcpRequestProofTemplate(proof).tags,
      content: "",
      sig: "valid",
    };

    const firstAttempt = await verifyAndConsumeSignedRequestProof(
      signedEvent as any,
      proof
    );
    expect(firstAttempt).toEqual({ ok: true, status: 200 });

    const replayAttempt = await verifyAndConsumeSignedRequestProof(
      signedEvent as any,
      proof
    );
    expect(replayAttempt).toEqual({
      ok: false,
      status: 401,
      error: "Signed request proof has already been used.",
    });
  });

  it("rejects proofs that do not match the requested operation", async () => {
    const pubkey = "f".repeat(64);
    const wrongProof = buildApiKeyCreateProof({
      name: "Wrong Name",
      permissions: "read",
      pubkey,
    });
    const signedEvent = {
      id: "proof-2",
      pubkey,
      kind: buildMcpRequestProofTemplate(wrongProof).kind,
      created_at: Math.floor(Date.now() / 1000),
      tags: buildMcpRequestProofTemplate(wrongProof).tags,
      content: "",
      sig: "valid",
    };

    const result = await verifyAndConsumeSignedRequestProof(signedEvent as any, {
      ...wrongProof,
      fields: {
        ...wrongProof.fields,
        name: "Expected Name",
      },
    });

    expect(result).toEqual({
      ok: false,
      status: 401,
      error: "Signed request proof does not match this operation.",
    });
  });

  it("rejects stale signed proofs", async () => {
    const pubkey = "e".repeat(64);
    const proof = buildApiKeyCreateProof({
      name: "Shopstr Agent",
      permissions: "read_write",
      pubkey,
    });
    const staleEvent = {
      id: "proof-3",
      pubkey,
      kind: buildMcpRequestProofTemplate(proof).kind,
      created_at: Math.floor(Date.now() / 1000) - 3600,
      tags: buildMcpRequestProofTemplate(proof).tags,
      content: "",
      sig: "valid",
    };

    const result = await verifyAndConsumeSignedRequestProof(
      staleEvent as any,
      proof
    );

    expect(result).toEqual({
      ok: false,
      status: 401,
      error: "Signed request proof has expired. Please sign the request again.",
    });
  });
});
