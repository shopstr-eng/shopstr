import { useState, useEffect } from "react";
import { useRouter } from "next/router";
import CryptoJS from "crypto-js";
import { EyeIcon, EyeSlashIcon } from "@heroicons/react/24/outline";
import { Card, CardBody, Button, Input, Image } from "@nextui-org/react";
import { SHOPSTRBUTTONCLASSNAMES } from "../../components/utility/STATIC-VARIABLES";
import { getPublicKey, nip19 } from "nostr-tools";
import {
  generateKeys,
  setLocalStorageDataOnSignIn,
} from "@/components/utility/nostr-helper-functions";
import FailureModal from "../../components/utility-components/failure-modal";
import SuccessModal from "../../components/utility-components/success-modal";

const Keys = () => {
  const router = useRouter();

  const [npub, setNPub] = useState<string>("");
  const [privateKey, setPrivateKey] = useState<string>("");
  const [passphrase, setPassphrase] = useState<string>("");
  const [viewState, setViewState] = useState<"shown" | "hidden">("hidden");

  const [showFailureModal, setShowFailureModal] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [successText, setSuccessText] = useState("");

  useEffect(() => {
    const fetchKeys = async () => {
      const { nsec, npub } = await generateKeys();
      setNPub(npub);
      setPrivateKey(nsec);
    };

    fetchKeys();
  }, []);

  const handleCopyPubkey = () => {
    navigator.clipboard.writeText(npub);
    setSuccessText("Public key was copied to clipboard!");
    setShowSuccessModal(true);
  };

  const handleCopyPrivkey = () => {
    navigator.clipboard.writeText(privateKey);
    setSuccessText("Private key was copied to clipboard!");
    setShowSuccessModal(true);
  };

  const handleSignIn = () => {
    if (passphrase === "" || passphrase === null) {
      setShowFailureModal(true);
    } else {
      let { data: sk } = nip19.decode(privateKey);
      let pk = getPublicKey(sk as Uint8Array);
      let encryptedPrivateKey = CryptoJS.AES.encrypt(
        privateKey,
        passphrase,
      ).toString();

      setLocalStorageDataOnSignIn({
        signInMethod: "nsec",
        pubkey: pk as string,
        encryptedPrivateKey: encryptedPrivateKey,
      });

      router.push("/marketplace");
    }
  };

  return (
    <>
      <div className="flex h-[100vh] flex-col bg-light-bg pt-24 dark:bg-dark-bg">
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
              <div className="mb-4 flex flex-col text-center">
                Make sure to save your public and private keys in a secure
                format! You can always view them again under your profile
                settings.
              </div>
              <div className="mb-4 flex flex-col">
                <label className="text-xl">Public Key:</label>
                {npub && (
                  <div
                    className="border-color-yellow-500 break-all rounded-md border-b-2 border-l-2 border-shopstr-purple bg-light-bg px-1 text-xl dark:border-shopstr-yellow dark:bg-dark-bg"
                    onClick={handleCopyPubkey}
                  >
                    {npub}
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
                        className="h-6 w-6 flex-shrink-0 px-1 hover:text-purple-700 dark:hover:text-yellow-700"
                        onClick={() => {
                          setViewState("hidden");
                        }}
                      />
                    ) : (
                      <EyeIcon
                        className="h-6 w-6 flex-shrink-0 px-1 hover:text-purple-700 dark:hover:text-yellow-700"
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
                  type="password"
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
      <FailureModal
        bodyText="No passphrase provided!"
        isOpen={showFailureModal}
        onClose={() => setShowFailureModal(false)}
      />
      <SuccessModal
        bodyText={successText}
        isOpen={showSuccessModal}
        onClose={() => setShowSuccessModal(false)}
      />
    </>
  );
};

export default Keys;
