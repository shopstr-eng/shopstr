import * as CryptoJS from "crypto-js";
import { finalizeEvent, nip04, nip19, nip98, SimplePool } from "nostr-tools";
import axios from "axios";
import { NostrEvent } from "@/utils/types/types";
import { ProductFormValues } from "@/pages/api/nostr/post-event";

function containsRelay(relays: string[], relay: string): boolean {
  return relays.some((r) => r.includes(relay));
}

export async function PostListing(
  values: ProductFormValues,
  passphrase: string,
) {
  const { signInMethod, userPubkey, relays, writeRelays } =
    getLocalStorageData();
  const summary = values.find(([key]) => key === "summary")?.[1] || "";

  const dValue = values.find(([key]) => key === "d")?.[1] || undefined;

  const created_at = Math.floor(Date.now() / 1000);
  // Add "published_at" key
  const updatedValues = [...values, ["published_at", String(created_at)]];

  if (signInMethod === "extension") {
    const event = {
      created_at: created_at,
      kind: 30402,
      // kind: 30018,
      tags: updatedValues,
      content: summary,
    };

    const recEvent = {
      kind: 31989,
      tags: [
        ["d", "30402"],
        [
          "a",
          "31990:" + userPubkey + ":" + dValue,
          "wss://relay.damus.io",
          "web",
        ],
      ],
      content: "",
      created_at: Math.floor(Date.now() / 1000),
    };

    const handlerEvent = {
      kind: 31990,
      tags: [
        ["d", dValue],
        ["k", "30402"],
        ["web", "https://shopstr.store/<bech-32>", "npub"],
      ],
      content: "",
      created_at: Math.floor(Date.now() / 1000),
    };

    const signedEvent = await window.nostr.signEvent(event);
    const signedRecEvent = await window.nostr.signEvent(recEvent);
    const signedHandlerEvent = await window.nostr.signEvent(handlerEvent);

    const pool = new SimplePool();

    const allWriteRelays = [...writeRelays, ...relays];
    const blastrRelay = "wss://nostr.mutinywallet.com";
    if (!containsRelay(allWriteRelays, blastrRelay)) {
      allWriteRelays.push(blastrRelay);
    }

    await Promise.any(pool.publish(allWriteRelays, signedEvent));
    await Promise.any(pool.publish(allWriteRelays, signedRecEvent));
    await Promise.any(pool.publish(allWriteRelays, signedHandlerEvent));
    return signedEvent;
  } else {
    const allWriteRelays = [...writeRelays, ...relays];
    const blastrRelay = "wss://nostr.mutinywallet.com";
    if (!containsRelay(allWriteRelays, blastrRelay)) {
      allWriteRelays.push(blastrRelay);
    }
    const res = await axios({
      method: "POST",
      url: "/api/nostr/post-event",
      headers: {
        "Content-Type": "application/json",
      },
      data: {
        pubkey: userPubkey,
        privkey: getPrivKeyWithPassphrase(passphrase),
        created_at: created_at,
        kind: 30402,
        // kind: 30018,
        tags: updatedValues,
        content: summary,
        relays: allWriteRelays,
      },
    });
    return {
      id: res.data.id,
      pubkey: userPubkey,
      created_at: created_at,
      kind: 30402,
      tags: updatedValues,
      content: summary,
    };
  }
}

interface EncryptedMessageEvent {
  pubkey: string;
  created_at: number;
  content: string;
  kind: number;
  tags: string[][];
}

export async function constructEncryptedMessageEvent(
  senderPubkey: string,
  message: string,
  recipientPubkey: string,
  passphrase?: string,
): Promise<EncryptedMessageEvent> {
  let encryptedContent = "";
  let signInMethod = getLocalStorageData().signInMethod;
  if (signInMethod === "extension") {
    encryptedContent = await window.nostr.nip04.encrypt(
      recipientPubkey,
      message,
    );
  } else if (signInMethod === "nsec") {
    if (!passphrase) {
      throw new Error("Passphrase is required");
    }
    let senderPrivkey = getPrivKeyWithPassphrase(passphrase) as Uint8Array;
    encryptedContent = await nip04.encrypt(
      senderPrivkey,
      recipientPubkey,
      message,
    );
  }
  let encryptedMessageEvent = {
    pubkey: senderPubkey,
    created_at: Math.floor(Date.now() / 1000),
    content: encryptedContent,
    kind: 4,
    tags: [["p", recipientPubkey]],
  };
  return encryptedMessageEvent;
}

