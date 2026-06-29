import { validateZapReceipt, validateSingleReceipt } from "@/utils/nostr/zap-validator";
import { NostrManager } from "@/utils/nostr/nostr-manager";

const mockVerifyEvent = jest.fn();
jest.mock("nostr-tools", () => {
  const actual = jest.requireActual("nostr-tools");
  return {
    ...actual,
    verifyEvent: (...args: unknown[]) => mockVerifyEvent(...args),
  };
});

const SELLER_PUBKEY = "seller-pubkey-hex";
const BUYER_PUBKEY = "buyer-pubkey-hex";
const PRODUCT_ID = "product-event-id";
const AMOUNT_SATS = 100;
const AMOUNT_MSAT = 100000;
const MIN_TIMESTAMP = 2000;

function defaultTags(): string[][] {
  return [
    ["p", SELLER_PUBKEY],
    ["e", PRODUCT_ID],
    ["amount", String(AMOUNT_MSAT)],
    ["bolt11", "lnbc..."],
    ["description", JSON.stringify({
      id: "zap-req-id",
      pubkey: BUYER_PUBKEY,
      created_at: MIN_TIMESTAMP,
      kind: 9734,
      tags: [
        ["p", SELLER_PUBKEY],
        ["e", PRODUCT_ID],
        ["amount", String(AMOUNT_MSAT)],
        ["relays", "wss://relay.damus.io"],
      ],
      content: "Order #order-123",
      sig: "zap-req-sig",
    })],
    ["preimage", "test-preimage"],
  ];
}

function withReplacedTag(
  tags: string[][],
  tagName: string,
  newValues: string[]
): string[][] {
  return tags.map((t) => (t[0] === tagName ? newValues : t));
}

function makeReceipt(overrides?: Partial<{
  kind: number;
  tags: string[][];
  content: string;
  pubkey: string;
  created_at: number;
  id: string;
  sig: string;
}>): Record<string, unknown> {
  return {
    id: "receipt-id",
    pubkey: SELLER_PUBKEY,
    created_at: MIN_TIMESTAMP + 10,
    kind: 9735,
    tags: defaultTags(),
    content: "",
    sig: "receipt-sig",
    ...overrides,
  };
}

function makeZapRequest(overrides?: Partial<{
  pubkey: string;
  created_at: number;
  kind: number;
  tags: string[][];
  content: string;
  id: string;
  sig: string;
}>): Record<string, unknown> {
  return {
    id: "zap-req-id",
    pubkey: BUYER_PUBKEY,
    created_at: MIN_TIMESTAMP,
    kind: 9734,
    tags: [
      ["p", SELLER_PUBKEY],
      ["e", PRODUCT_ID],
      ["amount", String(AMOUNT_MSAT)],
      ["relays", "wss://relay.damus.io"],
    ],
    content: "Order #order-123",
    sig: "zap-req-sig",
    ...overrides,
  };
}

