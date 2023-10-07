import React, { useEffect, useState } from "react";
import axios from "axios";
import DisplayEvents from "../components/display-events";
import { ProductFormValues } from "../api/post-event";
import { useRouter } from "next/router";
import { ArrowUturnLeftIcon } from '@heroicons/react/24/outline';
import { nip19, SimplePool } from 'nostr-tools';
import 'websocket-polyfill';
import * as CryptoJS from 'crypto-js';

const SellerView = () => {
  const router = useRouter();
  
  const [decryptedNpub, setDecryptedNpub] = useState("");
  const [encryptedPrivateKey, setEncryptedPrivateKey] = useState("");
  const [signIn, setSignIn] = useState("");
  const [relays, setRelays] = useState([]);
  
  const [pubkey, setPubkey] = useState("");
  const [displayComponent, setDisplayComponent] = useState("home");

  useEffect(() => {
    if (typeof window !== 'undefined') {
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
    setPubkey(router.query.pubkey ? router.query.pubkey[0] : ""); // router.query.pubkey returns array of pubkeys
  }, [router.query.pubkey]);

  const handlePostListing = async (values: ProductFormValues, passphrase: string) => {
    const summary = values.find(([key]) => key === "summary")?.[1] || "";
    
    const created_at = Math.floor(Date.now() / 1000);
    // Add "published_at" key
    const updatedValues = [...values, ["published_at", String(created_at)]];

    if (signIn === "extension") {
      const event = {
        created_at: created_at,
        kind: 30402,
          // kind: 30018,
        tags: updatedValues,
        content: summary,
      }
  
      const signedEvent = await window.nostr.signEvent(event);

      const pool = new SimplePool();

      // const relays = JSON.parse(storedRelays);
  
      // let sub = pool.sub(relays, [
      //   {
      //     kinds: [signedEvent.kind],
      //     authors: [signedEvent.pubkey],
      //   },
      // ]);
  
      // sub.on('event', (event) => {
      //   console.log('got event:', event);
      // });
  
      await pool.publish(relays, signedEvent);
  
      let events = await pool.list(relays, [{ kinds: [0, signedEvent.kind] }]);
      let postedEvent = await pool.get(relays, {
        ids: [signedEvent.id],
      });
    } else {
      let nsec = CryptoJS.AES.decrypt(encryptedPrivateKey, passphrase).toString(CryptoJS.enc.Utf8);
      // add error handling and re-prompt for passphrase
      let { data } = nip19.decode(nsec);
      axios({
        method: "POST",
        url: "/api/nostr/post-event",
        headers: {
          "Content-Type": "application/json",
        },
        data: {
          pubkey: decryptedNpub,
          privkey: data,
          created_at: created_at,
          kind: 30402,
          // kind: 30018,
          tags: updatedValues,
          content: summary,
          relays: relays,
        },
      });
    };
  };

  const routeToShop = (pubkey) => {
    setPubkey(pubkey);
    router.push("/marketplace/" + pubkey);
  };

  return (
    <div>
      {pubkey ? (
        <div
          className="flex flex-row items-center w-fit pr-2 align-middle text-yellow-500 hover:bg-purple-600 rounded-md cursor-pointer"
          onClick={() => {
            routeToShop("");
          }}
        >
          <ArrowUturnLeftIcon
            className="w-5 h-5 text-yellow-100 hover:text-purple-700 pr-1"
            onClick={() => {
              routeToShop("");
            }}
          >
            Go Back
          </ArrowUturnLeftIcon>
          {nip19.npubEncode(pubkey)}
        </div>
      ) : undefined}
      <DisplayEvents
        router={router}
        pubkey={pubkey}
        clickPubkey={(pubkey) => {
          routeToShop(pubkey);
        }}
        handlePostListing={handlePostListing}
      />
    </div>
  );
};

export default SellerView;