export async function sendEncryptedMessage(
  encryptedMessageEvent: EncryptedMessageEvent,
  passphrase?: string,
): Promise<NostrEvent> {
  const { signInMethod, relays, writeRelays } = getLocalStorageData();
  let signedEvent;
  if (signInMethod === "extension") {
    signedEvent = await window.nostr.signEvent(encryptedMessageEvent);
  } else {
    if (!passphrase) throw new Error("Passphrase is required");
    let senderPrivkey = getPrivKeyWithPassphrase(passphrase) as Uint8Array;
    signedEvent = finalizeEvent(encryptedMessageEvent, senderPrivkey);
  }
  const pool = new SimplePool();
  const allWriteRelays = [...writeRelays, ...relays];
  const blastrRelay = "wss://nostr.mutinywallet.com";
  if (!containsRelay(allWriteRelays, blastrRelay)) {
    allWriteRelays.push(blastrRelay);
  }
  await Promise.any(pool.publish(allWriteRelays, signedEvent));
  return signedEvent;
}

export async function finalizeAndSendNostrEvent(
  nostrEvent: NostrEvent,
  passphrase?: string,
) {
  try {
    const { signInMethod, relays, writeRelays } = getLocalStorageData();
    let signedEvent;
    if (signInMethod === "extension") {
      signedEvent = await window.nostr.signEvent(nostrEvent);
    } else {
      if (!passphrase) throw new Error("Passphrase is required");
      let senderPrivkey = getPrivKeyWithPassphrase(passphrase) as Uint8Array;
      signedEvent = finalizeEvent(nostrEvent, senderPrivkey);
    }
    const pool = new SimplePool();
    const allWriteRelays = [...writeRelays, ...relays];
    const blastrRelay = "wss://nostr.mutinywallet.com";
    if (!containsRelay(allWriteRelays, blastrRelay)) {
      allWriteRelays.push(blastrRelay);
    }
    await Promise.any(pool.publish(allWriteRelays, signedEvent));
  } catch (e: any) {
    console.log("Error: ", e);
    alert("Failed to send event: " + e.message);
    return { error: e };
  }
}

export type NostrBuildResponse = {
  status: "success" | "error";
  message: string;
  data: {
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
  }[];
};

export type DraftNostrEvent = Omit<NostrEvent, "pubkey" | "id" | "sig">;

export async function nostrBuildUploadImages(
  images: File[],
  sign?: (draft: DraftNostrEvent) => Promise<NostrEvent>,
) {
  if (images.some((img) => !img.type.includes("image")))
    throw new Error("Only images are supported");

  const url = "https://nostr.build/api/v2/upload/files";

  const payload = new FormData();
  images.forEach((image) => {
    payload.append("file[]", image);
  });

  const headers: HeadersInit = {};
  if (sign) {
    const token = await nip98.getToken(url, "POST", sign, true);
    headers.Authorization = token;
  }

  const response = await fetch(url, {
    body: payload,
    method: "POST",
    headers,
  }).then((res) => res.json() as Promise<NostrBuildResponse>);

  return response.data;
}

/***** HELPER FUNCTIONS *****/

// function to validate public and private keys
export function validateNPubKey(publicKey: string) {
  const validPubKey = /^npub[a-zA-Z0-9]{59}$/;
  return publicKey.match(validPubKey) !== null;
}
export function validateNSecKey(privateKey: string) {
  const validPrivKey = /^nsec[a-zA-Z0-9]{59}$/;
  return privateKey.match(validPrivKey) !== null;
}

async function sha256Hex(string: string | undefined) {
  const utf8 = new TextEncoder().encode(string);

  const hashBuffer = await crypto.subtle.digest("SHA-256", utf8);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray
    .map((bytes) => bytes.toString(16).padStart(2, "0"))
    .join("");
  return hashHex;
}

export function validPassphrase(passphrase: string) {
  try {
    let nsec = getNsecWithPassphrase(passphrase);
    if (!nsec) return false; // invalid passphrase
  } catch (e) {
    return false; // invalid passphrase
  }
  return true; // valid passphrase
}

