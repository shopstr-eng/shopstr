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

  it("keeps only the latest report from the same reporter for the same seller", () => {
    const older = makeReportEvent({
      id: "seller-old",
      reporterPubkey: "reporter-1",
      targetPubkey: "seller-1",
      reason: "spam",
      createdAt: 10,
    });

    const newer = makeReportEvent({
      id: "seller-new",
      reporterPubkey: "reporter-1",
      targetPubkey: "seller-1",
      reason: "illegal",
      createdAt: 20,
    });

    const { profileReports } = buildReportIndexes([older, newer]);
    const sellerReports = profileReports.get("seller-1") || [];

    expect(sellerReports).toHaveLength(1);
    expect(sellerReports[0]?.id).toBe("seller-new");
  });

  it("keeps only the latest report from the same reporter for the same listing", () => {
    const older = makeReportEvent({
      id: "listing-old",
      reporterPubkey: "reporter-2",
      targetPubkey: "seller-1",
      reason: "spam",
      createdAt: 10,
      listingAddress: "30402:seller-1:listing-d",
    });

    const newer = makeReportEvent({
      id: "listing-new",
      reporterPubkey: "reporter-2",
      targetPubkey: "seller-1",
      reason: "illegal",
      createdAt: 30,
      listingAddress: "30402:seller-1:listing-d",
    });

    const { listingReports } = buildReportIndexes([older, newer]);
    const listingEvents = listingReports.get("30402:seller-1:listing-d") || [];

    expect(listingEvents).toHaveLength(1);
    expect(listingEvents[0]?.id).toBe("listing-new");
  });

  it("does not increment seller index when report has only a listing target", () => {
    const listingOnlyReport: NostrEvent = {
      id: "listing-only-1",
      pubkey: "reporter-3",
      created_at: 40,
      kind: 1984,
      tags: [["a", "30402:seller-1:listing-d", "spam"]],
      content: "listing only",
      sig: "sig",
    } as NostrEvent;

    const { profileReports, listingReports } = buildReportIndexes([
      listingOnlyReport,
    ]);

    expect(profileReports.get("seller-1")).toBeUndefined();
    expect(listingReports.get("30402:seller-1:listing-d")?.length).toBe(1);
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
