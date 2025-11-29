import {
  EventTemplate,
  finalizeEvent,
  generateSecretKey,
  getPublicKey,
  getEventHash,
  nip19,
  nip44,
} from "nostr-tools";
import { v4 as uuidv4 } from "uuid";
import CryptoJS from "crypto-js";
import {
  Community,
  CommunityRelays,
  NostrEvent,
  ProductFormValues,
} from "@/utils/types/types";
import { ProductData } from "@/utils/parsers/product-parser-functions";
import { Proof } from "@cashu/cashu-ts";
import { NostrSigner } from "@/utils/nostr/signers/nostr-signer";
import { NostrManager } from "@/utils/nostr/nostr-manager";
import { removeProductFromCache } from "@/utils/nostr/cache-service";
import {
  cacheEventToDatabase,
  deleteEventsFromDatabase,
} from "@/utils/db/db-client";

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

export async function deleteEvent(
  nostr: NostrManager,
  signer: NostrSigner,
  event_ids_to_delete: string[]
) {
  const deletionEvent = createNostrDeleteEvent(
    event_ids_to_delete,
    "Shopstr deletion request"
  );

  await finalizeAndSendNostrEvent(signer, nostr, deletionEvent);
  await removeProductFromCache(event_ids_to_delete);

  // Delete from database via API
  deleteEventsFromDatabase(event_ids_to_delete).catch((error) =>
    console.error("Failed to delete events from database:", error)
  );
}

export function createNostrDeleteEvent(
  event_ids: string[],
  content: string
): EventTemplate {
  const msg: EventTemplate = {
    kind: 5,
    content: content,
    tags: event_ids.map((id) => ["e", id]),
    created_at: Math.floor(Date.now() / 1000),
  };

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
  stringifiedContent: string
) {
  const profileContent: EventTemplate = {
    created_at: Math.floor(Date.now() / 1000),
    content: stringifiedContent,
    kind: 0,
    tags: [],
  };
  const signedEvent = await finalizeAndSendNostrEvent(
    signer,
    nostr,
    profileContent
  );

  // Cache profile event to database
  if (signedEvent) {
    await cacheEventToDatabase(signedEvent).catch((error) =>
      console.error("Failed to cache profile event to database:", error)
    );
  }
}

