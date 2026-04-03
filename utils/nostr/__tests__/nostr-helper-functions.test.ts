import { publishReportEvent } from "../nostr-helper-functions";

describe("publishReportEvent", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    localStorage.clear();
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({}),
    });
  });

  it("builds a valid profile report event", async () => {
    const signer = {
      sign: jest.fn().mockImplementation(async (eventTemplate) => ({
        ...eventTemplate,
        id: "signed-profile-report",
        pubkey: "reporter-pubkey",
        sig: "signed-sig",
      })),
    };
    const nostr = {
      publish: jest.fn().mockResolvedValue(undefined),
    };

    const signedEvent = await publishReportEvent(nostr as any, signer as any, {
      content: "Spam account",
      reportType: "spam",
      reportedPubkey: "seller-pubkey",
    });

    expect(signer.sign).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 1984,
        content: "Spam account",
        tags: [["p", "seller-pubkey", "spam"]],
      })
    );
    expect(signedEvent).toEqual(
      expect.objectContaining({
        id: "signed-profile-report",
        kind: 1984,
      })
    );
  });

  it("builds a valid listing report event", async () => {
    const signer = {
      sign: jest.fn().mockImplementation(async (eventTemplate) => ({
        ...eventTemplate,
        id: "signed-listing-report",
        pubkey: "reporter-pubkey",
        sig: "signed-sig",
      })),
    };
    const nostr = {
      publish: jest.fn().mockResolvedValue(undefined),
    };

    await publishReportEvent(nostr as any, signer as any, {
      content: "Listing looks illegal",
      reportType: "illegal",
      reportedPubkey: "seller-pubkey",
      reportedEventId: "listing-event-id",
    });

    expect(signer.sign).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 1984,
        content: "Listing looks illegal",
        tags: [
          ["e", "listing-event-id", "illegal"],
          ["p", "seller-pubkey"],
        ],
      })
    );
  });
});
