import type { NextApiRequest, NextApiResponse } from "next";
import {
  SimplePool,
  finalizeEvent, // this assigns the pubkey, calculates the event id and signs the event in a single step
  nip04,
} from "nostr-tools";

type ProductFormValue = [key: string, ...values: string[]];
export type ProductFormValues = ProductFormValue[];

const parseRequestBody = (body: string) => {
  const parsedBody = typeof body === "string" ? JSON.parse(body) : body;

  if (!parsedBody.pubkey || typeof parsedBody.pubkey !== "string") {
    throw new Error("Invalid request data: missing or invalid property pk");
  }

  // Convert privkey from object to Uint8Array if necessary
  if (
    typeof parsedBody.privkey === "object" &&
    !Array.isArray(parsedBody.privkey) &&
    parsedBody.privkey !== null
  ) {
    const keys = Object.keys(parsedBody.privkey)
      .map(Number)
      .sort((a, b) => a - b);
    if (
      keys.length === 0 ||
      keys[0] !== 0 ||
      keys[keys.length - 1] !== keys.length - 1
    ) {
      throw new Error(
        "Invalid request data: privkey object must have consecutive numeric keys starting with 0",
      );
    }
    const uint8Array = new Uint8Array(keys.length);
    for (const key of keys) {
      const value = parsedBody.privkey[key];
      if (
        typeof value !== "number" ||
        value < 0 ||
        value > 255 ||
        !Number.isInteger(value)
      ) {
        throw new Error(
          "Invalid request data: privkey values must be integers in the range 0-255",
        );
      }
      uint8Array[key] = value;
    }
    parsedBody.privkey = uint8Array;
  } else {
    throw new Error("Invalid request data: missing or invalid property sk");
  }

  if (!parsedBody.created_at || typeof parsedBody.created_at !== "number") {
    throw new Error(
      "Invalid request data: missing or invalid property created_at",
    );
  }

  if (!parsedBody.kind || typeof parsedBody.kind !== "number") {
    throw new Error("Invalid request data: missing or invalid property kind");
  }

  if (
    parsedBody.kind === 30402 &&
    (!parsedBody.tags || !Array.isArray(parsedBody.tags))
  ) {
    if (!parseProductFormValues(parsedBody.tags)) {
      throw new Error("Invalid request data: missing or invalid property tags");
    }
  } else if (
    parsedBody.kind === 4 &&
    (!parsedBody.tags || !Array.isArray(parsedBody.tags))
  ) {
    if (!parseNip04Values(parsedBody.tags)) {
      throw new Error("Invalid request data: missing or invalid property tags");
    }
  }

  if (!parsedBody.content || typeof parsedBody.content !== "string") {
    throw new Error(
      "Invalid request data: missing or invalid property content",
    );
  }

  if (!parsedBody.relays || typeof parsedBody.relays !== "object") {
    throw new Error("Invalid request data: missing or invalid property relays");
  }

  return parsedBody;
};

const parseProductFormValues = (body: ProductFormValues): ProductFormValues => {
  const expectedKeys = [
    "title",
    "summary",
    "published_at",
    "location",
    "price",
  ];
  const parsedBody = typeof body === "string" ? JSON.parse(body) : body;
  for (const key of expectedKeys) {
    const matchingPair = parsedBody.find(([k]) => k === key);
    if (
      !matchingPair ||
      !Array.isArray(matchingPair) ||
      matchingPair[1] === undefined
    ) {
      throw new Error(`Missing or invalid property: ${key}`);
    }
  }
  return parsedBody;
};

const parseNip04Values = (body: ProductFormValues): ProductFormValues => {
  const expectedKeys = ["p"];
  const parsedBody = typeof body === "string" ? JSON.parse(body) : body;
  for (const key of expectedKeys) {
    const matchingPair = parsedBody.find(([k]) => k === key);
    if (
      !matchingPair ||
      !Array.isArray(matchingPair) ||
      matchingPair[1] === undefined
    ) {
      throw new Error(`Missing or invalid property: ${key}`);
    }
  }
  return parsedBody;
};

const PostEvent = async (req: NextApiRequest, res: NextApiResponse) => {
  if (req.method !== "POST") {
    return res.status(405).json({});
  }
  try {
    const event = parseRequestBody(req.body);
    const privkey = event.privkey;
    delete event.privkey;

    const kind = event.kind;
    const relays = event.relays;
    delete event.relays;
    const pool = new SimplePool();
    let signedEvent = { ...event }; // using this as the editable event object which is either signed already or needs to be signed and posted to a relay
    let signedRecEvent;
    let signedHandlerEvent;

    // if (kind === 1 || kind === 5 #deletion event) { do nothing and just sign event
    if (kind === 4) {
      let sk1 = privkey;
      let pk1 = event.pubkey;
      let pk2 = event.tags[0][1];
      let ciphertext = await nip04.encrypt(sk1, pk2, event.content);
      signedEvent = {
        kind: kind,
        pubkey: pk1,
        tags: [["p", pk2]],
        content: ciphertext,
        created_at: Math.floor(Date.now() / 1000),
      };
    } else if (kind === 30018) {
      event.content.stall_id = event.pubkey; // using users public key as stall id
      const productId = event.content.id;
      event.content = JSON.stringify(event.content);
      signedEvent = finalizeEvent(event, privkey);
    } else if (kind === 30402) {
      const dValue = event.tags.find(([key]) => key === "d")?.[1] || undefined;

      const recommendationEvent = {
        kind: 31989,
        pubkey: event.pubkey,
        tags: [
          ["d", "30402"],
          [
            "a",
            "31990:" + event.pubkey + ":" + dValue,
            "wss://relay.damus.io",
            "web",
          ],
        ],
        content: "",
        created_at: Math.floor(Date.now() / 1000),
      };

      signedRecEvent = finalizeEvent(recommendationEvent, privkey);

      const handlerEvent = {
        kind: 31990,
        pubkey: event.pubkey,
        tags: [
          ["d", dValue],
          ["k", "30402"],
          ["web", "https://shopstr.store/<bech-32>", "npub"],
        ],
        content: "",
        created_at: Math.floor(Date.now() / 1000),
      };

      signedHandlerEvent = finalizeEvent(handlerEvent, privkey);
    }

    if (signedEvent.sig === undefined) {
      // if signed by extension, don't sign again
      signedEvent = finalizeEvent(signedEvent, privkey);
    }
    await Promise.any(pool.publish(relays, signedEvent));
    await Promise.any(pool.publish(relays, signedRecEvent));
    await Promise.any(pool.publish(relays, signedHandlerEvent));

    return res.status(200).json({});
  } catch (error) {
    console.error(error);
    return res.status(500).json({});
  }
};

export default PostEvent;
