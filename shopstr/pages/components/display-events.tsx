import { useState, useEffect } from "react";
import axios from "axios";
import { withRouter, NextRouter } from "next/router";
import { relayInit, getEventHash, signEvent } from "nostr-tools";
import "websocket-polyfill";
import DisplayProduct from "./display-product";
import getRelay from "../api/nostr/relay";
import ProductForm, { ProductFormValues } from "../components/product-form";

import { Tooltip, Button, Spacer } from "@nextui-org/react";

export type Event = {
  id: string;
  pubkey: string;
  created_at: number;
  kind: number;
  tags: [];
  content: string;
  sig: string;
};

const DisplayEvents = ({
  router,
  pubkey,
  clickPubKey,
  handlePostListing,
}: {
  router: NextRouter;
  pubkey?: string;
  clickPubKey: (pubkey: string) => void;
  handlePostListing: (ProductFormValues: ProductFormValues) => void;
}) => {
  const [eventData, setEventData] = useState<Event[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [displayComponent, setDisplayComponent] = useState("home");
  // const prevPosts = [];
  const imageUrlRegExp = /(https?:\/\/.*\.(?:png|jpg|jpeg|gif))/i;

  const handleModalToggle = () => {
    setShowModal(!showModal);
  };

  useEffect(() => {
    setEventData([]);
    const relay = getRelay();

    relay.on("connect", () => {
      console.log(`connected to ${relay.url}`);
    });
    relay.on("error", () => {
      console.log(`failed to connect to ${relay.url}`);
    });

    relay.connect();

    let subParams: { kinds: number[]; authors?: string[] } = {
      kinds: [30018],
    };

    if (pubkey) {
      subParams["authors"] = [pubkey];
    }
    let productsSub = relay.sub([subParams]);
    console.log(subParams);
    productsSub.on("event", (event) => {
      setEventData((eventData) => {
        let newEventData = [...eventData, event];
        newEventData.sort((a, b) => b.created_at - a.created_at); // sorts most recently created to least recently created
        return newEventData;
      }); // add new post to top of posts array
    });

    return () => {
      relay.close();
    };
  }, [pubkey]);

  const displayDate = (timestamp: number): string => {
    const d = new Date(timestamp * 1000);
    const dateString = d.toLocaleString();
    return dateString;
  };

  const handleClickPubkey = (pubkey: string) => {
    clickPubKey(pubkey);
  };

  return (
    <div>
      <div
        className="mt-8 mb-8 overflow-y-scroll"
        style={{ maxHeight: "80vh" }}
      >
        {eventData?.map((event) => {
          console.log(event);
          return (
            <div
              key={event.id}
              className="p-4 mb-4 bg-gray-100 rounded-md shadow-lg"
            >
              <div className="flex justify-between items-center text-gray-600 text-xs md:text-sm">
                <Tooltip content={"Go to this sellers store"}>
                  <span
                    className="max-w-xsm truncate hover:hover:bg-yellow-100 rounded-md cursor-pointer"
                    onClick={() => {
                      handleClickPubkey(event.pubkey);
                    }}
                  >
                    {event.pubkey}
                  </span>
                </Tooltip>
                <span className="text-gray-400 ml-2 text-xs md:text-sm">
                  {displayDate(event.created_at)}
                </span>
              </div>
              {event.kind == 30018 ? (
                <DisplayProduct product={JSON.parse(event.content)} />
              ) : (
                <div className="mt-2 text-gray-800 text-sm md:text-base whitespace-pre-wrap max-w-xl break-words">
                  {event.content.indexOf(imageUrlRegExp) ? (
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
              )}
            </div>
          );
        })}
      </div>
      <div>
        <Button
          flat
          // disabled={pubkey === localStorage.getItem("publicKey")}
          onClick={() => {
            routeToShop(localStorage.getItem("publicKey"));
          }}
        >
          View Your Shop
        </Button>
        <Spacer y={0.3} />
        <Button flat onClick={handleModalToggle}>
          Add new listing
        </Button>
      </div>
      <ProductForm
        handlePostListing={handlePostListing}
        showModal={showModal}
        handleModalToggle={handleModalToggle}
      />
    </div>
  );
};

export default DisplayEvents;
