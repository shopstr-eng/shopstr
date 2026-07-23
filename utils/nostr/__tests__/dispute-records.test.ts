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
  DISPUTE_EVENT_KIND,
  publishDisputeEvent,
  fetchDisputeEvents,
  fetchDisputeEvent,
  fetchDisputeEventCandidates,
  selectAuthoritativeDisputeEvent,
  parseDisputeEvent,
} from "../dispute-records";

const mkDisputeEvent = (
  overrides: Partial<NostrEvent> & { tags: string[][] }
): NostrEvent =>
  ({
    id: "id",
    pubkey: "buyer-pubkey",
    created_at: 100,
    kind: DISPUTE_EVENT_KIND,
    content: "reason",
    sig: "sig",
    ...overrides,
  }) as unknown as NostrEvent;

describe("publishDisputeEvent", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("publishes a kind 30407 event with the correct tags and content", async () => {
    const nostr = {} as any;
    const signer = {} as any;

    await publishDisputeEvent({
      orderId: "order-1",
      reason: "item not received",
      nostr,
      signer,
      buyerPubkey: "buyer-pubkey",
      sellerPubkey: "seller-pubkey",
      arbiterPubkey: "arbiter-pubkey",
    });

    expect(finalizeAndSendNostrEvent).toHaveBeenCalledTimes(1);
    const [calledSigner, calledNostr, eventTemplate, options] = (
      finalizeAndSendNostrEvent as jest.Mock
    ).mock.calls[0]!;

    expect(calledSigner).toBe(signer);
    expect(calledNostr).toBe(nostr);
    expect(options).toEqual({
      waitForRelayPublish: false,
      requireDurableCache: true,
    });
    expect(eventTemplate.kind).toBe(DISPUTE_EVENT_KIND);
    expect(eventTemplate.content).toBe("item not received");
    expect(eventTemplate.tags).toEqual(
      expect.arrayContaining([
        ["d", "order-1"],
        ["p", "buyer-pubkey", "", "buyer"],
        ["p", "seller-pubkey", "", "seller"],
        ["p", "arbiter-pubkey", "", "arbiter"],
        ["status", "open"],
      ])
    );
  });
});

