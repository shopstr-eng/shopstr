import type { NostrEvent } from "@/utils/nostr/nostr-manager";
import { DISPUTE_EVENT_KIND } from "@/utils/nostr/dispute-records";

const fetchCachedEventsMock = jest.fn();
const verifyEventMock = jest.fn().mockReturnValue(true);

jest.mock("@/utils/db/db-service", () => ({
  fetchCachedEvents: (...args: unknown[]) => fetchCachedEventsMock(...args),
}));

jest.mock("nostr-tools", () => ({
  ...jest.requireActual("nostr-tools"),
  verifyEvent: (...args: unknown[]) => verifyEventMock(...args),
}));

import { fetchCachedDisputeEvents } from "../server-dispute-records";

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

describe("fetchCachedDisputeEvents", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    verifyEventMock.mockReturnValue(true);
  });

  it("filters to matching orderId, keeping one candidate per author", async () => {
    const legit = mkDisputeEvent({
      pubkey: "buyer-pubkey",
      created_at: 100,
      tags: [
        ["d", "order-1"],
        ["p", "buyer-pubkey", "", "buyer"],
        ["p", "seller-pubkey", "", "seller"],
        ["p", "arbiter-pubkey", "", "arbiter"],
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
      ],
    });
    const otherOrder = mkDisputeEvent({
      pubkey: "buyer-pubkey",
      created_at: 500,
      tags: [
        ["d", "order-2"],
        ["p", "buyer-pubkey", "", "buyer"],
        ["p", "seller-pubkey", "", "seller"],
        ["p", "arbiter-pubkey", "", "arbiter"],
      ],
    });
    fetchCachedEventsMock.mockResolvedValue([legit, forged, otherOrder]);

    const result = await fetchCachedDisputeEvents("order-1");

    expect(result).toContain(legit);
    expect(result).toContain(forged);
    expect(result).not.toContain(otherOrder);
    expect(result).toHaveLength(2);
  });

  it("drops events that fail signature verification even if cached", async () => {
    const stored = mkDisputeEvent({
      tags: [
        ["d", "order-1"],
        ["p", "buyer-pubkey", "", "buyer"],
        ["p", "seller-pubkey", "", "seller"],
        ["p", "arbiter-pubkey", "", "arbiter"],
      ],
    });
    fetchCachedEventsMock.mockResolvedValue([stored]);
    verifyEventMock.mockReturnValue(false);

    const result = await fetchCachedDisputeEvents("order-1");

    expect(result).toEqual([]);
  });

  it("drops events that don't parse as valid dispute events", async () => {
    const malformed = mkDisputeEvent({
      tags: [["d", "order-1"]],
    });
    fetchCachedEventsMock.mockResolvedValue([malformed]);

    const result = await fetchCachedDisputeEvents("order-1");

    expect(result).toEqual([]);
  });
});
