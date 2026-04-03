import { NostrEvent } from "@/utils/types/types";

export type Nip56ReportEventDraft = Pick<
  NostrEvent,
  "pubkey" | "created_at" | "kind" | "tags" | "content"
>;

export function buildNip56ReportEvent({
  reporterPubkey,
  reportedPubkey,
  reportContent = "",
  reportedEventId,
}: {
  reporterPubkey: string;
  reportedPubkey: string;
  reportContent?: string;
  reportedEventId?: string;
}): Nip56ReportEventDraft {
  const tags: string[][] = [["p", reportedPubkey]];

  if (reportedEventId) {
    tags.push(["e", reportedEventId]);
  }

  return {
    pubkey: reporterPubkey,
    created_at: Math.floor(Date.now() / 1000),
    kind: 1984,
    tags,
    content: reportContent,
  };
}

