import type { NextApiRequest, NextApiResponse } from 'next';
import {
  relayInit,
  getEventHash,
  signEvent, 
  nip04,
  generatePrivateKey, 
  getPublicKey
} from 'nostr-tools';
import 'websocket-polyfill';
import getRelay from "./relays";

export interface PostEventRequest {
  pubkey: string,
  privkey: string,
  created_at: number,
  kind: number,
  tags: [],
  content: string,
};

// export interface PostProductRequest {
//   privkey: string;
//   pubkey: string;
//   id: string;
//   stall_id: string;
//   name: string;
//   description?: string;
//   images?: string[];
//   currency: string;
//   price: number;
//   quantity: number;
//   specs: [string, string][];
// };

type ProductFormValue = [key: string, ...values: string[]];
export type ProductFormValues = ProductFormValue[];

const parseRequestBody = (body: string) => {
  const parsedBody = typeof body === 'string' ? JSON.parse(body) : body;
  if (!parsedBody.pubkey || typeof parsedBody.pubkey !== 'string') { 
    console.log("Missing or invalid property: publicKey");
    throw new Error('Invalid request data: missing or invalid property');
  }
  if (!parsedBody.privkey || typeof parsedBody.privkey !== 'string') { 
    console.log("Missing or invalid property: privateKey");
    throw new Error('Invalid request data: missing or invalid property');
  }
  if (!parsedBody.created_at || typeof parsedBody.created_at !== 'number') { 
    console.log("Missing or invalid property: created_at");
    throw new Error('Invalid request data: missing or invalid property');
  }
  if (!parsedBody.kind || typeof parsedBody.kind !== 'number') { 
    console.log("Missing or invalid property: kind");
    throw new Error('Invalid request data: missing or invalid property');
  }
  if (!parsedBody.tags || !Array.isArray(parsedBody.tags)) {
    if (!parseProductFormValues(parsedBody.tags)) {
      console.log("Missing or invalid property: tags");
      throw new Error('Invalid request data: missing or invalid property');
    }
  }
  if (!parsedBody.content || typeof parsedBody.content !== 'string') { 
    // if (!parsePostProductRequest(parsedBody.content)) {
      console.log("Missing or invalid property: content");
      throw new Error("Invalid request data: missing or invalid property");
    // }
  }
  return parsedBody;
};

const parseProductFormValues = (body: ProductFormValues): ProductFormValues => {
  const expectedKeys = [ "title", "summary", "published_at", "location", "price" ];
  const parsedBody = typeof body === "string" ? JSON.parse(body) : body;
  for (const key of expectedKeys) {
    const matchingPair = parsedBody.find(([k]) => k === key);
    if (!matchingPair || !Array.isArray(matchingPair) || matchingPair[1] === undefined) {
      throw new Error(`Missing or invalid property: ${key}`);
    }
  }
  return parsedBody;
};

// const parsePostProductRequest = (body: string) => {
//   const parsedBody = typeof body === "string" ? JSON.parse(body) : body;

//   // we are just going to use the users public key in order to identify owner of this product
//   //   if (!parsedBody.stall_id || typeof parsedBody.stall_id !== "string") {
//   //     console.log("Missing or invalid property: stall_id");
//   //     throw new Error("Invalid request data: missing or invalid property");
//   //   }
//   if (!parsedBody.name || typeof parsedBody.name !== "string") {
//     console.log("Missing or invalid property: name");
//     throw new Error("Invalid request data: missing or invalid property");
//   }
//   if (parsedBody.description && typeof parsedBody.description !== "string") {
//     console.log("Invalid property type: description");
//     throw new Error("Invalid request data: invalid property type");
//   }
//   if (parsedBody.images && !Array.isArray(parsedBody.images)) {
//     console.log("Invalid property type: images");
//     throw new Error("Invalid request data: invalid property type");
//   }
//   if (!parsedBody.currency || typeof parsedBody.currency !== "string") {
//     console.log("Missing or invalid property: currency");
//     throw new Error("Invalid request data: missing or invalid property");
//   }
//   if (
//     !(parsedBody.price === 0) &&
//     (!parsedBody.price || typeof parsedBody.price !== "number")
//   ) {
//     console.log("Missing or invalid property: price");
//     throw new Error("Invalid request data: missing or invalid property");
//   }
//   if (
//     !(parsedBody.quantity === 0) &&
//     (!parsedBody.quantity || typeof parsedBody.quantity !== "number")
//   ) {
//     console.log("Missing or invalid property: quantity");
//     throw new Error("Invalid request data: missing or invalid property");
//   }
//   if (!parsedBody.specs || !Array.isArray(parsedBody.specs)) {
//     console.log("Missing or invalid property: specs");
//     throw new Error("Invalid request data: missing or invalid property");
//   } else {
//     for (const [key, value] of parsedBody.specs) {
//       if (typeof key !== "string" || typeof value !== "string") {
//         console.log("Invalid property type: specs");
//         throw new Error("Invalid request data: invalid property type");
//       }
//     }
//   }

//   return parsedBody;
// };

const isRecord = (obj: unknown): obj is Record<string, unknown> =>
  obj instanceof Object;