describe("validateSingleReceipt", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("accepts a fully valid receipt", () => {
    mockVerifyEvent.mockReturnValue(true);

    const result = validateSingleReceipt(
      makeReceipt() as any,
      PRODUCT_ID,
      SELLER_PUBKEY,
      AMOUNT_SATS,
      MIN_TIMESTAMP
    );

    expect(result.valid).toBe(true);
    expect(result.amountSats).toBe(AMOUNT_SATS);
    expect(result.payerPubkey).toBe(BUYER_PUBKEY);
    expect(result.receiptId).toBe("receipt-id");
    expect(result.errors).toHaveLength(0);
  });

  it("rejects receipt with invalid signature", () => {
    mockVerifyEvent.mockReturnValue(false);

    const result = validateSingleReceipt(
      makeReceipt() as any,
      PRODUCT_ID,
      SELLER_PUBKEY,
      AMOUNT_SATS,
      MIN_TIMESTAMP
    );

    expect(result.valid).toBe(false);
    expect(result.errors).toContain("Invalid signature on zap receipt");
  });

  it("verifies both receipt and zap request signatures", () => {
    let callCount = 0;
    mockVerifyEvent.mockImplementation(() => {
      callCount++;
      return callCount === 1;
    });

    const result = validateSingleReceipt(
      makeReceipt() as any,
      PRODUCT_ID,
      SELLER_PUBKEY,
      AMOUNT_SATS,
      MIN_TIMESTAMP
    );

    expect(result.valid).toBe(false);
    expect(result.errors).toContain("Invalid signature on embedded zap request");
    expect(callCount).toBe(2);
  });

  it("rejects receipt with wrong kind", () => {
    mockVerifyEvent.mockReturnValue(true);

    const result = validateSingleReceipt(
      makeReceipt({ kind: 1 }) as any,
      PRODUCT_ID,
      SELLER_PUBKEY,
      AMOUNT_SATS,
      MIN_TIMESTAMP
    );

    expect(result.valid).toBe(false);
    expect(result.errors[0]).toMatch(/Expected kind 9735/);
  });

  it("rejects receipt with wrong seller pubkey", () => {
    mockVerifyEvent.mockReturnValue(true);

    const result = validateSingleReceipt(
      makeReceipt({
        tags: withReplacedTag(defaultTags(), "p", ["p", "wrong-pubkey"]),
      }) as any,
      PRODUCT_ID,
      SELLER_PUBKEY,
      AMOUNT_SATS,
      MIN_TIMESTAMP
    );

    expect(result.valid).toBe(false);
    expect(result.errors[0]).toMatch(/does not match seller/);
  });

  it("rejects receipt with wrong product id", () => {
    mockVerifyEvent.mockReturnValue(true);

    const result = validateSingleReceipt(
      makeReceipt() as any,
      "different-product",
      SELLER_PUBKEY,
      AMOUNT_SATS,
      MIN_TIMESTAMP
    );

    expect(result.valid).toBe(false);
    expect(result.errors[0]).toMatch(/does not match product/);
  });

  it("rejects receipt without amount tag", () => {
    mockVerifyEvent.mockReturnValue(true);

    const withoutAmount = makeReceipt() as any;
    withoutAmount.tags = withoutAmount.tags.filter((t: string[]) => t[0] !== "amount");

    const result = validateSingleReceipt(
      withoutAmount,
      PRODUCT_ID,
      SELLER_PUBKEY,
      AMOUNT_SATS,
      MIN_TIMESTAMP
    );

    expect(result.valid).toBe(false);
    expect(result.errors[0]).toMatch(/Missing or invalid 'amount' tag/);
  });

  it("rejects receipt with non-numeric amount (e.g. scientific notation)", () => {
    mockVerifyEvent.mockReturnValue(true);

    const result = validateSingleReceipt(
      makeReceipt({
        tags: withReplacedTag(defaultTags(), "amount", ["amount", "1e5"]),
      }) as any,
      PRODUCT_ID,
      SELLER_PUBKEY,
      AMOUNT_SATS,
      MIN_TIMESTAMP
    );

    expect(result.valid).toBe(false);
    expect(result.errors[0]).toMatch(/Missing or invalid 'amount' tag/);
  });

  it("rejects receipt with zero amount", () => {
    mockVerifyEvent.mockReturnValue(true);

    const result = validateSingleReceipt(
      makeReceipt({
        tags: withReplacedTag(defaultTags(), "amount", ["amount", "0"]),
      }) as any,
      PRODUCT_ID,
      SELLER_PUBKEY,
      AMOUNT_SATS,
      MIN_TIMESTAMP
    );

    expect(result.valid).toBe(false);
    expect(result.errors[0]).toMatch(/Invalid amount/);
  });

  it("rejects receipt with amount mismatch", () => {
    mockVerifyEvent.mockReturnValue(true);

    const result = validateSingleReceipt(
      makeReceipt({
        tags: withReplacedTag(defaultTags(), "amount", ["amount", "50000"]),
      }) as any,
      PRODUCT_ID,
      SELLER_PUBKEY,
      AMOUNT_SATS,
      MIN_TIMESTAMP
    );

    expect(result.valid).toBe(false);
    expect(result.errors[0]).toMatch(/does not match expected/);
  });

  it("accepts amount within rounding tolerance (1 sat difference)", () => {
    mockVerifyEvent.mockReturnValue(true);

    const oneSatOff = (AMOUNT_SATS - 1) * 1000;
    const tags = defaultTags();
    const descStr = tags.find((t) => t[0] === "description")?.[1];
    const desc = JSON.parse(descStr ?? "{}");
    desc.tags = (desc.tags as string[][]).map((t) =>
      t[0] === "amount" ? ["amount", String(oneSatOff)] : t
    );
    const updatedTags = tags.map((t) =>
      t[0] === "amount"
        ? ["amount", String(oneSatOff)]
        : t[0] === "description"
          ? ["description", JSON.stringify(desc)]
          : t
    );

    const result = validateSingleReceipt(
      makeReceipt({ tags: updatedTags }) as any,
      PRODUCT_ID,
      SELLER_PUBKEY,
      AMOUNT_SATS,
      MIN_TIMESTAMP
    );

    expect(result.valid).toBe(true);
    expect(result.amountSats).toBe(AMOUNT_SATS - 1);
  });

  it("rejects receipt without description tag", () => {
    mockVerifyEvent.mockReturnValue(true);

    const withoutDesc = makeReceipt() as any;
    withoutDesc.tags = withoutDesc.tags.filter((t: string[]) => t[0] !== "description");

    const result = validateSingleReceipt(
      withoutDesc,
      PRODUCT_ID,
      SELLER_PUBKEY,
      AMOUNT_SATS,
      MIN_TIMESTAMP
    );

    expect(result.valid).toBe(false);
    expect(result.errors[0]).toMatch(/Missing 'description' tag/);
  });

  it("rejects receipt with non-JSON description", () => {
    mockVerifyEvent.mockReturnValue(true);

    const badDesc = makeReceipt() as any;
    for (let i = 0; i < badDesc.tags.length; i++) {
      const tag = badDesc.tags[i];
      if (tag && tag[0] === "description") {
        badDesc.tags[i] = ["description", "not-json"];
      }
    }

    const result = validateSingleReceipt(
      badDesc,
      PRODUCT_ID,
      SELLER_PUBKEY,
      AMOUNT_SATS,
      MIN_TIMESTAMP
    );

    expect(result.valid).toBe(false);
    expect(result.errors[0]).toMatch(/Failed to parse/);
  });

  it("rejects receipt where description is not a zap request (wrong kind)", () => {
    mockVerifyEvent.mockReturnValue(true);

    const badZapReq = makeReceipt() as any;
    const wrongKindReq = { ...makeZapRequest(), kind: 1 };
    for (let i = 0; i < badZapReq.tags.length; i++) {
      const tag = badZapReq.tags[i];
      if (tag && tag[0] === "description") {
        badZapReq.tags[i] = ["description", JSON.stringify(wrongKindReq)];
      }
    }

    const result = validateSingleReceipt(
      badZapReq,
      PRODUCT_ID,
      SELLER_PUBKEY,
      AMOUNT_SATS,
      MIN_TIMESTAMP
    );

    expect(result.valid).toBe(false);
    expect(result.errors[0]).toMatch(/expected 9734/);
  });

  it("rejects receipt where zap request has wrong 'p' tag", () => {
    mockVerifyEvent.mockReturnValue(true);

    const badPTag = makeReceipt() as any;
    const wrongPReq = makeZapRequest({ tags: [["p", "wrong-pubkey"]] });
    for (let i = 0; i < badPTag.tags.length; i++) {
      const tag = badPTag.tags[i];
      if (tag && tag[0] === "description") {
        badPTag.tags[i] = ["description", JSON.stringify(wrongPReq)];
      }
    }

    const result = validateSingleReceipt(
      badPTag,
      PRODUCT_ID,
      SELLER_PUBKEY,
      AMOUNT_SATS,
      MIN_TIMESTAMP
    );

    expect(result.valid).toBe(false);
    expect(result.errors[0]).toMatch(/does not match seller/);
  });

  it("rejects receipt where zap request has missing 'e' tag", () => {
    mockVerifyEvent.mockReturnValue(true);

    const badETag = makeReceipt() as any;
    const noETagReq = makeZapRequest({ tags: [["p", SELLER_PUBKEY]] });
    for (let i = 0; i < badETag.tags.length; i++) {
      const tag = badETag.tags[i];
      if (tag && tag[0] === "description") {
        badETag.tags[i] = ["description", JSON.stringify(noETagReq)];
      }
    }

    const result = validateSingleReceipt(
      badETag,
      PRODUCT_ID,
      SELLER_PUBKEY,
      AMOUNT_SATS,
      MIN_TIMESTAMP
    );

    expect(result.valid).toBe(false);
    expect(result.errors[0]).toMatch(/missing or does not match product/);
  });

  it("rejects receipt where zap request has wrong 'e' tag", () => {
    mockVerifyEvent.mockReturnValue(true);

    const badETag = makeReceipt() as any;
    const wrongETagReq = makeZapRequest({
      tags: [
        ["p", SELLER_PUBKEY],
        ["e", "wrong-product"],
      ],
    });
    for (let i = 0; i < badETag.tags.length; i++) {
      const tag = badETag.tags[i];
      if (tag && tag[0] === "description") {
        badETag.tags[i] = ["description", JSON.stringify(wrongETagReq)];
      }
    }

    const result = validateSingleReceipt(
      badETag,
      PRODUCT_ID,
      SELLER_PUBKEY,
      AMOUNT_SATS,
      MIN_TIMESTAMP
    );

    expect(result.valid).toBe(false);
    expect(result.errors[0]).toMatch(/missing or does not match product/);
  });

  it("rejects receipt where zap request amount differs beyond tolerance", () => {
    mockVerifyEvent.mockReturnValue(true);

    const badAmount = makeReceipt() as any;
    const amountDiffReq = makeZapRequest({
      tags: [
        ["p", SELLER_PUBKEY],
        ["e", PRODUCT_ID],
        ["amount", String(AMOUNT_MSAT + 2000)],
      ],
    });
    for (let i = 0; i < badAmount.tags.length; i++) {
      const tag = badAmount.tags[i];
      if (tag && tag[0] === "description") {
        badAmount.tags[i] = ["description", JSON.stringify(amountDiffReq)];
      }
    }

    const result = validateSingleReceipt(
      badAmount,
      PRODUCT_ID,
      SELLER_PUBKEY,
      AMOUNT_SATS,
      MIN_TIMESTAMP
    );

    expect(result.valid).toBe(false);
    expect(result.errors[0]).toMatch(/does not match receipt amount/);
  });

  it("accepts receipt where zap request amount is within 1 sat tolerance", () => {
    mockVerifyEvent.mockReturnValue(true);

    const closeAmount = makeReceipt() as any;
    const closeReq = makeZapRequest({
      tags: [
        ["p", SELLER_PUBKEY],
        ["e", PRODUCT_ID],
        ["amount", String(AMOUNT_MSAT + 500)],
      ],
    });
    for (let i = 0; i < closeAmount.tags.length; i++) {
      const tag = closeAmount.tags[i];
      if (tag && tag[0] === "description") {
        closeAmount.tags[i] = ["description", JSON.stringify(closeReq)];
      }
    }

    const result = validateSingleReceipt(
      closeAmount,
      PRODUCT_ID,
      SELLER_PUBKEY,
      AMOUNT_SATS,
      MIN_TIMESTAMP
    );

    expect(result.valid).toBe(true);
  });

  it("rejects receipt with timestamp outside the window", () => {
    mockVerifyEvent.mockReturnValue(true);

    const result = validateSingleReceipt(
      makeReceipt({ created_at: MIN_TIMESTAMP - 121 }) as any,
      PRODUCT_ID,
      SELLER_PUBKEY,
      AMOUNT_SATS,
      MIN_TIMESTAMP
    );

    expect(result.valid).toBe(false);
    expect(result.errors[0]).toMatch(/outside acceptable window/);
  });

  it("skips freshness check when skipFreshnessCheck is true", () => {
    mockVerifyEvent.mockReturnValue(true);

    const result = validateSingleReceipt(
      makeReceipt({ created_at: 0 }) as any,
      PRODUCT_ID,
      SELLER_PUBKEY,
      AMOUNT_SATS,
      MIN_TIMESTAMP,
      { skipFreshnessCheck: true }
    );

    expect(result.valid).toBe(true);
  });

  it("rejects receipt when expectedPreimage is set but receipt has no preimage tag", () => {
    mockVerifyEvent.mockReturnValue(true);

    const noPreimage = makeReceipt() as any;
    noPreimage.tags = noPreimage.tags.filter((t: string[]) => t[0] !== "preimage");

    const result = validateSingleReceipt(
      noPreimage,
      PRODUCT_ID,
      SELLER_PUBKEY,
      AMOUNT_SATS,
      MIN_TIMESTAMP,
      { expectedPreimage: "should-be-present" }
    );

    expect(result.valid).toBe(false);
    expect(result.errors[0]).toMatch(/Missing 'preimage' tag/);
  });

  it("rejects receipt when expectedPreimage does not match", () => {
    mockVerifyEvent.mockReturnValue(true);

    const result = validateSingleReceipt(
      makeReceipt() as any,
      PRODUCT_ID,
      SELLER_PUBKEY,
      AMOUNT_SATS,
      MIN_TIMESTAMP,
      { expectedPreimage: "wrong-preimage" }
    );

    expect(result.valid).toBe(false);
    expect(result.errors[0]).toMatch(/Preimage mismatch/);
  });

  it("accepts receipt when expectedPreimage matches", () => {
    mockVerifyEvent.mockReturnValue(true);

    const result = validateSingleReceipt(
      makeReceipt() as any,
      PRODUCT_ID,
      SELLER_PUBKEY,
      AMOUNT_SATS,
      MIN_TIMESTAMP,
      { expectedPreimage: "test-preimage" }
    );

    expect(result.valid).toBe(true);
  });
});

