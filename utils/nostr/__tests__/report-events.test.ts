import { buildNip56ReportEvent, Nip56ReportEventDraft } from "../report-events";

describe("buildNip56ReportEvent", () => {
  const realDateNow = Date.now;

  beforeEach(() => {
    Date.now = jest.fn(() => 1710000000000);
  });

  afterEach(() => {
    Date.now = realDateNow;
  });

  it("builds a basic NIP-56 report event draft", () => {
    const event = buildNip56ReportEvent({
      reporterPubkey: "reporter-pubkey",
      reportedPubkey: "reported-pubkey",
      reportType: "spam",
      reportContent: "Repeated unsolicited ads",
    });

    expect(event).toEqual<Nip56ReportEventDraft>({
      pubkey: "reporter-pubkey",
      created_at: 1710000000,
      kind: 1984,
      tags: [["p", "reported-pubkey", "spam"]],
      content: "Repeated unsolicited ads",
    });
  });

  it("adds a typed event tag when a reported event id is provided", () => {
    const event = buildNip56ReportEvent({
      reporterPubkey: "reporter-pubkey",
      reportedPubkey: "reported-pubkey",
      reportType: "impersonation",
      reportContent: "This note is impersonating another account.",
      reportedEventId: "event-123",
    });

    expect(event.tags).toEqual([
      ["p", "reported-pubkey"],
      ["e", "event-123", "impersonation"],
    ]);
  });

  it("defaults report content to an empty string", () => {
    const event = buildNip56ReportEvent({
      reporterPubkey: "reporter-pubkey",
      reportedPubkey: "reported-pubkey",
      reportType: "other",
    });

    expect(event.content).toBe("");
  });
});
