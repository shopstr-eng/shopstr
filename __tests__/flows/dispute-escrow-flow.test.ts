import type { Proof } from "@cashu/cashu-ts";

const mockDecodeToken = jest.fn();
const mockReceive = jest.fn();
const mockVerifyNip98Request = jest.fn();
const mockRelayDisputeEvents: any[] = [];
const mockDmInbox: any[] = [];
const mockPublishedProofEvents: any[] = [];

jest.mock("@cashu/cashu-ts", () => {
  const actual = jest.requireActual("@cashu/cashu-ts");
  return {
    ...actual,
    getTokenMetadata: jest.fn().mockReturnValue({
      mint: "https://mint.example",
      unit: "sat",
    }),
    signP2PKProof: jest.fn((proof: Proof, privkey: string) => ({
      ...proof,
      witness: {
        signatures: [`sig:${privkey}:${proof.C}`],
      },
    })),
    Mint: jest.fn().mockImplementation(() => ({})),
    Wallet: jest.fn().mockImplementation(() => ({
      loadMint: jest.fn().mockResolvedValue(undefined),
      decodeToken: mockDecodeToken,
      receive: mockReceive,
    })),
  };
});

jest.mock("@/utils/nostr/nostr-helper-functions", () => ({
  publishProofEvent: (...args: unknown[]) => {
    mockPublishedProofEvents.push(args);
    return Promise.resolve(undefined);
  },
  finalizeAndSendNostrEvent: jest.fn().mockResolvedValue({ id: "event-id" }),
}));

jest.mock("@/utils/rate-limit", () => ({
  applyRateLimit: jest.fn().mockReturnValue(true),
}));

jest.mock("@/utils/nostr/nip98-auth", () => ({
  verifyNip98Request: (...args: unknown[]) => mockVerifyNip98Request(...args),
}));

jest.mock("@/utils/nostr/server-gift-wrap", () => ({
  sendServerGiftWrappedDm: (message: any) => {
    mockDmInbox.push(message);
    return Promise.resolve(undefined);
  },
}));

jest.mock("@/utils/nostr/dispute-records", () => {
  const actual = jest.requireActual("@/utils/nostr/dispute-records");
  return {
    ...actual,
    fetchDisputeEvent: jest.fn().mockImplementation(async () => {
      return mockRelayDisputeEvents.at(-1) ?? null;
    }),
  };
});

jest.mock("@/utils/mcp/nostr-signing", () => ({
  McpNostrSigner: jest.fn().mockImplementation(() => ({
    getPubKey: () => "arbiter-nostr-pubkey",
  })),
  signAndPublishEvent: (_signer: unknown, eventTemplate: any) => {
    mockRelayDisputeEvents.push({
      id: `resolved-${mockRelayDisputeEvents.length}`,
      pubkey: "arbiter-nostr-pubkey",
      sig: "arbiter-sig",
      ...eventTemplate,
    });
    return Promise.resolve({ id: "resolved-event" });
  },
}));

jest.mock("@/utils/nostr/nostr-manager", () => ({
  NostrManager: jest.fn().mockImplementation(() => ({
    close: jest.fn(),
  })),
}));

import handler from "@/pages/api/arbiter/rule";
import { buildP2pkOutputConfig, parseP2PK } from "@/utils/cashu/p2pk-checkout";
import {
  createPartialRedemption,
  combineAndRedeem,
} from "@/utils/cashu/dispute-redemption";
import {
  createDisputeEventTemplate,
  parseDisputeEvent,
} from "@/utils/nostr/dispute-records";

const BUYER_CASHU_PUBKEY = "a".repeat(64);
const SELLER_CASHU_PUBKEY = `02${"b".repeat(64)}`;
const NORMALIZED_SELLER_CASHU_PUBKEY = "b".repeat(64);
const ARBITER_CASHU_PUBKEY = `03${"c".repeat(64)}`;
const NORMALIZED_ARBITER_CASHU_PUBKEY = "c".repeat(64);
const BUYER_NOSTR_PUBKEY = "buyer-nostr-pubkey";
const SELLER_NOSTR_PUBKEY = "seller-nostr-pubkey";
const ARBITER_NOSTR_PUBKEY = "arbiter-nostr-pubkey";

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

function buildLockedProof(outputConfig: any): Proof {
  return {
    id: "keyset-1",
    amount: 21,
    C: "C_locked_1",
    secret: JSON.stringify([
      "P2PK",
      {
        nonce: "proof-1",
        data: outputConfig.send.options.pubkey,
        tags: [
          ["locktime", String(outputConfig.send.options.locktime)],
          ["refund", ...outputConfig.send.options.refundKeys],
          ["pubkeys", ...outputConfig.send.options.pubkeys],
          ["n_sigs", String(outputConfig.send.options.nSigs)],
        ],
      },
    ]),
  } as unknown as Proof;
}

