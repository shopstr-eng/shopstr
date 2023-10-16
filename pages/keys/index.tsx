import { useState, useEffect } from "react";
import axios from "axios";
import { useRouter } from "next/router";
import * as CryptoJS from "crypto-js";
import {
  EyeIcon,
  EyeSlashIcon,
  InformationCircleIcon,
} from "@heroicons/react/24/outline";
import {
  Card,
  CardBody,
  Button,
  Input,
  Image,
} from "@nextui-org/react";

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
          "Make sure to write down and save your public and private keys in a secure format!",
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
  };

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
          <div className="flex flex-col mb-4">
            <label className="text-xl">Public Key:</label>
            {publicKey && (
              <div
                className="border-b-2 border-l-2 border-purple-500 border-color-yellow-500 bg-white rounded-md text-xl overflow-hidden whitespace-nowrap overflow-ellipsis px-1"
                onClick={handleCopyPubkey}
              >
                {publicKey}
              </div>
            )}
          </div>
          <div className="flex flex-col mb-4">
            <label className="text-xl">Private Key:</label>
            {privateKey && (
              <div className="border-b-2 border-l-2 border-purple-500 bg-white rounded-md text-xl flex justify-between items-center">
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
          <div className="flex justify-center">
            <Button
              className="text-white shadow-lg bg-gradient-to-tr from-purple-600 via-purple-500 to-purple-600"
              onClick={handleSignIn}
            >
              Sign In
            </Button>
          </div>
        </CardBody>
      </Card>
    </div>
  );
};

export default Keys;
