import React, { useEffect, useState } from "react";
import axios from "axios";
import DisplayEvents from "../components/display-events";
import { ProductFormValues } from "../api/post-event";
import { useRouter } from "next/router";
import { ArrowUturnLeftIcon } from '@heroicons/react/24/outline';

// const Tooltip = ({ content, children }) => {
//   const [showTooltip, setShowTooltip] = useState(false);
//   return (
//     <div className="relative inline-block">
//       <div
//         className={`${
//           showTooltip ? 'block' : 'hidden'
//         } bg-gray-800 text-white text-xs rounded-md py-1 px-2 absolute z-10`}
//       >
//         {content}
//       </div>
//       <div
//         className="inline-block rounded-md cursor-pointer"
//         onMouseEnter={() => setShowTooltip(true)}
//         onMouseLeave={() => setShowTooltip(false)}
//       >
//         {children}
//       </div>
//     </div>
//   );
// };

const SellerView = () => {
  const [pubkey, setPubkey] = useState("");
  const [displayComponent, setDisplayComponent] = useState("home");

  const router = useRouter();
  useEffect(() => {
    setPubkey(router.query.pubkey ? router.query.pubkey[0] : ""); // router.query.pubkey returns array of pubkeys
  }, [router.query.pubkey]);

  const handlePostListing = (values: ProductFormValues) => {
    const summary = values.find(([key]) => key === "summary")?.[1] || "";
    
    const created_at = Math.floor(Date.now() / 1000);
    // Add "published_at" key
    const updatedValues = [...values, ["published_at", String(created_at)]];
    
    axios({
      method: "POST",
      url: "/api/nostr/post-event",
      headers: {
        "Content-Type": "application/json",
      },
      data: {
        pubkey: localStorage.getItem("publicKey"),
        privkey: localStorage.getItem("privateKey"),
        created_at: created_at,
        kind: 30402,
        // kind: 30018,
        tags: updatedValues,
        content: summary,
        relays: JSON.parse(localStorage.getItem("relays")),
      },
    });
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
          {pubkey}
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
