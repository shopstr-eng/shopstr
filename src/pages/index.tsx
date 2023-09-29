import { useState, useEffect } from "react";
import axios from "axios";
import { withRouter, NextRouter } from "next/router";
import { nip19 } from "nostr-tools";
import * as CryptoJS from "crypto-js";

const LoginPage = ({ router }: { router: NextRouter }) => {
  const [publicKey, setPublicKey] = useState<string>("");
  const [privateKey, setPrivateKey] = useState<string>("");
  const [errorMessage, setErrorMessage] = useState<string>("");
  const [disabled, setDisabled] = useState<boolean>(false);
  const [validPublicKey, setValidPublicKey] = useState<boolean>(false);
  const [validPrivateKey, setValidPrivateKey] = useState<boolean>(false);
  const [passphrase, setPassphrase] = useState<string>("");

  const handleSignIn = () => {
    if (validPublicKey && validPrivateKey) {
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
    } else {
      setErrorMessage(
        "The public and/or private keys inputted were not valid. Generate a new key pair or try again."
      );
    }
  };

  const handleGenerateKeys = () => {
    router.push("/keys");
  };

  const startExtensionLogin = async () => {
    try {
      // @ts-ignore
      var pubkey = await window.nostr.getPublicKey();
      let npub = nip19.npubEncode(pubkey);
      setPublicKey(npub);
      localStorage.setItem("npub", npub);
      let successStr = "Signed in as " + npub;
      alert(successStr);
      localStorage.setItem("signIn", "extension");
      localStorage.setItem(
        "relays",
        JSON.stringify(["wss://relay.damus.io", "wss://nos.lol"])
      );
      router.push("/marketplace");
    } catch (error) {
      alert("Extension sign in failed");
    }
  };

  useEffect(() => {
    const validPubKey = /^npub[a-zA-Z0-9]{59}$/;
    const validPrivKey = /^nsec[a-zA-Z0-9]{59}$/;

    setValidPublicKey(publicKey.match(validPubKey) !== null);
    setValidPrivateKey(privateKey.match(validPrivKey) !== null);
  }, [publicKey, privateKey]);

  useEffect(() => {
    if (
      localStorage.getItem("signIn") === "extension" ||
      localStorage.getItem("signIn") === "nsec"
    ) {
      router.push("/marketplace");
    }
  }, []);

  return (
    <div className="flex flex-col h-full justify-center items-center bg-yellow-100 rounded-md">
      <div className="w-10/12 lg:w-2/3 xl:w-1/2 bg-purple-500 rounded-md py-8 px-16">
        <h1 className="text-3xl font-bold text-center text-yellow-100 mb-4">
          Shopstr
        </h1>
        {errorMessage && (
          <div className="bg-red-500 text-white py-2 px-4 rounded mb-4">
            {errorMessage}
          </div>
        )}
        <div className="flex flex-col mb-4">
          <label className="text-xl text-yellow-100">Public Key</label>
          <input
            type="text"
            className="border-b-2 border-yellow-100 bg-purple-900 focus:outline-none focus:border-purple-900 text-yellow-100 text-xl"
            value={publicKey}
            placeholder={"npub..."}
            onChange={(e) => setPublicKey(e.target.value)}
            style={{ borderColor: validPublicKey ? "green" : "red" }}
          />
        </div>
        <div className="flex flex-col mb-4">
          <label className="text-xl text-yellow-100">Private Key</label>
          <input
            type="text"
            className="border-b-2 border-yellow-100 bg-purple-900 focus:outline-none focus:border-purple-900 text-yellow-100 text-xl"
            value={privateKey}
            placeholder={"nsec..."}
            onChange={(e) => setPrivateKey(e.target.value)}
            style={{ borderColor: validPrivateKey ? "green" : "red" }}
          />
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
        <div className="flex flex-row justify-between space-x-2">
          <button
            className="bg-yellow-100 hover:bg-purple-700 text-purple-500 font-bold py-2 px-4 rounded"
            onClick={handleGenerateKeys}
          >
            Generate Keys
          </button>
          <button
            className="bg-yellow-100 hover:bg-purple-700 text-purple-500 font-bold py-2 px-4 rounded hidden lg:block"
            onClick={startExtensionLogin}
          >
            Sign In With Extension
          </button>
          <button
            className="bg-yellow-100 hover:bg-purple-700 text-purple-500 font-bold py-2 px-4 rounded"
            onClick={handleSignIn}
            disabled={!validPublicKey || !validPrivateKey} // Disable the button only if both key strings are invalid or the button has already been clicked
          >
            Sign In
          </button>
        </div>
      </div>
    </div>
  );
};

export default withRouter(LoginPage);
