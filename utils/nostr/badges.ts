import type { Filter } from "nostr-tools";

import type { Nip58ProfileBadge, NostrEvent } from "@/utils/types/types";
import { isHexPubkey } from "@/utils/nostr/pubkey";
import type { NostrManager } from "@/utils/nostr/nostr-manager";

export type { Nip58ProfileBadge } from "@/utils/types/types";

export const NIP58_BADGE_AWARD_KIND = 8;
export const NIP58_PROFILE_BADGES_KIND = 10008;
export const NIP58_BADGE_SET_KIND = 30008;
export const NIP58_BADGE_DEFINITION_KIND = 30009;
export const NIP58_DEPRECATED_PROFILE_BADGES_D_TAG = "profile_badges";

const HEX_ID_PATTERN = /^[0-9a-fA-F]{64}$/;
const COMPACT_THUMBNAIL_DIMENSIONS = ["32x32", "64x64", "16x16", "256x256"];
const NIP58_BADGE_FETCH_TIMEOUT_MS = 5_000;

export interface Nip58BadgeAddress {
  kind: typeof NIP58_BADGE_DEFINITION_KIND;
  pubkey: string;
  d: string;
  address: string;
}

export type Nip58BadgeDefinition = Omit<Nip58ProfileBadge, "awardEventId">;

export interface Nip58ProfileBadgeReference {
  definitionAddress: string;
  awardEventId: string;
  relayHint?: string;
}

function getTagValue(tags: string[][], key: string): string | undefined {
  return tags.find((tag) => tag[0] === key)?.[1];
}

function getAllTagValues(tags: string[][], key: string): string[] {
  return tags
    .filter((tag) => tag[0] === key && Boolean(tag[1]))
    .map((tag) => tag[1]!);
}

function isHexEventId(value: string | undefined): value is string {
  return typeof value === "string" && HEX_ID_PATTERN.test(value);
}

function getPreferredThumbnail(tags: string[][]): string | undefined {
  const thumbTags = tags.filter((tag) => tag[0] === "thumb" && tag[1]);
  if (!thumbTags.length) return undefined;

  for (const dimensions of COMPACT_THUMBNAIL_DIMENSIONS) {
    const matchingThumb = thumbTags.find((tag) => tag[2] === dimensions);
    if (matchingThumb?.[1]) return matchingThumb[1];
  }

  return thumbTags[0]?.[1];
}

export function parseNip58BadgeAddress(
  address: string | undefined
): Nip58BadgeAddress | null {
  if (!address) return null;

  const [kindValue, pubkey, ...dParts] = address.split(":");
  const d = dParts.join(":");

  if (
    kindValue !== String(NIP58_BADGE_DEFINITION_KIND) ||
    !pubkey ||
    !isHexPubkey(pubkey) ||
    !d
  ) {
    return null;
  }

  return {
    kind: NIP58_BADGE_DEFINITION_KIND,
    pubkey,
    d,
    address: `${NIP58_BADGE_DEFINITION_KIND}:${pubkey}:${d}`,
  };
}

export function isNip58ProfileBadgesEvent(event: NostrEvent): boolean {
  if (event.kind === NIP58_PROFILE_BADGES_KIND) return true;

  return (
    event.kind === NIP58_BADGE_SET_KIND &&
    getTagValue(event.tags, "d") === NIP58_DEPRECATED_PROFILE_BADGES_D_TAG
  );
}

export function parseNip58BadgeDefinition(
  event: NostrEvent
): Nip58BadgeDefinition | null {
  if (event.kind !== NIP58_BADGE_DEFINITION_KIND) return null;
  if (!isHexPubkey(event.pubkey)) return null;

  const d = getTagValue(event.tags, "d");
  if (!d) return null;

  const image = getTagValue(event.tags, "image");

  return {
    definitionAddress: `${NIP58_BADGE_DEFINITION_KIND}:${event.pubkey}:${d}`,
    issuerPubkey: event.pubkey,
    badgeDefinitionDTag: d,
    name: getTagValue(event.tags, "name") || d,
    description: getTagValue(event.tags, "description"),
    image,
    thumbnail: getPreferredThumbnail(event.tags) || image,
  };
}

