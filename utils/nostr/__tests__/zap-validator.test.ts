import {
  validateZapReceipt,
  validateSingleReceipt,
} from "@/utils/nostr/zap-validator";
import { NostrManager } from "@/utils/nostr/nostr-manager";

const mockVerifyEvent = jest.fn();
const mockDecodeInvoice = jest.fn();
const mockValidatePreimage = jest.fn();

jest.mock("nostr-tools", () => {
  const actual = jest.requireActual("nostr-tools");
  return {
    ...actual,
    verifyEvent: (...args: unknown[]) => mockVerifyEvent(...args),
  };
});

jest.mock("@getalby/lightning-tools/bolt11", () => ({
  decodeInvoice: (...args: unknown[]) => mockDecodeInvoice(...args),
  validatePreimage: (...args: unknown[]) => mockValidatePreimage(...args),
}));

const BUYER_PUBKEY = "buyer-pubkey-hex";
const LNURL_NOSTR_PUBKEY = "lnurl-provider-pubkey-hex";
const OTHER_PUBKEY = "other-pubkey-hex";
const PRODUCT_ID = "product-event-id";
const AMOUNT_SATS = 100;
const AMOUNT_MSAT = 100000;
const MIN_TIMESTAMP = 2000;
const BOLT11 = "lnbc-valid-invoice";
const PAYMENT_HASH = "a".repeat(64);
const EXPECTED_PREIMAGE = "b".repeat(64);
const EXPECTED_LNURL = "lnurl1recipient";

function makeDecodedInvoice(
  overrides?: Partial<{
    paymentHash: string;
    satoshi: number;
    millisatoshi: number;
    amountRaw: string;
    timestamp: number;
    expiry: number;
    description: string;
  }>
): Record<string, unknown> {
  return {
    paymentHash: PAYMENT_HASH,
    satoshi: AMOUNT_SATS,
    millisatoshi: AMOUNT_MSAT,
    amountRaw: String(AMOUNT_MSAT),
    timestamp: MIN_TIMESTAMP,
    ...overrides,
  };
}

function makeZapRequest(
  overrides?: Partial<{
    pubkey: string;
    created_at: number;
    kind: number;
    tags: string[][];
    content: string;
    id: string;
    sig: string;
  }>
): Record<string, unknown> {
  return {
    id: "zap-req-id",
    pubkey: BUYER_PUBKEY,
    created_at: MIN_TIMESTAMP,
    kind: 9734,
    tags: [
      ["p", LNURL_NOSTR_PUBKEY],
      ["e", PRODUCT_ID],
      ["amount", String(AMOUNT_MSAT)],
      ["lnurl", EXPECTED_LNURL],
      ["relays", "wss://relay.damus.io"],
    ],
    content: "Order #order-123",
    sig: "zap-req-sig",
    ...overrides,
  };
}

function defaultTags(zapRequest = makeZapRequest()): string[][] {
  return [
    ["p", LNURL_NOSTR_PUBKEY],
    ["e", PRODUCT_ID],
    ["amount", String(AMOUNT_MSAT)],
    ["bolt11", BOLT11],
    ["description", JSON.stringify(zapRequest)],
    ["preimage", EXPECTED_PREIMAGE],
  ];
}

function replaceTag(
  tags: string[][],
  tagName: string,
  newValues: string[]
): string[][] {
  return tags.map((t) => (t[0] === tagName ? newValues : t));
}

function withoutTag(tags: string[][], tagName: string): string[][] {
  return tags.filter((t) => t[0] !== tagName);
}

function makeReceipt(
  overrides?: Partial<{
    kind: number;
    tags: string[][];
    content: string;
    pubkey: string;
    created_at: number;
    id: string;
    sig: string;
  }>
): Record<string, unknown> {
  return {
    id: "receipt-id",
    pubkey: LNURL_NOSTR_PUBKEY,
    created_at: MIN_TIMESTAMP + 10,
    kind: 9735,
    tags: defaultTags(),
    content: "",
    sig: "receipt-sig",
    ...overrides,
  };
}

