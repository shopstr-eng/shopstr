import CryptoJS from "crypto-js";
import {
  Filter,
  finalizeEvent,
  generateSecretKey,
  getPublicKey,
  nip04,
  nip19,
  nip44,
  nip98,
  SimplePool,
} from "nostr-tools";
import { NostrEvent, ProductFormValues } from "@/utils/types/types";
import { ProductData } from "@/components/utility/product-parser-functions";
import { Proof } from "@cashu/cashu-ts";
import { DateTime } from "luxon";
import { removeProductFromCache } from "../../pages/api/nostr/cache-service";

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
  const crypto = require("crypto");
  const hash = crypto.createHash("sha256");
  hash.update(serialized);
  return hash.digest("hex");
}

export async function DeleteEvent(
  event_ids_to_delete: string[],
  passphrase?: string,
) {
  const { userPubkey } = getLocalStorageData();
  let deletionEvent = await createNostrDeleteEvent(
    event_ids_to_delete,
    userPubkey,
    "NIP-99 listing deletion request",
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
    kind: 5,
    content: content,
    tags: [],
    created_at: Math.floor(Date.now() / 1000),
    pubkey,
    id: "",
    sig: "",
  } as NostrEvent;

  for (let event_id of event_ids) {
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

export async function sendBunkerRequest(
  method: string,
  requestIdString: string,
  event?: any,
  content?: string,
  thirdPartyPubkey?: string,
  clientPubkey?: string,
  clientPrivkey?: string,
  bunkerRemotePubkey?: string,
  bunkerRelays?: string[],
  bunkerSecret?: string,
) {
  const storage = getLocalStorageData();
  const finalClientPubkey = clientPubkey || storage.clientPubkey;
  const finalClientPrivkey = clientPrivkey || storage.clientPrivkey;
  const finalBunkerRemotePubkey =
    bunkerRemotePubkey || storage.bunkerRemotePubkey;
  const finalBunkerRelays = bunkerRelays || storage.bunkerRelays;
  const finalBunkerSecret = bunkerSecret || storage.bunkerSecret;

  if (
    !finalClientPubkey ||
    !finalClientPrivkey ||
    !finalBunkerRemotePubkey ||
    !finalBunkerRelays
  ) {
    return;
  }

  let request;
  if (
    method === "connect" &&
    finalClientPubkey &&
    finalClientPrivkey &&
    finalBunkerRemotePubkey &&
    finalBunkerRelays
  ) {
    request = {
      id: requestIdString,
      method: method,
      params: finalBunkerSecret
        ? [finalBunkerRemotePubkey, finalBunkerSecret]
        : [finalBunkerRemotePubkey],
    };
  } else {
    if (method === "sign_event" && event) {
      request = {
        id: requestIdString,
        method: method,
        params: [JSON.stringify(event)],
      };
    } else if (method === "get_relays" || method === "get_public_key") {
      request = {
        id: requestIdString,
        method: method,
        params: [],
      };
    } else if (
      method === "nip44_encrypt" ||
      (method === "nip44_decrypt" && thirdPartyPubkey) ||
      method === "nip04_encrypt" ||
      (method === "nip04_decrypt" && thirdPartyPubkey)
    ) {
      request = {
        id: requestIdString,
        method: method,
        params: [thirdPartyPubkey, content],
      };
    }
  }

  let decodedClientPrivkey = nip19.decode(finalClientPrivkey);
  let decodedClientPubkey = nip19.decode(finalClientPubkey);

  let conversationKey = nip44.getConversationKey(
    decodedClientPrivkey.data as Uint8Array,
    finalBunkerRemotePubkey,
  );
  let encryptedContent = nip44.encrypt(
    JSON.stringify(request),
    conversationKey,
  );

  let requestEvent = {
    kind: 24133,
    pubkey: decodedClientPubkey.data as string,
    content: encryptedContent,
    created_at: Math.floor(Date.now() / 1000),
    tags: [["p", finalBunkerRemotePubkey]],
  };
  let signedEvent = finalizeEvent(
    requestEvent,
    decodedClientPrivkey.data as Uint8Array,
  );

  const pool = new SimplePool();
  await Promise.any(pool.publish(finalBunkerRelays, signedEvent));
}

export async function awaitBunkerResponse(
  requestIdString: string,
  clientPubkey?: string,
  clientPrivkey?: string,
  bunkerRemotePubkey?: string,
  bunkerRelays?: string[],
): Promise<any> {
  const storage = getLocalStorageData();
  const finalClientPubkey = clientPubkey || storage.clientPubkey;
  const finalClientPrivkey = clientPrivkey || storage.clientPrivkey;
  const finalBunkerRemotePubkey =
    bunkerRemotePubkey || storage.bunkerRemotePubkey;
  const finalBunkerRelays = bunkerRelays || storage.bunkerRelays;

  if (
    !finalClientPubkey ||
    !finalClientPrivkey ||
    !finalBunkerRemotePubkey ||
    !finalBunkerRelays
  ) {
    return;
  }

  let decodedClientPrivkey = nip19.decode(finalClientPrivkey);
  let decodedClientPubkey = nip19.decode(finalClientPubkey);
  let conversationKey = nip44.getConversationKey(
    decodedClientPrivkey.data as Uint8Array,
    finalBunkerRemotePubkey,
  );
  return new Promise(async function (resolve, reject) {
    try {
      const pool = new SimplePool();
      let since = Math.trunc(DateTime.now().minus({ days: 1 }).toSeconds());
      const filter: Filter = {
        kinds: [24133],
        authors: [finalBunkerRemotePubkey],
        "#p": [decodedClientPubkey.data as string],
        since,
      };
      let responseResult: any;
      let h = pool.subscribeMany(finalBunkerRelays, [filter], {
        onevent(event) {
          let responseContent = nip44.decrypt(event.content, conversationKey);
          let responseId = JSON.parse(responseContent).id;
          if (responseId === requestIdString) {
            responseResult = JSON.parse(responseContent).result;
          }
        },
        oneose() {
          h.close();
          resolve(responseResult);
        },
      });
    } catch (error) {
      reject(error);
    }
  });
}

export async function createNostrProfileEvent(
  pubkey: string,
  content: string,
  passphrase: string,
) {
  let msg = {
    kind: 0,
    content: content,
    tags: [],
    created_at: Math.floor(Date.now() / 1000),
    pubkey: pubkey,
    id: "",
    sig: "",
  } as NostrEvent;

  await finalizeAndSendNostrEvent(msg, passphrase);
  return msg;
}

export async function PostListing(
  values: ProductFormValues,
  passphrase: string,
): Promise<NostrEvent> {
  const { signInMethod, userPubkey, relays, writeRelays } =
    getLocalStorageData();
  const summary = values.find(([key]) => key === "summary")?.[1] || "";

  const created_at = Math.floor(Date.now() / 1000);
  const updatedValues = [...values, ["published_at", String(created_at)]];

  const event = {
    created_at: created_at,
    kind: 30402,
    tags: updatedValues,
    content: summary,
  };

  const handlerDTag = crypto.randomUUID();

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
      ["a", "31990:" + userPubkey + ":" + handlerDTag, relays[0], "web"],
    ],
    content: "",
    created_at: Math.floor(Date.now() / 1000),
  };

  let signedEvent;
  let signedHandlerEvent;
  let signedRecEvent;

  if (signInMethod === "extension") {
    signedEvent = await window.nostr.signEvent(event);
    signedHandlerEvent = await window.nostr.signEvent(handlerEvent);
    if (signedHandlerEvent) {
      signedRecEvent = await window.nostr.signEvent(recEvent);
    }
  } else if (signInMethod === "bunker") {
    const signEventId = crypto.randomUUID();
    await sendBunkerRequest("sign_event", signEventId, event);
    while (!signedEvent) {
      signedEvent = await awaitBunkerResponse(signEventId);
      if (!signedEvent) {
        await new Promise((resolve) => setTimeout(resolve, 2100));
      }
    }
    signedEvent = JSON.parse(signedEvent);
    const signHandlerEventId = crypto.randomUUID();
    await sendBunkerRequest("sign_event", signHandlerEventId, handlerEvent);
    while (!signedHandlerEvent) {
      signedHandlerEvent = await awaitBunkerResponse(signHandlerEventId);
      if (!signedHandlerEvent) {
        await new Promise((resolve) => setTimeout(resolve, 2100));
      }
    }
    signedHandlerEvent = JSON.parse(signedHandlerEvent);
    if (signedHandlerEvent) {
      const signRecEventId = crypto.randomUUID();
      await sendBunkerRequest("sign_event", signRecEventId, recEvent);
      while (!signedRecEvent) {
        signedRecEvent = await awaitBunkerResponse(signRecEventId);
        if (!signedRecEvent) {
          await new Promise((resolve) => setTimeout(resolve, 2100));
        }
      }
      signedRecEvent = JSON.parse(signedRecEvent);
    }
  } else {
    if (!passphrase) throw new Error("Passphrase is required");
    let sk = getPrivKeyWithPassphrase(passphrase) as Uint8Array;
    signedEvent = finalizeEvent(event, sk);
    signedHandlerEvent = finalizeEvent(handlerEvent, sk);
    if (signedHandlerEvent) {
      signedRecEvent = finalizeEvent(recEvent, sk);
    }
  }

  const pool = new SimplePool();

  const allWriteRelays = [...writeRelays, ...relays];
  const blastrRelay = "wss://sendit.nosflare.com";
  if (!containsRelay(allWriteRelays, blastrRelay)) {
    allWriteRelays.push(blastrRelay);
  }

  await Promise.any(pool.publish(allWriteRelays, signedEvent));
  await Promise.any(pool.publish(allWriteRelays, signedHandlerEvent));
  await Promise.any(pool.publish(allWriteRelays, signedRecEvent));

  return signedEvent;
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
    created_at: Math.floor(Date.now() / 1000),
    pubkey: pubkey,
    id: "",
    sig: "",
  } as NostrEvent;

  await finalizeAndSendNostrEvent(msg, passphrase);
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
  } = {},
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

  let tags = [
    ["p", recipientPubkey, relays[0]],
    ["subject", subject],
  ];

  // Add order-specific tags
  if (isOrder) {
    tags.push(["order", orderId ? orderId : crypto.randomUUID()]);

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
        relays[0],
      ]);
    } else if (productAddress) {
      tags.push(["a", productAddress, relays[0]]);
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
  messageEvent: GiftWrappedMessageEvent,
  senderPubkey: string,
  recipientPubkey: string,
  passphrase?: string,
  randomPrivkey?: Uint8Array,
): Promise<NostrEvent> {
  let stringifiedEvent = JSON.stringify(messageEvent);
  let encryptedContent;
  const { signInMethod } = getLocalStorageData();
  if (randomPrivkey) {
    let conversationKey = nip44.getConversationKey(
      randomPrivkey,
      recipientPubkey,
    );
    encryptedContent = nip44.encrypt(stringifiedEvent, conversationKey);
  } else {
    if (signInMethod === "extension") {
      encryptedContent = await window.nostr.nip44.encrypt(
        recipientPubkey,
        stringifiedEvent,
      );
    } else if (signInMethod === "bunker") {
      const encryptId = crypto.randomUUID();
      await sendBunkerRequest(
        "nip44_encrypt",
        encryptId,
        undefined,
        stringifiedEvent,
        recipientPubkey,
      );
      while (!encryptedContent) {
        encryptedContent = await awaitBunkerResponse(encryptId);
        if (!encryptedContent) {
          await new Promise((resolve) => setTimeout(resolve, 2100));
        }
      }
    } else if (signInMethod === "nsec") {
      if (!passphrase) {
        throw new Error("Passphrase is required");
      }
      let senderPrivkey = getPrivKeyWithPassphrase(passphrase) as Uint8Array;
      let conversationKey = nip44.getConversationKey(
        senderPrivkey,
        recipientPubkey,
      );
      encryptedContent = nip44.encrypt(stringifiedEvent, conversationKey);
    }
  }

  let sealEvent = {
    pubkey: senderPubkey,
    created_at: generateRandomTimestamp(),
    content: encryptedContent,
    kind: 13,
    tags: [],
  };
  let signedEvent;
  if (randomPrivkey) {
    signedEvent = finalizeEvent(sealEvent, randomPrivkey);
  } else if (signInMethod === "extension") {
    signedEvent = await window.nostr.signEvent(sealEvent);
  } else if (signInMethod === "bunker") {
    const signEventId = crypto.randomUUID();
    await sendBunkerRequest("sign_event", signEventId, sealEvent);
    while (!signedEvent) {
      signedEvent = await awaitBunkerResponse(signEventId);
      if (!signedEvent) {
        await new Promise((resolve) => setTimeout(resolve, 2100));
      }
    }
    signedEvent = JSON.parse(signedEvent);
  } else if (signInMethod === "nsec") {
    if (!passphrase) throw new Error("Passphrase is required");
    let senderPrivkey = getPrivKeyWithPassphrase(passphrase) as Uint8Array;
    signedEvent = finalizeEvent(sealEvent, senderPrivkey);
  }
  return signedEvent;
}

