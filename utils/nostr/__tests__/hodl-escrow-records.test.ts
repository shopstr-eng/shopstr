import type { NostrEvent } from "@/utils/nostr/nostr-manager";

jest.mock("@/utils/nostr/nostr-helper-functions", () => ({
  finalizeAndSendNostrEvent: jest.fn().mockResolvedValue({ id: "event-id" }),
}));

const verifyEventMock = jest.fn().mockReturnValue(true);
jest.mock("nostr-tools", () => ({
  ...jest.requireActual("nostr-tools"),
  verifyEvent: (...args: unknown[]) => verifyEventMock(...args),
}));

import { finalizeAndSendNostrEvent } from "@/utils/nostr/nostr-helper-functions";
import {
  HODL_CONFIRM_EVENT_KIND,
  HODL_RELEASE_EVENT_KIND,
  createHodlConfirmEventTemplate,
  createHodlReleaseEventTemplate,
  publishHodlConfirmEvent,
  publishHodlReleaseEvent,
  parseHodlConfirmEvent,
  parseHodlReleaseEvent,
  fetchHodlConfirmEvents,
} from "../hodl-escrow-records";

const PAYMENT_HASH = "ab".repeat(32);
const OTHER_PAYMENT_HASH = "cd".repeat(32);

const mkConfirmEvent = (
  overrides: Partial<NostrEvent> & { tags: string[][] }
): NostrEvent =>
  ({
    id: "id",
    pubkey: "author-pubkey",
    created_at: 100,
    kind: HODL_CONFIRM_EVENT_KIND,
    content: "",
    sig: "sig",
    ...overrides,
  }) as unknown as NostrEvent;

const mkReleaseEvent = (
  overrides: Partial<NostrEvent> & { tags: string[][] }
): NostrEvent =>
  ({
    id: "id",
    pubkey: "author-pubkey",
    created_at: 100,
    kind: HODL_RELEASE_EVENT_KIND,
    content: "arbiter reasoning",
    sig: "sig",
    ...overrides,
  }) as unknown as NostrEvent;

describe("event kind allocation", () => {
  it("uses the next two free parameterized-replaceable kinds after 30407", () => {
    expect(HODL_CONFIRM_EVENT_KIND).toBe(30408);
    expect(HODL_RELEASE_EVENT_KIND).toBe(30409);
  });

  it("keeps the two message types on distinct kinds", () => {
    expect(HODL_CONFIRM_EVENT_KIND).not.toBe(HODL_RELEASE_EVENT_KIND);
  });
});

describe("createHodlConfirmEventTemplate", () => {
  it("builds a kind 30408 event whose only tag is the d tag", () => {
    const template = createHodlConfirmEventTemplate({
      paymentHash: PAYMENT_HASH,
      createdAt: 1234,
    });

    expect(template.kind).toBe(HODL_CONFIRM_EVENT_KIND);
    expect(template.tags).toEqual([["d", PAYMENT_HASH]]);
    expect(template.content).toBe("");
    expect(template.created_at).toBe(1234);
  });

  it("carries an optional free-text note as the content", () => {
    const template = createHodlConfirmEventTemplate({
      paymentHash: PAYMENT_HASH,
      note: "package arrived, thanks",
    });
    expect(template.content).toBe("package arrived, thanks");
  });

  it("never emits a p tag or any tag naming a buyer", () => {
    const template = createHodlConfirmEventTemplate({
      paymentHash: PAYMENT_HASH,
      note: "note",
    });
    const flattened = JSON.stringify(template.tags);

    expect(template.tags.some((tag) => tag[0] === "p")).toBe(false);
    expect(flattened).not.toContain("buyer");
  });

  it("emits no status tag — the event's existence is the confirmation", () => {
    const template = createHodlConfirmEventTemplate({
      paymentHash: PAYMENT_HASH,
    });
    expect(template.tags.some((tag) => tag[0] === "status")).toBe(false);
  });

  it("lowercases the payment hash so relay #d filters match", () => {
    const template = createHodlConfirmEventTemplate({
      paymentHash: PAYMENT_HASH.toUpperCase(),
    });
    expect(template.tags).toEqual([["d", PAYMENT_HASH]]);
  });

  it("defaults created_at to now, in seconds", () => {
    const before = Math.floor(Date.now() / 1000);
    const template = createHodlConfirmEventTemplate({
      paymentHash: PAYMENT_HASH,
    });
    expect(template.created_at).toBeGreaterThanOrEqual(before);
    expect(template.created_at).toBeLessThanOrEqual(
      Math.floor(Date.now() / 1000)
    );
  });

  it.each([
    ["too short", "ab".repeat(31)],
    ["too long", "ab".repeat(33)],
    ["non-hex", "zz".repeat(32)],
    ["empty", ""],
  ])("rejects a %s payment hash", (_label, paymentHash) => {
    expect(() => createHodlConfirmEventTemplate({ paymentHash })).toThrow(
      /32 bytes of hex/
    );
  });
});

