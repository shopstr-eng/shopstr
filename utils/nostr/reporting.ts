import { EventTemplate } from "nostr-tools";

/**
 * Valid NIP-56 report reason types.
 * @see https://github.com/nostr-protocol/nips/blob/master/56.md
 */
export type ReportReason =
  | "nudity"
  | "malware"
  | "profanity"
  | "illegal"
  | "spam"
  | "impersonation"
  | "other";

export const REPORT_REASONS: ReportReason[] = [
  "nudity",
  "malware",
  "profanity",
  "illegal",
  "spam",
  "impersonation",
  "other",
];


export function constructProfileReportTags(
  pubkey: string,
  reason: ReportReason,
  content?: string  // for report purpose
): { tags: string[][]; content: string } {
  const tags: string[][] = [["p", pubkey, reason]];

  return {
    tags,
    content: content || "",
  };
}

export function constructListingReportTags(
  pubkey: string,
  dTag: string,
  reason: ReportReason,
  content?: string
): { tags: string[][]; content: string } {
  const tags: string[][] = [
    ["p", pubkey],  //p for author
    ["a", `30402:${pubkey}:${dTag}`, reason], // a for referencing the listing
  ];

  return {
    tags,
    content: content || "",
  };
}

export function constructReportEventTemplate(
  targetType: "profile" | "listing",
  pubkey: string,
  reason: ReportReason,
  content?: string,
  dTag?: string // required when targetType is "listing"
): EventTemplate {
  let reportData: { tags: string[][]; content: string };

  if (targetType === "listing") {
    if (!dTag) {
      throw new Error(
        "dTag is required when reporting a listing (addressable event)"
      );
    }
    reportData = constructListingReportTags(pubkey, dTag, reason, content);
  } else {
    reportData = constructProfileReportTags(pubkey, reason, content);
  }

  return {
    kind: 1984,
    tags: reportData.tags,
    content: reportData.content,
    created_at: Math.floor(Date.now() / 1000),
  };
}