export function parseNip58ProfileBadgesEvent(
  event: NostrEvent
): Nip58ProfileBadgeReference[] {
  if (!isNip58ProfileBadgesEvent(event)) return [];

  const references: Nip58ProfileBadgeReference[] = [];
  const seenReferences = new Set<string>();

  for (let index = 0; index < event.tags.length - 1; index += 1) {
    const aTag = event.tags[index];
    const eTag = event.tags[index + 1];
    if (aTag?.[0] !== "a" || eTag?.[0] !== "e") continue;

    const badgeAddress = parseNip58BadgeAddress(aTag[1]);
    const awardEventId = eTag[1];
    if (!badgeAddress || !isHexEventId(awardEventId)) continue;

    const referenceKey = `${badgeAddress.address}:${awardEventId}`;
    if (seenReferences.has(referenceKey)) continue;

    references.push({
      definitionAddress: badgeAddress.address,
      awardEventId,
      relayHint: eTag[2],
    });
    seenReferences.add(referenceKey);
    index += 1;
  }

  return references;
}

export function buildNip58BadgeDefinitionFilters(
  definitionAddresses: Iterable<string>
): Filter[] {
  const dTagsByIssuer = new Map<string, Set<string>>();

  for (const definitionAddress of definitionAddresses) {
    const parsedAddress = parseNip58BadgeAddress(definitionAddress);
    if (!parsedAddress) continue;

    const dTags = dTagsByIssuer.get(parsedAddress.pubkey) || new Set<string>();
    dTags.add(parsedAddress.d);
    dTagsByIssuer.set(parsedAddress.pubkey, dTags);
  }

  return Array.from(dTagsByIssuer.entries()).map(([issuerPubkey, dTags]) => ({
    kinds: [NIP58_BADGE_DEFINITION_KIND],
    authors: [issuerPubkey],
    "#d": Array.from(dTags),
  }));
}

export function selectLatestNip58ProfileBadgesEvent(
  events: readonly NostrEvent[]
): NostrEvent | null {
  let latestEvent: NostrEvent | null = null;

  for (const event of events) {
    if (!isNip58ProfileBadgesEvent(event)) continue;
    if (!latestEvent) {
      latestEvent = event;
      continue;
    }

    if (event.created_at > latestEvent.created_at) {
      latestEvent = event;
      continue;
    }

    if (
      event.created_at === latestEvent.created_at &&
      event.kind === NIP58_PROFILE_BADGES_KIND &&
      latestEvent.kind !== NIP58_PROFILE_BADGES_KIND
    ) {
      latestEvent = event;
    }
  }

  return latestEvent;
}

export function resolveNip58ProfileBadgesForProfile({
  profilePubkey,
  profileBadgesEvent,
  awardEvents,
  definitionEvents,
}: {
  profilePubkey: string;
  profileBadgesEvent: NostrEvent | null;
  awardEvents: readonly NostrEvent[];
  definitionEvents: readonly NostrEvent[];
}): Nip58ProfileBadge[] {
  if (!profileBadgesEvent || !isHexPubkey(profilePubkey)) return [];

  const references = parseNip58ProfileBadgesEvent(profileBadgesEvent);
  const awardEventsById = new Map(
    awardEvents
      .filter(
        (event) =>
          event.kind === NIP58_BADGE_AWARD_KIND && isHexEventId(event.id)
      )
      .map((event) => [event.id, event])
  );
  const definitionsByAddress = new Map<
    string,
    { definition: Nip58BadgeDefinition; createdAt: number }
  >();

  for (const event of definitionEvents) {
    const definition = parseNip58BadgeDefinition(event);
    if (!definition) continue;

    const currentDefinition = definitionsByAddress.get(
      definition.definitionAddress
    );
    if (!currentDefinition || event.created_at > currentDefinition.createdAt) {
      definitionsByAddress.set(definition.definitionAddress, {
        definition,
        createdAt: event.created_at,
      });
    }
  }

  const badges: Nip58ProfileBadge[] = [];

  for (const reference of references) {
    const badgeAddress = parseNip58BadgeAddress(reference.definitionAddress);
    if (!badgeAddress) continue;

    const awardEvent = awardEventsById.get(reference.awardEventId);
    const definitionEntry = definitionsByAddress.get(
      reference.definitionAddress
    );
    if (!awardEvent || !definitionEntry) continue;

    const awardDefinitionAddresses = getAllTagValues(awardEvent.tags, "a");
    const awardedPubkeys = getAllTagValues(awardEvent.tags, "p");
    if (
      awardEvent.pubkey !== badgeAddress.pubkey ||
      awardDefinitionAddresses.length !== 1 ||
      awardDefinitionAddresses[0] !== reference.definitionAddress ||
      !awardedPubkeys.includes(profilePubkey)
    ) {
      continue;
    }

    badges.push({
      ...definitionEntry.definition,
      awardEventId: reference.awardEventId,
    });
  }

  return badges;
}

