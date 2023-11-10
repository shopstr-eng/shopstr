import { useState, useEffect } from "react";
import axios from "axios";
import { withRouter, NextRouter } from "next/router";
import { nip19, getPublicKey } from "nostr-tools";
import * as CryptoJS from "crypto-js";
import { validateNSecKey } from "../components/utility/nostr-helper-functions";
import { Card, CardBody, Button, Input, Image } from "@nextui-org/react";

const LoginPage = ({ router }: { router: NextRouter }) => {
  const [privateKey, setPrivateKey] = useState<string>("");
  const [errorMessage, setErrorMessage] = useState<string>("");
  const [validPrivateKey, setValidPrivateKey] = useState<boolean>(false);
  const [passphrase, setPassphrase] = useState<string>("");

  const handleSignIn = async () => {
    if (validPrivateKey) {
      if (passphrase === "" || passphrase === null) {
        alert("No passphrase provided!");
      } else {
        let { data: sk } = nip19.decode(privateKey);
        let pk = await getPublicKey(sk);
        let npub = nip19.npubEncode(pk);
        localStorage.setItem("npub", npub);

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

        alert("Signed in as " + npub + ".");
        router.push("/");
      }
    } else {
      setErrorMessage(
        "The private key inputted was not valid! Generate a new key pair or try again.",
      );
    }
  };

  const handleGenerateKeys = () => {
    router.push("/keys");
  };

  const startExtensionLogin = async () => {
    try {
      // @ts-ignore
      var pk = await window.nostr.getPublicKey();
      let npub = nip19.npubEncode(pk);
      localStorage.setItem("npub", npub);
      localStorage.setItem("signIn", "extension");
      localStorage.setItem(
        "relays",
        JSON.stringify(["wss://relay.damus.io", "wss://nos.lol"]),
      );
      alert("Signed in as " + npub + ".");
      router.push("/");
    } catch (error) {
      alert("Extension sign in failed!");
    }
  };

  useEffect(() => {
    setValidPrivateKey(validateNSecKey(privateKey));
  }, [privateKey]);

  return (
    <div className="flex flex-row justify-center items-center max-h-screen">
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
              disabled={!validPrivateKey} // Disable the button only if both key strings are invalid or the button has already been clicked
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
