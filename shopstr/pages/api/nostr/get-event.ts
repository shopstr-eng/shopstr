import { useState } from 'react';
import type { NextApiRequest, NextApiResponse } from 'next';
import {
  relayInit,
  getEventHash,
  signEvent
} from 'nostr-tools';
import 'websocket-polyfill';

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

    const relayUrl = 'wss://relay.damus.io';
    const relay = relayInit(relayUrl);

    relay.on('connect', () => {
      console.log(`connected to ${relay.url}`);
    });
    relay.on('error', () => {
      console.log(`failed to connect to ${relay.url}`);
    });

    relay.connect();

    relay.sub([{ kinds: [kind] }]).on('event', (event) => {
      events.push(event); // add new post to events array
    });

    relay.close();

    return res.status(200).json({ events: events });
  } catch (error) {
    console.error(error);
    return res.status(500).json({});
  }
};

export default GetEvent;
