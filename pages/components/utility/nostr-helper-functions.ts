import * as CryptoJS from "crypto-js";
import { nip19, nip98, SimplePool } from "nostr-tools";
import { ProductFormValues } from "../api/post-event";
import axios from "axios";

export async function PostListing(
  values: ProductFormValues,
  passphrase: string,
) {
  const { signIn, encryptedPrivateKey, decryptedNpub, relays } =
    getLocalStorageData();
  const summary = values.find(([key]) => key === "summary")?.[1] || "";

  const created_at = Math.floor(Date.now() / 1000);
  // Add "published_at" key
  const updatedValues = [...values, ["published_at", String(created_at)]];

  if (signIn === "extension") {
    const event = {
      created_at: created_at,
      kind: 30402,
      // kind: 30018,
      tags: updatedValues,
      content: summary,
    };

    const signedEvent = await window.nostr.signEvent(event);

    const pool = new SimplePool();

    await Promise.any(pool.publish(relays, signedEvent));
  } else {
    axios({
      method: "POST",
      url: "/api/nostr/post-event",
      headers: {
        "Content-Type": "application/json",
      },
      data: {
        pubkey: decryptedNpub,
        privkey: getPrivKeyWithPassphrase(passphrase),
        created_at: created_at,
        kind: 30402,
        // kind: 30018,
        tags: updatedValues,
        content: summary,
        relays: relays,
      },
    });
  }
}

export async function DeleteListing(
  event_ids_to_delete: ProductFormValues,
  passphrase: string,
) {
  const { signIn, decryptedNpub, relays } = getLocalStorageData();
  let deletionEvent = await createNostrDeleteEvent(
    event_ids_to_delete,
    decryptedNpub,
    "user deletion request",
    signIn == "extension" ? undefined : getPrivKeyWithPassphrase(passphrase),
  );

  if (signIn === "extension") {
    const signedEvent = await window.nostr.signEvent(deletionEvent);
    const pool = new SimplePool();

    await Promise.any(pool.publish(relays, signedEvent));
  } else {
    axios({
      method: "POST",
      url: "/api/nostr/post-event",
      headers: {
        "Content-Type": "application/json",
      },
      data: {
        ...deletionEvent,
        relays: relays,
      },
    });
  }
}

type NostrBuildResponse = {
  status: "success" | "error";
  message: string;
  data: [
    {
      input_name: "APIv2";
      name: string;
      url: string;
      thumbnail: string;
      responsive: {
        "240p": string;
        "360p": string;
        "480p": string;
        "720p": string;
        "1080p": string;
      };
      blurhash: string;
      sha256: string;
      type: "picture" | "video";
      mime: string;
      size: number;
      metadata: Record<string, string>;
      dimensions: {
        width: number;
        height: number;
      };
    },
  ];
};

export type NostrEvent = {
  id: string;
  pubkey: string;
  created_at: number;
  kind: number;
  tags: Tag[];
  content: string;
  sig: string;
};

export type DraftNostrEvent = Omit<NostrEvent, "pubkey" | "id" | "sig">;

export async function nostrBuildUploadImage(
  image: File,
  sign?: (draft: DraftNostrEvent) => Promise<NostrEvent>,
) {
  if (!image.type.includes("image"))
    throw new Error("Only images are supported");

  const url = "https://nostr.build/api/v2/upload/files";

  const payload = new FormData();
  payload.append("fileToUpload", image);

  const headers: HeadersInit = {};
  if (sign) {
    // @ts-ignore
    const token = await nip98.getToken(url, "POST", sign, true);
    headers.Authorization = token;
  }

  const response = await fetch(url, {
    body: payload,
    method: "POST",
    headers,
  }).then((res) => res.json() as Promise<NostrBuildResponse>);

  return response.data[0];
}

/***** HELPER FUNCTIONS *****/

// function to validate public and private keys
export function validateNPubKey(publicKey) {
  const validPubKey = /^npub[a-zA-Z0-9]{59}$/;
  return publicKey.match(validPubKey) !== null;
}
export function validateNSecKey(privateKey) {
  const validPrivKey = /^nsec[a-zA-Z0-9]{59}$/;
  return privateKey.match(validPrivKey) !== null;
}

function sha256Hex(string) {
  const utf8 = new TextEncoder().encode(string);

  return crypto.subtle.digest("SHA-256", utf8).then((hashBuffer) => {
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray
      .map((bytes) => bytes.toString(16).padStart(2, "0"))
      .join("");

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

export function getPubKey() {
  const npub = localStorage.getItem("npub");
  const { data } = nip19.decode(npub);
  return data;
}

export function getNsecWithPassphrase(passphrase: string) {
  if (!passphrase) return undefined;
  const { encryptedPrivateKey } = getLocalStorageData();
  let nsec = CryptoJS.AES.decrypt(encryptedPrivateKey, passphrase).toString(
    CryptoJS.enc.Utf8,
  );
  // returns undefined or "" thanks to the toString method
  return nsec;
}

export function getPrivKeyWithPassphrase(passphrase: string) {
  let { data } = nip19.decode(getNsecWithPassphrase(passphrase));
  return data;
}

export const getLocalStorageData = () => {
  let signIn;
  let encryptedPrivateKey;
  let decryptedNpub;
  let relays;
  let mints;

  if (typeof window !== "undefined") {
    const npub = localStorage.getItem("npub");
    if (npub) {
      const { data } = nip19.decode(npub);
      decryptedNpub = data;
    }
    encryptedPrivateKey = localStorage.getItem("encryptedPrivateKey");
    signIn = localStorage.getItem("signIn");
    const storedRelays = localStorage.getItem("relays");
    relays = storedRelays ? JSON.parse(storedRelays) : [];
    const storedMints = localStorage.getItem("mints");
    mints = storedMints ? JSON.parse(storedMints) : [];
  }
  return { signIn, encryptedPrivateKey, decryptedNpub, relays, mints };
};

export const decryptNpub = (nPub: string) => {
  const { data } = nip19.decode(nPub);
  return data;
};

export async function createNostrDeleteEvent(
  event_ids: [string],
  pubkey: string,
  content: string,
  privkey: String,
) {
  let msg = {
    kind: 5, // NIP-X - Deletion
    content: content, // Deletion Reason
    tags: [],
  };

  for (let event_id of event_ids) {
    msg.tags.push(["e", event_id]);
  }

  // set msg fields
  msg.created_at = Math.floor(new Date().getTime() / 1000);
  msg.pubkey = pubkey;
  if (privkey) msg.privkey = privkey;

  // Generate event id
  msg.id = await generateNostrEventId(msg);
  return msg;
}

export function nostrExtensionLoaded() {
  if (!window.nostr) {
    return false;
  }
  return true;
}