describe("validateZapReceipt", () => {
  const mockFetch = jest.fn();
  const mockNostrManager = {
    fetch: mockFetch,
  } as unknown as NostrManager;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("returns valid result when receipt passes crypto checks", async () => {
    mockVerifyEvent.mockReturnValue(true);
    mockFetch.mockResolvedValue([makeReceipt()]);

    const result = await validateZapReceipt(
      mockNostrManager,
      PRODUCT_ID,
      MIN_TIMESTAMP,
      SELLER_PUBKEY,
      AMOUNT_SATS
    );

    expect(result.valid).toBe(true);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("retries when fetched receipts fail crypto validation", async () => {
    mockVerifyEvent.mockReturnValue(true);
    const badAmount = makeReceipt({
      tags: withReplacedTag(defaultTags(), "amount", ["amount", "5000"]),
    });
    mockFetch
      .mockResolvedValueOnce([badAmount])
      .mockResolvedValueOnce([badAmount])
      .mockResolvedValueOnce([makeReceipt()]);

    const promise = validateZapReceipt(
      mockNostrManager,
      PRODUCT_ID,
      MIN_TIMESTAMP,
      SELLER_PUBKEY,
      AMOUNT_SATS
    );

    await jest.advanceTimersByTimeAsync(3000);

    const result = await promise;

    expect(result.valid).toBe(true);
    expect(mockFetch).toHaveBeenCalledTimes(3);
  });

  it("returns invalid after all retries if no receipt validates", async () => {
    mockVerifyEvent.mockReturnValue(true);
    mockFetch.mockResolvedValue([]);

    const promise = validateZapReceipt(
      mockNostrManager,
      PRODUCT_ID,
      MIN_TIMESTAMP,
      SELLER_PUBKEY,
      AMOUNT_SATS
    );

    await jest.advanceTimersByTimeAsync(5000);

    const result = await promise;

    expect(result.valid).toBe(false);
    expect(mockFetch).toHaveBeenCalledTimes(5);
    expect(result.errors).toContain("No valid zap receipt found after all retries");
  });

  it("passes the correct filter to nostr.fetch", async () => {
    mockVerifyEvent.mockReturnValue(true);
    mockFetch.mockResolvedValue([makeReceipt()]);

    await validateZapReceipt(
      mockNostrManager,
      PRODUCT_ID,
      MIN_TIMESTAMP,
      SELLER_PUBKEY,
      AMOUNT_SATS
    );

    expect(mockFetch).toHaveBeenCalledWith([
      expect.objectContaining({
        kinds: [9735],
        "#e": [PRODUCT_ID],
        since: MIN_TIMESTAMP,
      }),
    ]);
  });
});
