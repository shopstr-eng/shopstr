import {
  buildProfileReportTags,
  buildListingReportTags,
  Nip56ReportType,
} from "../nip56";

const PUBKEY =
  "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const EVENT_ID =
  "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";

describe("buildProfileReportTags", () => {
  it("returns a single p tag with the reason", () => {
    const tags = buildProfileReportTags(PUBKEY, "spam");
    expect(tags).toEqual([["p", PUBKEY, "spam"]]);
  });

  it("includes the pubkey verbatim", () => {
    const tags = buildProfileReportTags(PUBKEY, "impersonation");
    expect(tags[0]![1]).toBe(PUBKEY);
  });

  const reasons: Nip56ReportType[] = [
    "nudity",
    "malware",
    "profanity",
    "illegal",
    "spam",
    "impersonation",
    "other",
  ];

  it.each(reasons)("accepts report type %s", (reason) => {
    const tags = buildProfileReportTags(PUBKEY, reason);
    expect(tags[0]![2]).toBe(reason);
  });
});

describe("buildListingReportTags", () => {
  it("returns an e tag followed by a p tag", () => {
    const tags = buildListingReportTags(EVENT_ID, PUBKEY, "spam");
    expect(tags).toEqual([
      ["e", EVENT_ID, "spam"],
      ["p", PUBKEY],
    ]);
  });

  it("attaches the reason to the e tag, not the p tag", () => {
    const tags = buildListingReportTags(EVENT_ID, PUBKEY, "illegal");
    expect(tags[0]).toEqual(["e", EVENT_ID, "illegal"]);
    expect(tags[1]).toEqual(["p", PUBKEY]);
    expect(tags[1]).toHaveLength(2);
  });

  it("preserves the event id verbatim", () => {
    const tags = buildListingReportTags(EVENT_ID, PUBKEY, "other");
    expect(tags[0]![1]).toBe(EVENT_ID);
  });
});
