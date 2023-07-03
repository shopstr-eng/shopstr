import React, { useEffect, useState } from "react";
import axios from "axios";
import DisplayEvents from "../components/display-events";
import { ProductFormValues } from "../components/product-form";
import { useRouter } from "next/router";
import { TiDelete } from "react-icons/ti";
import {
  AiOutlineHome,
  AiOutlineMessage,
  AiOutlineWallet,
} from "react-icons/ai";
import { Tooltip, Button, Spacer } from "@nextui-org/react";
import DirectMessages from "../components/direct-messages";

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
      url: "/api/nostr/post-listing",
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
      <div className="xl:w-2/3 h-full bg-purple-500 rounded-md py-8 px-16 my-1">
        <div className="flex flex-row justify-between">
          <h1 className="text-3xl font-bold text-yellow-100">
            {pubkey
              ? pubkey === localStorage.getItem("publicKey")
                ? "Your Shopstr Shop"
                : "Shopstr Seller View"
              : "Shopstr Marketplace"}
          </h1>
          <div className="flex space-x-2">
            <AiOutlineHome
              className={`w-6 h-6 hover:text-purple-700 ${
                displayComponent === "home" ? "text-yellow-100" : ""
              }`}
              onClick={() => setDisplayComponent("home")}
            />
            <AiOutlineMessage
              className={`w-6 h-6 hover:text-purple-700 ${
                displayComponent === "messages" ? "text-yellow-100" : ""
              }`}
              onClick={() => setDisplayComponent("messages")}
            />
            <AiOutlineWallet
              className={`w-6 h-6 hover:text-purple-700 ${
                displayComponent === "wallet" ? "text-yellow-100" : ""
              }`}
              onClick={() => setDisplayComponent("wallet")}
            />
          </div>
        </div>
        {pubkey ? (
          <Tooltip content="Clear pubkey" placement="right">
            <div
              className="flex flex-row w-fit pr-2 align-middle hover:bg-yellow-100 hover:text-black rounded-md cursor-pointer"
              onClick={() => {
                routeToShop("");
              }}
            >
              <div>
                <TiDelete style={{ height: "2rem", width: "2rem" }} />
              </div>
              <span className="text-lg font-bold">{pubkey ? pubkey : ""}</span>
            </div>
          </Tooltip>
        ) : undefined}

        {displayComponent === "home" && (
          <DisplayEvents
            router={router}
            pubkey={pubkey}
            clickPubKey={(pubkey) => {
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