describe("publishHodlConfirmEvent", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("signs and sends a kind 30408 event with the expected tags", async () => {
    const nostr = {} as any;
    const signer = {} as any;

    await publishHodlConfirmEvent({
      paymentHash: PAYMENT_HASH,
      note: "received",
      nostr,
      signer,
    });

    expect(finalizeAndSendNostrEvent).toHaveBeenCalledTimes(1);
    const [calledSigner, calledNostr, eventTemplate, options] = (
      finalizeAndSendNostrEvent as jest.Mock
    ).mock.calls[0]!;

    expect(calledSigner).toBe(signer);
    expect(calledNostr).toBe(nostr);
    expect(eventTemplate.kind).toBe(HODL_CONFIRM_EVENT_KIND);
    expect(eventTemplate.content).toBe("received");
    expect(eventTemplate.tags).toEqual([["d", PAYMENT_HASH]]);
    expect(options).toEqual({
      waitForRelayPublish: true,
      requireDurableCache: false,
    });
  });

  it("publishes an empty note when none is given", async () => {
    await publishHodlConfirmEvent({
      paymentHash: PAYMENT_HASH,
      nostr: {} as any,
      signer: {} as any,
    });

    const [, , eventTemplate] = (finalizeAndSendNostrEvent as jest.Mock).mock
      .calls[0]!;
    expect(eventTemplate.content).toBe("");
  });

  it("does not publish anything for a malformed payment hash", async () => {
    await expect(
      publishHodlConfirmEvent({
        paymentHash: "beef",
        nostr: {} as any,
        signer: {} as any,
      })
    ).rejects.toThrow(/32 bytes of hex/);
    expect(finalizeAndSendNostrEvent).not.toHaveBeenCalled();
  });
});