describe("fetchDisputeEvents", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    verifyEventMock.mockReturnValue(true);
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue([]),
    }) as jest.Mock;
  });

  afterAll(() => {
    global.fetch = originalFetch;
  });

  it("deduplicates events by orderId (d tag), keeping the newest", async () => {
    const older = mkDisputeEvent({
      created_at: 100,
      tags: [
        ["d", "order-1"],
        ["p", "buyer-pubkey", "", "buyer"],
        ["p", "seller-pubkey", "", "seller"],
        ["p", "arbiter-pubkey", "", "arbiter"],
      ],
    });
    const newer = mkDisputeEvent({
      created_at: 200,
      tags: [
        ["d", "order-1"],
        ["p", "buyer-pubkey", "", "buyer"],
        ["p", "seller-pubkey", "", "seller"],
        ["p", "arbiter-pubkey", "", "arbiter"],
      ],
    });
    const otherOrder = mkDisputeEvent({
      created_at: 150,
      tags: [
        ["d", "order-2"],
        ["p", "buyer-pubkey", "", "buyer"],
        ["p", "seller-pubkey", "", "seller"],
        ["p", "arbiter-pubkey", "", "arbiter"],
      ],
    });

    const nostr = {
      fetch: jest.fn().mockResolvedValue([older, newer, otherOrder]),
    } as any;

    const result = await fetchDisputeEvents({
      nostr,
      arbiterPubkey: "arbiter-pubkey",
    });

    expect(result).toHaveLength(2);
    expect(result[0]).toBe(newer);
    expect(result[1]).toBe(otherOrder);
    expect(result).not.toContain(older);
  });

  it("omits disputes whose newest event is resolved", async () => {
    const resolved = mkDisputeEvent({
      created_at: 300,
      tags: [
        ["d", "order-1"],
        ["p", "buyer-pubkey", "", "buyer"],
        ["p", "seller-pubkey", "", "seller"],
        ["p", "arbiter-pubkey", "", "arbiter"],
        ["status", "resolved:buyer"],
      ],
    });
    const open = mkDisputeEvent({
      created_at: 200,
      tags: [
        ["d", "order-2"],
        ["p", "buyer-pubkey", "", "buyer"],
        ["p", "seller-pubkey", "", "seller"],
        ["p", "arbiter-pubkey", "", "arbiter"],
        ["status", "open"],
      ],
    });

    const nostr = {
      fetch: jest.fn().mockResolvedValue([resolved, open]),
    } as any;

    const result = await fetchDisputeEvents({
      nostr,
      arbiterPubkey: "arbiter-pubkey",
    });

    expect(result).toEqual([open]);
  });

  it("falls back to cached dispute events when relays miss them", async () => {
    const cached = mkDisputeEvent({
      created_at: 200,
      tags: [
        ["d", "order-1"],
        ["p", "buyer-pubkey", "", "buyer"],
        ["p", "seller-pubkey", "", "seller"],
        ["p", "arbiter-pubkey", "", "arbiter"],
        ["status", "open"],
      ],
    });
    const nostr = {
      fetch: jest.fn().mockResolvedValue([]),
    } as any;
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue([cached]),
    });

    const result = await fetchDisputeEvents({
      nostr,
      arbiterPubkey: "arbiter-pubkey",
    });

    expect(global.fetch).toHaveBeenCalledWith(
      "/api/db/fetch-disputes?arbiterPubkey=arbiter-pubkey"
    );
    expect(result).toEqual([cached]);
  });

  it("drops cached events that fail signature verification", async () => {
    const forged = mkDisputeEvent({
      created_at: 200,
      tags: [
        ["d", "order-1"],
        ["p", "buyer-pubkey", "", "buyer"],
        ["p", "seller-pubkey", "", "seller"],
        ["p", "arbiter-pubkey", "", "arbiter"],
        ["status", "open"],
      ],
    });
    const nostr = {
      fetch: jest.fn().mockResolvedValue([]),
    } as any;
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue([forged]),
    });
    verifyEventMock.mockReturnValue(false);

    const result = await fetchDisputeEvents({
      nostr,
      arbiterPubkey: "arbiter-pubkey",
    });

    expect(result).toEqual([]);
  });

  it("does not let a forged event from a different author clobber a legitimate one for the same orderId", async () => {
    const legit = mkDisputeEvent({
      pubkey: "buyer-pubkey",
      created_at: 100,
      tags: [
        ["d", "order-1"],
        ["p", "buyer-pubkey", "", "buyer"],
        ["p", "seller-pubkey", "", "seller"],
        ["p", "arbiter-pubkey", "", "arbiter"],
        ["status", "open"],
      ],
    });
    const forged = mkDisputeEvent({
      pubkey: "attacker-pubkey",
      created_at: 999,
      tags: [
        ["d", "order-1"],
        ["p", "attacker-pubkey", "", "buyer"],
        ["p", "seller-pubkey", "", "seller"],
        ["p", "arbiter-pubkey", "", "arbiter"],
        ["status", "open"],
      ],
    });

    const nostr = {
      fetch: jest.fn().mockResolvedValue([legit, forged]),
    } as any;

    const result = await fetchDisputeEvents({
      nostr,
      arbiterPubkey: "arbiter-pubkey",
    });

    expect(result).toContain(legit);
    expect(result).toContain(forged);
    expect(result).toHaveLength(2);
  });

  it("keeps an arbiter resolution final even when a participant publishes a newer open event", async () => {
    const resolution = mkDisputeEvent({
      pubkey: "arbiter-pubkey",
      created_at: 200,
      tags: [
        ["d", "order-1"],
        ["p", "buyer-pubkey", "", "buyer"],
        ["p", "seller-pubkey", "", "seller"],
        ["p", "arbiter-pubkey", "", "arbiter"],
        ["status", "resolved:buyer"],
      ],
    });
    const futureOpen = mkDisputeEvent({
      pubkey: "seller-pubkey",
      created_at: 999,
      tags: [
        ["d", "order-1"],
        ["p", "buyer-pubkey", "", "buyer"],
        ["p", "seller-pubkey", "", "seller"],
        ["p", "arbiter-pubkey", "", "arbiter"],
        ["status", "open"],
      ],
    });
    const nostr = {
      fetch: jest.fn().mockResolvedValue([resolution, futureOpen]),
    } as any;

    const result = await fetchDisputeEvents({
      nostr,
      arbiterPubkey: "arbiter-pubkey",
    });

    expect(result).toEqual([]);
  });
});