function validationOptions(
  overrides?: Partial<{
    productId: string;
    expectedRecipientPubkey: string;
    expectedReceiptSignerPubkey: string;
    expectedAmountSats: number;
    minTimestamp: number;
    skipFreshnessCheck: boolean;
    expectedPreimage: string;
    expectedLnurl: string;
    alternateRecipientPubkeys: string[];
    allowOverpayment: boolean;
  }>
): Record<string, unknown> {
  return {
    productId: PRODUCT_ID,
    expectedRecipientPubkey: LNURL_NOSTR_PUBKEY,
    expectedReceiptSignerPubkey: LNURL_NOSTR_PUBKEY,
    expectedAmountSats: AMOUNT_SATS,
    minTimestamp: MIN_TIMESTAMP,
    expectedLnurl: EXPECTED_LNURL,
    ...overrides,
  };
}

function receiptWithZapRequest(
  zapRequest: Record<string, unknown>
): Record<string, unknown> {
  return makeReceipt({
    tags: replaceTag(defaultTags(), "description", [
      "description",
      JSON.stringify(zapRequest),
    ]),
  });
}

describe("validateSingleReceipt", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockVerifyEvent.mockReturnValue(true);
    mockDecodeInvoice.mockReturnValue(makeDecodedInvoice());
    mockValidatePreimage.mockReturnValue(true);
  });

  it("accepts a fully valid NIP-57 receipt signed by the LNURL provider", () => {
    const result = validateSingleReceipt(
      makeReceipt() as any,
      validationOptions() as any
    );

    expect(result.valid).toBe(true);
    expect(result.amountSats).toBe(AMOUNT_SATS);
    expect(result.payerPubkey).toBe(BUYER_PUBKEY);
    expect(result.receiptId).toBe("receipt-id");
    expect(result.errors).toHaveLength(0);
    expect(mockDecodeInvoice).toHaveBeenCalledWith(BOLT11);
  });

  it("rejects receipt with invalid signature", () => {
    mockVerifyEvent.mockReturnValue(false);

    const result = validateSingleReceipt(
      makeReceipt() as any,
      validationOptions() as any
    );

    expect(result.valid).toBe(false);
    expect(result.errors).toContain("Invalid signature on zap receipt");
  });

  it("rejects receipt signed by a pubkey other than the LNURL provider nostrPubkey", () => {
    const result = validateSingleReceipt(
      makeReceipt({ pubkey: OTHER_PUBKEY }) as any,
      validationOptions() as any
    );

    expect(result.valid).toBe(false);
    expect(result.errors[0]).toMatch(/Receipt signer does not match/);
  });

  it("verifies both receipt and zap request signatures", () => {
    let callCount = 0;
    mockVerifyEvent.mockImplementation(() => {
      callCount++;
      return callCount === 1;
    });

    const result = validateSingleReceipt(
      makeReceipt() as any,
      validationOptions() as any
    );

    expect(result.valid).toBe(false);
    expect(result.errors).toContain(
      "Invalid signature on embedded zap request"
    );
    expect(callCount).toBe(2);
  });

  it("rejects receipt with wrong kind", () => {
    const result = validateSingleReceipt(
      makeReceipt({ kind: 1 }) as any,
      validationOptions() as any
    );

    expect(result.valid).toBe(false);
    expect(result.errors[0]).toMatch(/Expected kind 9735/);
  });

  it("rejects receipt with wrong recipient p tag", () => {
    const result = validateSingleReceipt(
      makeReceipt({
        tags: replaceTag(defaultTags(), "p", ["p", OTHER_PUBKEY]),
      }) as any,
      validationOptions() as any
    );

    expect(result.valid).toBe(false);
    expect(result.errors[0]).toMatch(
      /does not match an accepted zap recipient/
    );
  });

  it("rejects receipt with wrong product id", () => {
    const result = validateSingleReceipt(
      makeReceipt() as any,
      validationOptions({ productId: "different-product" }) as any
    );

    expect(result.valid).toBe(false);
    expect(result.errors[0]).toMatch(/does not match product/);
  });

  it("rejects receipt without bolt11 tag", () => {
    const result = validateSingleReceipt(
      makeReceipt({ tags: withoutTag(defaultTags(), "bolt11") }) as any,
      validationOptions() as any
    );

    expect(result.valid).toBe(false);
    expect(result.errors[0]).toMatch(/Missing 'bolt11' tag/);
  });

  it("rejects receipt when bolt11 cannot be decoded", () => {
    mockDecodeInvoice.mockReturnValue(null);

    const result = validateSingleReceipt(
      makeReceipt() as any,
      validationOptions() as any
    );

    expect(result.valid).toBe(false);
    expect(result.errors[0]).toMatch(/Invalid 'bolt11' invoice/);
  });

  it("rejects receipt when invoice amount differs from expected product price", () => {
    mockDecodeInvoice.mockReturnValue(
      makeDecodedInvoice({
        satoshi: 99,
        millisatoshi: 99000,
        amountRaw: "99000",
      })
    );

    const result = validateSingleReceipt(
      makeReceipt() as any,
      validationOptions() as any
    );

    expect(result.valid).toBe(false);
    expect(result.errors[0]).toMatch(
      /Invoice amount 99 sats does not match expected 100 sats/
    );
  });

  it("accepts receipt without relay amount tag because bolt11 is canonical", () => {
    const result = validateSingleReceipt(
      makeReceipt({ tags: withoutTag(defaultTags(), "amount") }) as any,
      validationOptions() as any
    );

    expect(result.valid).toBe(true);
  });

  it("rejects receipt with malformed relay amount tag", () => {
    const result = validateSingleReceipt(
      makeReceipt({
        tags: replaceTag(defaultTags(), "amount", ["amount", "1e5"]),
      }) as any,
      validationOptions() as any
    );

    expect(result.valid).toBe(false);
    expect(result.errors[0]).toMatch(/Invalid 'amount' tag in zap receipt/);
  });

  it("rejects receipt when optional relay amount differs from bolt11 amount", () => {
    const result = validateSingleReceipt(
      makeReceipt({
        tags: replaceTag(defaultTags(), "amount", ["amount", "50000"]),
      }) as any,
      validationOptions() as any
    );

    expect(result.valid).toBe(false);
    expect(result.errors[0]).toMatch(/does not match invoice amount/);
  });

  it("rejects receipt without description tag", () => {
    const result = validateSingleReceipt(
      makeReceipt({ tags: withoutTag(defaultTags(), "description") }) as any,
      validationOptions() as any
    );

    expect(result.valid).toBe(false);
    expect(result.errors[0]).toMatch(/Missing 'description' tag/);
  });

  it("rejects receipt with non-JSON description", () => {
    const result = validateSingleReceipt(
      makeReceipt({
        tags: replaceTag(defaultTags(), "description", [
          "description",
          "not-json",
        ]),
      }) as any,
      validationOptions() as any
    );

    expect(result.valid).toBe(false);
    expect(result.errors[0]).toMatch(/Failed to parse/);
  });

  it("rejects receipt where description is not a zap request", () => {
    const result = validateSingleReceipt(
      receiptWithZapRequest({ ...makeZapRequest(), kind: 1 }) as any,
      validationOptions() as any
    );

    expect(result.valid).toBe(false);
    expect(result.errors[0]).toMatch(/expected 9734/);
  });

  it("rejects receipt where zap request has wrong p tag", () => {
    const result = validateSingleReceipt(
      receiptWithZapRequest(
        makeZapRequest({
          tags: [
            ["p", OTHER_PUBKEY],
            ["e", PRODUCT_ID],
            ["amount", String(AMOUNT_MSAT)],
          ],
        })
      ) as any,
      validationOptions() as any
    );

    expect(result.valid).toBe(false);
    expect(result.errors[0]).toMatch(
      /does not match an accepted zap recipient/
    );
  });

  it("rejects receipt where zap request has missing e tag", () => {
    const result = validateSingleReceipt(
      receiptWithZapRequest(
        makeZapRequest({
          tags: [
            ["p", LNURL_NOSTR_PUBKEY],
            ["amount", String(AMOUNT_MSAT)],
          ],
        })
      ) as any,
      validationOptions() as any
    );

    expect(result.valid).toBe(false);
    expect(result.errors[0]).toMatch(/missing or does not match product/);
  });

  it("rejects receipt where zap request amount is malformed", () => {
    const result = validateSingleReceipt(
      receiptWithZapRequest(
        makeZapRequest({
          tags: [
            ["p", LNURL_NOSTR_PUBKEY],
            ["e", PRODUCT_ID],
            ["amount", "1e5"],
          ],
        })
      ) as any,
      validationOptions() as any
    );

    expect(result.valid).toBe(false);
    expect(result.errors[0]).toMatch(/Invalid 'amount' tag in zap request/);
  });

  it("accepts receipt when zap request amount is absent because bolt11 is canonical", () => {
    const result = validateSingleReceipt(
      receiptWithZapRequest(
        makeZapRequest({
          tags: [
            ["p", LNURL_NOSTR_PUBKEY],
            ["e", PRODUCT_ID],
          ],
        })
      ) as any,
      validationOptions() as any
    );

    expect(result.valid).toBe(true);
  });

  it("rejects receipt where zap request amount differs from invoice amount", () => {
    const result = validateSingleReceipt(
      receiptWithZapRequest(
        makeZapRequest({
          tags: [
            ["p", LNURL_NOSTR_PUBKEY],
            ["e", PRODUCT_ID],
            ["amount", String(AMOUNT_MSAT + 1000)],
          ],
        })
      ) as any,
      validationOptions() as any
    );

    expect(result.valid).toBe(false);
    expect(result.errors[0]).toMatch(
      /Zap request amount does not match invoice amount/
    );
  });

  it("rejects receipt where zap request lnurl conflicts with the expected LNURL", () => {
    const result = validateSingleReceipt(
      receiptWithZapRequest(
        makeZapRequest({
          tags: [
            ["p", LNURL_NOSTR_PUBKEY],
            ["e", PRODUCT_ID],
            ["amount", String(AMOUNT_MSAT)],
            ["lnurl", "lnurl1attacker"],
          ],
        })
      ) as any,
      validationOptions() as any
    );

    expect(result.valid).toBe(false);
    expect(result.errors[0]).toMatch(/does not match expected LNURL/);
  });

  it("accepts receipt when optional lnurl tag is absent", () => {
    const result = validateSingleReceipt(
      receiptWithZapRequest(
        makeZapRequest({
          tags: [
            ["p", LNURL_NOSTR_PUBKEY],
            ["e", PRODUCT_ID],
            ["amount", String(AMOUNT_MSAT)],
          ],
        })
      ) as any,
      validationOptions() as any
    );

    expect(result.valid).toBe(true);
  });

  it("rejects receipt with timestamp outside the freshness window", () => {
    const result = validateSingleReceipt(
      makeReceipt({ created_at: MIN_TIMESTAMP - 121 }) as any,
      validationOptions() as any
    );

    expect(result.valid).toBe(false);
    expect(result.errors[0]).toMatch(/outside acceptable window/);
  });

  it("accepts a receipt created well after minTimestamp (slow payer)", () => {
    const result = validateSingleReceipt(
      makeReceipt({ created_at: MIN_TIMESTAMP + 3600 }) as any,
      validationOptions() as any
    );

    expect(result.valid).toBe(true);
  });

  it("rejects a future-dated receipt beyond the clock-skew allowance", () => {
    const futureCreatedAt = Math.floor(Date.now() / 1000) + 300;
    const result = validateSingleReceipt(
      makeReceipt({ created_at: futureCreatedAt }) as any,
      validationOptions() as any
    );

    expect(result.valid).toBe(false);
    expect(result.errors[0]).toMatch(/outside acceptable window/);
  });

  it("skips freshness check when skipFreshnessCheck is true", () => {
    const result = validateSingleReceipt(
      makeReceipt({ created_at: 0 }) as any,
      validationOptions({ skipFreshnessCheck: true }) as any
    );

    expect(result.valid).toBe(true);
  });

  it("accepts 'p' tags matching an alternate recipient pubkey", () => {
    const zapRequest = makeZapRequest({
      tags: [
        ["p", OTHER_PUBKEY],
        ["e", PRODUCT_ID],
        ["amount", String(AMOUNT_MSAT)],
        ["lnurl", EXPECTED_LNURL],
      ],
    });
    const receipt = makeReceipt({
      tags: replaceTag(defaultTags(zapRequest), "p", ["p", OTHER_PUBKEY]),
    });

    const strictResult = validateSingleReceipt(
      receipt as any,
      validationOptions() as any
    );
    expect(strictResult.valid).toBe(false);

    const relaxedResult = validateSingleReceipt(
      receipt as any,
      validationOptions({
        alternateRecipientPubkeys: [OTHER_PUBKEY],
      }) as any
    );
    expect(relaxedResult.valid).toBe(true);
  });

  it("rejects 'p' tags not in the accepted recipient set even with alternates", () => {
    const receipt = makeReceipt({
      tags: replaceTag(defaultTags(), "p", ["p", "unrelated-pubkey"]),
    });

    const result = validateSingleReceipt(
      receipt as any,
      validationOptions({
        alternateRecipientPubkeys: [OTHER_PUBKEY],
      }) as any
    );

    expect(result.valid).toBe(false);
    expect(result.errors[0]).toMatch(/accepted zap recipient/);
  });

  it("accepts an invoice above the expected amount when allowOverpayment is true", () => {
    mockDecodeInvoice.mockReturnValue(
      makeDecodedInvoice({ millisatoshi: 250000, satoshi: 250 })
    );
    const differentAmountTags = replaceTag(
      defaultTags(
        makeZapRequest({
          tags: [
            ["p", LNURL_NOSTR_PUBKEY],
            ["e", PRODUCT_ID],
            ["amount", "250000"],
            ["lnurl", EXPECTED_LNURL],
          ],
        })
      ),
      "amount",
      ["amount", "250000"]
    );
    const receipt = makeReceipt({ tags: differentAmountTags });

    const strictResult = validateSingleReceipt(
      receipt as any,
      validationOptions() as any
    );
    expect(strictResult.valid).toBe(false);

    const relaxedResult = validateSingleReceipt(
      receipt as any,
      validationOptions({ allowOverpayment: true }) as any
    );
    expect(relaxedResult.valid).toBe(true);
    expect(relaxedResult.amountSats).toBe(250);
  });

  it("rejects an invoice below the expected amount even when allowOverpayment is true", () => {
    mockDecodeInvoice.mockReturnValue(
      makeDecodedInvoice({ millisatoshi: 1000, satoshi: 1 })
    );
    const lowAmountTags = replaceTag(
      defaultTags(
        makeZapRequest({
          tags: [
            ["p", LNURL_NOSTR_PUBKEY],
            ["e", PRODUCT_ID],
            ["amount", "1000"],
            ["lnurl", EXPECTED_LNURL],
          ],
        })
      ),
      "amount",
      ["amount", "1000"]
    );
    const receipt = makeReceipt({ tags: lowAmountTags });

    const result = validateSingleReceipt(
      receipt as any,
      validationOptions({ allowOverpayment: true }) as any
    );

    expect(result.valid).toBe(false);
    expect(result.errors[0]).toMatch(/below expected minimum/);
  });

  it("still rejects receipt amount tag mismatching the invoice when allowOverpayment is true", () => {
    const receipt = makeReceipt({
      tags: replaceTag(defaultTags(), "amount", ["amount", "999000"]),
    });

    const result = validateSingleReceipt(
      receipt as any,
      validationOptions({ allowOverpayment: true }) as any
    );

    expect(result.valid).toBe(false);
    expect(result.errors[0]).toMatch(
      /Zap receipt amount does not match invoice amount/
    );
  });

  it("rejects receipt when expectedPreimage does not match invoice payment hash", () => {
    mockValidatePreimage.mockReturnValue(false);

    const result = validateSingleReceipt(
      makeReceipt() as any,
      validationOptions({ expectedPreimage: EXPECTED_PREIMAGE }) as any
    );

    expect(result.valid).toBe(false);
    expect(result.errors[0]).toMatch(
      /Preimage does not match invoice payment hash/
    );
    expect(mockValidatePreimage).toHaveBeenCalledWith(
      EXPECTED_PREIMAGE,
      PAYMENT_HASH
    );
  });

  it("accepts receipt when expectedPreimage matches invoice payment hash and receipt omits preimage tag", () => {
    const result = validateSingleReceipt(
      makeReceipt({ tags: withoutTag(defaultTags(), "preimage") }) as any,
      validationOptions({ expectedPreimage: EXPECTED_PREIMAGE }) as any
    );

    expect(result.valid).toBe(true);
    expect(mockValidatePreimage).toHaveBeenCalledWith(
      EXPECTED_PREIMAGE,
      PAYMENT_HASH
    );
  });

  it("rejects receipt when included preimage tag conflicts with expected preimage", () => {
    const result = validateSingleReceipt(
      makeReceipt({
        tags: replaceTag(defaultTags(), "preimage", [
          "preimage",
          "wrong-preimage",
        ]),
      }) as any,
      validationOptions({ expectedPreimage: EXPECTED_PREIMAGE }) as any
    );

    expect(result.valid).toBe(false);
    expect(result.errors[0]).toMatch(/Preimage mismatch/);
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
    mockVerifyEvent.mockReturnValue(true);
    mockDecodeInvoice.mockReturnValue(makeDecodedInvoice());
    mockValidatePreimage.mockReturnValue(true);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("returns valid result when receipt passes NIP-57 checks", async () => {
    mockFetch.mockResolvedValue([makeReceipt()]);

    const result = await validateZapReceipt(
      mockNostrManager,
      validationOptions() as any
    );

    expect(result.valid).toBe(true);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("retries when fetched receipts fail validation", async () => {
    const badAmount = makeReceipt({
      tags: replaceTag(defaultTags(), "amount", ["amount", "5000"]),
    });
    mockFetch
      .mockResolvedValueOnce([badAmount])
      .mockResolvedValueOnce([badAmount])
      .mockResolvedValueOnce([makeReceipt()]);

    const promise = validateZapReceipt(
      mockNostrManager,
      validationOptions() as any
    );

    await jest.advanceTimersByTimeAsync(3000);

    const result = await promise;

    expect(result.valid).toBe(true);
    expect(mockFetch).toHaveBeenCalledTimes(3);
  });

  it("returns invalid after all retries if no receipt validates", async () => {
    mockFetch.mockResolvedValue([]);

    const promise = validateZapReceipt(
      mockNostrManager,
      validationOptions() as any
    );

    await jest.advanceTimersByTimeAsync(5000);

    const result = await promise;

    expect(result.valid).toBe(false);
    expect(mockFetch).toHaveBeenCalledTimes(5);
    expect(result.errors).toContain(
      "No valid zap receipt found after all retries"
    );
  });

  it("passes the correct filter to nostr.fetch", async () => {
    mockFetch.mockResolvedValue([makeReceipt()]);

    await validateZapReceipt(mockNostrManager, validationOptions() as any);

    expect(mockFetch).toHaveBeenCalledWith([
      expect.objectContaining({
        kinds: [9735],
        "#e": [PRODUCT_ID],
        since: MIN_TIMESTAMP - 120,
      }),
    ]);
  });
});
