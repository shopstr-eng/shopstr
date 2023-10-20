import React from "react";
import {
  HomeIcon,
  EnvelopeOpenIcon,
  WalletIcon,
  GlobeAltIcon,
  ArrowRightOnRectangleIcon,
  ArrowLeftOnRectangleIcon,
} from "@heroicons/react/24/outline";
import { useRouter } from "next/router";

const Navbar = () => {
  const router = useRouter();
  return (
    <div className="flex flex-row justify-between">
      <h1
        className="text-3xl font-bold text-purple-500 hover:text-purple-700 cursor-pointer"
        onClick={() => router.push("/")}
      >
        Shopstr
      </h1>
      <div className="flex space-x-2 mt-2">
        <HomeIcon
          className={`w-6 h-6 hover:text-purple-700 cursor-pointer ${
            router.pathname === "/" ? "text-purple-500" : ""
          }`}
          onClick={() => router.push("/")}
        />
        <EnvelopeOpenIcon
          className={`w-6 h-6 hover:text-purple-700 cursor-pointer ${
            router.pathname === "/direct-messages" ? "text-purple-500" : ""
          }`}
          onClick={() => router.push("/direct-messages")}
        />
        <WalletIcon
          className={`w-6 h-6 hover:text-purple-700 cursor-pointer ${
            router.pathname === "/wallet" ? "text-purple-500" : ""
          }`}
          onClick={() => router.push("/wallet")}
        />
        <GlobeAltIcon
          className={`w-6 h-6 hover:text-purple-700 cursor-pointer ${
            router.pathname === "/relays" ? "text-purple-500" : ""
          }`}
          onClick={() => router.push("/relays")}
        />
        <ArrowRightOnRectangleIcon 
          className="w-6 h-6 hover:text-purple-700 cursor-pointer"
          onClick={() => {
            router.push("/sign-in");
          }}
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
