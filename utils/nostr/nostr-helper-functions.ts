import {
  finalizeEvent,
  generateSecretKey,
  getPublicKey,
  nip19,
  nip44,
  nip98,
  SimplePool,
} from "nostr-tools";
import CryptoJS from "crypto-js";
import { v4 as uuidv4 } from "uuid";
import { NostrEvent, ProductFormValues } from "@/utils/types/types";
import { ProductData } from "@/utils/parsers/product-parser-functions";
import { Proof } from "@cashu/cashu-ts";
import { NostrSigner } from "@/utils/nostr/signers/nostr-signer";
import { NostrManager } from "@/utils/nostr/nostr-manager";
import { removeProductFromCache } from "@/utils/nostr/cache-service";

function containsRelay(relays: string[], relay: string): boolean {
  return relays.some((r) => r.includes(relay));
}

function generateRandomTimestamp(): number {
  const now = Math.floor(Date.now() / 1000);
  const twoDaysInMilliseconds = 172800;
  const randomSeconds = Math.floor(Math.random() * (twoDaysInMilliseconds + 1));
  const randomTimestamp = now - randomSeconds;
  return randomTimestamp;
}

export async function generateKeys(): Promise<{ nsec: string; npub: string }> {
  const sk = generateSecretKey();
  const nsec = nip19.nsecEncode(sk);

  const pk = getPublicKey(sk);
  const npub = nip19.npubEncode(pk);

  return { nsec, npub };
}

