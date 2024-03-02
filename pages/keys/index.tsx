import { useState, useEffect } from "react";
import axios from "axios";
import { useRouter } from "next/router";
import * as CryptoJS from "crypto-js";
import { EyeIcon, EyeSlashIcon } from "@heroicons/react/24/outline";
import { Card, CardBody, Button, Input, Image } from "@nextui-org/react";
import { SHOPSTRBUTTONCLASSNAMES } from "../../components/utility/STATIC-VARIABLES";

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
        JSON.stringify([
          "wss://relay.damus.io",
          "wss://nos.lol",
          "wss://nostr.mutinywallet.com",
        ]),
      );

      localStorage.setItem(
        "mints",
        JSON.stringify(["https://mint.minibits.cash/Bitcoin"]),
      );

      router.push("/");
    }
  };

  return (
    <div className="flex h-[100vh] flex-col bg-light-bg pb-20 pt-4 dark:bg-dark-bg sm:ml-[120px] md:ml-[250px]">
      <div className="p-4">
        <Card>
          <CardBody>
            <div className="mb-4 flex flex-row items-center justify-center">
              <Image
                alt="Shopstr logo"
                height={50}
                radius="sm"
                src="/shopstr-2000x2000.png"
                width={50}
              />
              <h1 className="cursor-pointer text-center text-3xl font-bold text-shopstr-purple-light hover:text-purple-700 dark:text-shopstr-yellow-light">
                Shopstr
              </h1>
            </div>
            <div className="mb-4 flex flex-col">
              Make sure to write down and save your public and private keys in a
              secure format!
            </div>
            <div className="mb-4 flex flex-col">
              <label className="text-xl">Public Key:</label>
              {publicKey && (
                <div
                  className="border-color-yellow-500 break-all rounded-md border-b-2 border-l-2 border-shopstr-purple bg-light-bg px-1 text-xl dark:border-shopstr-yellow dark:bg-dark-bg"
                  onClick={handleCopyPubkey}
                >
                  {publicKey}
                </div>
              )}
            </div>
            <div className="mb-4 flex flex-col">
              <label className="text-xl">Private Key:</label>
              {privateKey && (
                <div className="flex items-center justify-between rounded-md border-b-2 border-l-2 border-shopstr-purple bg-light-bg text-xl dark:border-shopstr-yellow dark:bg-dark-bg">
                  <div className="break-all px-1" onClick={handleCopyPrivkey}>
                    {viewState === "shown" ? privateKey : "* * * * *"}
                  </div>
                  {viewState === "shown" ? (
                    <EyeSlashIcon
                      className="h-6 w-6 flex-shrink-0 px-1 hover:text-purple-700"
                      onClick={() => {
                        setViewState("hidden");
                      }}
                    />
                  ) : (
                    <EyeIcon
                      className="h-6 w-6 flex-shrink-0 px-1 hover:text-purple-700"
                      onClick={() => {
                        setViewState("shown");
                      }}
                    />
                  )}
                </div>
              )}
            </div>
            <div className="mb-4 flex flex-col">
              <label className="text-xl">
                Encryption Passphrase:<span className="text-red-500">*</span>
              </label>
              <Input
                type="text"
                width="100%"
                size="lg"
                value={passphrase}
                placeholder="Enter a passphrase of your choice..."
                onChange={(e) => setPassphrase(e.target.value)}
                onKeyDown={(e) => {
                  if (
                    e.key === "Enter" &&
                    !(passphrase === "" || passphrase === null)
                  )
                    handleSignIn();
                }}
              />
            </div>
            <div className="flex justify-center">
              <Button
                className={SHOPSTRBUTTONCLASSNAMES}
                onClick={handleSignIn}
              >
                Sign In
              </Button>
            </div>
          </CardBody>
        </Card>
      </div>
    </div>
  );
};

export default Keys;
