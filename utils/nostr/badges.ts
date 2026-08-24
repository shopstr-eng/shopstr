import type { Filter } from "nostr-tools";

import type { Nip58ProfileBadge, NostrEvent } from "@/utils/types/types";
import { isHexPubkey } from "@/utils/nostr/pubkey";
import type {
  NostrFetchResult,
  NostrManager,
} from "@/utils/nostr/nostr-manager";

export type { Nip58ProfileBadge } from "@/utils/types/types";

export const NIP58_BADGE_AWARD_KIND = 8;
export const NIP58_PROFILE_BADGES_KIND = 10008;
export const NIP58_BADGE_SET_KIND = 30008;
export const NIP58_BADGE_DEFINITION_KIND = 30009;
export const NIP58_DEPRECATED_PROFILE_BADGES_D_TAG = "profile_badges";

const HEX_ID_PATTERN = /^[0-9a-fA-F]{64}$/;
const COMPACT_THUMBNAIL_DIMENSIONS = ["32x32", "64x64", "16x16", "256x256"];
const NIP58_BADGE_FETCH_TIMEOUT_MS = 5_000;
export const MAX_NIP58_PROFILE_BADGES = 4;
const MAX_NIP58_HINTED_RELAYS = 8;

export interface Nip58BadgeAddress {
  kind: typeof NIP58_BADGE_DEFINITION_KIND;
  pubkey: string;
  d: string;
  address: string;
}

interface Nip58BadgeSetAddress {
  pubkey: string;
  d: string;
  address: string;
}

export type Nip58BadgeDefinition = Omit<Nip58ProfileBadge, "awardEventId">;

export interface Nip58ProfileBadgeReference {
  definitionAddress: string;
  awardEventId: string;
  definitionRelayHint?: string;
  awardRelayHint?: string;
}

type Nip58ProfileBadgeListItem =
  | { type: "badge"; reference: Nip58ProfileBadgeReference }
  | {
      type: "set";
      setAddress: string;
      relayHint?: string;
    };