export async function constructMessageGiftWrap(
  sealEvent: NostrEvent,
  randomPubkey: string,
  randomPrivkey: Uint8Array,
  recipientPubkey: string,
): Promise<NostrEvent> {
  const { relays } = getLocalStorageData();
  let stringifiedEvent = JSON.stringify(sealEvent);
  let conversationKey = nip44.getConversationKey(
    randomPrivkey,
    recipientPubkey,
  );
  let encryptedEvent = nip44.encrypt(stringifiedEvent, conversationKey);
  let giftWrapEvent = {
    pubkey: randomPubkey,
    created_at: generateRandomTimestamp(),
    content: encryptedEvent,
    kind: 1059,
    tags: [["p", recipientPubkey, relays[0]]],
  };
  let signedEvent = finalizeEvent(giftWrapEvent, randomPrivkey);
  return signedEvent;
}

export async function sendGiftWrappedMessageEvent(
  giftWrappedMessageEvent: NostrEvent,
) {
  const { relays, writeRelays } = getLocalStorageData();
  const pool = new SimplePool();
  const allWriteRelays = [...writeRelays, ...relays];
  const blastrRelay = "wss://sendit.nosflare.com";
  if (!containsRelay(allWriteRelays, blastrRelay)) {
    allWriteRelays.push(blastrRelay);
  }
  await Promise.any(pool.publish(allWriteRelays, giftWrappedMessageEvent));
}

