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

export interface PostEventRequest {
  pubkey: string,
  privkey: string,
  created_at: number,
  kind: number,
  tags: [],
  content: string,
}

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
    console.log("Missing or invalid property: tags");
    throw new Error('Invalid request data: missing or invalid property');
  }
  if (!parsedBody.content || typeof parsedBody.content !== 'string') { 
    console.log("Missing or invalid property: content");
    throw new Error('Invalid request data: missing or invalid property');
  }
  return parsedBody;
};

const PostEvent = async (req: NextApiRequest, res: NextApiResponse) => {
  if (req.method !== 'POST') {
    return res.status(405).json({});
  }

  try {
    const event = parseRequestBody(req.body);
    const privkey = event.privkey;
    delete event.privkey;

    const kind = event.kind;

    const relay = relayInit('wss://relay.damus.io');
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
    };

    relay.close();

    return res.status(200).json({});
  } catch (error) {
    console.error(error);
    return res.status(500).json({});
  }
};

export default PostEvent;