describe("buyer/seller/arbiter dispute escrow flow", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    localStorage.clear();
    mockRelayDisputeEvents.length = 0;
    mockDmInbox.length = 0;
    mockPublishedProofEvents.length = 0;
    process.env = {
      ...originalEnv,
      NEXT_PUBLIC_ARBITER_PUBKEY: ARBITER_CASHU_PUBKEY,
      NEXT_PUBLIC_ARBITER_NOSTR_PUBKEY: ARBITER_NOSTR_PUBKEY,
      ARBITER_NOSTR_PRIVKEY: "arbiter-nostr-privkey",
      ARBITER_PRIVKEY: "arbiter-cashu-privkey",
    };
    mockVerifyNip98Request.mockResolvedValue({
      ok: true,
      pubkey: ARBITER_NOSTR_PUBKEY,
    });
    mockReceive.mockResolvedValue([
      {
        id: "keyset-1",
        amount: 21,
        C: "C_fresh_1",
        secret: "fresh-secret",
      },
    ]);
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("locks buyer payment 2-of-3, opens dispute, routes arbiter sig only to winner, then winner redeems with two signatures", async () => {
    const outputConfig = buildP2pkOutputConfig(
      {
        enabled: true,
        pubkey: SELLER_CASHU_PUBKEY,
        refundDelayDays: 7,
      },
      undefined,
      BUYER_CASHU_PUBKEY
    );
    expect(outputConfig).toEqual({
      send: {
        type: "p2pk",
        options: expect.objectContaining({
          pubkey: NORMALIZED_SELLER_CASHU_PUBKEY,
          pubkeys: [BUYER_CASHU_PUBKEY, NORMALIZED_ARBITER_CASHU_PUBKEY],
          nSigs: 2,
          refundKeys: [BUYER_CASHU_PUBKEY],
        }),
      },
    });

    const lockedProof = buildLockedProof(outputConfig);
    mockDecodeToken.mockReturnValue({
      mint: "https://mint.example",
      proofs: [lockedProof],
    });

    expect(parseP2PK(lockedProof)).toEqual(
      expect.objectContaining({
        pubkey: NORMALIZED_SELLER_CASHU_PUBKEY,
        pubkeys: [BUYER_CASHU_PUBKEY, NORMALIZED_ARBITER_CASHU_PUBKEY],
        nSigs: 2,
        refundKeys: [BUYER_CASHU_PUBKEY],
      })
    );

    const openDisputeEvent = {
      id: "dispute-open",
      pubkey: BUYER_NOSTR_PUBKEY,
      sig: "buyer-dispute-sig",
      ...createDisputeEventTemplate({
        orderId: "order-1",
        reason: "item not delivered",
        buyerPubkey: BUYER_NOSTR_PUBKEY,
        sellerPubkey: SELLER_NOSTR_PUBKEY,
        arbiterPubkey: ARBITER_NOSTR_PUBKEY,
        status: "open",
        createdAt: 100,
      }),
    };
    mockRelayDisputeEvents.push(openDisputeEvent);
    expect(parseDisputeEvent(openDisputeEvent as any)).toEqual(
      expect.objectContaining({
        orderId: "order-1",
        buyerPubkey: BUYER_NOSTR_PUBKEY,
        sellerPubkey: SELLER_NOSTR_PUBKEY,
        arbiterPubkey: ARBITER_NOSTR_PUBKEY,
        status: "open",
      })
    );

    const res = createResponse();
    await handler(
      {
        method: "POST",
        headers: {
          authorization: "Nostr signed-event",
          host: "localhost:5000",
        },
        url: "/api/arbiter/rule",
        body: {
          orderId: "order-1",
          token: "cashuAtoken",
          rulingFor: "buyer",
          winnerNostrPubkey: SELLER_NOSTR_PUBKEY,
        },
      } as any,
      res as any
    );

    expect(res.statusCode).toBe(200);
    expect(res.jsonBody).toEqual({ success: true });

    expect(mockDmInbox).toHaveLength(1);
    expect(mockDmInbox[0]).toEqual(
      expect.objectContaining({
        senderPrivkeyHexOrNsec: "arbiter-nostr-privkey",
        recipientPubkey: BUYER_NOSTR_PUBKEY,
        payload: {
          type: "escrow-arbiter-sig",
          orderId: "order-1",
          proofs: [lockedProof],
          arbiterSigs: ["sig:arbiter-cashu-privkey:C_locked_1"],
        },
      })
    );
    expect(mockDmInbox[0].recipientPubkey).not.toBe(SELLER_NOSTR_PUBKEY);

    const resolvedDispute = parseDisputeEvent(
      mockRelayDisputeEvents.at(-1) as any
    );
    expect(resolvedDispute).toEqual(
      expect.objectContaining({
        orderId: "order-1",
        status: "resolved:buyer",
      })
    );

    const buyerPartial = await createPartialRedemption(
      "cashuAtoken",
      "buyer-cashu-privkey"
    );
    const result = await combineAndRedeem({
      proofs: buyerPartial.proofs,
      sig1: mockDmInbox[0].payload.arbiterSigs,
      sig2: buyerPartial.partialSigs,
      tokenMint: "https://mint.example",
      tokenAmount: 21,
      nostr: {} as any,
      signer: {} as any,
      mints: [],
      tokens: [],
      history: [],
    });

    expect(result).toEqual({ success: true });
    expect(mockReceive).toHaveBeenCalledWith([
      {
        ...lockedProof,
        witness: JSON.stringify({
          signatures: [
            "sig:arbiter-cashu-privkey:C_locked_1",
            "sig:buyer-cashu-privkey:C_locked_1",
          ],
        }),
      },
    ]);
    expect(JSON.parse(localStorage.getItem("tokens")!)).toEqual([
      {
        id: "keyset-1",
        amount: 21,
        C: "C_fresh_1",
        secret: "fresh-secret",
      },
    ]);
    expect(mockPublishedProofEvents).toHaveLength(1);
  });
});