export async function publishReviewEvent(
  content: string,
  eventTags: string[][],
  passphrase?: string,
) {
  try {
    const { userPubkey, relays, writeRelays, signInMethod } =
      getLocalStorageData();
    const allWriteRelays = [...relays, ...writeRelays];
    const blastrRelay = "wss://sendit.nosflare.com";
    if (!containsRelay(allWriteRelays, blastrRelay)) {
      allWriteRelays.push(blastrRelay);
    }
    let reviewEvent = {
      pubkey: userPubkey,
      created_at: Math.floor(Date.now() / 1000),
      content: content,
      kind: 31555,
      tags: eventTags,
    };
    let signedEvent;
    if (signInMethod === "extension") {
      signedEvent = await window.nostr.signEvent(reviewEvent);
    } else if (signInMethod === "bunker") {
      const signEventId = crypto.randomUUID();
      await sendBunkerRequest("sign_event", signEventId, reviewEvent);
      while (!signedEvent) {
        signedEvent = await awaitBunkerResponse(signEventId);
        if (!signedEvent) {
          await new Promise((resolve) => setTimeout(resolve, 2100));
        }
      }
      signedEvent = JSON.parse(signedEvent);
    } else if (signInMethod === "nsec") {
      if (!passphrase) throw new Error("Passphrase is required");
      let senderPrivkey = getPrivKeyWithPassphrase(passphrase) as Uint8Array;
      signedEvent = finalizeEvent(reviewEvent, senderPrivkey);
    }
    const pool = new SimplePool();
    await Promise.any(pool.publish(allWriteRelays, signedEvent));
  } catch (e: any) {
    alert("Failed to send event: " + e.message);
    return { error: e };
  }
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
    created_at: Math.floor(Date.now() / 1000),
    pubkey: pubkey,
    id: "",
    sig: "",
  } as NostrEvent;

  await finalizeAndSendNostrEvent(relayEvent, passphrase);
  return relayEvent;
}

