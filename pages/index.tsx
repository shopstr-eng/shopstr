import { useState, useEffect } from "react";
import axios from "axios";
import { withRouter, NextRouter } from "next/router";
import { nip19 } from "nostr-tools";
import * as CryptoJS from "crypto-js";
import { validateNPubKey, validateNSecKey } from "./nostr-helpers";
import {
  Card,
  CardBody,
  Button,
  Input,
  Image,
} from "@nextui-org/react";

const LoginPage = ({ router }: { router: NextRouter }) => {
  const [publicKey, setPublicKey] = useState<string>("");
  const [privateKey, setPrivateKey] = useState<string>("");
  const [errorMessage, setErrorMessage] = useState<string>("");
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
          passphrase,
        ).toString();

        localStorage.setItem("encryptedPrivateKey", encryptedPrivateKey);

        localStorage.setItem("signIn", "nsec");

        localStorage.setItem(
          "relays",
          JSON.stringify(["wss://relay.damus.io", "wss://nos.lol"]),
        );

        router.push("/marketplace");
      }
    } else {
      setErrorMessage(
        "The public and/or private keys inputted were not valid. Generate a new key pair or try again.",
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
      localStorage.setItem("signIn", "extension");
      localStorage.setItem(
        "relays",
        JSON.stringify(["wss://relay.damus.io", "wss://nos.lol"]),
      );
      alert("Signed in as " + npub);
      router.push("/marketplace");
    } catch (error) {
      alert("Extension sign in failed");
    }
  };

  useEffect(() => {
    setValidPublicKey(validateNPubKey(publicKey));
    setValidPrivateKey(validateNSecKey(privateKey));
  }, [publicKey, privateKey]);

  useEffect(() => {
    let signinMethod = localStorage.getItem("signIn");
    if (signinMethod === "extension" || signinMethod === "nsec")
      router.push("/marketplace");
  }, []);

  return (
    <div className="flex flex-row justify-center items-center min-h-screen">
      <Card>
        <CardBody>
          <div className="flex flex-row items-center justify-center mb-4">
            <Image
              alt="Shopstr logo"
              height={50}
              radius="sm"
              src="/shopstr.png"
              width={50}
            />
            <h1 className="text-3xl font-bold text-center text-purple-500">
              Shopstr
            </h1>
          </div>
          {errorMessage && (
            <div className="bg-red-500 text-white py-2 px-4 rounded mb-4">
              {errorMessage}
            </div>
          )}
          <div className="flex flex-col mb-4">
            <label className="text-xl">Public Key:</label>
            <Input
              color={validPublicKey ? "success" : "error"}
              type="text"
              width="100%"
              size="large"
              value={publicKey}
              placeholder="npub..."
              onChange={(e) => setPublicKey(e.target.value)}
            />
          </div>
          <div className="flex flex-col mb-4">
            <label className="text-xl">Private Key:</label>
            <Input
              color={validPrivateKey ? "success" : "error"}
              type="text"
              width="100%"
              size="large"
              value={privateKey}
              placeholder="nsec..."
              onChange={(e) => setPrivateKey(e.target.value)}
            />
          </div>
          <div className="flex flex-col mb-4">
            <label className="text-xl">
              Encryption Passphrase:<span className="text-red-500">*</span>
            </label>
            <Input
              type="text"
              width="100%"
              size="large"
              value={passphrase}
              placeholder="Enter a passphrase of your choice..."
              onChange={(e) => setPassphrase(e.target.value)}
            />
          </div>
          <div className="flex flex-row justify-between space-x-2">
            <Button
              className="text-white shadow-lg bg-gradient-to-tr from-purple-600 via-purple-500 to-purple-600"
              onClick={handleGenerateKeys}
            >
              Create Account
            </Button>
            <Button
              className="text-white shadow-lg bg-gradient-to-tr from-purple-600 via-purple-500 to-purple-600"
              onClick={startExtensionLogin}
            >
              Extension Sign In
            </Button>
            <Button
              className="text-white shadow-lg bg-gradient-to-tr from-purple-600 via-purple-500 to-purple-600"
              onClick={handleSignIn}
              disabled={!validPublicKey || !validPrivateKey} // Disable the button only if both key strings are invalid or the button has already been clicked
            >
              Sign In
            </Button>
          </div>
        </CardBody>
      </Card>
    </div>
  );
};

export default withRouter(LoginPage);