export function validateEvent<T>(event: T): event is T {
  if (!isRecord(event)) {
    console.log("Invalid event type: event");
    return false;
  }
  if (typeof event.kind !== "number") {
    console.log("Invalid event type: kind");
    return false;
  }
  if (typeof event.content !== "string") {
    console.log("Invalid event type: content");
    return false;
  }
  if (typeof event.created_at !== "number") {
    console.log("Invalid event type: created_at");
    return false;
  }
  if (typeof event.pubkey !== "string") {
    console.log("Invalid event type: pubkey");
    return false;
  }
  if (!event.pubkey.match(/^[a-f0-9]{64}$/)) {
    console.log("Invalid event type: pubkey");
    return false;
  }

  if (!Array.isArray(event.tags)) {
    console.log("Invalid event type: tags");
    return false;
  }
  for (let i = 0; i < event.tags.length; i++) {
    let tag = event.tags[i];
    if (!Array.isArray(tag)) {
      console.log("Invalid event type: tags");
      return false;
    }
    for (let j = 0; j < tag.length; j++) {
      if (typeof tag[j] === "object") {
        console.log("Invalid event type: tags");
        return false;
      }
    }
  }

  return true;
}

const PostEvent = async (req: NextApiRequest, res: NextApiResponse) => {
  if (req.method !== 'POST') {
    return res.status(405).json({});
  }

  try {
    const event = parseRequestBody(req.body);
    const privkey = event.privkey;
    delete event.privkey;

    const kind = event.kind;

    const relay = getRelay()
    relay.on('connect', () => {
      console.log(`connected to ${relay.url}`);
    });
    relay.on('error', () => {
      console.log(`failed to connect to ${relay.url}`);
    });

    await relay.connect();

    if (kind === 1) {
      event.id = getEventHash(event);
  
      event.sig = signEvent(event, privkey);
  
      let sub = relay.sub([
        {
          kinds: [kind],
          authors: [event.pubkey],
        },
      ]);
  
      sub.on('event', (event) => {
        console.log('got event:', event);
      });
  
      let pub = relay.publish(event);
      pub.on('ok', () => {
        console.log(`${relay.url} has accepted our event`);
      });
      pub.on('failed', (reason) => {
        console.log(`failed to publish to ${relay.url}: ${reason}`);
      });
  
      let events = await relay.list([{ kinds: [0, kind] }]);
      let postedEvent = await relay.get({
        ids: [event.id],
      });
    } else if (kind === 4) {
      let sk1 = privkey;
      let pk1 = event.pubkey;
      
      let pk2 = event.tags[0][1];

      let ciphertext = await nip04.encrypt(sk1, pk2, event.content);
  
      let nip04Event = {
        kind: kind,
        pubkey: pk1,
        tags: [['p', pk2]],
        content: ciphertext,
        created_at: Math.floor(Date.now() / 1000),
      };

      nip04Event.id = getEventHash(nip04Event);
  
      nip04Event.sig = signEvent(nip04Event, sk1);

      let sub = relay.sub([
        {
          kinds: [kind],
          authors: [event.pubkey],
        },
      ]);
  
      sub.on('event', (event) => {
        console.log('got event:', event);
      });

      let pub = relay.publish(nip04Event);
      pub.on('ok', () => {
        console.log(`${relay.url} has accepted our event`);
      });
      pub.on('failed', (reason) => {
        console.log(`failed to publish to ${relay.url}: ${reason}`);
      });
      
      let events = await relay.list([{ kinds: [0, kind] }]);
      let postedEvent = await relay.get({
        ids: [event.id],
      });
    } else if (kind === 30018) {
      event.content.stall_id = event.pubkey; // using users public key as stall id
      const productId = event.content.id;
      event.content = JSON.stringify(event.content);
      event.id = getEventHash(event);
      event.sig = signEvent(event, privkey);
      // event.tags = [["d", event.id]];
  
      let sub = relay.sub([
        {
          kinds: [kind],
          authors: [event.pubkey],
        },
      ]);
  
      sub.on("event", (event) => {
        console.log("got event:", event);
      });
  
      let pub = relay.publish(event);
      pub.on("ok", () => {
        console.log(`${relay.url} has accepted our event`);
      });
      pub.on("failed", (reason) => {
        console.log(`failed to publish to ${relay.url}: ${reason}`);
      });
  
      let events = await relay.list([{ kinds: [0, kind] }]);
      let postedEvent = await relay.get({
        ids: [event.id],
      });
    } else if (kind === 30402) {
      event.id = getEventHash(event);
  
      event.sig = signEvent(event, privkey);
  
      let sub = relay.sub([
        {
          kinds: [kind],
          authors: [event.pubkey],
        },
      ]);
  
      sub.on('event', (event) => {
        console.log('got event:', event);
      });
  
      let pub = relay.publish(event);
      pub.on('ok', () => {
        console.log(`${relay.url} has accepted our event`);
      });
      pub.on('failed', (reason) => {
        console.log(`failed to publish to ${relay.url}: ${reason}`);
      });
  
      let events = await relay.list([{ kinds: [0, kind] }]);
      let postedEvent = await relay.get({
        ids: [event.id],
      });
    };

    relay.close();

    return res.status(200).json({});
  } catch (error) {
    console.error(error);
    return res.status(500).json({});
  }
};

export default PostEvent;