describe("fetchDisputeEvent", () => {
  it("ignores unrelated authors and returns the role-authorized order state", async () => {
    const legitimateOpen = mkDisputeEvent({
      pubkey: "buyer-pubkey",
      created_at: 100,
      tags: [
        ["d", "order-1"],
        ["p", "buyer-pubkey", "", "buyer"],
        ["p", "seller-pubkey", "", "seller"],
        ["p", "arbiter-pubkey", "", "arbiter"],
        ["status", "open"],
      ],
    });
    const forged = mkDisputeEvent({
      pubkey: "attacker-pubkey",
      created_at: 999,
      tags: [
        ["d", "order-1"],
        ["p", "buyer-pubkey", "", "buyer"],
        ["p", "seller-pubkey", "", "seller"],
        ["p", "arbiter-pubkey", "", "arbiter"],
        ["status", "open"],
      ],
    });
    const nostr = {
      fetch: jest.fn().mockResolvedValue([legitimateOpen, forged]),
    } as any;

    const result = await (fetchDisputeEvent as any)({
      nostr,
      orderId: "order-1",
      orderParticipants: {
        buyerPubkey: "buyer-pubkey",
        sellerPubkey: "seller-pubkey",
      },
      arbiterPubkey: "arbiter-pubkey",
    });

    expect(result).toBe(legitimateOpen);
  });
});

describe("fetchDisputeEventCandidates", () => {
  it("returns one candidate per author, keeping the newest for each", async () => {
    const olderFromAuthor = mkDisputeEvent({
      pubkey: "buyer-pubkey",
      created_at: 100,
      tags: [
        ["d", "order-1"],
        ["p", "buyer-pubkey", "", "buyer"],
        ["p", "seller-pubkey", "", "seller"],
        ["p", "arbiter-pubkey", "", "arbiter"],
      ],
    });
    const newerFromAuthor = mkDisputeEvent({
      pubkey: "buyer-pubkey",
      created_at: 200,
      tags: [
        ["d", "order-1"],
        ["p", "buyer-pubkey", "", "buyer"],
        ["p", "seller-pubkey", "", "seller"],
        ["p", "arbiter-pubkey", "", "arbiter"],
      ],
    });
    const otherAuthor = mkDisputeEvent({
      pubkey: "attacker-pubkey",
      created_at: 999,
      tags: [
        ["d", "order-1"],
        ["p", "attacker-pubkey", "", "buyer"],
        ["p", "seller-pubkey", "", "seller"],
        ["p", "arbiter-pubkey", "", "arbiter"],
      ],
    });

    const nostr = {
      fetch: jest
        .fn()
        .mockResolvedValue([olderFromAuthor, newerFromAuthor, otherAuthor]),
    } as any;

    const result = await fetchDisputeEventCandidates({
      nostr,
      orderId: "order-1",
    });

    expect(result).toHaveLength(2);
    expect(result).toContain(newerFromAuthor);
    expect(result).toContain(otherAuthor);
    expect(result).not.toContain(olderFromAuthor);
  });
});