export async function PostListing(
  values: ProductFormValues,
  signer: NostrSigner,
  isLoggedIn: boolean,
  nostr: NostrManager
) {
  const { relays } = getLocalStorageData();

  if (!signer || !isLoggedIn) throw new Error("Login required");
  const userPubkey = await signer.getPubKey();

  if (!nostr) throw new Error("Nostr writer required");

  const summary = values.find(([key]) => key === "summary")?.[1] || "";

  const created_at = Math.floor(Date.now() / 1000);
  const updatedValues = [...values, ["published_at", String(created_at)]];

  const event: EventTemplate = {
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

  const handlerEvent: EventTemplate = {
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

  const recEvent: EventTemplate = {
    kind: 31989,
    tags: [
      ["d", "30402"],
      ["a", "31990:" + userPubkey! + ":" + handlerDTag!, relays[0]!, "web"],
    ],
    content: "",
    created_at: Math.floor(Date.now() / 1000),
  };

  const signedEvent = await finalizeAndSendNostrEvent(signer, nostr, event);
  await finalizeAndSendNostrEvent(signer, nostr, recEvent);
  await finalizeAndSendNostrEvent(signer, nostr, handlerEvent);

  return signedEvent;
}

export async function createNostrShopEvent(
  nostr: NostrManager,
  signer: NostrSigner,
  stringifiedContent: string
) {
  const userPubkey = await signer?.getPubKey?.();
  const shopContent: EventTemplate = {
    created_at: Math.floor(Date.now() / 1000),
    content: stringifiedContent,
    kind: 30019,
    tags: [["d", userPubkey]],
  };
  const signedEvent = await finalizeAndSendNostrEvent(
    signer,
    nostr,
    shopContent
  );

  // Cache shop profile event to database
  if (signedEvent) {
    await cacheEventToDatabase(signedEvent).catch((error) =>
      console.error("Failed to cache shop profile event to database:", error)
    );
  }
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
    paymentReference?: string;
    paymentProof?: string;
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
    paymentReference,
    paymentProof,
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
    if (paymentType && paymentReference && paymentProof)
      tags.push(["payment", paymentType, paymentReference, paymentProof]);
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

  // To generate a predictable ID before signing (as required by NIP-17 gift wrap structure),
  // we create a temporary full event object and hash it using the official NIP-01 method.
  const eventToHash: NostrEvent = {
    ...bareEvent,
    id: "", // dummy value for hashing
    sig: "", // dummy value for hashing
  };
  const eventId = getEventHash(eventToHash);
  return {
    id: eventId,
    ...bareEvent,
  } as GiftWrappedMessageEvent;
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
  nostr: NostrManager,
  giftWrappedMessageEvent: NostrEvent
) {
  const { relays, writeRelays } = getLocalStorageData();
  const allWriteRelays = withBlastr([...writeRelays, ...relays]);

  await nostr.publish(giftWrappedMessageEvent, allWriteRelays);

  // Cache the gift-wrapped event to database
  await cacheEventToDatabase(giftWrappedMessageEvent).catch((error) =>
    console.error("Failed to cache gift-wrapped message to database:", error)
  );
}

export async function publishReviewEvent(
  nostr: NostrManager,
  signer: NostrSigner,
  content: string,
  eventTags: string[][]
) {
  try {
    const reviewEvent: EventTemplate = {
      created_at: Math.floor(Date.now() / 1000),
      content: content,
      kind: 31555,
      tags: eventTags,
    };
    const signedEvent = await finalizeAndSendNostrEvent(
      signer,
      nostr,
      reviewEvent
    );

    // Cache review event to database
    if (signedEvent) {
      await cacheEventToDatabase(signedEvent).catch((error) =>
        console.error("Failed to cache review event to database:", error)
      );
    }
  } catch (error) {
    console.error(error);
    throw error;
  }
}
export async function createNostrRelayEvent(
  nostr: NostrManager,
  signer: NostrSigner
) {
  const relayList = getLocalStorageData().relays;
  const readRelayList = getLocalStorageData().readRelays;
  const writeRelayList = getLocalStorageData().writeRelays;
  const relayTags = [];
  for (const relay of relayList) {
    relayTags.push(["r", relay]);
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
  const relayEvent: EventTemplate = {
    kind: 10002, // NIP-65 - Relay List Metadata
    content: "",
    tags: relayTags,
    created_at: Math.floor(Date.now() / 1000),
  };

  await finalizeAndSendNostrEvent(signer, nostr, relayEvent);
  return relayEvent;
}

export async function publishRelayEvent(
  nostr: NostrManager,
  signer: NostrSigner,
  relays: string[]
) {
  const relayTags = relays.map((relay) => ["r", relay]);
  const relayEvent: EventTemplate = {
    kind: 10002,
    tags: relayTags,
    content: "",
    created_at: Math.floor(Date.now() / 1000),
  };
  const signedEvent = await finalizeAndSendNostrEvent(
    signer,
    nostr,
    relayEvent
  );

  // Cache relay list event to database
  if (signedEvent) {
    await cacheEventToDatabase(signedEvent).catch((error) =>
      console.error("Failed to cache relay list event to database:", error)
    );
  }
}

export async function createBlossomServerEvent(
  nostr: NostrManager,
  signer: NostrSigner
) {
  const blossomServers = getLocalStorageData().blossomServers;
  const serverTags = [];
  for (const server of blossomServers) {
    serverTags.push(["server", server]);
  }
  const blossomServerEvent: EventTemplate = {
    kind: 10063,
    content: "",
    tags: serverTags,
    created_at: Math.floor(Date.now() / 1000),
  };

  await finalizeAndSendNostrEvent(signer, nostr, blossomServerEvent);
  return blossomServerEvent;
}

export async function publishBlossomServerEvent(
  nostr: NostrManager,
  signer: NostrSigner,
  servers: string[]
) {
  const serverTags = servers.map((server) => ["server", server]);
  const blossomEvent: EventTemplate = {
    kind: 10063,
    tags: serverTags,
    content: "",
    created_at: Math.floor(Date.now() / 1000),
  };
  const signedEvent = await finalizeAndSendNostrEvent(
    signer,
    nostr,
    blossomEvent
  );

  // Cache blossom server event to database
  if (signedEvent) {
    await cacheEventToDatabase(signedEvent).catch((error) =>
      console.error("Failed to cache blossom server event to database:", error)
    );
  }
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

    const cartEvent: EventTemplate = {
      created_at: Math.floor(Date.now() / 1000),
      content: encryptedContent,
      kind: 30405,
      tags: [],
    };

    await finalizeAndSendNostrEvent(signer, nostr, cartEvent);
  } catch (_) {
    return;
  }
}

export async function publishWalletEvent(
  nostr: NostrManager,
  signer: NostrSigner
) {
  try {
    const { mints } = getLocalStorageData();
    const userPubkey = await signer.getPubKey();

    const mintTagsSet = new Set<string>();

    let walletMints = [];

    mints.forEach((mint) => mintTagsSet.add(mint));
    walletMints = Array.from(mintTagsSet);
    const mintTags = walletMints.map((mint) => ["mint", mint]);
    const walletContent = [...mintTags];
    const cashuWalletEvent: EventTemplate = {
      kind: 17375,
      tags: [],
      content: await signer.encrypt(userPubkey, JSON.stringify(walletContent)),
      created_at: Math.floor(Date.now() / 1000),
    };
    const signedEvent = await finalizeAndSendNostrEvent(
      signer,
      nostr,
      cashuWalletEvent
    );

    // Cache wallet event to database
    if (signedEvent) {
      await cacheEventToDatabase(signedEvent).catch((error) =>
        console.error("Failed to cache wallet event to database:", error)
      );
    }
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
    const userPubkey = await signer?.getPubKey?.();

    let signedEvent;
    if (proofs.length > 0) {
      const tokenArray = {
        mint: mint,
        proofs: proofs,
        ...(deletedEventsArray ? { del: deletedEventsArray } : {}),
      };
      const cashuProofEvent: EventTemplate = {
        kind: 7375,
        tags: [],
        content: await signer!.encrypt(userPubkey, JSON.stringify(tokenArray)),
        created_at: Math.floor(Date.now() / 1000),
      };
      signedEvent = await finalizeAndSendNostrEvent(
        signer!,
        nostr,
        cashuProofEvent
      );
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

    const cashuSpendingHistoryEvent: EventTemplate = {
      kind: 7376,
      tags: [],
      content: await signer!.encrypt(userPubkey, JSON.stringify(eventContent)),
      created_at: Math.floor(Date.now() / 1000),
    };
    await finalizeAndSendNostrEvent(signer!, nostr!, cashuSpendingHistoryEvent);
  } catch (_) {
    return;
  }
}

export async function createOrUpdateCommunity(
  signer: NostrSigner,
  nostr: NostrManager,
  details: {
    d: string; // The unique identifier, should be constant for a community
    name: string;
    description: string;
    image: string;
    moderators: string[];
    relays?: CommunityRelays; // optional relay declarations
  }
) {
  const tags: string[][] = [
    ["d", details.d],
    ["name", details.name],
    ["description", details.description],
    ["image", details.image],
    ["t", "shopstr"],
  ];

  // moderators as p tags with role marker
  for (const mod_pk of details.moderators) {
    tags.push(["p", mod_pk, "", "moderator"]);
  }

  // include relay tags if provided: ["relay", url, type]
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
  // Cache community event to database
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
    parentEvent?: NostrEvent; // reply
    crosspostCommunities?: Community[]; // cross-post to other communities (NIP-18)
    externalId?: string; // NIP-73 external content id
    contentKind?: string; // optional k/i usage
  }
) {
  const communityAddress = `${community.kind}:${community.pubkey}:${community.d}`;
  const tags: string[][] = [];

  // Always include uppercase A/P tags pointing to the community address/pubkey
  tags.push(["A", communityAddress]);
  tags.push(["P", community.pubkey]);
  tags.push(["K", String(community.kind)]);

  if (options?.parentEvent) {
    // reply: reference parent event via e and p tags and include parent kind
    tags.push(["a", communityAddress]);
    tags.push(["e", options.parentEvent.id, ""]);
    tags.push(["p", options.parentEvent.pubkey, ""]);
    tags.push(["k", String(options.parentEvent.kind)]);
  } else {
    // top-level announcement: include lowercase a/p/k pointing to the community address/kind
    tags.push(["a", communityAddress]);
    tags.push(["p", community.pubkey]);
    tags.push(["k", String(community.kind)]);
  }

  // cross-posting: include additional lowercase a tags pointing to other communities' addresses
  if (options?.crosspostCommunities) {
    for (const c of options.crosspostCommunities) {
      const addr = `${c.kind}:${c.pubkey}:${c.d}`;
      tags.push(["a", addr]);
    }
  }

  // NIP-73 external ID support (i tag)
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

  // returns signed event (so caller can know id)
  const signedEvent = await finalizeAndSendNostrEvent(
    signer,
    nostr,
    eventTemplate
  );
  // Cache community post event to database
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

  // returns signed approval event (so caller can persist approval id)
  const signedEvent = await finalizeAndSendNostrEvent(
    signer,
    nostr,
    eventTemplate
  );
  // Cache community approval event to database
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

// Moderator retract of approval -> publish deletion event (NIP-09, kind 5)
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

export async function finalizeAndSendNostrEvent(
  signer: NostrSigner,
  nostr: NostrManager,
  eventTemplate: EventTemplate
) {
  try {
    const { writeRelays, relays } = getLocalStorageData();
    const signedEvent = await signer.sign(eventTemplate);
    const allWriteRelays = withBlastr([...writeRelays, ...relays]);
    await nostr.publish(signedEvent, allWriteRelays);

    // Cache to database via API
    cacheEventToDatabase(signedEvent).catch((error) =>
      console.error("Failed to cache event to database:", error)
    );

    // return the signed event to caller so we know generated IDs
    return signedEvent;
  } catch (error) {
    // Log the actual error and re-throw it so the calling function knows something went wrong
    throw error;
  }
}

export type BlossomUploadResponse = {
  url: string;
  sha256: string;
  size: number;
  type?: string;
};

export async function blossomUploadImages(
  image: File,
  signer: NostrSigner,
  servers: Request["url"][]
) {
  if (!image.type.includes("image"))
    throw new Error("Only images are supported");

  const arrayBuffer = await image.arrayBuffer();
  const wordArray = CryptoJS.lib.WordArray.create(arrayBuffer);
  const hash = CryptoJS.SHA256(wordArray).toString(CryptoJS.enc.Hex);

  const event = {
    kind: 24242,
    content: `Upload ${image.name}`,
    created_at: Math.floor(Date.now() / 1000),
    tags: [
      ["t", "upload"],
      ["x", hash],
      ["size", image.size.toString()],
      [
        "expiration",
        Math.floor((Date.now() + 24 * 60 * 60 * 1000) / 1000).toString(),
      ],
    ],
  };

  const signedEvent = await signer!.sign(event);

  const authorization = `Nostr ${CryptoJS.enc.Base64.stringify(
    CryptoJS.enc.Utf8.parse(JSON.stringify(signedEvent))
  )}`;

  let tags: string[][] = [];
  let responseUrl: string = "";
  for (let i = 0; i < servers.length; i++) {
    const server = servers[i];
    if (i == 0) {
      const url = new URL("/upload", server);

      const response = await fetch(url, {
        method: "PUT",
        body: image,
        headers: {
          authorization,
          "content-type": image.type,
        },
      }).then((res) => res.json());

      responseUrl = response.url;

      tags = [
        ["url", responseUrl],
        ["x", response.sha256],
        ["ox", response.sha256],
        ["size", response.size.toString()],
      ];

      if (response.type) {
        tags.push(["m", response.type]);
      }
    } else {
      const url = new URL("/mirror", server);

      await fetch(url, {
        method: "PUT",
        body: JSON.stringify({
          url: responseUrl,
        }),
        headers: {
          authorization,
          "content-type": image.type,
        },
      });
    }
  }
  // Cache blossom upload event to database
  if (signedEvent) {
    await cacheEventToDatabase(signedEvent).catch((error) =>
      console.error("Failed to cache blossom upload event to database:", error)
    );
  }
  return tags;
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
  blossomServers: "blossomServers",
  tokens: "tokens",
  history: "history",
  wot: "wot",
  clientPubkey: "clientPubkey",
  clientPrivkey: "clientPrivkey",
  bunkerRemotePubkey: "bunkerRemotePubkey",
  bunkerRelays: "bunkerRelays",
  bunkerSecret: "bunkerSecret",
  signer: "signer",
  nwcString: "nwcString",
  nwcInfo: "nwcInfo",
};

export const setLocalStorageDataOnSignIn = ({
  encryptedPrivateKey,
  relays,
  readRelays,
  writeRelays,
  mints,
  blossomServers,
  wot,
  clientPubkey,
  clientPrivkey,
  bunkerRemotePubkey,
  bunkerRelays,
  bunkerSecret,
  signer,
  migrationComplete,
}: {
  encryptedPrivateKey?: string;
  relays?: string[];
  readRelays?: string[];
  writeRelays?: string[];
  mints?: string[];
  blossomServers?: string[];
  wot?: number;
  clientPubkey?: string;
  clientPrivkey?: string;
  bunkerRemotePubkey?: string;
  bunkerRelays?: string[];
  bunkerSecret?: string;
  signer?: NostrSigner;
  migrationComplete?: boolean;
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

  localStorage.setItem(
    LOCALSTORAGECONSTANTS.blossomServers,
    JSON.stringify(
      blossomServers ? blossomServers : [getDefaultBlossomServer()]
    )
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

  if (migrationComplete) {
    localStorage.setItem("migrationComplete", migrationComplete.toString());
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
  blossomServers: string[];
  tokens: [];
  history: [];
  wot: number;
  encryptedPrivateKey?: string;
  clientPrivkey?: string;
  bunkerRemotePubkey?: string;
  bunkerRelays?: string[];
  bunkerSecret?: string;
  signer?: { [key: string]: string };
  nwcString?: string | null;
  nwcInfo?: string | null;
  migrationComplete?: boolean;
}

export const getLocalStorageData = (): LocalStorageInterface => {
  let signInMethod;
  let encryptedPrivateKey;
  let relays;
  let readRelays;
  let writeRelays;
  let mints;
  let blossomServers;
  let tokens;
  let history;
  let wot;
  let clientPrivkey;
  let bunkerRemotePubkey;
  let bunkerRelays;
  let bunkerSecret;
  let signer;
  let migrationComplete;
  let nwcString;
  let nwcInfo;

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

    blossomServers = localStorage.getItem(LOCALSTORAGECONSTANTS.blossomServers)
      ? JSON.parse(localStorage.getItem("blossomServers") as string)
      : null;

    if (blossomServers === null) {
      blossomServers = [getDefaultBlossomServer()];
      localStorage.setItem(
        LOCALSTORAGECONSTANTS.blossomServers,
        JSON.stringify(blossomServers)
      );
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

    nwcString = localStorage.getItem(LOCALSTORAGECONSTANTS.nwcString)
      ? localStorage.getItem(LOCALSTORAGECONSTANTS.nwcString)
      : null;

    nwcInfo = localStorage.getItem(LOCALSTORAGECONSTANTS.nwcInfo)
      ? localStorage.getItem(LOCALSTORAGECONSTANTS.nwcInfo)
      : null;
    migrationComplete = localStorage.getItem("migrationComplete") === "true";
  }
  return {
    signInMethod: signInMethod as string,
    encryptedPrivateKey: encryptedPrivateKey as string,
    relays: relays || [],
    readRelays: readRelays || [],
    writeRelays: writeRelays || [],
    mints,
    blossomServers: blossomServers || [],
    tokens: tokens || [],
    history: history || [],
    wot: wot || 3,
    clientPrivkey: clientPrivkey?.toString(),
    bunkerRemotePubkey: bunkerRemotePubkey?.toString(),
    bunkerRelays: bunkerRelays || [],
    bunkerSecret: bunkerSecret?.toString(),
    signer,
    nwcString: nwcString as string | null,
    nwcInfo: nwcInfo as string | null,
    migrationComplete: migrationComplete || false,
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

export function getDefaultBlossomServer(): string {
  return "https://cdn.nostrcheck.me";
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

export const saveNWCString = (nwcString: string) => {
  if (nwcString) {
    localStorage.setItem(LOCALSTORAGECONSTANTS.nwcString, nwcString);
  } else {
    localStorage.removeItem(LOCALSTORAGECONSTANTS.nwcString);
    localStorage.removeItem(LOCALSTORAGECONSTANTS.nwcInfo);
  }
  window.dispatchEvent(new Event("storage"));
};
