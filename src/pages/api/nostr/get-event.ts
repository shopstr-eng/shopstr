import { useState } from 'react';
import type { NextApiRequest, NextApiResponse } from 'next';
import {
  relayInit,
  getEventHash,
  signEvent
} from 'nostr-tools';
import 'websocket-polyfill';
import getRelay from "./relays";

export type Event = {
  id: string;
  pubkey: string,
  created_at: number,
  kind: number,
  tags: [],
  content: string,
  sig: string,
};

export interface GetEventRequest {
  kind: number,
}

// const parseRequestBody = (body: number) => {
//   const parsedBody = body;
//   return parsedBody;
// }

let events = [];

const GetEvent = async (req: NextApiRequest, res: NextApiResponse) => {
  // const [events, setEvents] = useState<Event[]>([]);
  
  if (req.method !== 'POST') {
    return res.status(405).json({});
  }
  
  try {
    const kind = req.body.kind;

    const relay = getRelay();

    relay.on('connect', () => {
      console.log(`connected to ${relay.url}`);
    });
    relay.on('error', () => {
      console.log(`failed to connect to ${relay.url}`);
    });

    relay.connect();

    relay.sub([{ kinds: [kind] }]).on('event', (event) => {
      if (kind != 4) {
        events.push(event); // add new post to events array
      } else {
        let sk2 = localStorage.getItem("privateKey");
        let sender = event.pubkey;
        let pk1 = sender;
        let plaintext = await nip04.decrypt(sk2, pk1, event.content);
        events.push(plaintext);
        console.log(events)
      }
    });

    relay.close();

    return res.status(200).json({ events: events });
  } catch (error) {
    console.error(error);
    return res.status(500).json({});
  }
};

export default GetEvent;
