import {
  finalizeAndSendNostrEvent,
  generateNostrEventId,
  getLocalStorageData,
} from "@/components/utility/nostr-helper-functions";
import { NostrEvent } from "@/pages/types";
import { removeProductFromCache } from "./cache-service";

export async function DeleteListing(
  event_ids_to_delete: string[],
  passphrase?: string,
) {
  const { decryptedNpub } = getLocalStorageData();
  let deletionEvent = await createNostrDeleteEvent(
    event_ids_to_delete,
    decryptedNpub,
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
  msg.id = await generateNostrEventId(msg);
  return msg;
}
