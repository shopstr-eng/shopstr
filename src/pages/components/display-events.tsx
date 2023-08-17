import { useState, useEffect } from "react";
import axios from "axios";
import { relayInit, getEventHash, signEvent } from "nostr-tools";
import "websocket-polyfill";
import DisplayProduct from "./display-product";
import getRelay from "../api/nostr/relays";
import ProductForm, { ProductFormValues } from "../components/product-form";

const Tooltip = ({ content, children }) => {
  const [showTooltip, setShowTooltip] = useState(false);
  return (
    <div className="relative inline-block">
      <div
        className={`${
          showTooltip ? "block" : "hidden"
        } bg-gray-800 text-white text-xs rounded-md py-1 px-2 absolute z-10`}
      >
        {content}
      </div>
      <div
        className="inline-block rounded-md cursor-pointer"
        onMouseEnter={() => setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
      >
        {children}
      </div>
    </div>
  );
};

//           <div className="flex justify-between items-center text-gray-600 text-xs md:text-sm">
//             <Tooltip content={"Go to this sellers store"}>
//               <span
//                 className="max-w-xsm truncate"
//                 onClick={() => {
//                   handleClickPubkey(event.pubkey);
//                 }}
//               >
//                 {event.pubkey}
//               </span>
//             </Tooltip>
//             <span className="text-gray-400 ml-2 text-xs md:text-sm">
//               {displayDate(event.created_at)}
//             </span>
//           </div>

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
  clickPubkey,
  handlePostListing,
}: {
  router: NextRouter;
  pubkey?: string;
  clickPubkey: (pubkey: string) => void;
  handlePostListing: (ProductFormValues: ProductFormValues) => void;
}) => {
  const [eventData, setEventData] = useState<Event[]>([]);
  // const prevPosts = [];
  const imageUrlRegExp = /(https?:\/\/.*\.(?:png|jpg|jpeg|gif))/i;
  const [showModal, setShowModal] = useState(false);
  const [displayComponent, setDisplayComponent] = useState("home");

  useEffect(() => {
    const relay = getRelay();
    setEventData([]);

    relay.on("connect", () => {
      console.log(`connected to ${relay.url}`);
    });
    relay.on("error", () => {
      console.log(`failed to connect to ${relay.url}`);
    });

    relay.connect();

    // relay.sub([{ kinds: [1] }]).on('event', (event) => {
    //   setEventData((eventData) => [event, ...eventData]); // add new post to top of posts array
    let subParams: { kinds: number[]; authors?: string[] } = {
      kinds: [30018],
    };

    if (pubkey) {
      subParams["authors"] = [pubkey];
    }
    let productsSub = relay.sub([subParams]);
    productsSub.on("event", (event) => {
      setEventData((eventData) => {
        let newEventData = [...eventData, event];
        newEventData.sort((a, b) => b.created_at - a.created_at); // sorts most recently created to least recently created
        return newEventData;
      });
    });

    return () => {
      relay.close();
    };
    // }, []);
  }, [pubkey]);

  const handleClickPubkey = (pubkey: string) => {
    clickPubkey(pubkey);
  };

  const displayDate = (timestamp: number): string => {
    const d = new Date(timestamp * 1000);
    const dateString = d.toLocaleString();
    return dateString;
  };

  // const handleCopyPubkey = (pubkey: string) => {
  //   navigator.clipboard.writeText(pubkey);
  //   alert(`Pubkey '${pubkey}' copied to clipboard!`);
  // };

  const handleModalToggle = () => {
    setShowModal(!showModal);
  };

  // const handlePostListing = () => {
  //   const eventContent = document.getElementById('eventContent') as HTMLTextAreaElement;
  //   axios({
  //     method: 'POST',
  //     url: '/api/nostr/post-event',
  //     headers: {
  //       'Content-Type': 'application/json',
  //     },
  //     data: {
  //       pubkey: localStorage.getItem('publicKey'),
  //       privkey: localStorage.getItem('privateKey'),
  //       created_at: Math.floor(Date.now() / 1000),
  //       kind: 1,
  //       tags: [],
  //       content: eventContent.value,
  //     }
  //   });
  //   setShowModal(false);
  // };

  return (
    <div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 mt-8 mb-8 overflow-y-scroll overflow-x-hidden max-h-[80vh] max-w-full">
        {eventData?.map((event) => (
          <div
            key={event.sig}
            className="p-4 mb-4 mx-2 bg-gray-100 rounded-md shadow-lg"
          >
            <div className="flex justify-between items-center text-gray-600 text-xs md:text-sm">
              <span
                className="max-w-xsm truncate hover:text-purple-600 rounded-md cursor-pointer"
                onClick={() => {
                  handleClickPubkey(event.pubkey);
                }}
              >
                {event.pubkey}
              </span>
              <span className="text-gray-400 ml-2 text-xs md:text-sm">
                {displayDate(event.created_at)}
              </span>
            </div>
            <div className="mt-2 text-gray-800 text-sm md:text-base whitespace-pre-wrap max-w-xl break-words">
              {event.kind == 30018 ? (
                <DisplayProduct content={JSON.parse(event.content)} />
              ) : (
                event.content.indexOf(imageUrlRegExp) ? (
                  <div>
                    <p>{event.content.replace(imageUrlRegExp, '')}</p>
                    <img src={event.content.match(imageUrlRegExp)?.[0]} />
                  </div>
                ) : (
                  <div>
                    <p>{event.content}</p>
                  </div>
              ))}
            </div>
            {event.kind == 30018 ? (
              <DisplayProduct content={JSON.parse(event.content)} />
            ) : event.content.indexOf(imageUrlRegExp) ? ( // I'm not sure 173 to 184 is needed. We are only concerned with events of 30018 kind, which are products
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
        ))}
      </div>
      <div className="flex flex-row justify-between">
        <button
          type="button"
          className="bg-yellow-100 hover:bg-purple-700 text-purple-500 font-bold py-2 px-4 rounded"
          // disabled={pubkey === localStorage.getItem("publicKey")}
          onClick={() => {
            handleClickPubkey(localStorage.getItem("publicKey"));
          }}
        >
          View Your Shop
        </button>
        <button
          className="bg-yellow-100 hover:bg-purple-700 text-purple-500 font-bold py-2 px-4 rounded"
          onClick={handleModalToggle}
        >
          Add new listing
        </button>
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
