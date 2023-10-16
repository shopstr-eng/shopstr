import React from "react";
import {
  HomeIcon,
  EnvelopeOpenIcon,
  WalletIcon,
  GlobeAltIcon,
  ArrowLeftOnRectangleIcon,
} from "@heroicons/react/24/outline";
import { useRouter } from "next/router";

const Navbar = () => {
  const router = useRouter();
  return (
    <div className="flex flex-row justify-between">
      <h1
        className="text-3xl font-bold text-yellow-100 hover:text-purple-700 cursor-pointer"
        onClick={() => router.push("/marketplace")}
      >
        Shopstr
      </h1>
      <div className="flex space-x-2 mt-2">
        <EnvelopeOpenIcon
          className={`w-6 h-6 hover:text-purple-700 cursor-pointer ${
            router.pathname === "/direct-messages" ? "text-yellow-100" : ""
          }`}
          onClick={() => router.push("/direct-messages")}
        />
        <WalletIcon
          className={`w-6 h-6 hover:text-purple-700 cursor-pointer ${
            router.pathname === "/wallet" ? "text-yellow-100" : ""
          }`}
          onClick={() => router.push("/wallet")}
        />
        <GlobeAltIcon
          className={`w-6 h-6 hover:text-purple-700 cursor-pointer ${
            router.pathname === "/relays" ? "text-yellow-100" : ""
          }`}
          onClick={() => router.push("/relays")}
        />
        <ArrowLeftOnRectangleIcon
          className="w-6 h-6 hover:text-purple-700 cursor-pointer"
          onClick={() => {
            localStorage.removeItem("npub");
            localStorage.removeItem("signIn");
            localStorage.removeItem("encryptedPrivateKey");
            router.push("/");
            let successStr = "Logged out";
            alert(successStr);
          }}
        />
      </div>
    </div>
  );
};

export default Navbar;