describe("parseHodlConfirmEvent", () => {
  it("returns the order id, author pubkey and timestamp", () => {
    const parsed = parseHodlConfirmEvent(
      mkConfirmEvent({
        pubkey: "signer-pubkey",
        created_at: 4242,
        content: "arrived",
        tags: [["d", PAYMENT_HASH]],
      })
    );

    expect(parsed).toEqual({
      orderId: PAYMENT_HASH,
      authorPubkey: "signer-pubkey",
      note: "arrived",
      createdAt: 4242,
    });
  });

  it("exposes the signer only as authorPubkey, never as a trusted role", () => {
    const parsed = parseHodlConfirmEvent(
      mkConfirmEvent({ pubkey: "signer-pubkey", tags: [["d", PAYMENT_HASH]] })
    )!;

    expect(parsed.authorPubkey).toBe("signer-pubkey");
    expect(Object.keys(parsed)).toEqual([
      "orderId",
      "authorPubkey",
      "note",
      "createdAt",
    ]);
    // Field *names* only: `note` is author-written free text and may contain
    // any word at all, so it is the shape of the result that is under test.
    const keys = Object.keys(parsed).join(",").toLowerCase();
    for (const forbidden of ["buyer", "verified", "authorized", "trusted"]) {
      expect(keys).not.toContain(forbidden);
    }
  });

  it("does not promote a forged buyer role tag into the parsed result", () => {
    const parsed = parseHodlConfirmEvent(
      mkConfirmEvent({
        pubkey: "attacker-pubkey",
        tags: [
          ["d", PAYMENT_HASH],
          ["p", "real-buyer-pubkey", "", "buyer"],
        ],
      })
    )!;

    // The attacker's own key is all that is reported; the tag they wrote
    // claiming to speak for the real buyer is ignored entirely.
    expect(parsed.authorPubkey).toBe("attacker-pubkey");
    expect(Object.values(parsed)).not.toContain("real-buyer-pubkey");
  });

  it("lowercases a mixed-case d tag", () => {
    const parsed = parseHodlConfirmEvent(
      mkConfirmEvent({ tags: [["d", PAYMENT_HASH.toUpperCase()]] })
    );
    expect(parsed?.orderId).toBe(PAYMENT_HASH);
  });

  it("returns an empty note when the content is empty", () => {
    const parsed = parseHodlConfirmEvent(
      mkConfirmEvent({ content: "", tags: [["d", PAYMENT_HASH]] })
    );
    expect(parsed?.note).toBe("");
  });

  it("rejects an event of the wrong kind", () => {
    expect(
      parseHodlConfirmEvent(
        mkConfirmEvent({
          kind: HODL_RELEASE_EVENT_KIND,
          tags: [["d", PAYMENT_HASH]],
        })
      )
    ).toBeNull();
    expect(
      parseHodlConfirmEvent(
        mkConfirmEvent({ kind: 1, tags: [["d", PAYMENT_HASH]] })
      )
    ).toBeNull();
  });

  it("rejects an event with no d tag", () => {
    expect(parseHodlConfirmEvent(mkConfirmEvent({ tags: [] }))).toBeNull();
  });

  it("rejects a d tag that is not a 32-byte hex payment hash", () => {
    expect(
      parseHodlConfirmEvent(mkConfirmEvent({ tags: [["d", "order-1"]] }))
    ).toBeNull();
    expect(
      parseHodlConfirmEvent(mkConfirmEvent({ tags: [["d", "ab".repeat(31)]] }))
    ).toBeNull();
  });

  it("rejects a d tag with no value", () => {
    expect(parseHodlConfirmEvent(mkConfirmEvent({ tags: [["d"]] }))).toBeNull();
  });

  it("rejects an event with a missing or malformed pubkey", () => {
    expect(
      parseHodlConfirmEvent(
        mkConfirmEvent({ pubkey: "", tags: [["d", PAYMENT_HASH]] })
      )
    ).toBeNull();
    expect(
      parseHodlConfirmEvent(
        mkConfirmEvent({
          pubkey: undefined as any,
          tags: [["d", PAYMENT_HASH]],
        })
      )
    ).toBeNull();
  });

  it("rejects an event with a non-numeric created_at", () => {
    expect(
      parseHodlConfirmEvent(
        mkConfirmEvent({
          created_at: "100" as any,
          tags: [["d", PAYMENT_HASH]],
        })
      )
    ).toBeNull();
  });

  it("rejects an event with no tags array at all", () => {
    expect(
      parseHodlConfirmEvent({
        id: "id",
        pubkey: "author-pubkey",
        created_at: 100,
        kind: HODL_CONFIRM_EVENT_KIND,
        content: "",
        sig: "sig",
      } as unknown as NostrEvent)
    ).toBeNull();
  });

  it("rejects a null or undefined event", () => {
    expect(parseHodlConfirmEvent(null as any)).toBeNull();
    expect(parseHodlConfirmEvent(undefined as any)).toBeNull();
  });

  it("round-trips a template built by createHodlConfirmEventTemplate", () => {
    const template = createHodlConfirmEventTemplate({
      paymentHash: PAYMENT_HASH,
      note: "ok",
      createdAt: 999,
    });
    const parsed = parseHodlConfirmEvent(
      mkConfirmEvent({
        ...template,
        pubkey: "signer",
      } as Partial<NostrEvent> & { tags: string[][] })
    );

    expect(parsed).toEqual({
      orderId: PAYMENT_HASH,
      authorPubkey: "signer",
      note: "ok",
      createdAt: 999,
    });
  });
});

describe("createHodlReleaseEventTemplate", () => {
  it("builds a kind 30409 event with d and decision tags", () => {
    const template = createHodlReleaseEventTemplate({
      paymentHash: PAYMENT_HASH,
      decision: "release:seller",
      reasoning: "tracking shows delivery",
      createdAt: 555,
    });

    expect(template.kind).toBe(HODL_RELEASE_EVENT_KIND);
    expect(template.tags).toEqual([
      ["d", PAYMENT_HASH],
      ["decision", "release:seller"],
    ]);
    expect(template.content).toBe("tracking shows delivery");
    expect(template.created_at).toBe(555);
  });

  it("adds bare p tags for discovery, with no role markers", () => {
    const template = createHodlReleaseEventTemplate({
      paymentHash: PAYMENT_HASH,
      decision: "release:buyer",
      buyerPubkey: "buyer-pubkey",
      sellerPubkey: "seller-pubkey",
    });

    const pTags = template.tags.filter((tag) => tag[0] === "p");
    expect(pTags).toEqual([
      ["p", "buyer-pubkey"],
      ["p", "seller-pubkey"],
    ]);
    // No 4th-element role marker that a later reader could mistake for proof.
    expect(pTags.every((tag) => tag.length === 2)).toBe(true);
    expect(JSON.stringify(template.tags)).not.toContain('buyer-pubkey",""');
  });

  it("omits p tags when no pubkeys are supplied", () => {
    const template = createHodlReleaseEventTemplate({
      paymentHash: PAYMENT_HASH,
      decision: "release:buyer",
    });
    expect(template.tags.some((tag) => tag[0] === "p")).toBe(false);
  });

  it("defaults reasoning to empty content", () => {
    const template = createHodlReleaseEventTemplate({
      paymentHash: PAYMENT_HASH,
      decision: "release:buyer",
    });
    expect(template.content).toBe("");
  });

  it("rejects a malformed payment hash", () => {
    expect(() =>
      createHodlReleaseEventTemplate({
        paymentHash: "beef",
        decision: "release:buyer",
      })
    ).toThrow(/32 bytes of hex/);
  });

  it("rejects an unrecognized decision", () => {
    expect(() =>
      createHodlReleaseEventTemplate({
        paymentHash: PAYMENT_HASH,
        decision: "release:arbiter" as any,
      })
    ).toThrow(/decision must be one of/);
  });
});

