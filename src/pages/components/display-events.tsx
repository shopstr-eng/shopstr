import { useState, useEffect } from "react";
import DisplayProduct from "./display-product";
import { SimplePool } from 'nostr-tools';
import ProductForm from "../components/product-form";
import { ProductFormValues } from "../api/post-event";
import { createNostrDeleteEvent } from '../nostrHelpers';

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
  tags: ProductFormValues;
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
    const pool = new SimplePool();
    setEventData([]);

    let subParams: { kinds: number[]; authors?: string[] } = {
      kinds: [30402],
      // kinds: [30018],
    };
    let deleteEventSubParams : { kinds: number[]; authors?: string[] } = {
      kinds: [5],
    };

    if (pubkey) {
      subParams["authors"] = [pubkey];
    }
    let productsSub = pool.sub(JSON.parse(localStorage.getItem("relays")), [subParams]);
    productsSub.on("event", (event) => {
      setEventData((eventData) => {
        let newEventData = [...eventData, event];
        newEventData.sort((a, b) => b.created_at - a.created_at); // sorts most recently created to least recently created
        return newEventData;
      });
    });
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

  const handleDelete = async (productId: string) => {
    let deleteEvent = await createNostrDeleteEvent([productId], localStorage.getItem('publicKey'), "user deletion request", localStorage.getItem('privateKey'));
    axios({
      method: 'POST',
      url: '/api/nostr/post-event',
      headers: {
        'Content-Type': 'application/json',
      },
      data: {
        ...deleteEvent,
        relays: JSON.parse(localStorage.getItem("relays")),
      }
    });
    setEventData((eventData) => {
      let newEventData = eventData.filter((event) => event.id !== productId); // removes the deleted product from the list
      return newEventData;
    });
  };

  return (
    <div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 mt-8 mb-8 overflow-y-scroll overflow-x-hidden max-h-[70vh] max-w-full">
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
            <div className="mt-2 text-gray-800 text-sm md:text-base whitespace-pre-wrap break-words">
              {/*
              {
                event.kind == 30018 ? (
                  <DisplayProduct content={JSON.parse(event.content)} eventId={event.id} pubkey={event.pubkey} />
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
                ))
              } */}
              {
                event.kind == 30402 ? (
                  <DisplayProduct tags={event.tags} eventId={event.id} pubkey={event.pubkey} handleDelete={handleDelete}/>
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
                ))
              }
            </div>
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
