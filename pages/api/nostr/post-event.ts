import type { NextApiRequest, NextApiResponse } from "next";
import {
  SimplePool,
  finishEvent, // this assigns the pubkey, calculates the event id and signs the event in a single step
  nip04,
} from "nostr-tools";

export interface PostEventRequest {
  pubkey: string;
  privkey: string;
  created_at: number;
  kind: number;
  tags: [];
  content: string;
  relays: string[];
}

type ProductFormValue = [key: string, ...values: string[]];
export type ProductFormValues = ProductFormValue[];

const parseRequestBody = (body: string) => {
  const parsedBody = typeof body === "string" ? JSON.parse(body) : body;
  if (!parsedBody.pubkey || typeof parsedBody.pubkey !== "string") {
    console.log("Missing or invalid property: publicKey");
    throw new Error("Invalid request data: missing or invalid property");
  }
  if (!parsedBody.privkey || typeof parsedBody.privkey !== "string") {
    console.log("Missing or invalid property: privateKey");
    throw new Error("Invalid request data: missing or invalid property");
  }
  if (!parsedBody.created_at || typeof parsedBody.created_at !== "number") {
    console.log("Missing or invalid property: created_at");
    throw new Error("Invalid request data: missing or invalid property");
  }
  if (!parsedBody.kind || typeof parsedBody.kind !== "number") {
    console.log("Missing or invalid property: kind");
    throw new Error("Invalid request data: missing or invalid property");
  }
  if (!parsedBody.tags || !Array.isArray(parsedBody.tags)) {
    if (!parseProductFormValues(parsedBody.tags)) {
      console.log("Missing or invalid property: tags");
      throw new Error("Invalid request data: missing or invalid property");
    }
  }
  if (!parsedBody.content || typeof parsedBody.content !== "string") {
    // if (!parsePostProductRequest(parsedBody.content)) {
    console.log("Missing or invalid property: content");
    throw new Error("Invalid request data: missing or invalid property");
    // }
  }
  if (!parsedBody.relays || typeof parsedBody.relays !== "object") {
    console.log("Missing or invalid property: relays");
    throw new Error("Invalid request data: missing or invalid property");
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
      signedEvent = finishEvent(event, privkey);
    }

    if (signedEvent.sig === undefined) {
      // if signed by extension, don't sign again
      signedEvent = finishEvent(signedEvent, privkey);
    }
    // let sub = pool.sub(relays, [
    //   {
    //     kinds: [kind],
    //     authors: [event.pubkey],
    //   },
    // ]);

    // sub.on('event', (event) => {
    //   console.log('got event:', event);
    // });
    await pool.publish(relays, signedEvent);

    return res.status(200).json({});
  } catch (error) {
    console.error(error);
    return res.status(500).json({});
  }
};

export default PostEvent;
