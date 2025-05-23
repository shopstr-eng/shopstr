import { useState, useEffect, useContext } from "react";
import { useRouter } from "next/router";
import { EyeIcon, EyeSlashIcon } from "@heroicons/react/24/outline";
import { Card, CardBody, Button, Input, Image } from "@nextui-org/react";
import { ArrowLongRightIcon } from "@heroicons/react/24/outline";
import { SHOPSTRBUTTONCLASSNAMES } from "@/utils/STATIC-VARIABLES";
import {
  generateKeys,
  setLocalStorageDataOnSignIn,
} from "@/utils/nostr/nostr-helper-functions";
import { RelaysContext } from "../../utils/context/context";
import { SignerContext } from "@/components/utility-components/nostr-context-provider";
import { NostrSigner } from "@/utils/nostr/signers/nostr-signer";
import { NostrNSecSigner } from "@/utils/nostr/signers/nostr-nsec-signer";
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

  const { newSigner } = useContext(SignerContext);
  const relaysContext = useContext(RelaysContext);

  const saveSigner = (signer: NostrSigner) => {
    if (
      !relaysContext.isLoading &&
      relaysContext.relayList.length >= 0 &&
      relaysContext.readRelayList &&
      relaysContext.writeRelayList
    ) {
      setLocalStorageDataOnSignIn({
        signer,
        relays: relaysContext.relayList,
        readRelays: relaysContext.readRelayList,
        writeRelays: relaysContext.writeRelayList,
      });
    } else {
      setLocalStorageDataOnSignIn({ signer });
    }
  };

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

  const handleNext = async () => {
    if (passphrase === "" || passphrase === null) {
      setShowFailureModal(true);
    } else {
      const { encryptedPrivKey, pubkey } = NostrNSecSigner.getEncryptedNSEC(
        privateKey,
        passphrase
      );
      const signer = newSigner!("nsec", {
        encryptedPrivKey: encryptedPrivKey,
        pubkey,
      });
      await signer.getPubKey();
      saveSigner(signer);
      router.push("/onboarding/user-profile");
    }
  };

  return (
    <>
      <div className="flex h-[100vh] flex-col bg-light-bg pt-24 dark:bg-dark-bg">
        <div className="mx-auto w-full max-w-2xl px-4 py-6">
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
              <div className="mb-4 text-center">
                <h2 className="text-2xl font-bold text-light-text dark:text-dark-text">
                  Step 1: Secure Your Keys
                </h2>
                <p className="text-light-text dark:text-dark-text">
                  Make sure to save your public and private keys in a secure
                  format! You can always view them again under your profile
                  settings.
                </p>
              </div>

              {/* Public Key Section */}
              <div className="mb-4 flex flex-col space-y-2">
                <label className="text-xl">Public Key:</label>
                {npub && (
                  <div
                    className="cursor-pointer break-all rounded-md border border-shopstr-purple bg-light-bg p-2 text-lg dark:border-shopstr-yellow dark:bg-dark-bg"
                    onClick={handleCopyPubkey}
                  >
                    {npub}
                  </div>
                )}
              </div>

              <div className="mb-4 flex flex-col space-y-2">
                <label className="text-xl">Private Key:</label>
                {privateKey && (
                  <div className="relative flex items-center rounded-md border border-shopstr-purple bg-light-bg dark:border-shopstr-yellow dark:bg-dark-bg">
                    <div
                      className="w-full cursor-pointer break-all px-2 py-1"
                      onClick={handleCopyPrivkey}
                    >
                      {viewState === "shown" ? privateKey : "* * * * *"}
                    </div>
                    {viewState === "shown" ? (
                      <EyeSlashIcon
                        className="absolute right-2 h-5 w-5 cursor-pointer"
                        onClick={() => {
                          setViewState("hidden");
                        }}
                      />
                    ) : (
                      <EyeIcon
                        className="absolute right-2 h-5 w-5 cursor-pointer"
                        onClick={() => {
                          setViewState("shown");
                        }}
                      />
                    )}
                  </div>
                )}
              </div>

              <div className="mb-4 flex flex-col space-y-2">
                <label className="text-xl">
                  Encryption Passphrase:<span className="text-red-500">*</span>
                </label>
                <Input
                  type="password"
                  fullWidth
                  size="lg"
                  value={passphrase}
                  placeholder="Enter a passphrase of your choice..."
                  onChange={(e) => setPassphrase(e.target.value)}
                  onKeyDown={(e) => {
                    if (
                      e.key === "Enter" &&
                      !(passphrase === "" || passphrase === null)
                    )
                      handleNext();
                  }}
                />
              </div>

              <div className="flex justify-center">
                <Button
                  className={SHOPSTRBUTTONCLASSNAMES}
                  onClick={handleNext}
                >
                  Next <ArrowLongRightIcon className="h-5 w-5" />
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
