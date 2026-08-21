import { ProductData } from "@/utils/parsers/product-parser-functions";
import {
  getDirectFollowPubkeys,
  getListingReportSignal,
  getProfileReportSignal,
  summarizeReportEvents,
} from "../report-moderation";

const makeReport = ({
  id,
  pubkey,
  tags,
}: {
  id: string;
  pubkey: string;
  tags: string[][];
}) => ({
  id,
  pubkey,
  created_at: 1,
  kind: 1984,
  tags,
  content: "",
  sig: `sig-${id}`,
});

const product = {
  id: "listing-1",
  pubkey: "seller-1",
  title: "Coffee",
  summary: "",
  images: [],
  categories: [],
  location: "",
  price: 1,
  currency: "USD",
  createdAt: 1,
  publishedAt: "",
  totalCost: 1,
} as ProductData;

describe("report moderation helpers", () => {
  it("uses only first-degree follows as trusted reporters", () => {
    expect(
      getDirectFollowPubkeys(["direct-1", "direct-2", "second-degree"], 2)
    ).toEqual(["direct-1", "direct-2"]);
  });

  it("ignores malformed report events and unknown report types", () => {
    const summaries = summarizeReportEvents({
      reportEvents: [
        makeReport({
          id: "bad-kind",
          pubkey: "direct-1",
          tags: [["e", "listing-1", "not-a-type"]],
        }),
        {
          ...makeReport({ id: "wrong-kind", pubkey: "direct-1", tags: [] }),
          kind: 1,
        },
        makeReport({
          id: "good",
          pubkey: "direct-1",
          tags: [["e", "listing-1", "spam"]],
        }),
      ],
      directFollowPubkeys: ["direct-1"],
      userPubkey: "viewer",
    });

    expect(summaries).toHaveLength(1);
    expect(summaries[0]).toMatchObject({
      reporterPubkey: "direct-1",
      targetKind: "listing",
      targetId: "listing-1",
      reportType: "spam",
      isTrustedReport: true,
    });
  });

  it("warns on one trusted listing report and blurs on three", () => {
    const oneTrustedSummary = summarizeReportEvents({
      reportEvents: [
        makeReport({
          id: "report-1",
          pubkey: "direct-1",
          tags: [["e", "listing-1", "spam"]],
        }),
      ],
      directFollowPubkeys: ["direct-1"],
      userPubkey: "viewer",
    });

    expect(getListingReportSignal(product, oneTrustedSummary)).toMatchObject({
      level: "trusted_warning",
      reportCount: 1,
      reportTypes: ["spam"],
    });

    const threeTrustedSummaries = summarizeReportEvents({
      reportEvents: ["direct-1", "direct-2", "direct-3"].map((pubkey, index) =>
        makeReport({
          id: `report-${index}`,
          pubkey,
          tags: [["e", "listing-1", "illegal"]],
        })
      ),
      directFollowPubkeys: ["direct-1", "direct-2", "direct-3"],
      userPubkey: "viewer",
    });

    expect(
      getListingReportSignal(product, threeTrustedSummaries)
    ).toMatchObject({
      level: "trusted_blur",
      reportCount: 3,
      reportTypes: ["illegal"],
    });
  });

  it("does not treat a listing report's untyped p tag as a profile report", () => {
    const summaries = summarizeReportEvents({
      reportEvents: [
        makeReport({
          id: "listing-report",
          pubkey: "direct-1",
          tags: [
            ["e", "listing-1", "spam"],
            ["p", "seller-1"],
          ],
        }),
      ],
      directFollowPubkeys: ["direct-1"],
      userPubkey: "viewer",
    });

    expect(getListingReportSignal(product, summaries)).toMatchObject({
      level: "trusted_warning",
      reportCount: 1,
    });
    expect(getProfileReportSignal("seller-1", summaries)).toMatchObject({
      level: "none",
      reportCount: 0,
    });
  });

  it("counts unique trusted reporters for blur threshold", () => {
    const summaries = summarizeReportEvents({
      reportEvents: [1, 2, 3].map((index) =>
        makeReport({
          id: `repeat-report-${index}`,
          pubkey: "direct-1",
          tags: [["e", "listing-1", "spam"]],
        })
      ),
      directFollowPubkeys: ["direct-1"],
      userPubkey: "viewer",
    });

    expect(getListingReportSignal(product, summaries)).toMatchObject({
      level: "trusted_warning",
      reportCount: 1,
      reportTypes: ["spam"],
    });
  });

  it("prioritizes current user's own reports", () => {
    const summaries = summarizeReportEvents({
      reportEvents: [
        makeReport({
          id: "own-report",
          pubkey: "viewer",
          tags: [["e", "listing-1", "other"]],
        }),
      ],
      directFollowPubkeys: [],
      userPubkey: "viewer",
    });

    expect(getListingReportSignal(product, summaries)).toMatchObject({
      level: "reported_by_you",
      reportCount: 1,
      reportTypes: ["other"],
    });
  });

  it("summarizes trusted profile reports", () => {
    const summaries = summarizeReportEvents({
      reportEvents: [
        makeReport({
          id: "profile-report",
          pubkey: "direct-1",
          tags: [["p", "seller-1", "impersonation"]],
        }),
      ],
      directFollowPubkeys: ["direct-1"],
      userPubkey: "viewer",
    });

    expect(getProfileReportSignal("seller-1", summaries)).toMatchObject({
      level: "trusted_warning",
      reportCount: 1,
      reportTypes: ["impersonation"],
    });
  });
});
