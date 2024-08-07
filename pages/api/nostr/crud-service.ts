import {
  finalizeAndSendNostrEvent,
  getLocalStorageData,
} from "@/components/utility/nostr-helper-functions";
import { NostrEvent } from "@/utils/types/types";
import { removeProductFromCache } from "./cache-service";

export async function DeleteEvent(
  event_ids_to_delete: string[],
  passphrase?: string,
) {
  const { userPubkey } = getLocalStorageData();
  let deletionEvent = await createNostrDeleteEvent(
    event_ids_to_delete,
    userPubkey,
    "user deletion request from shopstr.store",
  );

  await finalizeAndSendNostrEvent(deletionEvent, passphrase);
  await removeProductFromCache(event_ids_to_delete);
}

export async function createNostrDeleteEvent(
  event_ids: string[],
  pubkey: string,
  content: string,
) {
  let msg = {
    kind: 5, // NIP-X - Deletion
    content: content, // Deletion Reason
    tags: [],
    created_at: 0,
    pubkey: "",
    id: "",
    sig: "",
  } as NostrEvent;

  for (let event_id of event_ids) {
    msg.tags.push(["e", event_id]);
  }

  msg.created_at = Math.floor(new Date().getTime() / 1000);
  msg.pubkey = pubkey;
  return msg;
}

export async function createNostrProfileEvent(
  pubkey: string,
  content: string,
  passphrase: string,
) {
  let msg = {
    kind: 0, // NIP-1 - Profile
    content: content,
    tags: [],
    created_at: 0,
    pubkey: pubkey,
    id: "",
    sig: "",
  } as NostrEvent;

  msg.created_at = Math.floor(new Date().getTime() / 1000);
  await finalizeAndSendNostrEvent(msg, passphrase);
  return msg;
}

export async function createNostrShopEvent(
  pubkey: string,
  content: string,
  passphrase: string,
) {
  let msg = {
    kind: 30019, // NIP-15 - Stall Metadata
    content: content,
    tags: [],
    created_at: 0,
    pubkey: pubkey,
    id: "",
    sig: "",
  } as NostrEvent;

  msg.created_at = Math.floor(new Date().getTime() / 1000);
  await finalizeAndSendNostrEvent(msg, passphrase);
  return msg;
}

export async function createNostrRelayEvent(
  pubkey: string,
  passphrase: string,
) {
  const relayList = getLocalStorageData().relays;
  const readRelayList = getLocalStorageData().readRelays;
  const writeRelayList = getLocalStorageData().writeRelays;
  let relayTags = [];
  if (relayList.length != 0) {
    for (const relay of relayList) {
      const relayTag = ["r", relay];
      relayTags.push(relayTag);
    }
  }
  if (readRelayList.length != 0) {
    for (const relay of readRelayList) {
      const relayTag = ["r", relay, "read"];
      relayTags.push(relayTag);
    }
  }
  if (writeRelayList.length != 0) {
    for (const relay of writeRelayList) {
      const relayTag = ["r", relay, "write"];
      relayTags.push(relayTag);
    }
  }
  let relayEvent = {
    kind: 10002, // NIP-65 - Relay List Metadata
    content: "",
    tags: relayTags,
    created_at: 0,
    pubkey: pubkey,
    id: "",
    sig: "",
  } as NostrEvent;

  relayEvent.created_at = Math.floor(new Date().getTime() / 1000);
  await finalizeAndSendNostrEvent(relayEvent, passphrase);
  return relayEvent;
}
