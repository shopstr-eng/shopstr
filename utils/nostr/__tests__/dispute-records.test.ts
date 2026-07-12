import type { NostrEvent } from "@/utils/nostr/nostr-manager";

jest.mock("@/utils/nostr/nostr-helper-functions", () => ({
  finalizeAndSendNostrEvent: jest.fn().mockResolvedValue({ id: "event-id" }),
}));

import { finalizeAndSendNostrEvent } from "@/utils/nostr/nostr-helper-functions";
import {
  DISPUTE_EVENT_KIND,
  publishDisputeEvent,
  fetchDisputeEvents,
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

  it("publishes a kind 30009 event with the correct tags and content", async () => {
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
    expect(options).toEqual({ waitForRelayPublish: false });
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