function generateEventId(event: EncryptedMessageEvent) {
  // Step 1: Create the array structure
  const eventArray = [
    0,
    event.pubkey.toLowerCase(),
    event.created_at,
    event.kind,
    event.tags,
    event.content,
  ];

  // Step 2: JSON stringify the array with custom replacer for proper escaping
  const serialized = JSON.stringify(eventArray, (_, value) => {
    if (typeof value === "string") {
      return value
        .replace(/\\/g, "\\\\")
        .replace(/\n/g, "\\n")
        .replace(/"/g, '\\"')
        .replace(/\r/g, "\\r")
        .replace(/\t/g, "\\t")
        .replace(/\b/g, "\\b")
        .replace(/\f/g, "\\f");
    }
    return value;
  });

  // Step 3: Create SHA256 hash of the serialized string
  const hashHex = CryptoJS.SHA256(serialized).toString(CryptoJS.enc.Hex);
  return hashHex;
}

export async function deleteEvent(
  nostr: NostrManager,
  signer: NostrSigner,
  event_ids_to_delete: string[]
) {
  const userPubkey: string = await signer.getPubKey();
  const deletionEvent = await createNostrDeleteEvent(
    nostr,
    signer,
    event_ids_to_delete,
    userPubkey,
    "NIP-99 listing deletion request"
  );

  await finalizeAndSendNostrEvent(signer, nostr, deletionEvent);
  await removeProductFromCache(event_ids_to_delete);
}

export async function createNostrDeleteEvent(
  nostr: NostrManager,
  signer: NostrSigner,
  event_ids: string[],
  pubkey: string,
  content: string
) {
  if (!signer || !nostr) throw new Error("Login required");
  const msg = {
    kind: 5,
    content: content,
    tags: [],
    created_at: Math.floor(Date.now() / 1000),
    pubkey,
    id: "",
    sig: "",
  } as NostrEvent;

  for (const event_id of event_ids) {
    msg.tags.push(["e", event_id]);
  }

  return msg;
}

interface BunkerTokenParams {
  remotePubkey: string;
  relays: string[];
  secret?: string;
}

export function parseBunkerToken(token: string): BunkerTokenParams | null {
  try {
    if (!token.startsWith("bunker://")) {
      return null;
    }

    // Extract the basic parts using URL
    const url = new URL(token.replace("bunker://", "https://"));

    // Get pubkey (hostname in URL)
    const remotePubkey = url.hostname;

    // Get relays from query params (can have multiple relay params)
    const relays = url.searchParams.getAll("relay");

    // Get optional secret
    const secret = url.searchParams.get("secret") || undefined;

    return {
      remotePubkey,
      relays,
      secret,
    };
  } catch (error) {
    console.error("Failed to parse bunker token:", error);
    return null;
  }
}

export async function createNostrProfileEvent(
  nostr: NostrManager,
  signer: NostrSigner,
  pubkey: string,
  content: string
) {
  const msg = {
    kind: 0,
    content: content,
    tags: [],
    created_at: Math.floor(Date.now() / 1000),
    pubkey: pubkey,
    id: "",
    sig: "",
  } as NostrEvent;

  await finalizeAndSendNostrEvent(signer, nostr, msg);
  return msg;
}

export async function PostListing(
  values: ProductFormValues,
  signer: NostrSigner,
  isLoggedIn: boolean,
  nostr: NostrManager
) {
  const { relays, writeRelays } = getLocalStorageData();

  if (!signer || !isLoggedIn) throw new Error("Login required");
  const userPubkey = await signer.getPubKey();

  if (!nostr) throw new Error("Nostr writer required");

  const summary = values.find(([key]) => key === "summary")?.[1] || "";

  const created_at = Math.floor(Date.now() / 1000);
  const updatedValues = [...values, ["published_at", String(created_at)]];

  const event = {
    created_at: created_at,
    kind: 30402,
    tags: updatedValues,
    content: summary,
  };

  const handlerDTag = uuidv4();

  const origin =
    window && typeof window !== undefined
      ? window.location.origin
      : "https://shopstr.store";

  const handlerEvent = {
    kind: 31990,
    tags: [
      ["d", handlerDTag],
      ["k", "30402"],
      ["web", `${origin}/marketplace/<bech-32>`, "npub"],
      ["web", `${origin}/listing/<bech-32>`, "naddr"],
    ],
    content: "",
    created_at: Math.floor(Date.now() / 1000),
  };

  const recEvent = {
    kind: 31989,
    tags: [
      ["d", "30402"],
      ["a", "31990:" + userPubkey! + ":" + handlerDTag!, relays[0]!, "web"],
    ],
    content: "",
    created_at: Math.floor(Date.now() / 1000),
  };

  const signedEvent = await signer.sign(event);
  const signedRecEvent = await signer.sign(recEvent);
  const signedHandlerEvent = await signer.sign(handlerEvent);

  const allWriteRelays = withBlastr([...writeRelays, ...relays]);
  await nostr.publish(signedEvent, allWriteRelays);
  await nostr.publish(signedRecEvent, allWriteRelays);
  await nostr.publish(signedHandlerEvent, allWriteRelays);

  return signedEvent;
}

export async function createNostrShopEvent(
  nostr: NostrManager,
  signer: NostrSigner,
  pubkey: string,
  content: string
) {
  const msg = {
    kind: 30019, // NIP-15 - Stall Metadata
    content: content,
    tags: [],
    created_at: Math.floor(Date.now() / 1000),
    pubkey: pubkey,
    id: "",
    sig: "",
  } as NostrEvent;

  await finalizeAndSendNostrEvent(signer, nostr, msg);
  return msg;
}

interface EncryptedMessageEvent {
  pubkey: string;
  created_at: number;
  content: string;
  kind: number;
  tags: string[][];
}

interface GiftWrappedMessageEvent {
  id: string;
  pubkey: string;
  created_at: number;
  content: string;
  kind: number;
  tags: string[][];
}

export async function constructGiftWrappedEvent(
  senderPubkey: string,
  recipientPubkey: string,
  message: string,
  subject: string,
  options: {
    kind?: number;
    orderId?: string;
    type?: number;
    paymentType?: string;
    paymentProof?: string;
    paymentMint?: string;
    orderAmount?: number;
    status?: string;
    productData?: ProductData;
    quantity?: number;
    productAddress?: string;
    tracking?: string;
    carrier?: string;
    eta?: number;
    isOrder?: boolean;
  } = {}
): Promise<GiftWrappedMessageEvent> {
  const { relays } = getLocalStorageData();
  const {
    kind,
    orderId,
    type,
    paymentType,
    paymentProof,
    paymentMint,
    orderAmount,
    status,
    productData,
    quantity,
    productAddress,
    tracking,
    carrier,
    eta,
    isOrder,
  } = options;

  const tags = [
    ["p", recipientPubkey, relays[0]!],
    ["subject", subject],
  ];

  // Add order-specific tags
  if (isOrder) {
    tags.push(["order", orderId ? orderId : uuidv4()]);

    if (type) tags.push(["type", type.toString()]);
    if (orderAmount) tags.push(["amount", orderAmount.toString()]);
    if (paymentType && paymentProof && paymentMint)
      tags.push(["payment", paymentType, paymentProof, paymentMint]);
    if (status) tags.push(["status", status]);
    if (tracking) tags.push(["tracking", tracking]);
    if (carrier) tags.push(["carrier", carrier]);
    if (eta) tags.push(["eta", eta.toString()]);

    // Handle product information for orders
    if (productData || productAddress) {
      tags.push([
        "item",
        productData
          ? `30402:${productData.pubkey}:${productData.d}`
          : productAddress!,
        quantity ? quantity.toString() : "1",
      ]);
    }
  } else {
    // Handle regular message product references
    if (productData) {
      tags.push([
        "a",
        `30402:${productData.pubkey}:${productData.d}`,
        relays[0]!,
      ]);
    } else if (productAddress) {
      tags.push(["a", productAddress, relays[0]!]);
    }
  }

  const bareEvent = {
    pubkey: senderPubkey,
    created_at: Math.floor(Date.now() / 1000),
    content: message,
    kind: kind ? kind : 14,
    tags,
  };

  const eventId = generateEventId(bareEvent);
  return {
    id: eventId,
    ...bareEvent,
  };
}

export async function constructMessageSeal(
  signer: NostrSigner,
  messageEvent: GiftWrappedMessageEvent,
  senderPubkey: string,
  recipientPubkey: string,
  randomPrivkey?: Uint8Array
): Promise<NostrEvent> {
  const stringifiedEvent = JSON.stringify(messageEvent);
  let encryptedContent;
  if (randomPrivkey) {
    const conversationKey = nip44.getConversationKey(
      randomPrivkey,
      recipientPubkey
    );
    encryptedContent = nip44.encrypt(stringifiedEvent, conversationKey);
  } else {
    encryptedContent = await signer.encrypt(recipientPubkey, stringifiedEvent);
  }

  const sealEvent = {
    pubkey: senderPubkey,
    created_at: generateRandomTimestamp(),
    content: encryptedContent,
    kind: 13,
    tags: [],
  };
  let signedEvent;
  if (randomPrivkey) {
    signedEvent = finalizeEvent(sealEvent, randomPrivkey);
  } else {
    signedEvent = await signer.sign(sealEvent);
  }
  return signedEvent;
}

export async function constructMessageGiftWrap(
  sealEvent: NostrEvent,
  randomPubkey: string,
  randomPrivkey: Uint8Array,
  recipientPubkey: string
): Promise<NostrEvent> {
  const { relays } = getLocalStorageData();
  const stringifiedEvent = JSON.stringify(sealEvent);
  const conversationKey = nip44.getConversationKey(
    randomPrivkey,
    recipientPubkey
  );
  const encryptedEvent = nip44.encrypt(stringifiedEvent, conversationKey);
  const giftWrapEvent = {
    pubkey: randomPubkey,
    created_at: generateRandomTimestamp(),
    content: encryptedEvent,
    kind: 1059,
    tags: [["p", recipientPubkey, relays[0]!]],
  };
  const signedEvent = finalizeEvent(giftWrapEvent, randomPrivkey);
  return signedEvent;
}

export async function sendGiftWrappedMessageEvent(
  giftWrappedMessageEvent: NostrEvent
) {
  const { relays, writeRelays } = getLocalStorageData();
  const pool = new SimplePool();
  const allWriteRelays = withBlastr([...writeRelays, ...relays]);

  await Promise.any(pool.publish(allWriteRelays, giftWrappedMessageEvent));
}

export async function publishReviewEvent(
  nostr: NostrManager,
  signer: NostrSigner,
  content: string,
  eventTags: string[][]
) {
  try {
    const { relays, writeRelays } = getLocalStorageData();
    const allWriteRelays = withBlastr([...writeRelays, ...relays]);

    const userPubkey = await signer?.getPubKey?.();

    const reviewEvent = {
      pubkey: userPubkey,
      created_at: Math.floor(Date.now() / 1000),
      content: content,
      kind: 31555,
      tags: eventTags,
    };

    const signedEvent = await signer.sign(reviewEvent);
    await nostr.publish(signedEvent, allWriteRelays);
  } catch (_) {
    return;
  }
}
export async function createNostrRelayEvent(
  nostr: NostrManager,
  signer: NostrSigner,
  pubkey: string
) {
  if (!signer || !nostr) throw new Error("Login required");
  const relayList = getLocalStorageData().relays;
  const readRelayList = getLocalStorageData().readRelays;
  const writeRelayList = getLocalStorageData().writeRelays;
  const relayTags = [];
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
  const relayEvent = {
    kind: 10002, // NIP-65 - Relay List Metadata
    content: "",
    tags: relayTags,
    created_at: Math.floor(Date.now() / 1000),
    pubkey: pubkey,
    id: "",
    sig: "",
  } as NostrEvent;

  relayEvent.created_at = Math.floor(new Date().getTime() / 1000);
  await finalizeAndSendNostrEvent(signer, nostr, relayEvent);
  return relayEvent;
}

export async function publishSavedForLaterEvent(
  nostr: NostrManager,
  signer: NostrSigner,
  type: "cart" | "saved",
  userPubkey: string,
  cartAddresses: string[][],
  product: ProductData,
  quantity?: number
) {
  try {
    const { relays, writeRelays } = getLocalStorageData();
    const allWriteRelays = withBlastr([...writeRelays, ...relays]);

    let cartTags: string[][] = [];

    if (quantity && quantity < 0) {
      cartTags = [...cartAddresses].filter(
        (address) => !address[1]!.includes(`:${product.d}`)
      );
    } else if (quantity && quantity > 0) {
      for (let i = 0; i < quantity; i++) {
        const productTag = ["a", "30402:" + product.pubkey + ":" + product.d];
        cartTags.push(productTag);
      }
    }

    cartTags.push(
      ...[
        ["d", uuidv4()],
        ["title", type],
      ]
    );
    const productAddressTags = JSON.stringify(cartTags);
    const encryptedContent = await signer.encrypt(
      userPubkey,
      productAddressTags
    );

    const cartEvent = {
      pubkey: userPubkey,
      created_at: Math.floor(Date.now() / 1000),
      content: encryptedContent,
      kind: 30405,
      tags: [],
    };

    const signedEvent = await signer.sign(cartEvent);

    await nostr.publish(signedEvent, allWriteRelays);
  } catch (_) {
    return;
  }
}

export async function publishWalletEvent(
  nostr: NostrManager,
  signer: NostrSigner
) {
  try {
    const { mints, relays, writeRelays } = getLocalStorageData();
    const userPubkey = await signer.getPubKey();

    const mintTagsSet = new Set<string>();

    let walletMints = [];

    const allWriteRelays = withBlastr([...relays, ...writeRelays]);
    mints.forEach((mint) => mintTagsSet.add(mint));
    walletMints = Array.from(mintTagsSet);
    const mintTags = walletMints.map((mint) => ["mint", mint]);
    const walletContent = [...mintTags];
    const cashuWalletEvent = {
      kind: 17375,
      tags: [],
      content: await window.nostr.nip44.encrypt(
        userPubkey,
        JSON.stringify(walletContent)
      ),
      created_at: Math.floor(Date.now() / 1000),
    };
    const signedEvent = await signer.sign(cashuWalletEvent);
    await nostr.publish(signedEvent, allWriteRelays);
  } catch (_) {
    return;
  }
}

export async function publishProofEvent(
  nostr: NostrManager,
  signer: NostrSigner,
  mint: string,
  proofs: Proof[],
  direction: "in" | "out",
  amount: string,
  deletedEventsArray?: string[]
) {
  try {
    const { relays, writeRelays } = getLocalStorageData();
    const allWriteRelays = withBlastr([...relays, ...writeRelays]);
    const userPubkey = await signer?.getPubKey?.();

    let signedEvent;
    if (proofs.length > 0) {
      const tokenArray = {
        mint: mint,
        proofs: proofs,
        ...(deletedEventsArray ? { del: deletedEventsArray } : {}),
      };
      const cashuProofEvent = {
        kind: 7375,
        tags: [],
        content: await signer!.encrypt(userPubkey, JSON.stringify(tokenArray)),
        created_at: Math.floor(Date.now() / 1000),
      };
      signedEvent = await signer!.sign(cashuProofEvent);
      await nostr.publish(signedEvent, allWriteRelays);
    }
    if (deletedEventsArray && deletedEventsArray.length > 0) {
      await deleteEvent(nostr!, signer!, deletedEventsArray);
    }

    await publishSpendingHistoryEvent(
      nostr!,
      signer!,
      direction,
      amount,
      signedEvent && signedEvent.id ? signedEvent.id : "",
      deletedEventsArray
    );
  } catch (_) {
    return;
  }
}

export async function publishSpendingHistoryEvent(
  nostr: NostrManager,
  signer: NostrSigner,
  direction: string,
  amount: string,
  keptEventId: string,
  sentEventIds?: string[]
) {
  try {
    const { relays, writeRelays } = getLocalStorageData();
    const allWriteRelays = withBlastr([...relays, ...writeRelays]);

    const eventContent = [
      ["direction", direction],
      ["amount", amount],
    ];
    const userPubkey = await signer?.getPubKey?.();
    if (sentEventIds && sentEventIds.length > 0) {
      sentEventIds.forEach((eventId) => {
        eventContent.push(["e", eventId, allWriteRelays[0]!, "destroyed"]);
      });
    }

    if (keptEventId !== "") {
      eventContent.push(["e", keptEventId, allWriteRelays[0]!, "created"]);
    }

    const cashuSpendingHistoryEvent = {
      kind: 7376,
      tags: [],
      content: await signer!.encrypt(userPubkey, JSON.stringify(eventContent)),
      created_at: Math.floor(Date.now() / 1000),
    };
    const signedEvent = await signer!.sign(cashuSpendingHistoryEvent);
    await nostr!.publish(signedEvent, allWriteRelays);
  } catch (_) {
    return;
  }
}

export async function finalizeAndSendNostrEvent(
  signer: NostrSigner,
  nostr: NostrManager,
  nostrEvent: NostrEvent
) {
  try {
    const { writeRelays, relays } = getLocalStorageData();
    const signedEvent = await signer.sign(nostrEvent);
    const allWriteRelays = withBlastr([...writeRelays, ...relays]);
    await nostr.publish(signedEvent, allWriteRelays);
  } catch (_) {
    return;
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
  sign?: (draft: DraftNostrEvent) => Promise<NostrEvent>
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
  clientPubkey: "clientPubkey",
  clientPrivkey: "clientPrivkey",
  bunkerRemotePubkey: "bunkerRemotePubkey",
  bunkerRelays: "bunkerRelays",
  bunkerSecret: "bunkerSecret",
  signer: "signer",
};

export const setLocalStorageDataOnSignIn = ({
  encryptedPrivateKey,
  relays,
  readRelays,
  writeRelays,
  mints,
  wot,
  clientPubkey,
  clientPrivkey,
  bunkerRemotePubkey,
  bunkerRelays,
  bunkerSecret,
  signer,
}: {
  encryptedPrivateKey?: string;
  relays?: string[];
  readRelays?: string[];
  writeRelays?: string[];
  mints?: string[];
  wot?: number;
  clientPubkey?: string;
  clientPrivkey?: string;
  bunkerRemotePubkey?: string;
  bunkerRelays?: string[];
  bunkerSecret?: string;
  signer?: NostrSigner;
}) => {
  if (encryptedPrivateKey) {
    localStorage.setItem(
      LOCALSTORAGECONSTANTS.encryptedPrivateKey,
      encryptedPrivateKey
    );
  }

  localStorage.setItem(
    LOCALSTORAGECONSTANTS.relays,
    JSON.stringify(relays && relays.length != 0 ? relays : getDefaultRelays())
  );

  localStorage.setItem(
    LOCALSTORAGECONSTANTS.readRelays,
    JSON.stringify(readRelays && readRelays.length != 0 ? readRelays : [])
  );

  localStorage.setItem(
    LOCALSTORAGECONSTANTS.writeRelays,
    JSON.stringify(writeRelays && writeRelays.length != 0 ? writeRelays : [])
  );

  localStorage.setItem(
    LOCALSTORAGECONSTANTS.mints,
    JSON.stringify(mints ? mints : [getDefaultMint()])
  );

  localStorage.setItem(LOCALSTORAGECONSTANTS.wot, String(wot ? wot : 3));

  if (clientPubkey && clientPrivkey && bunkerRemotePubkey && bunkerRelays) {
    localStorage.setItem(LOCALSTORAGECONSTANTS.clientPubkey, clientPubkey);
    localStorage.setItem(LOCALSTORAGECONSTANTS.clientPrivkey, clientPrivkey);
    localStorage.setItem(
      LOCALSTORAGECONSTANTS.bunkerRemotePubkey,
      bunkerRemotePubkey
    );
    localStorage.setItem(
      LOCALSTORAGECONSTANTS.bunkerRelays,
      JSON.stringify(
        bunkerRelays && bunkerRelays.length != 0 ? bunkerRelays : []
      )
    );
    if (bunkerSecret) {
      localStorage.setItem(LOCALSTORAGECONSTANTS.bunkerSecret, bunkerSecret);
    }
  }

  if (signer) {
    localStorage.setItem(LOCALSTORAGECONSTANTS.signer, JSON.stringify(signer));
  }

  window.dispatchEvent(new Event("storage"));
};

export interface LocalStorageInterface {
  /**
   * @deprecated
   */
  signInMethod: string; // deprecated
  relays: string[];
  readRelays: string[];
  writeRelays: string[];
  mints: string[];
  tokens: [];
  history: [];
  wot: number;
  encryptedPrivateKey?: string;
  clientPrivkey?: string;
  bunkerRemotePubkey?: string;
  bunkerRelays?: string[];
  bunkerSecret?: string;
  signer?: { [key: string]: string };
}

export const getLocalStorageData = (): LocalStorageInterface => {
  let signInMethod;
  let encryptedPrivateKey;
  let relays;
  let readRelays;
  let writeRelays;
  let mints;
  let tokens;
  let history;
  let wot;
  let clientPrivkey;
  let bunkerRemotePubkey;
  let bunkerRelays;
  let bunkerSecret;
  let signer;

  if (typeof window !== "undefined") {
    encryptedPrivateKey = localStorage.getItem(
      LOCALSTORAGECONSTANTS.encryptedPrivateKey
    );

    signInMethod = localStorage.getItem(LOCALSTORAGECONSTANTS.signInMethod);

    if (signInMethod) {
      // remove old data
      localStorage.removeItem("npub");
      localStorage.removeItem("signIn");
      localStorage.removeItem("chats");
      localStorage.removeItem("cashuWalletRelays");
    }

    const relaysString = localStorage.getItem(LOCALSTORAGECONSTANTS.relays);
    relays = relaysString ? (JSON.parse(relaysString) as string[]) : [];

    const defaultRelays = getDefaultRelays();

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
            localStorage.getItem(LOCALSTORAGECONSTANTS.readRelays) as string
          ) as string[]
        ).filter((r) => r)
      : [];

    writeRelays = localStorage.getItem(LOCALSTORAGECONSTANTS.writeRelays)
      ? (
          JSON.parse(
            localStorage.getItem(LOCALSTORAGECONSTANTS.writeRelays) as string
          ) as string[]
        ).filter((r) => r)
      : [];

    mints = localStorage.getItem(LOCALSTORAGECONSTANTS.mints)
      ? JSON.parse(localStorage.getItem("mints") as string)
      : null;

    if (mints === null) {
      mints = [getDefaultMint()];
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

    clientPrivkey = localStorage.getItem(LOCALSTORAGECONSTANTS.clientPrivkey)
      ? localStorage.getItem(LOCALSTORAGECONSTANTS.clientPrivkey)
      : undefined;
    bunkerRemotePubkey = localStorage.getItem(
      LOCALSTORAGECONSTANTS.bunkerRemotePubkey
    )
      ? localStorage.getItem(LOCALSTORAGECONSTANTS.bunkerRemotePubkey)
      : undefined;
    bunkerRelays = localStorage.getItem(LOCALSTORAGECONSTANTS.bunkerRelays)
      ? (
          JSON.parse(
            localStorage.getItem(LOCALSTORAGECONSTANTS.bunkerRelays) as string
          ) as string[]
        ).filter((r) => r)
      : [];
    bunkerSecret = localStorage.getItem(LOCALSTORAGECONSTANTS.bunkerSecret)
      ? localStorage.getItem(LOCALSTORAGECONSTANTS.bunkerSecret)
      : undefined;

    const signerData: string | null = localStorage.getItem(
      LOCALSTORAGECONSTANTS.signer
    );
    if (signerData) {
      signer = JSON.parse(signerData);
    } else {
      switch (signInMethod) {
        case "extension":
          signer = {
            type: "nip07",
          };
          break;
        case "bunker":
          let bunker =
            "bunker://" + bunkerRemotePubkey + "?secret=" + bunkerSecret;
          for (const relay of bunkerRelays) {
            bunker += "&relay=" + relay;
          }
          signer = {
            type: "nip46",
            bunker: bunker,
            appPrivKey: clientPrivkey,
          };
          break;
        case "nsec":
          signer = {
            type: "nsec",
            encryptedPrivKey: encryptedPrivateKey,
          };
          break;
      }
    }
  }
  return {
    signInMethod: signInMethod as string,
    encryptedPrivateKey: encryptedPrivateKey as string,
    relays: relays || [],
    readRelays: readRelays || [],
    writeRelays: writeRelays || [],
    mints,
    tokens: tokens || [],
    history: history || [],
    wot: wot || 3,
    clientPrivkey: clientPrivkey?.toString(),
    bunkerRemotePubkey: bunkerRemotePubkey?.toString(),
    bunkerRelays: bunkerRelays || [],
    bunkerSecret: bunkerSecret?.toString(),
    signer,
  };
};

export const LogOut = () => {
  // remove old data
  localStorage.removeItem("npub");
  localStorage.removeItem("signIn");
  localStorage.removeItem("chats");
  for (const key in LOCALSTORAGECONSTANTS) {
    localStorage.removeItem(key);
  }

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

export function getDefaultRelays(): string[] {
  return [
    "wss://relay.damus.io",
    "wss://nos.lol",
    "wss://purplepag.es",
    "wss://relay.primal.net",
    "wss://relay.nostr.band",
  ];
}

export function withBlastr(relays: string[]): string[] {
  const out = [...relays];

  const blastrRelay = "wss://sendit.nosflare.com";
  if (!containsRelay(out, blastrRelay)) {
    out.push(blastrRelay);
  }
  return out;
}

export function getDefaultMint(): string {
  return "https://mint.minibits.cash/Bitcoin";
}

export async function verifyNip05Identifier(
  nip05: string,
  pubkey: string
): Promise<boolean> {
  try {
    if (!nip05 || !pubkey) return false;

    const parts = nip05.split("@");
    if (parts.length !== 2) return false;

    const [username, domain] = parts;
    if (!username || !domain) return false;

    let url;
    try {
      url = `https://${domain}/.well-known/nostr.json?name=${username}`;
    } catch {
      return false;
    }

    try {
      // Use a timeout to prevent hanging requests
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout

      const response = await fetch(url, { signal: controller.signal });
      clearTimeout(timeoutId);

      if (!response.ok) return false;

      let data;
      try {
        data = await response.json();
      } catch {
        return false;
      }

      if (!data || typeof data !== "object") return false;

      const names = data.names || {};
      return (
        names[username] === pubkey || names[username.toLowerCase()] === pubkey
      );
    } catch {
      // This will catch fetch errors, timeout errors, etc.
      return false;
    }
  } catch {
    // Catch any unexpected errors
    return false;
  }
}
