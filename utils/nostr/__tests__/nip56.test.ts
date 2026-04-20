import {
  buildListingReportTags,
  buildProfileReportTags,
  Nip56ReportType,
} from "../nip56";

const PUBKEY =
  "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const EVENT_ID =
  "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";

describe("buildProfileReportTags", () => {
  it("returns a single p tag with the reason", () => {
    expect(buildProfileReportTags(PUBKEY, "spam")).toEqual([
      ["p", PUBKEY, "spam"],
    ]);
  });

  it("includes the pubkey verbatim", () => {
    const tags = buildProfileReportTags(PUBKEY, "impersonation");
    const [firstTag] = tags;

    expect(firstTag).toBeDefined();
    expect(firstTag?.[1]).toBe(PUBKEY);
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
    const [firstTag] = tags;

    expect(firstTag).toBeDefined();
    expect(firstTag?.[2]).toBe(reason);
  });
});

describe("buildListingReportTags", () => {
  it("returns an e tag followed by a p tag", () => {
    expect(buildListingReportTags(EVENT_ID, PUBKEY, "spam")).toEqual([
      ["e", EVENT_ID, "spam"],
      ["p", PUBKEY],
    ]);
  });

  it("attaches the reason to the e tag, not the p tag", () => {
    const tags = buildListingReportTags(EVENT_ID, PUBKEY, "illegal");
    const [eventTag, pubkeyTag] = tags;

    expect(eventTag).toEqual(["e", EVENT_ID, "illegal"]);
    expect(pubkeyTag).toEqual(["p", PUBKEY]);
    expect(pubkeyTag).toHaveLength(2);
  });

  it("preserves the event id verbatim", () => {
    const tags = buildListingReportTags(EVENT_ID, PUBKEY, "other");
    const [eventTag] = tags;

    expect(eventTag).toBeDefined();
    expect(eventTag?.[1]).toBe(EVENT_ID);
  });
});
