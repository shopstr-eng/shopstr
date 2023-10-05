import { useState, useEffect } from "react";
import axios from "axios";
import DisplayProduct from "./display-product";
import { nip19, SimplePool } from "nostr-tools";
import { ProductFormValues } from "../api/post-event";
import { createNostrDeleteEvent } from "../nostr-helpers";
import * as CryptoJS from "crypto-js";

export type Event = {
  id: string;
  pubkey: string;
  created_at: number;
  kind: number;
  tags: ProductFormValues;
  content: string;
  sig: string;
};

const DisplayEvents = ({
  focusedPubkey,
  clickNPubkey,
}: {
  focusedPubkey?: string;
  clickNPubkey: (npubkey: string) => void;
}) => {
  const [decryptedNpub, setDecryptedNpub] = useState("");
  const [encryptedPrivateKey, setEncryptedPrivateKey] = useState("");
  const [signIn, setSignIn] = useState("");
  const [relays, setRelays] = useState([]);
  const [eventData, setEventData] = useState<Event[]>([]);
  const imageUrlRegExp = /(https?:\/\/.*\.(?:png|jpg|jpeg|gif))/i;

  useEffect(() => {
    if (typeof window !== "undefined") {
      const npub = localStorage.getItem("npub");
      const { data } = nip19.decode(npub);
      setDecryptedNpub(data);
      const encrypted = localStorage.getItem("encryptedPrivateKey");
      setEncryptedPrivateKey(encrypted);
      const signIn = localStorage.getItem("signIn");
      setSignIn(signIn);
      const storedRelays = localStorage.getItem("relays");
      setRelays(storedRelays ? JSON.parse(storedRelays) : []);
    }
  }, []);

  useEffect(() => {
    const pool = new SimplePool();
    setEventData([]);
    let subParams: { kinds: number[]; authors?: string[] } = {
      kinds: [30402],
    };
    let productsSub = pool.sub(relays, [subParams]);
    productsSub.on("event", (event) => {
      if (focusedPubkey && focusedPubkey !== event.pubkey) {
        // needed cause on reload in a sellers shop, it displays all posts instead of just the sellers
        return;
      }
      setEventData((eventData) => {
        let newEventData = [...eventData, event];
        newEventData.sort((a, b) => b.created_at - a.created_at); // sorts most recently created to least recently created
        return newEventData;
      });
    });
  }, [relays]);

  const displayDate = (timestamp: number): string => {
    const d = new Date(timestamp * 1000);
    const dateString = d.toLocaleString();
    return dateString;
  };

  const getSelectedSellersProducts = () => {
    if (focusedPubkey == "") return eventData;
    return eventData.filter((event) => event.pubkey == focusedPubkey);
  };

  const handleDelete = async (productId: string, passphrase: string) => {
    if (signIn === "extension") {
      const event = {
        created_at: Math.floor(Date.now() / 1000),
        kind: 5,
        tags: [["e", productId]],
        content: "user deletion request",
      };

      const signedEvent = await window.nostr.signEvent(event);

      const pool = new SimplePool();

      // const relays = JSON.parse(storedRelays);

      await pool.publish(relays, signedEvent);

      let events = await pool.list(relays, [{ kinds: [0, signedEvent.kind] }]);
      let postedEvent = await pool.get(relays, {
        ids: [signedEvent.id],
      });
    } else {
      let nsec = CryptoJS.AES.decrypt(encryptedPrivateKey, passphrase).toString(
        CryptoJS.enc.Utf8,
      );
      // add error handling and re-prompt for passphrase
      let { data } = nip19.decode(nsec);
      let deleteEvent = await createNostrDeleteEvent(
        [productId],
        decryptedNpub,
        "user deletion request",
        data,
      );
      axios({
        method: "POST",
        url: "/api/nostr/post-event",
        headers: {
          "Content-Type": "application/json",
        },
        data: {
          ...deleteEvent,
          relays: relays,
        },
      });
    }
    setEventData((eventData) => {
      let newEventData = eventData.filter((event) => event.id !== productId); // removes the deleted product from the list
      return newEventData;
    });
  };

  return (
    <div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 mt-8 mb-8 overflow-y-scroll overflow-x-hidden max-h-[70vh] max-w-full">
        {getSelectedSellersProducts()?.map((event, index) => {
          let npub = nip19.npubEncode(event.pubkey);
          return (
            <div
              key={event.sig + "-" + index}
              className="p-4 mb-4 mx-2 bg-gray-100 rounded-md shadow-lg"
            >
              <div className="flex justify-between items-center text-gray-600 text-xs md:text-sm">
                <span
                  className="max-w-xsm truncate hover:text-purple-600 rounded-md cursor-pointer"
                  onClick={() => {
                    clickNPubkey(npub);
                  }}
                >
                  {npub}
                </span>
                <span className="text-gray-400 ml-2 text-xs md:text-sm">
                  {displayDate(event.created_at)}
                </span>
              </div>
              <div className="mt-2 text-gray-800 text-sm md:text-base whitespace-pre-wrap break-words">
                {event.kind == 30402 ? (
                  <DisplayProduct
                    tags={event.tags}
                    eventId={event.id}
                    pubkey={event.pubkey}
                    handleDelete={handleDelete}
                  />
                ) : event.content.indexOf(imageUrlRegExp) ? (
                  <div>
                    <p>{event.content.replace(imageUrlRegExp, "")}</p>
                    <img src={event.content.match(imageUrlRegExp)?.[0]} />
                  </div>
                ) : (
                  <div>
                    <p>{event.content}</p>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default DisplayEvents;
