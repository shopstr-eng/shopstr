import {
  mergeAndDeduplicateProducts,
  searchListingsNip50,
} from "@/utils/nostr/nip50-search";
import {
  constructReportEventTemplate,
  publishReportEvent,
} from "@/utils/nostr/reporting";
import { fetchReports } from "@/utils/nostr/fetch-service";
import { finalizeAndSendNostrEvent } from "@/utils/nostr/nostr-helper-functions";
import { NostrManager } from "@/utils/nostr/nostr-manager";
import { NostrSigner } from "@/utils/nostr/signers/nostr-signer";
import { NostrEvent } from "@/utils/types/types";

jest.mock("@/utils/nostr/nostr-helper-functions", () => ({
  ...jest.requireActual("@/utils/nostr/nostr-helper-functions"),
  finalizeAndSendNostrEvent: jest.fn(),
}));

const mockFinalizeAndSendNostrEvent = finalizeAndSendNostrEvent as jest.Mock;

function computeListingReportCount(
  profileReports: Map<string, Array<{ id: string }>>,
  listingReports: Map<string, Array<{ id: string }>>,
  sellerPubkey: string,
  dTag?: string
): number {
  const listingAddress = dTag ? `30402:${sellerPubkey}:${dTag}` : null;
  const reportIds = new Set<string>();

  (profileReports.get(sellerPubkey) || []).forEach((event) => {
    if (event.id) reportIds.add(event.id);
  });

  if (listingAddress) {
    (listingReports.get(listingAddress) || []).forEach((event) => {
      if (event.id) reportIds.add(event.id);
    });
  }

  return reportIds.size;
}

describe("search + reporting integration", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("supports the full search -> report -> fetch -> display cycle", async () => {
    const localListing = {
      id: "local-old",
      pubkey: "seller-1",
      created_at: 100,
      kind: 30402,
      tags: [["d", "camera-1"]],
      content: "old",
      sig: "sig-local",
    };

    const remoteListing = {
      id: "relay-new",
      pubkey: "seller-1",
      created_at: 200,
      kind: 30402,
      tags: [["d", "camera-1"]],
      content: "new",
      sig: "sig-remote",
    };

    const searchNostr = {
      fetch: jest.fn().mockResolvedValue([remoteListing]),
    } as unknown as NostrManager;

    const searchResults = await searchListingsNip50(searchNostr, "camera");
    const mergedListings = mergeAndDeduplicateProducts(
      [localListing as NostrEvent],
      searchResults
    );

    expect(mergedListings).toHaveLength(1);
    expect(mergedListings[0]?.id).toBe("relay-new");

    const template = constructReportEventTemplate(
      "listing",
      "seller-1",
      "spam",
      "Misleading listing",
      "camera-1"
    );

    expect(template.kind).toBe(1984);
    expect(template.tags).toEqual([
      ["p", "seller-1"],
      ["a", "30402:seller-1:camera-1", "spam"],
    ]);

    await publishReportEvent(
      {} as unknown as NostrManager,
      {} as unknown as NostrSigner,
      "listing",
      "seller-1",
      "spam",
      "Misleading listing",
      "camera-1"
    );

    expect(mockFinalizeAndSendNostrEvent).toHaveBeenCalledTimes(1);

    const relayReportEvent = {
      id: "report-1",
      pubkey: "reporter-1",
      created_at: 300,
      kind: 1984,
      tags: template.tags,
      content: template.content,
      sig: "sig-report",
    };

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => [],
    }) as unknown as typeof fetch;

    const reportsNostr = {
      fetch: jest.fn().mockResolvedValue([relayReportEvent]),
    } as unknown as NostrManager;

    const fetched = await fetchReports(
      reportsNostr,
      ["wss://relay.example"],
      mergedListings,
      ["seller-1"],
      jest.fn()
    );

    const reportCount = computeListingReportCount(
      fetched.profileReports as Map<string, Array<{ id: string }>>,
      fetched.listingReports as Map<string, Array<{ id: string }>>,
      "seller-1",
      "camera-1"
    );

    expect(reportCount).toBe(1);
  });
});