describe("publishHodlReleaseEvent", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("signs and sends a kind 30409 event with the expected tags", async () => {
    const nostr = {} as any;
    const signer = {} as any;

    await publishHodlReleaseEvent({
      paymentHash: PAYMENT_HASH,
      decision: "release:buyer",
      reasoning: "no proof of shipment",
      buyerPubkey: "buyer-pubkey",
      sellerPubkey: "seller-pubkey",
      nostr,
      signer,
    });

    const [calledSigner, calledNostr, eventTemplate, options] = (
      finalizeAndSendNostrEvent as jest.Mock
    ).mock.calls[0]!;

    expect(calledSigner).toBe(signer);
    expect(calledNostr).toBe(nostr);
    expect(eventTemplate.kind).toBe(HODL_RELEASE_EVENT_KIND);
    expect(eventTemplate.content).toBe("no proof of shipment");
    expect(eventTemplate.tags).toEqual([
      ["d", PAYMENT_HASH],
      ["decision", "release:buyer"],
      ["p", "buyer-pubkey"],
      ["p", "seller-pubkey"],
    ]);
    expect(options).toEqual({
      waitForRelayPublish: true,
      requireDurableCache: false,
    });
  });

  it("does not publish anything for an unrecognized decision", async () => {
    await expect(
      publishHodlReleaseEvent({
        paymentHash: PAYMENT_HASH,
        decision: "release:nobody" as any,
        nostr: {} as any,
        signer: {} as any,
      })
    ).rejects.toThrow(/decision must be one of/);
    expect(finalizeAndSendNostrEvent).not.toHaveBeenCalled();
  });
});

