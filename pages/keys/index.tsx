import { useState, useEffect } from "react";
import axios from "axios";
import { useRouter } from "next/router";
import * as CryptoJS from "crypto-js";
import {
  EyeIcon,
  EyeSlashIcon,
  InformationCircleIcon,
} from "@heroicons/react/24/outline";
import Tooltip from "../components/tooltip";

const Keys = () => {
  const router = useRouter();

  const [publicKey, setPublicKey] = useState<string>("");
  const [privateKey, setPrivateKey] = useState<string>("");
  const [passphrase, setPassphrase] = useState<string>("");
  const [viewState, setViewState] = useState<"shown" | "hidden">("hidden");

  useEffect(() => {
    axios({
      method: "GET",
      url: "/api/nostr/generate-keys",
    })
      .then((response) => {
        setPublicKey(response.data.npub);
        setPrivateKey(response.data.nsec);
        alert(
          "Make sure to write down and save your public and private keys in a secure format!"
        );
      })
      .catch((error) => {
        console.error(error);
      });
  }, []);

  const handleCopyPubkey = () => {
    navigator.clipboard.writeText(publicKey);
    // navigator.clipboard.writeText(invoiceString);
    alert("Public key was copied to clipboard!");
  };

  const handleCopyPrivkey = () => {
    navigator.clipboard.writeText(privateKey);
    // navigator.clipboard.writeText(invoiceString);
    alert("Private key was copied to clipboard!");
  };

  const handleSignIn = () => {
    if (passphrase === "" || passphrase === null) {
      alert("No passphrase provided!");
    } else {
      localStorage.setItem("npub", publicKey);

      let encryptedPrivateKey = CryptoJS.AES.encrypt(
        privateKey,
        passphrase
      ).toString();

      localStorage.setItem("encryptedPrivateKey", encryptedPrivateKey);

      localStorage.setItem("signIn", "nsec");

      localStorage.setItem(
        "relays",
        JSON.stringify(["wss://relay.damus.io", "wss://nos.lol"])
      );

      router.push("/marketplace");
    }
  };

  return (
    <div className="mt-8 mb-8 max-h-96 rounded-md">
      <h1 className="text-3xl font-bold text-center text-yellow-100 mb-8">
        Keys
      </h1>
      <div className="flex flex-col mb-4">
        <label className="text-xl text-yellow-100">Public Key</label>
        {publicKey && (
          <div
            className="border-b-2 border-yellow-100 bg-white rounded-md text-xl overflow-hidden whitespace-nowrap overflow-ellipsis px-1"
            onClick={handleCopyPubkey}
          >
            {publicKey}
          </div>
        )}
      </div>
      <div className="flex flex-col mb-4">
        <label className="text-xl text-yellow-100">Private Key</label>
        {privateKey && (
          <div className="border-b-2 border-yellow-100 bg-white rounded-md text-xl flex justify-between items-center">
            <div
              className="overflow-hidden whitespace-nowrap overflow-ellipsis px-1"
              onClick={handleCopyPubkey}
            >
              {viewState === "shown" ? privateKey : "* * * * *"}
            </div>
            {viewState === "shown" ? (
              <EyeSlashIcon
                className="w-6 h-6 hover:text-purple-700 flex-shrink-0 px-1"
                onClick={() => {
                  setViewState("hidden");
                }}
              />
            ) : (
              <EyeIcon
                className="w-6 h-6 hover:text-purple-700 flex-shrink-0 px-1"
                onClick={() => {
                  setViewState("shown");
                }}
              />
            )}
          </div>
        )}
      </div>
      <div className="flex flex-col mb-4">
        <label className="text-xl text-yellow-100">
          Passphrase<span className="text-red-500">*</span>
        </label>
        <input
          type="text"
          className="border-b-2 border-yellow-100 bg-purple-900 focus:outline-none focus:border-purple-900 text-yellow-100 text-xl"
          value={passphrase}
          onChange={(e) => setPassphrase(e.target.value)}
        />
      </div>
      <div className="flex justify-center">
        <button
          className="bg-yellow-100 hover:bg-purple-700 text-purple-500 font-bold py-2 px-4 rounded"
          onClick={handleSignIn}
        >
          Sign In
        </button>
      </div>
    </div>
  );
};

export default Keys;