export async function publishSavedForLaterEvent(
  type: "cart" | "saved",
  userPubkey: string,
  cartAddresses: string[][],
  product: ProductData,
  quantity?: number,
  passphrase?: string,
) {
  try {
    const { relays, writeRelays, signInMethod } = getLocalStorageData();
    const allWriteRelays = [...relays, ...writeRelays];
    const blastrRelay = "wss://sendit.nosflare.com";
    if (!containsRelay(allWriteRelays, blastrRelay)) {
      allWriteRelays.push(blastrRelay);
    }
    let cartTags: string[][] = [];
    if (quantity && quantity < 0) {
      cartTags = [...cartAddresses].filter(
        (address) => !address[1].includes(`:${product.d}`),
      );
    } else if (quantity && quantity > 0) {
      for (let i = 0; i < quantity; i++) {
        const productTag = ["a", "30402:" + product.pubkey + ":" + product.d];
        cartTags.push(productTag);
      }
    }
    cartTags.push(
      ...[
        ["d", crypto.randomUUID()],
        ["title", type],
      ],
    );
    let productAddressTags = JSON.stringify(cartTags);
    let encryptedContent;
    if (signInMethod === "extension") {
      encryptedContent = await window.nostr.nip04.encrypt(
        userPubkey,
        productAddressTags,
      );
    } else if (signInMethod === "bunker") {
      const encryptId = crypto.randomUUID();
      await sendBunkerRequest(
        "nip04_encrypt",
        encryptId,
        undefined,
        productAddressTags,
        userPubkey,
      );
      while (!encryptedContent) {
        encryptedContent = await awaitBunkerResponse(encryptId);
        if (!encryptedContent) {
          await new Promise((resolve) => setTimeout(resolve, 2100));
        }
      }
    } else if (signInMethod === "nsec") {
      if (!passphrase) {
        throw new Error("Passphrase is required");
      }
      let senderPrivkey = getPrivKeyWithPassphrase(passphrase) as Uint8Array;
      encryptedContent = await nip04.encrypt(
        senderPrivkey,
        userPubkey,
        productAddressTags,
      );
    }
    let cartEvent = {
      pubkey: userPubkey,
      created_at: Math.floor(Date.now() / 1000),
      content: encryptedContent,
      kind: 30405,
      tags: [],
    };
    let signedEvent;
    if (signInMethod === "extension") {
      signedEvent = await window.nostr.signEvent(cartEvent);
    } else if (signInMethod === "bunker") {
      const signEventId = crypto.randomUUID();
      await sendBunkerRequest("sign_event", signEventId, cartEvent);
      while (!signedEvent) {
        signedEvent = await awaitBunkerResponse(signEventId);
        if (!signedEvent) {
          await new Promise((resolve) => setTimeout(resolve, 2100));
        }
      }
      signedEvent = JSON.parse(signedEvent);
    } else if (signInMethod === "nsec") {
      if (!passphrase) throw new Error("Passphrase is required");
      let senderPrivkey = getPrivKeyWithPassphrase(passphrase) as Uint8Array;
      signedEvent = finalizeEvent(cartEvent, senderPrivkey);
    }
    const pool = new SimplePool();
    await Promise.any(pool.publish(allWriteRelays, signedEvent));
  } catch (e: any) {
    alert("Failed to send event: " + e.message);
    return { error: e };
  }
}

