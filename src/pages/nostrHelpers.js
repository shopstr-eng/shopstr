export async function createNostrDeleteEvent(event_ids, pubkey, content, privkey) {
  let msg = {
      kind: 5, // NIP-X - Deletion
      content: content, // Deletion Reason
      tags: []
  };
  try {
    // Sign event
    msg = await window.nostr.signEvent(msg)
  } catch (e) {
    console.log("Failed to sign message with browser extension", e)
  }
  
  for (let event_id of event_ids) {
    msg.tags.push(["e", event_id])
  }

  // set msg fields
  msg.created_at = Math.floor((new Date()).getTime() / 1000)
  msg.pubkey = pubkey
  if (privkey) msg.privkey = privkey
  
  // Generate event id
  msg.id = await generateNostrEventId(msg)
  
  return msg;
}

export function nostrExtensionLoaded() {
  if (!window.nostr) {
    return false;
  }
  return true;
}

function sha256Hex(string) {
  const utf8 = new TextEncoder().encode(string);

  return crypto.subtle.digest('SHA-256', utf8).then((hashBuffer) => {
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      const hashHex = hashArray
        .map((bytes) => bytes.toString(16).padStart(2, '0'))
        .join('');

      return hashHex;
  });
}

async function generateNostrEventId(msg) {
  const digest = [
      0,
      msg.pubkey,
      msg.created_at,
      msg.kind,
      msg.tags,
      msg.content,
  ];
  const digest_str = JSON.stringify(digest);
  const hash = await sha256Hex(digest_str);

  return hash;
}