export interface Nip58ProfileBadgesResult {
  badges: Nip58ProfileBadge[];
  complete: boolean;
  retryable?: boolean;
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

function parseNip58BadgeSetAddress(
  address: string | undefined
): Nip58BadgeSetAddress | null {
  if (!address) return null;

  const [kindValue, pubkey, ...dParts] = address.split(":");
  const d = dParts.join(":");
  if (
    kindValue !== String(NIP58_BADGE_SET_KIND) ||
    !pubkey ||
    !isHexPubkey(pubkey) ||
    !d
  ) {
    return null;
  }

  return {
    pubkey,
    d,
    address: `${NIP58_BADGE_SET_KIND}:${pubkey}:${d}`,
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
  event: NostrEvent,
  maxReferences = Number.POSITIVE_INFINITY
): Nip58ProfileBadgeReference[] {
  if (!isNip58ProfileBadgesEvent(event)) return [];
  return parseNip58BadgeReferencePairs(event.tags, maxReferences);
}

function parseNip58BadgeReferencePairs(
  tags: string[][],
  maxReferences = Number.POSITIVE_INFINITY
): Nip58ProfileBadgeReference[] {
  if (maxReferences <= 0) return [];

  const references: Nip58ProfileBadgeReference[] = [];
  const seenReferences = new Set<string>();

  for (let index = 0; index < tags.length - 1; index += 1) {
    const aTag = tags[index];
    const eTag = tags[index + 1];
    if (aTag?.[0] !== "a" || eTag?.[0] !== "e") continue;

    const badgeAddress = parseNip58BadgeAddress(aTag[1]);
    const awardEventId = eTag[1];
    if (!badgeAddress || !isHexEventId(awardEventId)) continue;

    const referenceKey = `${badgeAddress.address}:${awardEventId}`;
    if (seenReferences.has(referenceKey)) continue;

    references.push({
      definitionAddress: badgeAddress.address,
      awardEventId,
      definitionRelayHint: aTag[2],
      awardRelayHint: eTag[2],
    });
    seenReferences.add(referenceKey);
    if (references.length >= maxReferences) break;
    index += 1;
  }

  return references;
}

function parseNip58ProfileBadgeListItems(
  event: NostrEvent,
  maxItems: number
): Nip58ProfileBadgeListItem[] {
  if (!isNip58ProfileBadgesEvent(event) || maxItems <= 0) return [];

  const items: Nip58ProfileBadgeListItem[] = [];
  const seenItems = new Set<string>();
  for (let index = 0; index < event.tags.length; index += 1) {
    const aTag = event.tags[index];
    if (aTag?.[0] !== "a") continue;

    const badgeAddress = parseNip58BadgeAddress(aTag[1]);
    const eTag = event.tags[index + 1];
    if (badgeAddress && eTag?.[0] === "e" && isHexEventId(eTag[1])) {
      const key = `badge:${badgeAddress.address}:${eTag[1]}`;
      if (!seenItems.has(key)) {
        items.push({
          type: "badge",
          reference: {
            definitionAddress: badgeAddress.address,
            awardEventId: eTag[1],
            definitionRelayHint: aTag[2],
            awardRelayHint: eTag[2],
          },
        });
        seenItems.add(key);
      }
      index += 1;
    } else {
      const setAddress = parseNip58BadgeSetAddress(aTag[1]);
      const key = setAddress ? `set:${setAddress.address}` : "";
      if (setAddress && !seenItems.has(key)) {
        items.push({
          type: "set",
          setAddress: setAddress.address,
          relayHint: aTag[2],
        });
        seenItems.add(key);
      }
    }

    if (items.length >= maxItems) break;
  }
  return items;
}

function buildNip58BadgeSetFilters(setAddresses: Iterable<string>): Filter[] {
  const dTagsByAuthor = new Map<string, Set<string>>();
  for (const setAddress of setAddresses) {
    const parsedAddress = parseNip58BadgeSetAddress(setAddress);
    if (!parsedAddress) continue;
    const dTags = dTagsByAuthor.get(parsedAddress.pubkey) || new Set<string>();
    dTags.add(parsedAddress.d);
    dTagsByAuthor.set(parsedAddress.pubkey, dTags);
  }

  return Array.from(dTagsByAuthor.entries()).map(([author, dTags]) => ({
    kinds: [NIP58_BADGE_SET_KIND],
    authors: [author],
    "#d": Array.from(dTags),
  }));
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

    if (isPreferredReplaceableEvent(event, latestEvent)) {
      latestEvent = event;
    }
  }

  return latestEvent;
}

function isPreferredReplaceableEvent(
  candidate: NostrEvent,
  current: NostrEvent
): boolean {
  if (candidate.created_at !== current.created_at) {
    return candidate.created_at > current.created_at;
  }

  return candidate.id.localeCompare(current.id) < 0;
}

function buildBadgeSetsByAddress(
  events: readonly NostrEvent[]
): Map<string, NostrEvent> {
  const badgeSetsByAddress = new Map<string, NostrEvent>();
  for (const event of events) {
    if (event.kind !== NIP58_BADGE_SET_KIND || !isHexPubkey(event.pubkey)) {
      continue;
    }
    const d = getTagValue(event.tags, "d");
    if (!d) continue;
    const address = `${NIP58_BADGE_SET_KIND}:${event.pubkey}:${d}`;
    const current = badgeSetsByAddress.get(address);
    if (!current || isPreferredReplaceableEvent(event, current)) {
      badgeSetsByAddress.set(address, event);
    }
  }
  return badgeSetsByAddress;
}

function getAwardEventForReference(
  reference: Nip58ProfileBadgeReference,
  awardEventsById: ReadonlyMap<string, NostrEvent>
): NostrEvent | undefined {
  return awardEventsById.get(reference.awardEventId);
}

function isValidAwardForReference(
  awardEvent: NostrEvent,
  reference: Nip58ProfileBadgeReference,
  profilePubkey: string
): boolean {
  const badgeAddress = parseNip58BadgeAddress(reference.definitionAddress);
  if (!badgeAddress) return false;

  const awardDefinitionAddresses = getAllTagValues(awardEvent.tags, "a");
  const awardedPubkeys = getAllTagValues(awardEvent.tags, "p");
  return (
    awardEvent.kind === NIP58_BADGE_AWARD_KIND &&
    awardEvent.pubkey === badgeAddress.pubkey &&
    awardDefinitionAddresses.length === 1 &&
    awardDefinitionAddresses[0] === reference.definitionAddress &&
    awardedPubkeys.includes(profilePubkey)
  );
}

function buildAwardEventsById(
  awardEvents: readonly NostrEvent[]
): Map<string, NostrEvent> {
  return new Map(
    awardEvents
      .filter(
        (event) =>
          event.kind === NIP58_BADGE_AWARD_KIND && isHexEventId(event.id)
      )
      .map((event) => [event.id, event])
  );
}

function buildDefinitionsByAddress(
  definitionEvents: readonly NostrEvent[]
): Map<string, { definition: Nip58BadgeDefinition; event: NostrEvent }> {
  const definitionsByAddress = new Map<
    string,
    { definition: Nip58BadgeDefinition; event: NostrEvent }
  >();

  for (const event of definitionEvents) {
    const definition = parseNip58BadgeDefinition(event);
    if (!definition) continue;

    const currentDefinition = definitionsByAddress.get(
      definition.definitionAddress
    );
    if (
      !currentDefinition ||
      isPreferredReplaceableEvent(event, currentDefinition.event)
    ) {
      definitionsByAddress.set(definition.definitionAddress, {
        definition,
        event,
      });
    }
  }

  return definitionsByAddress;
}

function resolveNip58BadgeReferences(
  profilePubkey: string,
  references: readonly Nip58ProfileBadgeReference[],
  awardEventsById: ReadonlyMap<string, NostrEvent>,
  definitionsByAddress: ReadonlyMap<
    string,
    { definition: Nip58BadgeDefinition }
  >
): Nip58ProfileBadge[] {
  const badges: Nip58ProfileBadge[] = [];

  for (const reference of references) {
    const awardEvent = getAwardEventForReference(reference, awardEventsById);
    const definitionEntry = definitionsByAddress.get(
      reference.definitionAddress
    );
    if (
      !awardEvent ||
      !definitionEntry ||
      !isValidAwardForReference(awardEvent, reference, profilePubkey)
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

  const references = parseNip58ProfileBadgesEvent(
    profileBadgesEvent,
    MAX_NIP58_PROFILE_BADGES
  );
  const awardEventsById = buildAwardEventsById(awardEvents);
  const definitionsByAddress = buildDefinitionsByAddress(definitionEvents);
  return resolveNip58BadgeReferences(
    profilePubkey,
    references,
    awardEventsById,
    definitionsByAddress
  );
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

function normalizeNip58RelayHint(relayHint: string | undefined): string | null {
  if (!relayHint) return null;

  try {
    const relayUrl = new URL(relayHint.trim());
    if (relayUrl.protocol !== "ws:" && relayUrl.protocol !== "wss:") {
      return null;
    }
    if (relayUrl.username || relayUrl.password) return null;

    return relayUrl.toString().replace(/\/+$/, "");
  } catch {
    return null;
  }
}

function deduplicateEvents(events: readonly NostrEvent[]): NostrEvent[] {
  return Array.from(new Map(events.map((event) => [event.id, event])).values());
}

function getAwardDefinitionRelayHint(
  awardEvent: NostrEvent,
  definitionAddress: string
): string | undefined {
  const definitionTags = awardEvent.tags.filter((tag) => tag[0] === "a");
  if (
    definitionTags.length !== 1 ||
    definitionTags[0]?.[1] !== definitionAddress
  ) {
    return undefined;
  }

  return definitionTags[0][2];
}

type Nip58Fetcher = Pick<NostrManager, "fetch"> &
  Partial<Pick<NostrManager, "fetchWithStatus" | "fetchTransientWithStatus">>;

async function fetchNip58Events(
  nostr: Nip58Fetcher,
  filters: Filter[],
  relays: string[],
  transient = false
): Promise<NostrFetchResult> {
  if (transient && typeof nostr.fetchTransientWithStatus === "function") {
    return nostr.fetchTransientWithStatus(
      filters,
      {},
      relays,
      NIP58_BADGE_FETCH_TIMEOUT_MS
    );
  }

  if (typeof nostr.fetchWithStatus === "function") {
    return nostr.fetchWithStatus(
      filters,
      {},
      relays,
      NIP58_BADGE_FETCH_TIMEOUT_MS
    );
  }

  return {
    events: await nostr.fetch(
      filters,
      {},
      relays,
      NIP58_BADGE_FETCH_TIMEOUT_MS
    ),
    complete: true,
  };
}

export async function fetchNip58ProfileBadges(
  nostr: Nip58Fetcher,
  relays: string[],
  pubkeys: string[]
): Promise<Map<string, Nip58ProfileBadgesResult>> {
  const uniquePubkeys = Array.from(new Set(pubkeys.filter(isHexPubkey)));
  const uniquePubkeySet = new Set(uniquePubkeys);
  const badgesByPubkey = new Map<string, Nip58ProfileBadgesResult>();
  if (!uniquePubkeys.length) return badgesByPubkey;

  const profileBadgeFetch = await fetchNip58Events(
    nostr,
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
    relays
  );
  const profileBadgeEvents = profileBadgeFetch.events;

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

  const selectedProfileBadgeEvents = new Map<
    string,
    {
      items: Nip58ProfileBadgeListItem[];
      references: Nip58ProfileBadgeReference[];
      setsComplete: boolean;
    }
  >();
  const badgeSetAddresses = new Set<string>();

  for (const pubkey of uniquePubkeys) {
    const latestProfileBadgesEvent = selectLatestNip58ProfileBadgesEvent(
      profileBadgeEventsByPubkey.get(pubkey) || []
    );
    if (!latestProfileBadgesEvent) continue;

    const items = parseNip58ProfileBadgeListItems(
      latestProfileBadgesEvent,
      MAX_NIP58_PROFILE_BADGES
    );
    selectedProfileBadgeEvents.set(pubkey, {
      items,
      references: [],
      setsComplete: true,
    });
    for (const item of items) {
      if (item.type === "set") badgeSetAddresses.add(item.setAddress);
    }
  }

  for (const pubkey of uniquePubkeys) {
    if (selectedProfileBadgeEvents.has(pubkey)) continue;
    badgesByPubkey.set(pubkey, {
      badges: [],
      complete: false,
      retryable: !profileBadgeFetch.complete,
    });
  }

  if (!selectedProfileBadgeEvents.size) {
    return badgesByPubkey;
  }

  const configuredRelays = getUniqueRelayUrls(relays);
  const configuredRelayKeys = new Set(
    configuredRelays.map((relay) => relay.toLowerCase())
  );
  const acceptedHintRelays = new Map<string, string>();
  const acceptHint = (relayHint: string | undefined): string | null => {
    const normalizedHint = normalizeNip58RelayHint(relayHint);
    if (!normalizedHint) return null;

    const relayKey = normalizedHint.toLowerCase();
    if (configuredRelayKeys.has(relayKey)) return null;
    const existingHint = acceptedHintRelays.get(relayKey);
    if (existingHint) return existingHint;
    if (acceptedHintRelays.size >= MAX_NIP58_HINTED_RELAYS) return null;

    acceptedHintRelays.set(relayKey, normalizedHint);
    return normalizedHint;
  };

  const badgeSetFilters = buildNip58BadgeSetFilters(badgeSetAddresses);
  const badgeSetFetch = badgeSetFilters.length
    ? await fetchNip58Events(nostr, badgeSetFilters, configuredRelays)
    : { events: [], complete: true };
  let badgeSetEvents = badgeSetFetch.events;
  const incompleteBadgeSetAddresses = new Set<string>();
  if (!badgeSetFetch.complete) {
    for (const address of badgeSetAddresses) {
      incompleteBadgeSetAddresses.add(address);
    }
  }

  const badgeSetAddressesByHint = new Map<string, Set<string>>();
  for (const { items } of selectedProfileBadgeEvents.values()) {
    for (const item of items) {
      if (item.type !== "set") continue;
      const relayHint = acceptHint(item.relayHint);
      if (!relayHint) continue;
      const addresses = badgeSetAddressesByHint.get(relayHint) || new Set();
      addresses.add(item.setAddress);
      badgeSetAddressesByHint.set(relayHint, addresses);
    }
  }

  const hintedBadgeSetEvents = await Promise.all(
    Array.from(badgeSetAddressesByHint.entries()).map(
      async ([relayHint, addresses]) => ({
        addresses,
        result: await fetchNip58Events(
          nostr,
          buildNip58BadgeSetFilters(addresses),
          [relayHint],
          true
        ).catch(() => ({ events: [], complete: false })),
      })
    )
  );
  for (const { addresses, result } of hintedBadgeSetEvents) {
    if (result.complete) continue;
    for (const address of addresses) {
      incompleteBadgeSetAddresses.add(address);
    }
  }
  badgeSetEvents = deduplicateEvents([
    ...badgeSetEvents,
    ...hintedBadgeSetEvents.flatMap(({ result }) => result.events),
  ]);
  const badgeSetsByAddress = buildBadgeSetsByAddress(badgeSetEvents);

  const awardIds = new Set<string>();
  for (const selected of selectedProfileBadgeEvents.values()) {
    const seenReferences = new Set<string>();
    for (const item of selected.items) {
      if (selected.references.length >= MAX_NIP58_PROFILE_BADGES) break;
      const itemReferences =
        item.type === "badge"
          ? [item.reference]
          : parseNip58BadgeReferencePairs(
              badgeSetsByAddress.get(item.setAddress)?.tags || [],
              MAX_NIP58_PROFILE_BADGES - selected.references.length
            );

      if (
        item.type === "set" &&
        (!badgeSetsByAddress.has(item.setAddress) ||
          incompleteBadgeSetAddresses.has(item.setAddress))
      ) {
        selected.setsComplete = false;
      }

      for (const reference of itemReferences) {
        const key = `${reference.definitionAddress}:${reference.awardEventId}`;
        if (seenReferences.has(key)) continue;
        seenReferences.add(key);
        selected.references.push(reference);
        awardIds.add(reference.awardEventId);
        if (selected.references.length >= MAX_NIP58_PROFILE_BADGES) break;
      }
    }
  }

  let awardEvents: NostrEvent[] = [];
  if (awardIds.size) {
    const awardFetch = await fetchNip58Events(
      nostr,
      [
        {
          kinds: [NIP58_BADGE_AWARD_KIND],
          ids: Array.from(awardIds),
        },
      ],
      configuredRelays
    );
    awardEvents = awardFetch.events;
  }

  let awardEventsById = buildAwardEventsById(awardEvents);
  const awardIdsByHint = new Map<string, Set<string>>();
  for (const { references } of selectedProfileBadgeEvents.values()) {
    for (const reference of references) {
      if (awardEventsById.has(reference.awardEventId)) continue;
      const relayHint = acceptHint(reference.awardRelayHint);
      if (!relayHint) continue;

      const ids = awardIdsByHint.get(relayHint) || new Set<string>();
      ids.add(reference.awardEventId);
      awardIdsByHint.set(relayHint, ids);
    }
  }

  const hintedAwardEvents = await Promise.all(
    Array.from(awardIdsByHint.entries()).map(([relayHint, ids]) =>
      fetchNip58Events(
        nostr,
        [{ kinds: [NIP58_BADGE_AWARD_KIND], ids: Array.from(ids) }],
        [relayHint],
        true
      ).catch(() => ({ events: [], complete: false }))
    )
  );
  awardEvents = deduplicateEvents([
    ...awardEvents,
    ...hintedAwardEvents.flatMap((result) => result.events),
  ]);
  awardEventsById = buildAwardEventsById(awardEvents);

  const definitionAddresses = new Set<string>();
  for (const [pubkey, { references }] of selectedProfileBadgeEvents) {
    for (const reference of references) {
      const awardEvent = getAwardEventForReference(reference, awardEventsById);
      if (
        awardEvent &&
        isValidAwardForReference(awardEvent, reference, pubkey)
      ) {
        definitionAddresses.add(reference.definitionAddress);
      }
    }
  }

  const definitionFilters =
    buildNip58BadgeDefinitionFilters(definitionAddresses);
  const definitionFetch = definitionFilters.length
    ? await fetchNip58Events(nostr, definitionFilters, configuredRelays)
    : { events: [], complete: true };
  let definitionEvents = definitionFetch.events;
  const incompleteDefinitionAddresses = new Set<string>();
  if (!definitionFetch.complete) {
    for (const address of definitionAddresses) {
      incompleteDefinitionAddresses.add(address);
    }
  }

  const definitionAddressesByHint = new Map<string, Set<string>>();
  for (const [pubkey, { references }] of selectedProfileBadgeEvents) {
    for (const reference of references) {
      const awardEvent = getAwardEventForReference(reference, awardEventsById);
      if (
        !awardEvent ||
        !isValidAwardForReference(awardEvent, reference, pubkey)
      ) {
        continue;
      }

      const possibleHints = [
        reference.definitionRelayHint,
        getAwardDefinitionRelayHint(awardEvent, reference.definitionAddress),
      ];
      for (const possibleHint of possibleHints) {
        const relayHint = acceptHint(possibleHint);
        if (!relayHint) continue;

        const addresses =
          definitionAddressesByHint.get(relayHint) || new Set<string>();
        addresses.add(reference.definitionAddress);
        definitionAddressesByHint.set(relayHint, addresses);
      }
    }
  }

  const hintedDefinitionEvents = await Promise.all(
    Array.from(definitionAddressesByHint.entries()).map(
      async ([relayHint, addresses]) => ({
        addresses,
        result: await fetchNip58Events(
          nostr,
          buildNip58BadgeDefinitionFilters(addresses),
          [relayHint],
          true
        ).catch(() => ({ events: [], complete: false })),
      })
    )
  );
  for (const { addresses, result } of hintedDefinitionEvents) {
    if (result.complete) continue;
    for (const address of addresses) {
      incompleteDefinitionAddresses.add(address);
    }
  }
  definitionEvents = deduplicateEvents([
    ...definitionEvents,
    ...hintedDefinitionEvents.flatMap(({ result }) => result.events),
  ]);
  const definitionsByAddress = buildDefinitionsByAddress(definitionEvents);

  for (const [
    pubkey,
    { references, setsComplete },
  ] of selectedProfileBadgeEvents) {
    const badges = resolveNip58BadgeReferences(
      pubkey,
      references,
      awardEventsById,
      definitionsByAddress
    );
    const complete =
      profileBadgeFetch.complete &&
      setsComplete &&
      references.every((reference) => {
        const awardEvent = getAwardEventForReference(
          reference,
          awardEventsById
        );
        if (!awardEvent) return false;
        if (!isValidAwardForReference(awardEvent, reference, pubkey))
          return true;
        return (
          definitionsByAddress.has(reference.definitionAddress) &&
          !incompleteDefinitionAddresses.has(reference.definitionAddress)
        );
      });

    badgesByPubkey.set(pubkey, { badges, complete });
  }

  return badgesByPubkey;
}
