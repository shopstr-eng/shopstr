import { useState, useEffect } from 'react';
import axios from 'axios';
import {
  relayInit,
  getEventHash,
  signEvent
} from 'nostr-tools';
import 'websocket-polyfill';
// import DisplayProduct from "./display-product";
// import getRelay from "../api/nostr/relay";
// import ProductForm, { ProductFormValues } from "../components/product-form";

// import { Tooltip, Button, Spacer } from "@nextui-org/react";

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
//   const DisplayEvents = ({
//   router,
//   pubkey,
//   clickPubKey,
//   handlePostListing,
// }: {
//   router: NextRouter;
//   pubkey?: string;
//   clickPubKey: (pubkey: string) => void;
//   handlePostListing: (ProductFormValues: ProductFormValues) => void;
// }) => {
  const [eventData, setEventData] = useState<Event[]>([]);
  // const prevPosts = [];
  const imageUrlRegExp = /(https?:\/\/.*\.(?:png|jpg|jpeg|gif))/i;
  const [showModal, setShowModal] = useState(false);
  // const [displayComponent, setDisplayComponent] = useState("home");

  useEffect(() => {
    const relayUrl = 'wss://relay.damus.io';
    const relay = relayInit(relayUrl);
    //     setEventData([]);
    // const relay = getRelay();

    relay.on('connect', () => {
      console.log(`connected to ${relay.url}`);
    });
    relay.on('error', () => {
      console.log(`failed to connect to ${relay.url}`);
    });

    relay.connect();

    relay.sub([{ kinds: [1] }]).on('event', (event) => {
      setEventData((eventData) => [event, ...eventData]); // add new post to top of posts array
    //     let subParams: { kinds: number[]; authors?: string[] } = {
    //   kinds: [30018],
    // };

    // if (pubkey) {
    //   subParams["authors"] = [pubkey];
    // }
    // let productsSub = relay.sub([subParams]);
    // console.log(subParams);
    // productsSub.on("event", (event) => {
    //   setEventData((eventData) => {
    //     let newEventData = [...eventData, event];
    //     newEventData.sort((a, b) => b.created_at - a.created_at); // sorts most recently created to least recently created
    //     return newEventData;
    //   });
    });

    return () => {
      relay.close();
    };
  }, []);
    // }, [pubkey]);

    //  const handleClickPubkey = (pubkey: string) => {
  //   clickPubKey(pubkey);
  // };

  const displayDate = (timestamp: number): string => {
    const d = new Date(timestamp * 1000);
    const dateString = d.toLocaleString();
    return dateString;
  };

  const handleCopyPubkey = (pubkey: string) => {
    navigator.clipboard.writeText(pubkey);
    alert(`Pubkey '${pubkey}' copied to clipboard!`);
  };

  const handleModalToggle = () => {
    setShowModal(!showModal);
  };

  const handlePostListing = () => {
    const eventContent = document.getElementById('eventContent') as HTMLTextAreaElement;
    axios({
      method: 'POST',
      url: '/api/nostr/post-event',
      headers: {
        'Content-Type': 'application/json',
      },
      data: {
        pubkey: localStorage.getItem('publicKey'),
        privkey: localStorage.getItem('privateKey'),
        created_at: Math.floor(Date.now() / 1000),
        kind: 1,
        tags: [],
        content: eventContent.value,
      }
    });
    setShowModal(false);
  };

  return (
    <div>
      <div className="mt-8 mb-8 overflow-y-scroll max-h-96">
        {eventData?.reverse().map((event) => (
          <div key={event.sig} className="p-4 mb-4 bg-gray-100 rounded-md shadow-lg max-w-xl">
            <div className="flex justify-between items-center text-gray-600 text-xs md:text-sm">
              <span className="max-w-xsm truncate" onClick={() => handleCopyPubkey(event.pubkey)} style={{ cursor: "pointer" }}>{event.pubkey}</span>
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
                      {/* <div>
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
                </span> */}
                </div>
              )}
            </div>
          </div>
        ))}
        {/* {event.kind == 30018 ? (
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
      /> */}
      </div>
      <div className="flex justify-between">
        <button
          className="bg-yellow-100 hover:bg-purple-700 text-purple-500 font-bold py-2 px-4 rounded"
          onClick={handleModalToggle}
        >
          Add new listing
        </button>
      </div>
      <div className={`fixed z-10 inset-0 overflow-y-auto ${showModal ? "" : "hidden"}`}>
        <div className="flex items-end justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
          <div className="fixed inset-0 transition-opacity" aria-hidden="true">
            <div className="absolute inset-0 bg-gray-500 opacity-75"></div>
          </div>
          <span className="hidden sm:inline-block sm:align-middle sm:h-screen" aria-hidden="true">&#8203;</span>
          <div className="inline-block align-bottom bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg sm:w-full">
            <div className="bg-white px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
              <div className="sm:flex sm:items-start">
                <div className="mt-3 text-center sm:mt-0 sm:ml-4 sm:text-left">
                  <h3 className="text-lg leading-6 font-medium text-gray-900 mb-4">
                    Add New Listing
                  </h3>
                  <div className="mt-2">
                    <textarea id="eventContent" className="shadow-sm focus:ring-indigo-500 focus:border-indigo-500 block w-full sm:text-sm border-gray-300 rounded-md mb-2" placeholder="Enter event content here..."></textarea>
                  </div>
                </div>
              </div>
            </div>
            <div className="bg-gray-50 px-4 py-3 sm:px-6 sm:flex sm:flex-row-reverse">
              <button
                type="button"
                className="w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-green-600 text-base font-medium text-white hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 sm:ml-3 sm:w-auto sm:text-sm"
                onClick={handlePostListing}
              >
                Add Listing
              </button>
              <button
                type="button"
                className="mt-3 w-full inline-flex justify-center rounded-md border border-gray-300 shadow-sm px-4 py-2 bg-white text-base font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 sm:mt-0 sm:ml-3 sm:w-auto sm:text-sm"
                onClick={handleModalToggle}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DisplayEvents;

