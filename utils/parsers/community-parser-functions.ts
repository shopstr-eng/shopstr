import { NostrEvent } from "nostr-tools";
import { Community, CommunityRelays } from "../types/types";

// Helper: push into categorized relays
function addRelayToMap(
  map: Record<string, string[]>,
  url: string,
  type?: string
) {
  if (!url) return;
  map.all = map.all || [];
  if (!map.all.includes(url)) map.all.push(url);
  if (!type) {
    // no type -> treat as request relay by default (backwards compat)
    map.requests = map.requests || [];
    if (!map.requests.includes(url)) map.requests.push(url);
    return;
  }
  const key = type.toLowerCase();
  map[key] = map[key] || [];
  const list = map[key];
  if (list && !list.includes(url)) list.push(url);
}

export const parseCommunityEvent = (event: NostrEvent): Community | null => {
  if (event.kind !== 34550) return null;

  const dTag = event.tags.find((tag) => tag[0] === "d")?.[1];
  if (!dTag) return null; // d tag is required by NIP-72

  const nameTag = event.tags.find((tag) => tag[0] === "name")?.[1];
  const descriptionTag = event.tags.find(
    (tag) => tag[0] === "description"
  )?.[1];
  const imageTag = event.tags.find((tag) => tag[0] === "image")?.[1];

  // moderators: p tags that optionally use the 4th element as role marker "moderator"
  const moderators = event.tags
    .filter(
      (tag) => tag[0] === "p" && (tag[3] === "moderator" || tag.length >= 2)
    )
    .map((tag) => tag[1])
    .filter((pubkey): pubkey is string => !!pubkey);

  // parse relay tags: ["relay", "<url>", "<type>"] where type may be "approvals", "requests", "metadata"
  const relayMap: Record<string, string[]> = {
    approvals: [],
    requests: [],
    metadata: [],
    all: [],
  };
  const relayTags = event.tags.filter((tag) => tag[0] === "relay");
  for (const r of relayTags) {
    const url = r[1];
    if (url) {
      const type = r.length >= 3 ? r[2] : undefined;
      addRelayToMap(relayMap, url, type);
    }
  }

  // fallback: if no relays declared at all, leave all empty
  const relays: CommunityRelays = {
    approvals: relayMap.approvals || [],
    requests: relayMap.requests || [],
    metadata: relayMap.metadata || [],
    all: relayMap.all || [],
  };

  return {
    id: event.id,
    kind: event.kind,
    pubkey: event.pubkey,
    createdAt: event.created_at,
    d: dTag,
    name: nameTag || dTag,
    description: descriptionTag || "",
    image: imageTag || `https://robohash.org/${event.id}`,
    moderators: Array.from(new Set([event.pubkey, ...moderators])),
    relays,
    relaysList: relays.all.length ? relays.all : undefined,
  };
};