export async function publishWalletEvent(passphrase?: string) {
  try {
    const { signInMethod, relays, writeRelays, mints, userPubkey } =
      getLocalStorageData();

    let mintTagsSet = new Set<string>();

    let walletMints = [];

    const allWriteRelays = [...relays, ...writeRelays];
    const blastrRelay = "wss://sendit.nosflare.com";
    if (!containsRelay(allWriteRelays, blastrRelay)) {
      allWriteRelays.push(blastrRelay);
    }
    mints.forEach((mint) => mintTagsSet.add(mint));
    walletMints = Array.from(mintTagsSet);
    const mintTags = walletMints.map((mint) => ["mint", mint]);
    const walletContent = [...mintTags];
    let signedEvent;
    if (signInMethod === "extension") {
      const cashuWalletEvent = {
        kind: 17375,
        tags: [],
        content: await window.nostr.nip44.encrypt(
          userPubkey,
          JSON.stringify(walletContent),
        ),
        created_at: Math.floor(Date.now() / 1000),
      };
      signedEvent = await window.nostr.signEvent(cashuWalletEvent);
    } else if (signInMethod === "bunker") {
      const cashuWalletEvent = {
        kind: 17375,
        tags: [],
        content: await (async (): Promise<string> => {
          const encryptId = crypto.randomUUID();
          await sendBunkerRequest(
            "nip44_encrypt",
            encryptId,
            undefined,
            JSON.stringify(walletContent),
            userPubkey,
          );
          let encryptedContent;
          while (!encryptedContent) {
            encryptedContent = await awaitBunkerResponse(encryptId);
            if (!encryptedContent) {
              await new Promise((resolve) => setTimeout(resolve, 2100));
            }
          }
          return encryptedContent;
        })(),
        created_at: Math.floor(Date.now() / 1000),
      };
      const signEventId = crypto.randomUUID();
      await sendBunkerRequest("sign_event", signEventId, cashuWalletEvent);
      while (!signedEvent) {
        signedEvent = await awaitBunkerResponse(signEventId);
        if (!signedEvent) {
          await new Promise((resolve) => setTimeout(resolve, 2100));
        }
      }
      signedEvent = JSON.parse(signedEvent);
    } else {
      if (!passphrase) throw new Error("Passphrase is required");
      let senderPrivkey = getPrivKeyWithPassphrase(passphrase) as Uint8Array;
      const conversationKey = nip44.getConversationKey(
        senderPrivkey,
        userPubkey,
      );
      const cashuWalletEvent = {
        kind: 17375,
        tags: [],
        content: nip44.encrypt(JSON.stringify(walletContent), conversationKey),
        created_at: Math.floor(Date.now() / 1000),
      };
      signedEvent = finalizeEvent(cashuWalletEvent, senderPrivkey);
    }
    const pool = new SimplePool();
    await Promise.any(pool.publish(allWriteRelays, signedEvent));
  } catch (e: any) {
    alert("Failed to send event: " + e.message);
    return { error: e };
  }
}

