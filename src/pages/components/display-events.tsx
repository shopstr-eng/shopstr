import { useState, useEffect } from 'react';
import Link from 'next/link';
import axios from 'axios';
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

const DisplayEvents = () => {
  const [eventData, setEventData] = useState<Event[]>([]);
  // const prevPosts = [];
  const imageUrlRegExp = /(https?:\/\/.*\.(?:png|jpg|jpeg|gif))/i;

  useEffect(() => {
    const relayUrl = 'wss://relay.damus.io';
    const relay = relayInit(relayUrl);

    relay.on('connect', () => {
      console.log(`connected to ${relay.url}`);
    });
    relay.on('error', () => {
      console.log(`failed to connect to ${relay.url}`);
    });

    relay.connect();

    relay.sub([{ kinds: [1] }]).on('event', (event) => {
      setEventData((eventData) => [event, ...eventData]); // add new post to top of posts array
    });

    return () => {
      relay.close();
    };
  }, []);

  const displayDate = (timestamp: number): string => {
    const d = new Date(timestamp * 1000);
    const dateString = d.toLocaleString();
    return dateString;
  };

  return (
    <div className="mt-8 mb-8 overflow-y-scroll max-h-96">
      {eventData?.reverse().map((event) => (
        <div key={event.id} className="p-4 mb-4 bg-gray-100 rounded-md shadow-lg max-w-xl">
          <div className="flex justify-between items-center text-gray-600 text-xs md:text-sm">
            <Link href={{ pathname: '/components/direct-messages', query: { pubkey: event.pubkey } }}>
              <span className="max-w-xsm truncate">{event.pubkey}</span>
            </Link>
            <span className="text-gray-400 ml-2 text-xs md:text-sm">{displayDate(event.created_at)}</span>
          </div>
          <div className="mt-2 text-gray-800 text-sm md:text-base whitespace-pre-wrap max-w-xl break-words">
            {event.content.indexOf(imageUrlRegExp) ? (
              <div>
                  <p>{event.content.replace(imageUrlRegExp, '')}</p>
                <img src={event.content.match(imageUrlRegExp)?.[0]} />
              </div>
            ) : (
              <div>
                <p>{event.content}</p>
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
};

export default DisplayEvents;
