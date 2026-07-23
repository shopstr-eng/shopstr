import {
  finalizeEvent,
  generateSecretKey,
  getEventHash,
  nip44,
} from "nostr-tools";
import { v4 as uuidv4 } from "uuid";
import type { NostrEvent } from "@/utils/types/types";

import type { ProductData } from "@/utils/parsers/product-parser-functions";
import { NostrSigner } from "@/utils/nostr/signers/nostr-signer";
import type { NostrManager } from "@/utils/nostr/nostr-manager";
import {
  cacheEventToDatabase,
  cacheEventToDatabaseStrict,
} from "@/utils/db/db-client";
import { newPromiseWithTimeout } from "@/utils/timeout";
import { getLocalStorageData } from "./nostr-helper-functions";
import { withBlastr } from "./relay-config";

export type GiftWrapSigner = {
  encrypt(pubkey: string, content: string): string | Promise<string>;
  sign(event: {
    kind: number;
    tags: string[][];
    content: string;
    created_at: number;
  }): NostrEvent | Promise<NostrEvent>;
};

export async function createGiftWrapEvent(
  innerContent: string,
  recipientPubkey: string,
  options?: {
    randomPrivKey?: Uint8Array;
    signer?: GiftWrapSigner;
    relayHint?: string;
  }
): Promise<NostrEvent> {
  if (options?.randomPrivKey && options?.signer) {
    throw new Error(
      "createGiftWrapEvent: randomPrivKey and signer are mutually exclusive"
    );
  }

  const now = Math.floor(Date.now() / 1000);

  const sealTimestamp = now - Math.floor(Math.random() * 172800);
  let encryptedSealContent: string;
  let signedSeal: NostrEvent;

  if (options?.randomPrivKey) {
    const conversationKey = nip44.getConversationKey(
      options.randomPrivKey,
      recipientPubkey
    );
    encryptedSealContent = nip44.encrypt(innerContent, conversationKey);
    signedSeal = finalizeEvent(
      {
        created_at: sealTimestamp,
        content: encryptedSealContent,
        kind: 13,
        tags: [],
      },
      options.randomPrivKey
    );
  } else if (options?.signer) {
    encryptedSealContent = await options.signer.encrypt(
      recipientPubkey,
      innerContent
    );
    signedSeal = await options.signer.sign({
      kind: 13,
      tags: [],
      content: encryptedSealContent,
      created_at: sealTimestamp,
    });
  } else {
    const randomPrivKey = generateSecretKey();
    const conversationKey = nip44.getConversationKey(
      randomPrivKey,
      recipientPubkey
    );
    encryptedSealContent = nip44.encrypt(innerContent, conversationKey);
    signedSeal = finalizeEvent(
      {
        created_at: sealTimestamp,
        content: encryptedSealContent,
        kind: 13,
        tags: [],
      },
      randomPrivKey
    );
  }

  const wrapPrivKey = generateSecretKey();
  const wrapConversationKey = nip44.getConversationKey(
    wrapPrivKey,
    recipientPubkey
  );
  const wrapContent = nip44.encrypt(
    JSON.stringify(signedSeal),
    wrapConversationKey
  );
  const wrapTimestamp = now - Math.floor(Math.random() * 172800);

  const wrapTags: string[][] = [
    options?.relayHint
      ? ["p", recipientPubkey, options.relayHint]
      : ["p", recipientPubkey],
  ];

  return finalizeEvent(
    {
      created_at: wrapTimestamp,
      content: wrapContent,
      kind: 1059,
      tags: wrapTags,
    },
    wrapPrivKey
  );
}

function generateRandomTimestamp(): number {
  const now = Math.floor(Date.now() / 1000);
  const twoDaysInMilliseconds = 172800;
  const randomSeconds = Math.floor(Math.random() * (twoDaysInMilliseconds + 1));
  const randomTimestamp = now - randomSeconds;
  return randomTimestamp;
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
    contact?: string;
    address?: string;
    pickup?: string;
    buyerPubkey?: string;
    donationAmount?: number;
    donationPercentage?: number;
    selectedSize?: string;
    selectedVolume?: string;
    selectedWeight?: string;
    selectedBulkOption?: number;
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
    contact,
    address,
    pickup,
    buyerPubkey,
    donationAmount,
    donationPercentage,
    selectedSize,
    selectedVolume,
    selectedWeight,
    selectedBulkOption,
  } = options;

  const tags = [
    ["p", recipientPubkey, relays[0]!],
    ["subject", subject],
  ];

  if (isOrder) {
    tags.push(["order", orderId ? orderId : uuidv4()]);

    if (buyerPubkey) tags.push(["b", buyerPubkey]);
    if (type) tags.push(["type", type.toString()]);
    if (orderAmount) tags.push(["amount", orderAmount.toString()]);
    if (paymentType && paymentReference) {
      if (paymentProof) {
        tags.push(["payment", paymentType, paymentReference, paymentProof]);
      } else {
        tags.push(["payment", paymentType, paymentReference]);
      }
    }
    if (status) tags.push(["status", status]);
    if (tracking) tags.push(["tracking", tracking]);
    if (carrier) tags.push(["carrier", carrier]);
    if (eta) tags.push(["eta", eta.toString()]);
    if (contact) tags.push(["contact", contact]);
    if (address) tags.push(["address", address]);
    if (pickup) tags.push(["pickup", pickup]);
    if (selectedSize) tags.push(["size", selectedSize]);
    if (selectedVolume) tags.push(["volume", selectedVolume]);
    if (selectedWeight) tags.push(["weight", selectedWeight]);
    if (selectedBulkOption) tags.push(["bulk", selectedBulkOption.toString()]);
    if (
      donationAmount &&
      donationAmount > 0 &&
      donationPercentage !== undefined
    ) {
      tags.push([
        "donation_amount",
        donationAmount.toString(),
        donationPercentage.toString(),
      ]);
    }

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

  const eventToHash: NostrEvent = {
    ...bareEvent,
    id: "",
    sig: "",
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

type SendGiftWrappedMessageOptions = {
  waitForRelayPublish?: boolean;
  requireDurableCache?: boolean;
};

export async function sendGiftWrappedMessageEvent(
  nostr: NostrManager,
  giftWrappedMessageEvent: NostrEvent,
  signer?: NostrSigner,
  options: SendGiftWrappedMessageOptions = {}
) {
  const { relays, writeRelays } = getLocalStorageData();
  const allWriteRelays = withBlastr([...writeRelays, ...relays]);

  if (options.requireDurableCache) {
    await cacheEventToDatabaseStrict(giftWrappedMessageEvent);
  } else {
    await cacheEventToDatabase(giftWrappedMessageEvent);
  }

  const publishWithRetryTracking = async () => {
    try {
      await newPromiseWithTimeout(
        async (resolve, reject) => {
          try {
            await nostr.publish(giftWrappedMessageEvent, allWriteRelays);
            resolve(undefined);
          } catch (err) {
            reject(err as Error);
          }
        },
        { timeout: 21000 }
      );
    } catch (error) {
      console.warn(
        "Relay publish timed out or failed for gift-wrapped message, but event is saved to database:",
        error
      );
      const { trackFailedRelayPublish } = await import("@/utils/db/db-client");
      await trackFailedRelayPublish(
        giftWrappedMessageEvent.id,
        giftWrappedMessageEvent,
        allWriteRelays,
        signer
      ).catch(console.error);
    }
  };

  if (options.waitForRelayPublish === false) {
    void publishWithRetryTracking();
    return;
  }

  await publishWithRetryTracking();
}