describe("selectAuthoritativeDisputeEvent", () => {
  const legitBuyerEvent = mkDisputeEvent({
    pubkey: "buyer-pubkey",
    created_at: 100,
    tags: [
      ["d", "order-1"],
      ["p", "buyer-pubkey", "", "buyer"],
      ["p", "seller-pubkey", "", "seller"],
      ["p", "arbiter-pubkey", "", "arbiter"],
    ],
  });
  const forgedByAttacker = mkDisputeEvent({
    pubkey: "attacker-pubkey",
    created_at: 999,
    tags: [
      ["d", "order-1"],
      ["p", "attacker-pubkey", "", "buyer"],
      ["p", "seller-pubkey", "", "seller"],
      ["p", "arbiter-pubkey", "", "arbiter"],
    ],
  });
  const forgedWithRealParticipantTags = mkDisputeEvent({
    pubkey: "attacker-pubkey",
    created_at: 999,
    tags: [
      ["d", "order-1"],
      ["p", "buyer-pubkey", "", "buyer"],
      ["p", "seller-pubkey", "", "seller"],
      ["p", "arbiter-pubkey", "", "arbiter"],
    ],
  });

  it("picks the candidate whose buyer/seller match the authoritative order record, ignoring a newer forged one", () => {
    const result = selectAuthoritativeDisputeEvent(
      [legitBuyerEvent, forgedByAttacker],
      { buyerPubkey: "buyer-pubkey", sellerPubkey: "seller-pubkey" }
    );

    expect(result).toBe(legitBuyerEvent);
  });

  it("returns null when no candidate matches the authoritative order record", () => {
    const result = selectAuthoritativeDisputeEvent([forgedByAttacker], {
      buyerPubkey: "buyer-pubkey",
      sellerPubkey: "seller-pubkey",
    });

    expect(result).toBeNull();
  });

  it("rejects a forged candidate whose role tags name the real participants but whose author is unrelated", () => {
    const result = selectAuthoritativeDisputeEvent(
      [legitBuyerEvent, forgedWithRealParticipantTags],
      { buyerPubkey: "buyer-pubkey", sellerPubkey: "seller-pubkey" }
    );

    expect(result).toBe(legitBuyerEvent);
  });

  it("returns null when the order record has no known participants", () => {
    const result = selectAuthoritativeDisputeEvent(
      [legitBuyerEvent, forgedByAttacker],
      { buyerPubkey: null, sellerPubkey: null }
    );

    expect(result).toBeNull();
  });

  it("does not let a participant forge a resolved transition", () => {
    const forgedResolution = mkDisputeEvent({
      pubkey: "seller-pubkey",
      created_at: 999,
      tags: [
        ["d", "order-1"],
        ["p", "buyer-pubkey", "", "buyer"],
        ["p", "seller-pubkey", "", "seller"],
        ["p", "arbiter-pubkey", "", "arbiter"],
        ["status", "resolved:seller"],
      ],
    });

    const result = selectAuthoritativeDisputeEvent(
      [legitBuyerEvent, forgedResolution],
      { buyerPubkey: "buyer-pubkey", sellerPubkey: "seller-pubkey" },
      "arbiter-pubkey"
    );

    expect(result).toBe(legitBuyerEvent);
  });

  it("treats an arbiter-authored resolution as final even when a participant publishes a newer open event", () => {
    const resolution = mkDisputeEvent({
      pubkey: "arbiter-pubkey",
      created_at: 200,
      tags: [
        ["d", "order-1"],
        ["p", "buyer-pubkey", "", "buyer"],
        ["p", "seller-pubkey", "", "seller"],
        ["p", "arbiter-pubkey", "", "arbiter"],
        ["status", "resolved:buyer"],
      ],
    });
    const futureOpen = mkDisputeEvent({
      pubkey: "seller-pubkey",
      created_at: 999,
      tags: [
        ["d", "order-1"],
        ["p", "buyer-pubkey", "", "buyer"],
        ["p", "seller-pubkey", "", "seller"],
        ["p", "arbiter-pubkey", "", "arbiter"],
        ["status", "open"],
      ],
    });

    const result = selectAuthoritativeDisputeEvent(
      [legitBuyerEvent, resolution, futureOpen],
      { buyerPubkey: "buyer-pubkey", sellerPubkey: "seller-pubkey" },
      "arbiter-pubkey"
    );

    expect(result).toBe(resolution);
  });
});

describe("parseDisputeEvent", () => {
  it("returns null when the d tag is missing", () => {
    const event = mkDisputeEvent({
      tags: [
        ["p", "buyer-pubkey", "", "buyer"],
        ["p", "seller-pubkey", "", "seller"],
        ["p", "arbiter-pubkey", "", "arbiter"],
      ],
    });
    expect(parseDisputeEvent(event)).toBeNull();
  });

  it("returns null when a marked p tag is missing", () => {
    const event = mkDisputeEvent({
      tags: [
        ["d", "order-1"],
        ["p", "buyer-pubkey", "", "buyer"],
        ["p", "seller-pubkey", "", "seller"],
      ],
    });
    expect(parseDisputeEvent(event)).toBeNull();
  });

  it("returns the parsed dispute for a valid event", () => {
    const event = mkDisputeEvent({
      created_at: 123,
      content: "wrong item shipped",
      tags: [
        ["d", "order-1"],
        ["p", "buyer-pubkey", "", "buyer"],
        ["p", "seller-pubkey", "", "seller"],
        ["p", "arbiter-pubkey", "", "arbiter"],
        ["status", "open"],
      ],
    });

    expect(parseDisputeEvent(event)).toEqual({
      orderId: "order-1",
      reason: "wrong item shipped",
      buyerPubkey: "buyer-pubkey",
      sellerPubkey: "seller-pubkey",
      arbiterPubkey: "arbiter-pubkey",
      status: "open",
      createdAt: 123,
    });
  });
});
