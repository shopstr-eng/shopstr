import { EventTemplate } from "nostr-tools";
import {
  Community,
  CommunityRelays,
  NostrEvent,
} from "@/utils/types/types";
import { NostrSigner } from "@/utils/nostr/signers/nostr-signer";
import { NostrManager } from "@/utils/nostr/nostr-manager";
import { cacheEventToDatabase } from "@/utils/db/db-client";
import { finalizeAndSendNostrEvent } from "./nostr-helper-functions";

export async function createOrUpdateCommunity(
  signer: NostrSigner,
  nostr: NostrManager,
  details: {
    d: string;
    name: string;
    description: string;
    image: string;
    moderators: string[];
    relays?: CommunityRelays;
  }
) {
  const tags: string[][] = [
    ["d", details.d],
    ["name", details.name],
    ["description", details.description],
    ["image", details.image],
    ["t", "shopstr"],
  ];

  for (const mod_pk of details.moderators) {
    tags.push(["p", mod_pk, "", "moderator"]);
  }

  if (details.relays) {
    const {
      approvals = [],
      requests = [],
      metadata = [],
      all = [],
    } = details.relays;
    for (const r of approvals) tags.push(["relay", r, "approvals"]);
    for (const r of requests) tags.push(["relay", r, "requests"]);
    for (const r of metadata) tags.push(["relay", r, "metadata"]);
    for (const r of all) tags.push(["relay", r]);
  }

  const eventTemplate: EventTemplate = {
    kind: 34550,
    created_at: Math.floor(Date.now() / 1000),
    tags,
    content: "",
  };

  const signedEvent = await finalizeAndSendNostrEvent(
    signer,
    nostr,
    eventTemplate
  );
  if (signedEvent) {
    await cacheEventToDatabase(signedEvent).catch((error) =>
      console.error("Failed to cache community event to database:", error)
    );
  }
  return signedEvent;
}

export async function createCommunityPost(
  signer: NostrSigner,
  nostr: NostrManager,
  community: Community,
  content: string,
  options?: {
    parentEvent?: NostrEvent;
    crosspostCommunities?: Community[];
    externalId?: string;
    contentKind?: string;
  }
) {
  const communityAddress = `${community.kind}:${community.pubkey}:${community.d}`;
  const tags: string[][] = [];

  tags.push(["A", communityAddress]);
  tags.push(["P", community.pubkey]);
  tags.push(["K", String(community.kind)]);

  if (options?.parentEvent) {
    tags.push(["a", communityAddress]);
    tags.push(["e", options.parentEvent.id, ""]);
    tags.push(["p", options.parentEvent.pubkey, ""]);
    tags.push(["k", String(options.parentEvent.kind)]);
  } else {
    tags.push(["a", communityAddress]);
    tags.push(["p", community.pubkey]);
    tags.push(["k", String(community.kind)]);
  }

  if (options?.crosspostCommunities) {
    for (const c of options.crosspostCommunities) {
      const addr = `${c.kind}:${c.pubkey}:${c.d}`;
      tags.push(["a", addr]);
    }
  }

  if (options?.externalId) {
    tags.push(["i", options.externalId]);
    if (options?.contentKind) tags.push(["k", options.contentKind]);
  }

  const eventTemplate: EventTemplate = {
    kind: 1111,
    created_at: Math.floor(Date.now() / 1000),
    tags,
    content,
  };

  const signedEvent = await finalizeAndSendNostrEvent(
    signer,
    nostr,
    eventTemplate
  );
  if (signedEvent) {
    await cacheEventToDatabase(signedEvent).catch((error) =>
      console.error("Failed to cache community post event to database:", error)
    );
  }
  return signedEvent;
}

export async function approveCommunityPost(
  signer: NostrSigner,
  nostr: NostrManager,
  postToApprove: NostrEvent,
  community: Community
) {
  const communityAddress = `${community.kind}:${community.pubkey}:${community.d}`;
  const tags: string[][] = [
    ["a", communityAddress],
    ["e", postToApprove.id],
    ["p", postToApprove.pubkey],
    ["k", String(postToApprove.kind)],
  ];
  const eventTemplate: EventTemplate = {
    kind: 4550,
    created_at: Math.floor(Date.now() / 1000),
    tags,
    content: JSON.stringify(postToApprove),
  };

  const signedEvent = await finalizeAndSendNostrEvent(
    signer,
    nostr,
    eventTemplate
  );
  if (signedEvent) {
    await cacheEventToDatabase(signedEvent).catch((error) =>
      console.error(
        "Failed to cache community approval event to database:",
        error
      )
    );
  }
  return signedEvent;
}

export async function retractApproval(
  signer: NostrSigner,
  nostr: NostrManager,
  approvalEventId: string,
  reason?: string
) {
  const eventTemplate: EventTemplate = {
    kind: 5,
    created_at: Math.floor(Date.now() / 1000),
    tags: [["e", approvalEventId]],
    content: reason || `Retract approval ${approvalEventId}`,
  };
  return await finalizeAndSendNostrEvent(signer, nostr, eventTemplate);
}