export function getNsecWithPassphrase(passphrase: string) {
  if (!passphrase) return undefined;
  const { encryptedPrivateKey } = getLocalStorageData();
  let nsec = CryptoJS.AES.decrypt(
    encryptedPrivateKey as string,
    passphrase,
  ).toString(CryptoJS.enc.Utf8);
  // returns undefined or "" thanks to the toString method
  return nsec;
}

export function getPrivKeyWithPassphrase(passphrase: string) {
  const nsec = getNsecWithPassphrase(passphrase);
  if (!nsec) return undefined;
  let { data } = nip19.decode(nsec);
  return data;
}

const LOCALSTORAGECONSTANTS = {
  signInMethod: "signInMethod",
  userNPub: "userNPub",
  userPubkey: "userPubkey",
  encryptedPrivateKey: "encryptedPrivateKey",
  relays: "relays",
  readRelays: "readRelays",
  writeRelays: "writeRelays",
  mints: "mints",
  tokens: "tokens",
  history: "history",
  wot: "wot",
};

export const setLocalStorageDataOnSignIn = ({
  signInMethod,
  pubkey,
  encryptedPrivateKey,
  relays,
  readRelays,
  writeRelays,
  mints,
  wot,
}: {
  signInMethod: string;
  pubkey: string;
  encryptedPrivateKey?: string;
  relays?: string[];
  readRelays?: string[];
  writeRelays?: string[];
  mints?: string[];
  wot?: number;
}) => {
  localStorage.setItem(LOCALSTORAGECONSTANTS.signInMethod, signInMethod);
  localStorage.setItem(
    LOCALSTORAGECONSTANTS.userNPub,
    nip19.npubEncode(pubkey),
  );
  localStorage.setItem(LOCALSTORAGECONSTANTS.userPubkey, pubkey);
  if (encryptedPrivateKey) {
    localStorage.setItem(
      LOCALSTORAGECONSTANTS.encryptedPrivateKey,
      encryptedPrivateKey,
    );
  }

  localStorage.setItem(
    LOCALSTORAGECONSTANTS.relays,
    JSON.stringify(
      relays && relays.length != 0
        ? relays
        : [
            "wss://relay.damus.io",
            "wss://nos.lol",
            "wss://nostr.mutinywallet.com",
            "wss://purplepag.es",
          ],
    ),
  );

  localStorage.setItem(
    LOCALSTORAGECONSTANTS.readRelays,
    JSON.stringify(readRelays && readRelays.length != 0 ? readRelays : []),
  );

  localStorage.setItem(
    LOCALSTORAGECONSTANTS.writeRelays,
    JSON.stringify(writeRelays && writeRelays.length != 0 ? writeRelays : []),
  );

  localStorage.setItem(
    LOCALSTORAGECONSTANTS.mints,
    JSON.stringify(mints ? mints : ["https://mint.minibits.cash/Bitcoin"]),
  );

  localStorage.setItem(LOCALSTORAGECONSTANTS.wot, String(wot ? wot : 3));

  window.dispatchEvent(new Event("storage"));
};

export const isUserLoggedIn = () => {
  const { signInMethod, userNPub, userPubkey } = getLocalStorageData();
  if (!signInMethod || !userNPub || !userPubkey) return false;
  return true;
};

export interface LocalStorageInterface {
  signInMethod: string; // extension or nsec
  userNPub: string;
  userPubkey: string;
  relays: string[];
  readRelays: string[];
  writeRelays: string[];
  mints: string[];
  tokens: [];
  history: [];
  wot: number;
  encryptedPrivateKey?: string;
}

