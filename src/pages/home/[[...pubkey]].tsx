import React, { useEffect, useState } from "react";
import axios from "axios";
import DisplayEvents from "../components/display-events";
import { ProductFormValues } from "../components/product-form";
import { useRouter } from "next/router";
import { 
  EnvelopeIcon, 
  HomeIcon, 
  WalletIcon,
  XCircleIcon,
  ArrowLeftIcon
} from '@heroicons/react/24/outline';
import DirectMessages from "../components/direct-messages";

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
    console.log(values);
    axios({
      method: "POST",
      url: "/api/nostr/post-event",
      headers: {
        "Content-Type": "application/json",
      },
      data: {
        pubkey: localStorage.getItem("publicKey"),
        privkey: localStorage.getItem("privateKey"),
        created_at: Math.floor(Date.now() / 1000),
        kind: 30018,
        tags: [],
        content: values,
      },
    });
  };

  const routeToShop = (pubkey) => {
    setPubkey(pubkey);
    router.push("/home/" + pubkey);
  };

  return (
    <div className="flex flex-col h-screen justify-center items-center bg-yellow-100">
      <div className="w-10/12 lg:w-2/3 xl:w-1/2 bg-purple-500 rounded-md py-8 px-16">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-3xl font-bold text-yellow-100">
            {pubkey
              ? pubkey === localStorage.getItem("publicKey")
                ? "Your Shopstr Shop"
                : "Shopstr Seller View"
              : "Shopstr Marketplace"}
          </h1>
          <div className="flex space-x-2">
            <HomeIcon
              className={`w-6 h-6 hover:text-purple-700 ${displayComponent === 'home' ? 'text-yellow-100' : ''}`}
              onClick={() => setDisplayComponent('home')}
            />
            <EnvelopeIcon
              className={`w-6 h-6 hover:text-purple-700 ${displayComponent === 'messages' ? 'text-yellow-100' : ''}`}
              onClick={() => setDisplayComponent('messages')}
            />
            <WalletIcon
              className={`w-6 h-6 hover:text-purple-700 ${displayComponent === 'wallet' ? 'text-yellow-100' : ''}`}
              onClick={() => setDisplayComponent('wallet')}
            />
          </div>
        </div>
        {pubkey ? (
          <h2 className="max-w-xsm truncate text-yellow-500">
            <ArrowLeftIcon 
              className="w-5 h-5 text-yellow-100 hover:text-purple-700" 
              onClick={() => {
                routeToShop("");
              }}
            >
              Go Back
            </ArrowLeftIcon>
            {pubkey}
          </h2>
        ) : undefined}
        {displayComponent === "home" && (
          <DisplayEvents
            router={router}
            pubkey={pubkey}
            clickPubkey={(pubkey) => {
              routeToShop(pubkey);
            }}
            handlePostListing={handlePostListing}
          />
        )}
        {displayComponent === "messages" && <DirectMessages />}
      </div>
    </div>
  );
};

export default SellerView;