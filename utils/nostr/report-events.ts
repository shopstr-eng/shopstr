import { NostrEvent } from "@/utils/types/types";

export type Nip56ReportEventDraft = Pick<
  NostrEvent,
  "pubkey" | "created_at" | "kind" | "tags" | "content"
>;

export type Nip56ReportType =
  | "nudity"
  | "malware"
  | "profanity"
  | "illegal"
  | "spam"
  | "impersonation"
  | "other";

export function buildNip56ReportEvent({
  reporterPubkey,
  reportedPubkey,
  reportType,
  reportContent = "",
  reportedEventId,
}: {
  reporterPubkey: string;
  reportedPubkey: string;
  reportType: Nip56ReportType;
  reportContent?: string;
  reportedEventId?: string;
}): Nip56ReportEventDraft {
  const tags: string[][] = reportedEventId
    ? [["p", reportedPubkey], ["e", reportedEventId, reportType]]
    : [["p", reportedPubkey, reportType]];

  return {
    pubkey: reporterPubkey,
    created_at: Math.floor(Date.now() / 1000),
    kind: 1984,
    tags,
    content: reportContent,
  };
}