export async function publishProofEvent(
  mint: string,
  proofs: Proof[],
  direction: "in" | "out",
  amount: string,
  passphrase?: string,
  deletedEventsArray?: string[],
) {
  try {
    const { userPubkey, signInMethod, relays, writeRelays } =
      getLocalStorageData();
    const allWriteRelays = [...relays, ...writeRelays];
    const blastrRelay = "wss://sendit.nosflare.com";
    if (!containsRelay(allWriteRelays, blastrRelay)) {
      allWriteRelays.push(blastrRelay);
    }

    let signedEvent;
    if (proofs.length > 0) {
      const tokenArray = {
        mint: mint,
        proofs: proofs,
        ...(deletedEventsArray ? { del: deletedEventsArray } : {}),
      };

      if (signInMethod === "extension") {
        const cashuProofEvent = {
          kind: 7375,
          tags: [],
          content: await window.nostr.nip44.encrypt(
            userPubkey,
            JSON.stringify(tokenArray),
          ),
          created_at: Math.floor(Date.now() / 1000),
        };
        signedEvent = await window.nostr.signEvent(cashuProofEvent);
      } else if (signInMethod === "bunker") {
        const cashuWalletEvent = {
          kind: 7375,
          tags: [],
          content: await (async (): Promise<string> => {
            const encryptId = crypto.randomUUID();
            await sendBunkerRequest(
              "nip44_encrypt",
              encryptId,
              undefined,
              JSON.stringify(tokenArray),
              userPubkey,
            );
            let encryptedContent;
            while (!encryptedContent) {
              encryptedContent = await awaitBunkerResponse(encryptId);
              if (!encryptedContent) {
                await new Promise((resolve) => setTimeout(resolve, 2100));
              }
            }
            return encryptedContent;
          })(),
          created_at: Math.floor(Date.now() / 1000),
        };
        const signEventId = crypto.randomUUID();
        await sendBunkerRequest("sign_event", signEventId, cashuWalletEvent);
        while (!signedEvent) {
          signedEvent = await awaitBunkerResponse(signEventId);
          if (!signedEvent) {
            await new Promise((resolve) => setTimeout(resolve, 2100));
          }
        }
        signedEvent = JSON.parse(signedEvent);
      } else {
        if (!passphrase) throw new Error("Passphrase is required");
        let senderPrivkey = getPrivKeyWithPassphrase(passphrase) as Uint8Array;
        const conversationKey = nip44.getConversationKey(
          senderPrivkey,
          userPubkey,
        );

        const cashuProofEvent = {
          kind: 7375,
          tags: [],
          content: nip44.encrypt(JSON.stringify(tokenArray), conversationKey),
          created_at: Math.floor(Date.now() / 1000),
        };
        signedEvent = finalizeEvent(cashuProofEvent, senderPrivkey);
      }

      const pool = new SimplePool();
      await Promise.any(pool.publish(allWriteRelays, signedEvent));
    }

    if (deletedEventsArray && deletedEventsArray.length > 0) {
      await DeleteEvent(deletedEventsArray, passphrase);
    }

    await publishSpendingHistoryEvent(
      direction,
      amount,
      signedEvent && signedEvent.id ? signedEvent.id : "",
      deletedEventsArray,
      passphrase,
    );
  } catch (e: any) {
    alert("Failed to send event: " + e.message);
    return { error: e };
  }
}