describe("parseHodlReleaseEvent", () => {
  it("returns the order id, decision, author pubkey and reasoning", () => {
    const parsed = parseHodlReleaseEvent(
      mkReleaseEvent({
        pubkey: "signer-pubkey",
        created_at: 777,
        content: "buyer never received it",
        tags: [
          ["d", PAYMENT_HASH],
          ["decision", "release:buyer"],
        ],
      })
    );

    expect(parsed).toEqual({
      orderId: PAYMENT_HASH,
      decision: "release:buyer",
      authorPubkey: "signer-pubkey",
      reasoning: "buyer never received it",
      createdAt: 777,
    });
  });

  it("exposes the signer only as authorPubkey, never as a trusted arbiter", () => {
    const parsed = parseHodlReleaseEvent(
      mkReleaseEvent({
        pubkey: "signer-pubkey",
        tags: [
          ["d", PAYMENT_HASH],
          ["decision", "release:seller"],
        ],
      })
    )!;

    expect(Object.keys(parsed)).toEqual([
      "orderId",
      "decision",
      "authorPubkey",
      "reasoning",
      "createdAt",
    ]);
    // Field *names* only: `reasoning` is arbiter-written free text and may say
    // anything, so it is the shape of the result that must not imply trust.
    const keys = Object.keys(parsed).join(",").toLowerCase();
    expect(keys).not.toContain("arbiter");
    expect(keys).not.toContain("authorized");
  });

  it("never surfaces the p tags, which are author-controlled claims", () => {
    const parsed = parseHodlReleaseEvent(
      mkReleaseEvent({
        pubkey: "attacker-pubkey",
        tags: [
          ["d", PAYMENT_HASH],
          ["decision", "release:seller"],
          ["p", "real-buyer-pubkey"],
          ["p", "real-seller-pubkey"],
        ],
      })
    )!;

    expect(parsed.authorPubkey).toBe("attacker-pubkey");
    expect(JSON.stringify(parsed)).not.toContain("real-buyer-pubkey");
    expect(JSON.stringify(parsed)).not.toContain("real-seller-pubkey");
  });

  it("rejects an event of the wrong kind", () => {
    expect(
      parseHodlReleaseEvent(
        mkReleaseEvent({
          kind: HODL_CONFIRM_EVENT_KIND,
          tags: [
            ["d", PAYMENT_HASH],
            ["decision", "release:buyer"],
          ],
        })
      )
    ).toBeNull();
  });

  it("rejects an event with no decision tag", () => {
    expect(
      parseHodlReleaseEvent(mkReleaseEvent({ tags: [["d", PAYMENT_HASH]] }))
    ).toBeNull();
  });

  it.each([
    ["an unknown value", "release:arbiter"],
    ["an empty value", ""],
    ["a near-miss", "release:Buyer"],
    ["a status-style value", "resolved:buyer"],
  ])("rejects a decision tag with %s", (_label, decision) => {
    expect(
      parseHodlReleaseEvent(
        mkReleaseEvent({
          tags: [
            ["d", PAYMENT_HASH],
            ["decision", decision],
          ],
        })
      )
    ).toBeNull();
  });

  it("rejects a malformed d tag", () => {
    expect(
      parseHodlReleaseEvent(
        mkReleaseEvent({
          tags: [
            ["d", "order-1"],
            ["decision", "release:buyer"],
          ],
        })
      )
    ).toBeNull();
  });

  it("rejects a null event", () => {
    expect(parseHodlReleaseEvent(null as any)).toBeNull();
  });

  it("round-trips a template built by createHodlReleaseEventTemplate", () => {
    const template = createHodlReleaseEventTemplate({
      paymentHash: PAYMENT_HASH,
      decision: "release:seller",
      reasoning: "delivered",
      createdAt: 321,
    });
    const parsed = parseHodlReleaseEvent(
      mkReleaseEvent({
        ...template,
        pubkey: "signer",
      } as Partial<NostrEvent> & { tags: string[][] })
    );

    expect(parsed).toEqual({
      orderId: PAYMENT_HASH,
      decision: "release:seller",
      authorPubkey: "signer",
      reasoning: "delivered",
      createdAt: 321,
    });
  });
});

