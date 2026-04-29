export type Nip56ReportType =
  | "nudity"
  | "malware"
  | "profanity"
  | "illegal"
  | "spam"
  | "impersonation"
  | "other";

export function buildProfileReportTags(
  pubkey: string,
  reason: Nip56ReportType
): string[][] {
  return [["p", pubkey, reason]];
}

export function buildListingReportTags(
  eventId: string,
  pubkey: string,
  reason: Nip56ReportType
): string[][] {
  return [
    ["e", eventId, reason],
    ["p", pubkey],
  ];
}
