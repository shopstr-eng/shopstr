import { publishReportEvent } from "../reporting";
import { finalizeAndSendNostrEvent } from "@/utils/nostr/nostr-helper-functions";

jest.mock("@/utils/nostr/nostr-helper-functions", () => ({
  ...jest.requireActual("@/utils/nostr/nostr-helper-functions"),
  finalizeAndSendNostrEvent: jest.fn(),
}));

const mockFinalizeAndSendNostrEvent = finalizeAndSendNostrEvent as jest.Mock;

describe("publishReportEvent", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("publishes a profile report as kind 1984", async () => {
    const nostr = {} as any;
    const signer = {} as any;

    await publishReportEvent(
      nostr,
      signer,
      "profile",
      "target-pubkey",
      "spam",
      "Profile is spamming"
    );

    expect(mockFinalizeAndSendNostrEvent).toHaveBeenCalledTimes(1);

    const [calledSigner, calledNostr, template] =
      mockFinalizeAndSendNostrEvent.mock.calls[0];

    expect(calledSigner).toBe(signer);
    expect(calledNostr).toBe(nostr);
    expect(template).toMatchObject({
      kind: 1984,
      tags: [["p", "target-pubkey", "spam"]],
      content: "Profile is spamming",
    });
    expect(typeof template.created_at).toBe("number");
  });

  it("publishes a listing report with an addressable a-tag", async () => {
    const nostr = {} as any;
    const signer = {} as any;

    await publishReportEvent(
      nostr,
      signer,
      "listing",
      "target-pubkey",
      "illegal",
      "Listing violates policy",
      "listing-d"
    );

    expect(mockFinalizeAndSendNostrEvent).toHaveBeenCalledTimes(1);

    const [, , template] = mockFinalizeAndSendNostrEvent.mock.calls[0];
    expect(template).toMatchObject({
      kind: 1984,
      tags: [
        ["p", "target-pubkey"],
        ["a", "30402:target-pubkey:listing-d", "illegal"],
      ],
      content: "Listing violates policy",
    });
  });
});