function getUniqueRelayUrls(relays: string[]): string[] {
  const relayMap = new Map<string, string>();

  for (const relay of relays) {
    const normalizedRelay = relay.trim().replace(/\/+$/, "");
    if (!normalizedRelay) continue;
    relayMap.set(normalizedRelay.toLowerCase(), normalizedRelay);
  }

  return Array.from(relayMap.values());
}

export async function fetchNip58ProfileBadges(
  nostr: Pick<NostrManager, "fetch">,
  relays: string[],
  pubkeys: string[]
): Promise<Map<string, Nip58ProfileBadge[]>> {
  const uniquePubkeys = Array.from(new Set(pubkeys.filter(isHexPubkey)));
  const uniquePubkeySet = new Set(uniquePubkeys);
  const badgesByPubkey = new Map<string, Nip58ProfileBadge[]>();
  if (!uniquePubkeys.length) return badgesByPubkey;

  const profileBadgeEvents = await nostr.fetch(
    [
      {
        kinds: [NIP58_PROFILE_BADGES_KIND],
        authors: uniquePubkeys,
      },
      {
        kinds: [NIP58_BADGE_SET_KIND],
        authors: uniquePubkeys,
        "#d": [NIP58_DEPRECATED_PROFILE_BADGES_D_TAG],
      },
    ],
    {},
    relays,
    NIP58_BADGE_FETCH_TIMEOUT_MS
  );

  const profileBadgeEventsByPubkey = new Map<string, NostrEvent[]>();
  for (const event of profileBadgeEvents) {
    if (
      !uniquePubkeySet.has(event.pubkey) ||
      !isNip58ProfileBadgesEvent(event)
    ) {
      continue;
    }

    const events = profileBadgeEventsByPubkey.get(event.pubkey) || [];
    events.push(event);
    profileBadgeEventsByPubkey.set(event.pubkey, events);
  }

  const selectedProfileBadgeEvents = new Map<string, NostrEvent>();
  const awardIds = new Set<string>();
  const definitionAddresses = new Set<string>();
  const relayHints: string[] = [];

  for (const pubkey of uniquePubkeys) {
    const latestProfileBadgesEvent = selectLatestNip58ProfileBadgesEvent(
      profileBadgeEventsByPubkey.get(pubkey) || []
    );
    if (!latestProfileBadgesEvent) continue;

    selectedProfileBadgeEvents.set(pubkey, latestProfileBadgesEvent);

    for (const reference of parseNip58ProfileBadgesEvent(
      latestProfileBadgesEvent
    )) {
      awardIds.add(reference.awardEventId);
      definitionAddresses.add(reference.definitionAddress);
      if (reference.relayHint) relayHints.push(reference.relayHint);
    }
  }

  if (!selectedProfileBadgeEvents.size || !awardIds.size) {
    return badgesByPubkey;
  }

  const resolutionRelays = getUniqueRelayUrls([...relays, ...relayHints]);
  const definitionFilters =
    buildNip58BadgeDefinitionFilters(definitionAddresses);
  const [awardEvents, definitionEvents] = await Promise.all([
    nostr.fetch(
      [
        {
          kinds: [NIP58_BADGE_AWARD_KIND],
          ids: Array.from(awardIds),
        },
      ],
      {},
      resolutionRelays,
      NIP58_BADGE_FETCH_TIMEOUT_MS
    ),
    definitionFilters.length
      ? nostr.fetch(
          definitionFilters,
          {},
          resolutionRelays,
          NIP58_BADGE_FETCH_TIMEOUT_MS
        )
      : Promise.resolve([]),
  ]);

  for (const [pubkey, profileBadgesEvent] of selectedProfileBadgeEvents) {
    const badges = resolveNip58ProfileBadgesForProfile({
      profilePubkey: pubkey,
      profileBadgesEvent,
      awardEvents,
      definitionEvents,
    });

    if (badges.length) badgesByPubkey.set(pubkey, badges);
  }

  return badgesByPubkey;
}
