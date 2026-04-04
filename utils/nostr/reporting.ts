import { EventTemplate } from "nostr-tools";
import { finalizeAndSendNostrEvent } from "@/utils/nostr/nostr-helper-functions";
import { NostrManager } from "@/utils/nostr/nostr-manager";
import { NostrSigner } from "@/utils/nostr/signers/nostr-signer";
import { NostrEvent } from "@/utils/types/types";

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

export type ListingReportMode = "seller-and-listing" | "listing-only";

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
  content?: string // for report purpose
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
  content?: string,
  listingReportMode: ListingReportMode = "seller-and-listing"
): { tags: string[][]; content: string } {
  const listingTag: string[] = ["a", `30402:${pubkey}:${dTag}`, reason];
  const tags: string[][] =
    listingReportMode === "listing-only"
      ? [listingTag]
      : [
          ["p", pubkey], // p for author
          listingTag, // a for referencing the listing
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
  dTag?: string, // required when targetType is "listing"
  options?: {
    listingReportMode?: ListingReportMode;
  }
): EventTemplate {
  let reportData: { tags: string[][]; content: string };

  if (targetType === "listing") {
    if (!dTag) {
      throw new Error(
        "dTag is required when reporting a listing (addressable event)"
      );
    }
    reportData = constructListingReportTags(
      pubkey,
      dTag,
      reason,
      content,
      options?.listingReportMode ?? "seller-and-listing"
    );
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

export async function publishReportEvent(
  nostr: NostrManager,
  signer: NostrSigner,
  targetType: "profile" | "listing",
  pubkey: string,
  reason: ReportReason,
  content?: string,
  dTag?: string,
  options?: {
    listingReportMode?: ListingReportMode;
  }
): Promise<NostrEvent> {
  const template = constructReportEventTemplate(
    targetType,
    pubkey,
    reason,
    content,
    dTag,
    options
  );

  return await finalizeAndSendNostrEvent(signer, nostr, template);
}