export async function publishSpendingHistoryEvent(
  direction: string,
  amount: string,
  keptEventId: string,
  sentEventIds?: string[],
  passphrase?: string,
) {
  try {
    const { userPubkey, signInMethod, relays, writeRelays } =
      getLocalStorageData();
    const allWriteRelays = [...relays, ...writeRelays];
    const blastrRelay = "wss://sendit.nosflare.com";
    if (!containsRelay(allWriteRelays, blastrRelay)) {
      allWriteRelays.push(blastrRelay);
    }
    const eventContent = [
      ["direction", direction],
      ["amount", amount],
    ];

    if (sentEventIds && sentEventIds.length > 0) {
      sentEventIds.forEach((eventId) => {
        eventContent.push(["e", eventId, allWriteRelays[0], "destroyed"]);
      });
    }

    if (keptEventId !== "") {
      eventContent.push(["e", keptEventId, allWriteRelays[0], "created"]);
    }

    let signedEvent;
    if (signInMethod === "extension") {
      const cashuSpendingHistoryEvent = {
        kind: 7376,
        tags: [],
        content: await window.nostr.nip44.encrypt(
          userPubkey,
          JSON.stringify(eventContent),
        ),
        created_at: Math.floor(Date.now() / 1000),
      };
      signedEvent = await window.nostr.signEvent(cashuSpendingHistoryEvent);
    } else if (signInMethod === "bunker") {
      const cashuWalletEvent = {
        kind: 7376,
        tags: [],
        content: await (async (): Promise<string> => {
          const encryptId = crypto.randomUUID();
          await sendBunkerRequest(
            "nip44_encrypt",
            encryptId,
            undefined,
            JSON.stringify(eventContent),
            userPubkey,
          );
          let encryptedContent;
          while (!encryptedContent) {
            encryptedContent = await awaitBunkerResponse(encryptId);
            if (!encryptedContent) {
              await new Promise((resolve) => setTimeout(resolve, 2100));
            }
          }
          return encryptedContent;
        })(),
        created_at: Math.floor(Date.now() / 1000),
      };
      const signEventId = crypto.randomUUID();
      await sendBunkerRequest("sign_event", signEventId, cashuWalletEvent);
      while (!signedEvent) {
        signedEvent = await awaitBunkerResponse(signEventId);
        if (!signedEvent) {
          await new Promise((resolve) => setTimeout(resolve, 2100));
        }
      }
      signedEvent = JSON.parse(signedEvent);
    } else {
      if (!passphrase) throw new Error("Passphrase is required");
      let senderPrivkey = getPrivKeyWithPassphrase(passphrase) as Uint8Array;
      const conversationKey = nip44.getConversationKey(
        senderPrivkey,
        userPubkey,
      );

      const cashuSpendingHistoryEvent = {
        kind: 7376,
        tags: [],
        content: nip44.encrypt(JSON.stringify(eventContent), conversationKey),
        created_at: Math.floor(Date.now() / 1000),
      };
      signedEvent = finalizeEvent(cashuSpendingHistoryEvent, senderPrivkey);
    }

    const pool = new SimplePool();
    await Promise.any(pool.publish(allWriteRelays, signedEvent));
  } catch (e: any) {
    alert("Failed to send event: " + e.message);
    return { error: e };
  }
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
    } else if (signInMethod === "bunker") {
      const signEventId = crypto.randomUUID();
      await sendBunkerRequest("sign_event", signEventId, nostrEvent);
      while (!signedEvent) {
        signedEvent = await awaitBunkerResponse(signEventId);
        if (!signedEvent) {
          await new Promise((resolve) => setTimeout(resolve, 2100));
        }
      }
      signedEvent = JSON.parse(signedEvent);
    } else {
      if (!passphrase) throw new Error("Passphrase is required");
      let senderPrivkey = getPrivKeyWithPassphrase(passphrase) as Uint8Array;
      signedEvent = finalizeEvent(nostrEvent, senderPrivkey);
    }
    const pool = new SimplePool();
    const allWriteRelays = [...writeRelays, ...relays];
    const blastrRelay = "wss://sendit.nosflare.com";
    if (!containsRelay(allWriteRelays, blastrRelay)) {
      allWriteRelays.push(blastrRelay);
    }
    await Promise.any(pool.publish(allWriteRelays, signedEvent));
  } catch (e: any) {
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
  clientPubkey: "clientPubkey",
  clientPrivkey: "clientPrivkey",
  bunkerRemotePubkey: "bunkerRemotePubkey",
  bunkerRelays: "bunkerRelays",
  bunkerSecret: "bunkerSecret",
};

