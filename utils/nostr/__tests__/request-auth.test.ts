const verifyEventMock = jest.fn();

jest.mock("nostr-tools", () => {
  const actual = jest.requireActual("nostr-tools");
  return {
    ...actual,
    verifyEvent: (event: any) => verifyEventMock(event),
  };
});

import {
  buildDiscountCodeCreateProof,
  buildSignedHttpRequestProofTemplate,
  verifySignedHttpRequestProof,
} from "@/utils/nostr/request-auth";

describe("verifySignedHttpRequestProof", () => {
  beforeEach(() => {
    verifyEventMock.mockReset();
    verifyEventMock.mockReturnValue(true);
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
