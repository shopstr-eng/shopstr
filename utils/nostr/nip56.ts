/**
 * NIP-56 Reporting helpers.
 *
 * NIP-56 defines kind 1984 events for reporting objectionable content.
 * See: https://github.com/nostr-protocol/nips/blob/master/56.md
 *
 * Tag shapes:
 *   Profile report:  [["p", pubkey, reason]]
 *   Listing report:  [["e", eventId, reason], ["p", pubkey]]
 */

export type Nip56ReportType =
  | "nudity"
  | "malware"
  | "profanity"
  | "illegal"
  | "spam"
  | "impersonation"
  | "other";

/**
 * Build NIP-56 kind 1984 tags for reporting a seller profile.
 *
 * @param pubkey  The hex pubkey of the profile being reported.
 * @param reason  One of the NIP-56 report type strings.
 * @returns       Tag array ready to include in a kind 1984 event.
 */
export function buildProfileReportTags(
  pubkey: string,
  reason: Nip56ReportType
): string[][] {
  return [["p", pubkey, reason]];
}

/**
 * Build NIP-56 kind 1984 tags for reporting a marketplace listing (kind 30018).
 *
 * @param eventId  The hex id of the listing event being reported.
 * @param pubkey   The hex pubkey of the listing author.
 * @param reason   One of the NIP-56 report type strings.
 * @returns        Tag array ready to include in a kind 1984 event.
 */
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
