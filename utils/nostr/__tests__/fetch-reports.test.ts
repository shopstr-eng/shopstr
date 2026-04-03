import { NostrEvent } from "@/utils/types/types";
import { cacheEventsToDatabase } from "@/utils/db/db-client";
import { buildReportIndexes, fetchReports } from "../fetch-service";

jest.mock("@/utils/db/db-client", () => ({
  cacheEventsToDatabase: jest.fn(),
}));

const mockCacheEventsToDatabase = cacheEventsToDatabase as jest.Mock;

function makeReportEvent({
  id,
  reporterPubkey,
  targetPubkey,
  reason,
  createdAt,
  listingAddress,
  sig = "sig",
}: {
  id: string;
  reporterPubkey: string;
  targetPubkey: string;
  reason: string;
  createdAt: number;
  listingAddress?: string;
  sig?: string;
}): NostrEvent {
  const tags: string[][] = [["p", targetPubkey, reason]];
  if (listingAddress) tags.push(["a", listingAddress, reason]);

  return {
    id,
    pubkey: reporterPubkey,
    created_at: createdAt,
    kind: 1984,
    tags,
    content: "report details",
    sig,
  } as NostrEvent;
}

describe("buildReportIndexes", () => {
  it("indexes profile and listing reports by target tags", () => {
    const profileReport = makeReportEvent({
      id: "profile-1",
      reporterPubkey: "reporter-1",
      targetPubkey: "seller-1",
      reason: "spam",
      createdAt: 10,
    });

    const listingReport = makeReportEvent({
      id: "listing-1",
      reporterPubkey: "reporter-2",
      targetPubkey: "seller-1",
      reason: "illegal",
      createdAt: 11,
      listingAddress: "30402:seller-1:listing-d",
    });

    const { profileReports, listingReports } = buildReportIndexes([
      profileReport,
      listingReport,
    ]);

    expect(profileReports.get("seller-1")?.map((event) => event.id)).toEqual([
      "listing-1",
      "profile-1",
    ]);
    expect(
      listingReports.get("30402:seller-1:listing-d")?.map((event) => event.id)
    ).toEqual(["listing-1"]);
  });

  it("ignores non-report events", () => {
    const nonReport = {
      ...makeReportEvent({
        id: "not-report",
        reporterPubkey: "reporter",
        targetPubkey: "seller",
        reason: "spam",
        createdAt: 5,
      }),
      kind: 1,
    } as NostrEvent;

    const { profileReports, listingReports } = buildReportIndexes([nonReport]);

    expect(profileReports.size).toBe(0);
    expect(listingReports.size).toBe(0);
  });
});

describe("fetchReports", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCacheEventsToDatabase.mockResolvedValue(undefined);
  });

  it("hydrates from database, merges relay results, and caches relay reports", async () => {
    const dbReport = makeReportEvent({
      id: "db-1",
      reporterPubkey: "db-reporter",
      targetPubkey: "seller-1",
      reason: "spam",
      createdAt: 100,
    });

    const relayReport = makeReportEvent({
      id: "relay-1",
      reporterPubkey: "relay-reporter",
      targetPubkey: "seller-1",
      reason: "illegal",
      createdAt: 200,
      listingAddress: "30402:seller-1:listing-d",
    });

    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => [dbReport],
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const nostr = {
      fetch: jest.fn().mockResolvedValue([relayReport]),
    } as any;

    const editReportsContext = jest.fn();

    const result = await fetchReports(
      nostr,
      ["wss://relay.example"],
      [],
      ["seller-1"],
      editReportsContext
    );

    expect(fetchMock).toHaveBeenCalledWith("/api/db/fetch-reports");
    expect(nostr.fetch).toHaveBeenCalledWith(
      [{ kinds: [1984], "#p": ["seller-1"] }],
      {},
      ["wss://relay.example"]
    );

    expect(result.reportEvents.map((event) => event.id)).toEqual([
      "relay-1",
      "db-1",
    ]);
    expect(result.profileReports.get("seller-1")?.length).toBe(2);
    expect(result.listingReports.get("30402:seller-1:listing-d")?.length).toBe(
      1
    );

    expect(editReportsContext).toHaveBeenCalledTimes(2);
    expect(mockCacheEventsToDatabase).toHaveBeenCalledWith([relayReport]);
  });

  it("continues when database fetch fails", async () => {
    const consoleSpy = jest
      .spyOn(console, "error")
      .mockImplementation(() => {});

    global.fetch = jest
      .fn()
      .mockRejectedValue(
        new Error("db unavailable")
      ) as unknown as typeof fetch;

    const relayReport = makeReportEvent({
      id: "relay-only",
      reporterPubkey: "relay-reporter",
      targetPubkey: "seller-2",
      reason: "impersonation",
      createdAt: 300,
      sig: "",
    });

    const nostr = {
      fetch: jest.fn().mockResolvedValue([relayReport]),
    } as any;

    const editReportsContext = jest.fn();

    const result = await fetchReports(
      nostr,
      ["wss://relay.example"],
      [],
      ["seller-2"],
      editReportsContext
    );

    expect(result.reportEvents.map((event) => event.id)).toEqual([
      "relay-only",
    ]);
    expect(editReportsContext).toHaveBeenCalledTimes(1);
    expect(mockCacheEventsToDatabase).not.toHaveBeenCalled();

    consoleSpy.mockRestore();
  });
});