export const getLocalStorageData = (): LocalStorageInterface => {
  let signInMethod;
  let encryptedPrivateKey;
  let userNPub;
  let userPubkey;
  let relays;
  let readRelays;
  let writeRelays;
  let mints;
  let tokens;
  let history;
  let wot;

  if (typeof window !== "undefined") {
    userNPub = localStorage.getItem(LOCALSTORAGECONSTANTS.userNPub);
    userPubkey = localStorage.getItem(LOCALSTORAGECONSTANTS.userPubkey);
    if (!userPubkey && userNPub) {
      const { data } = nip19.decode(userNPub);
      userPubkey = data;
    }

    encryptedPrivateKey = localStorage.getItem(
      LOCALSTORAGECONSTANTS.encryptedPrivateKey,
    );

    signInMethod = localStorage.getItem(LOCALSTORAGECONSTANTS.signInMethod);

    if (signInMethod) {
      // remove old data
      localStorage.removeItem("npub");
      localStorage.removeItem("signIn");
      localStorage.removeItem("chats");
    }

    const relaysString = localStorage.getItem(LOCALSTORAGECONSTANTS.relays);
    relays = relaysString ? (JSON.parse(relaysString) as string[]) : [];

    const defaultRelays = [
      "wss://relay.damus.io",
      "wss://nos.lol",
      "wss://nostr.mutinywallet.com",
      "wss://purplepag.es",
    ];

    if (relays && relays.length === 0) {
      relays = defaultRelays;
      localStorage.setItem("relays", JSON.stringify(relays));
    } else {
      try {
        if (relays) {
          relays = relays.filter((r) => r);
        }
      } catch {
        relays = defaultRelays;
        localStorage.setItem("relays", JSON.stringify(relays));
      }
    }

    readRelays = localStorage.getItem(LOCALSTORAGECONSTANTS.readRelays)
      ? (
          JSON.parse(
            localStorage.getItem(LOCALSTORAGECONSTANTS.readRelays) as string,
          ) as string[]
        ).filter((r) => r)
      : [];

    writeRelays = localStorage.getItem(LOCALSTORAGECONSTANTS.writeRelays)
      ? (
          JSON.parse(
            localStorage.getItem(LOCALSTORAGECONSTANTS.writeRelays) as string,
          ) as string[]
        ).filter((r) => r)
      : [];

    mints = localStorage.getItem(LOCALSTORAGECONSTANTS.mints)
      ? JSON.parse(localStorage.getItem("mints") as string)
      : null;

    if (
      mints === null ||
      mints[0] ===
        "https://legend.lnbits.com/cashu/api/v1/AptDNABNBXv8gpuywhx6NV" ||
      mints[0] ===
        "https://legend.lnbits.com/cashu/api/v1/4gr9Xcmz3XEkUNwiBiQGoC"
    ) {
      mints = ["https://mint.minibits.cash/Bitcoin"];
      localStorage.setItem(LOCALSTORAGECONSTANTS.mints, JSON.stringify(mints));
    }

    tokens = localStorage.getItem(LOCALSTORAGECONSTANTS.tokens)
      ? JSON.parse(localStorage.getItem("tokens") as string)
      : localStorage.setItem(LOCALSTORAGECONSTANTS.tokens, JSON.stringify([]));

    history = localStorage.getItem(LOCALSTORAGECONSTANTS.history)
      ? JSON.parse(localStorage.getItem("history") as string)
      : localStorage.setItem(LOCALSTORAGECONSTANTS.history, JSON.stringify([]));

    wot = localStorage.getItem(LOCALSTORAGECONSTANTS.wot)
      ? Number(localStorage.getItem(LOCALSTORAGECONSTANTS.wot))
      : 3;
  }
  return {
    signInMethod: signInMethod as string,
    encryptedPrivateKey: encryptedPrivateKey as string,
    userNPub: userNPub as string,
    userPubkey: userPubkey as string,
    relays: relays || [],
    readRelays: readRelays || [],
    writeRelays: writeRelays || [],
    mints,
    tokens: tokens || [],
    history: history || [],
    wot: wot || 3,
  };
};

export const LogOut = () => {
  // remove old data
  localStorage.removeItem("npub");
  localStorage.removeItem("signIn");
  localStorage.removeItem("chats");

  localStorage.removeItem(LOCALSTORAGECONSTANTS.signInMethod);
  localStorage.removeItem(LOCALSTORAGECONSTANTS.userNPub);
  localStorage.removeItem(LOCALSTORAGECONSTANTS.userPubkey);
  localStorage.removeItem(LOCALSTORAGECONSTANTS.encryptedPrivateKey);

  window.dispatchEvent(new Event("storage"));
};

export const decryptNpub = (npub: string) => {
  const { data } = nip19.decode(npub);
  return data;
};

export function nostrExtensionLoaded() {
  if (!window.nostr) {
    return false;
  }
  return true;
}