describe("fetchHodlConfirmEvents", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    verifyEventMock.mockReturnValue(true);
  });

  const mkNostr = (events: NostrEvent[]) => ({
    fetch: jest.fn().mockResolvedValue(events),
  });

  it("queries relays by kind and lowercased d tag", async () => {
    const nostr = mkNostr([]);

    await fetchHodlConfirmEvents({
      nostr: nostr as any,
      paymentHash: PAYMENT_HASH.toUpperCase(),
      timeoutMs: 1500,
    });

    expect(nostr.fetch).toHaveBeenCalledWith(
      [{ kinds: [HODL_CONFIRM_EVENT_KIND], "#d": [PAYMENT_HASH] }],
      undefined,
      undefined,
      1500
    );
  });

  it("returns parsed matches", async () => {
    const nostr = mkNostr([
      mkConfirmEvent({
        pubkey: "author-a",
        created_at: 100,
        content: "got it",
        tags: [["d", PAYMENT_HASH]],
      }),
    ]);

    const results = await fetchHodlConfirmEvents({
      nostr: nostr as any,
      paymentHash: PAYMENT_HASH,
    });

    expect(results).toEqual([
      {
        orderId: PAYMENT_HASH,
        authorPubkey: "author-a",
        note: "got it",
        createdAt: 100,
      },
    ]);
  });

  it("keeps one entry per author, newest wins", async () => {
    const nostr = mkNostr([
      mkConfirmEvent({
        pubkey: "author-a",
        created_at: 100,
        content: "old",
        tags: [["d", PAYMENT_HASH]],
      }),
      mkConfirmEvent({
        pubkey: "author-a",
        created_at: 200,
        content: "new",
        tags: [["d", PAYMENT_HASH]],
      }),
    ]);

    const results = await fetchHodlConfirmEvents({
      nostr: nostr as any,
      paymentHash: PAYMENT_HASH,
    });

    expect(results).toHaveLength(1);
    expect(results[0]!.note).toBe("new");
  });

  it("does not let a later event from another author hide an earlier one", async () => {
    const nostr = mkNostr([
      mkConfirmEvent({
        pubkey: "real-buyer",
        created_at: 100,
        tags: [["d", PAYMENT_HASH]],
      }),
      mkConfirmEvent({
        pubkey: "unrelated-pubkey",
        created_at: 999,
        tags: [["d", PAYMENT_HASH]],
      }),
    ]);

    const results = await fetchHodlConfirmEvents({
      nostr: nostr as any,
      paymentHash: PAYMENT_HASH,
    });

    // Both are returned so the caller must decide which author it believes;
    // the newer one does not silently win.
    expect(results.map((r) => r.authorPubkey)).toEqual([
      "unrelated-pubkey",
      "real-buyer",
    ]);
  });

  it("sorts newest first", async () => {
    const nostr = mkNostr([
      mkConfirmEvent({
        pubkey: "author-a",
        created_at: 100,
        tags: [["d", PAYMENT_HASH]],
      }),
      mkConfirmEvent({
        pubkey: "author-b",
        created_at: 300,
        tags: [["d", PAYMENT_HASH]],
      }),
      mkConfirmEvent({
        pubkey: "author-c",
        created_at: 200,
        tags: [["d", PAYMENT_HASH]],
      }),
    ]);

    const results = await fetchHodlConfirmEvents({
      nostr: nostr as any,
      paymentHash: PAYMENT_HASH,
    });

    expect(results.map((r) => r.createdAt)).toEqual([300, 200, 100]);
  });

  it("drops events whose signature does not verify", async () => {
    verifyEventMock.mockReturnValue(false);
    const nostr = mkNostr([
      mkConfirmEvent({ pubkey: "author-a", tags: [["d", PAYMENT_HASH]] }),
    ]);

    const results = await fetchHodlConfirmEvents({
      nostr: nostr as any,
      paymentHash: PAYMENT_HASH,
    });

    expect(results).toEqual([]);
  });

  it("drops events a relay returned for a different order", async () => {
    const nostr = mkNostr([
      mkConfirmEvent({
        pubkey: "author-a",
        tags: [["d", OTHER_PAYMENT_HASH]],
      }),
      mkConfirmEvent({ pubkey: "author-b", tags: [["d", PAYMENT_HASH]] }),
    ]);

    const results = await fetchHodlConfirmEvents({
      nostr: nostr as any,
      paymentHash: PAYMENT_HASH,
    });

    expect(results.map((r) => r.authorPubkey)).toEqual(["author-b"]);
  });

  it("drops malformed and wrong-kind events", async () => {
    const nostr = mkNostr([
      mkConfirmEvent({ pubkey: "author-a", tags: [] }),
      mkConfirmEvent({
        pubkey: "author-b",
        kind: 1,
        tags: [["d", PAYMENT_HASH]],
      }),
      mkReleaseEvent({
        pubkey: "author-c",
        tags: [
          ["d", PAYMENT_HASH],
          ["decision", "release:buyer"],
        ],
      }),
    ]);

    const results = await fetchHodlConfirmEvents({
      nostr: nostr as any,
      paymentHash: PAYMENT_HASH,
    });

    expect(results).toEqual([]);
  });

  it("returns nothing and does not query for a malformed payment hash", async () => {
    const nostr = mkNostr([]);

    const results = await fetchHodlConfirmEvents({
      nostr: nostr as any,
      paymentHash: "beef",
    });

    expect(results).toEqual([]);
    expect(nostr.fetch).not.toHaveBeenCalled();
  });

  it("returns an empty list when the relay query fails", async () => {
    const nostr = { fetch: jest.fn().mockRejectedValue(new Error("offline")) };

    await expect(
      fetchHodlConfirmEvents({
        nostr: nostr as any,
        paymentHash: PAYMENT_HASH,
      })
    ).resolves.toEqual([]);
  });

  it("returns results whose shape implies nothing about identity or settlement", async () => {
    const nostr = mkNostr([
      mkConfirmEvent({ pubkey: "author-a", tags: [["d", PAYMENT_HASH]] }),
    ]);

    const results = await fetchHodlConfirmEvents({
      nostr: nostr as any,
      paymentHash: PAYMENT_HASH,
    });

    const keys = Object.keys(results[0]!).join(",").toLowerCase();
    for (const forbidden of [
      "buyer",
      "seller",
      "arbiter",
      "authorized",
      "verified",
      "trusted",
      "preimage",
    ]) {
      expect(keys).not.toContain(forbidden);
    }
  });
});