export const setLocalStorageDataOnSignIn = ({
  signInMethod,
  pubkey,
  npub,
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
}: {
  signInMethod: string;
  pubkey?: string;
  npub?: string;
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
}) => {
  localStorage.setItem(LOCALSTORAGECONSTANTS.signInMethod, signInMethod);

  if (pubkey) {
    localStorage.setItem(
      LOCALSTORAGECONSTANTS.userNPub,
      nip19.npubEncode(pubkey),
    );
    localStorage.setItem(LOCALSTORAGECONSTANTS.userPubkey, pubkey);
  }

  if (npub) {
    localStorage.setItem(LOCALSTORAGECONSTANTS.userNPub, npub);
    localStorage.setItem(
      LOCALSTORAGECONSTANTS.userPubkey,
      nip19.decode(npub).data as string,
    );
  }
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
            "wss://purplepag.es",
            "wss://relay.primal.net",
            "wss://relay.nostr.band",
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

  if (clientPubkey && clientPrivkey && bunkerRemotePubkey && bunkerRelays) {
    localStorage.setItem(LOCALSTORAGECONSTANTS.clientPubkey, clientPubkey);
    localStorage.setItem(LOCALSTORAGECONSTANTS.clientPrivkey, clientPrivkey);
    localStorage.setItem(
      LOCALSTORAGECONSTANTS.bunkerRemotePubkey,
      bunkerRemotePubkey,
    );
    localStorage.setItem(
      LOCALSTORAGECONSTANTS.bunkerRelays,
      JSON.stringify(
        bunkerRelays && bunkerRelays.length != 0 ? bunkerRelays : [],
      ),
    );
    if (bunkerSecret) {
      localStorage.setItem(LOCALSTORAGECONSTANTS.bunkerSecret, bunkerSecret);
    }
  }

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
  clientPubkey?: string;
  clientPrivkey?: string;
  bunkerRemotePubkey?: string;
  bunkerRelays?: string[];
  bunkerSecret?: string;
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
  let clientPubkey;
  let clientPrivkey;
  let bunkerRemotePubkey;
  let bunkerRelays;
  let bunkerSecret;

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
      localStorage.removeItem("cashuWalletRelays");
    }

    const relaysString = localStorage.getItem(LOCALSTORAGECONSTANTS.relays);
    relays = relaysString ? (JSON.parse(relaysString) as string[]) : [];

    const defaultRelays = [
      "wss://relay.damus.io",
      "wss://nos.lol",
      "wss://purplepag.es",
      "wss://relay.primal.net",
      "wss://relay.nostr.band",
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

    clientPubkey = localStorage.getItem(LOCALSTORAGECONSTANTS.clientPubkey)
      ? localStorage.getItem(LOCALSTORAGECONSTANTS.clientPubkey)
      : undefined;
    clientPrivkey = localStorage.getItem(LOCALSTORAGECONSTANTS.clientPrivkey)
      ? localStorage.getItem(LOCALSTORAGECONSTANTS.clientPrivkey)
      : undefined;
    bunkerRemotePubkey = localStorage.getItem(
      LOCALSTORAGECONSTANTS.bunkerRemotePubkey,
    )
      ? localStorage.getItem(LOCALSTORAGECONSTANTS.bunkerRemotePubkey)
      : undefined;
    bunkerRelays = localStorage.getItem(LOCALSTORAGECONSTANTS.bunkerRelays)
      ? (
          JSON.parse(
            localStorage.getItem(LOCALSTORAGECONSTANTS.bunkerRelays) as string,
          ) as string[]
        ).filter((r) => r)
      : [];
    bunkerSecret = localStorage.getItem(LOCALSTORAGECONSTANTS.bunkerSecret)
      ? localStorage.getItem(LOCALSTORAGECONSTANTS.bunkerSecret)
      : undefined;
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
    clientPubkey: clientPubkey?.toString(),
    clientPrivkey: clientPrivkey?.toString(),
    bunkerRemotePubkey: bunkerRemotePubkey?.toString(),
    bunkerRelays: bunkerRelays || [],
    bunkerSecret: bunkerSecret?.toString(),
  };
};

export const LogOut = () => {
  // remove old data
  localStorage.removeItem("npub");
  localStorage.removeItem("signIn");
  localStorage.removeItem("chats");
  localStorage.removeItem("cashuWalletRelays");

  localStorage.removeItem(LOCALSTORAGECONSTANTS.signInMethod);
  localStorage.removeItem(LOCALSTORAGECONSTANTS.userNPub);
  localStorage.removeItem(LOCALSTORAGECONSTANTS.userPubkey);
  localStorage.removeItem(LOCALSTORAGECONSTANTS.encryptedPrivateKey);
  localStorage.removeItem(LOCALSTORAGECONSTANTS.history);
  localStorage.removeItem(LOCALSTORAGECONSTANTS.clientPubkey);
  localStorage.removeItem(LOCALSTORAGECONSTANTS.clientPrivkey);
  localStorage.removeItem(LOCALSTORAGECONSTANTS.bunkerRemotePubkey);
  localStorage.removeItem(LOCALSTORAGECONSTANTS.bunkerRelays);
  localStorage.removeItem(LOCALSTORAGECONSTANTS.bunkerSecret);

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
