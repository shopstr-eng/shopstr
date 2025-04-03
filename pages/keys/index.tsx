import { useState, useEffect, useContext } from "react";
import { useRouter } from "next/router";
import { EyeIcon, EyeSlashIcon } from "@heroicons/react/24/outline";
import { Card, CardBody, Button, Input, Image } from "@nextui-org/react";
import { SHOPSTRBUTTONCLASSNAMES } from "../../components/utility/STATIC-VARIABLES";
import { setLocalStorageDataOnSignIn } from "@/components/utility/nostr-helper-functions";
import { RelaysContext } from "../../utils/context/context";
import { SignerContext } from "@/utils/context/nostr-context";
import { NostrSigner } from "@/utils/nostr/signers/nostr-signer";
import { NostrNSecSigner } from "@/utils/nostr/signers/nostr-nsec-signer";
import { generateKeys } from "@/components/utility/nostr-helper-functions";
import FailureModal from "../../components/utility-components/failure-modal";
import SuccessModal from "../../components/utility-components/success-modal";

const Keys = () => {
  const router = useRouter();
  const signerContext = useContext(SignerContext);
  const relaysContext = useContext(RelaysContext);

  const [npub, setNPub] = useState<string>("");
  const [privateKey, setPrivateKey] = useState<string>("");
  const [passphrase, setPassphrase] = useState<string>("");
  const [viewState, setViewState] = useState<"shown" | "hidden">("hidden");
  const [isLoading, setIsLoading] = useState(false);
  const [isNavigating, setIsNavigating] = useState(false);

  const [showFailureModal, setShowFailureModal] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [successText, setSuccessText] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    if (!signerContext) {
      console.error("SignerContext not initialized");
      setErrorMessage("Application not properly initialized. Please refresh the page.");
      setShowFailureModal(true);
      return;
    }

    if (!signerContext.newSigner) {
      console.error("newSigner function not available");
      setErrorMessage("Signer functionality not available. Please refresh the page.");
      setShowFailureModal(true);
      return;
    }
  }, [signerContext]);

  const saveSigner = (signer: NostrSigner) => {
    try {
      if (
        !relaysContext.isLoading &&
        relaysContext.relayList.length >= 0 &&
        relaysContext.readRelayList &&
        relaysContext.writeRelayList
      ) {
        const generalRelays = relaysContext.relayList;
        const readRelays = relaysContext.readRelayList;
        const writeRelays = relaysContext.writeRelayList;
        setLocalStorageDataOnSignIn({
          signer,
          relays: generalRelays,
          readRelays: readRelays,
          writeRelays: writeRelays,
        });
      } else {
        setLocalStorageDataOnSignIn({
          signer,
        });
      }
    } catch (error) {
      console.error("Error saving signer:", error);
      setErrorMessage("Failed to save signer data");
      setShowFailureModal(true);
    }
  };

  useEffect(() => {
    const fetchKeys = async () => {
      try {
        setIsLoading(true);
        const { nsec, npub } = await generateKeys();
        setNPub(npub);
        setPrivateKey(nsec);
      } catch (error) {
        console.error("Error generating keys:", error);
        setErrorMessage("Failed to generate keys");
        setShowFailureModal(true);
      } finally {
        setIsLoading(false);
      }
    };

    fetchKeys();
  }, []);

  const handleCopyPubkey = () => {
    try {
      navigator.clipboard.writeText(npub);
      setSuccessText("Public key was copied to clipboard!");
      setShowSuccessModal(true);
    } catch (error) {
      console.error("Error copying public key:", error);
      setErrorMessage("Failed to copy public key");
      setShowFailureModal(true);
    }
  };

  const handleCopyPrivkey = () => {
    try {
      navigator.clipboard.writeText(privateKey);
      setSuccessText("Private key was copied to clipboard!");
      setShowSuccessModal(true);
    } catch (error) {
      console.error("Error copying private key:", error);
      setErrorMessage("Failed to copy private key");
      setShowFailureModal(true);
    }
  };

  const handleSignIn = async () => {
    if (!signerContext) {
      setErrorMessage("Signer context not initialized. Please refresh the page.");
      setShowFailureModal(true);
      return;
    }

    if (!signerContext.newSigner) {
      setErrorMessage("Signer creation function not available. Please refresh the page.");
      setShowFailureModal(true);
      return;
    }

    if (passphrase === "" || passphrase === null) {
      setErrorMessage("No passphrase provided!");
      setShowFailureModal(true);
      return;
    }

    if (isNavigating) {
      return;
    }

    try {
      setIsLoading(true);
      
      let encryptedPrivKey, pubkey;
      try {
        const result = NostrNSecSigner.getEncryptedNSEC(
          privateKey,
          passphrase,
        );
        encryptedPrivKey = result.encryptedPrivKey;
        pubkey = result.pubkey;
      } catch (error) {
        console.error("Error encrypting private key:", error);
        setErrorMessage("Failed to encrypt private key. Please try again.");
        setShowFailureModal(true);
        return;
      }

      let signer;
      try {
        if (typeof signerContext.newSigner !== 'function') {
          throw new Error("newSigner is not a function");
        }
        
        signer = signerContext.newSigner("nsec", {
          encryptedPrivKey: encryptedPrivKey,
          pubkey,
        });
      } catch (error) {
        console.error("Error creating signer:", error);
        setErrorMessage("Failed to create signer. Please try again.");
        setShowFailureModal(true);
        return;
      }

      try {
        if (!signer || typeof signer.getPubKey !== 'function') {
          throw new Error("Signer or getPubKey is not available");
        }
        await signer.getPubKey();
      } catch (error) {
        console.error("Error getting public key:", error);
        setErrorMessage("Failed to get public key. Please try again.");
        setShowFailureModal(true);
        return;
      }

      saveSigner(signer);
      
      if (router.pathname !== "/marketplace") {
        setIsNavigating(true);
        try {
          if (router.asPath === "/marketplace") {
            console.log("Already on marketplace page");
            return;
          }
          
          await router.replace("/marketplace");
        } catch (error: any) {
          if (error?.cancelled) {
            console.log("Navigation cancelled");
          } else {
            console.error("Navigation error:", error);
            setErrorMessage("Navigation failed. Please try again.");
            setShowFailureModal(true);
          }
        } finally {
          setIsNavigating(false);
        }
      }
    } catch (error) {
      console.error("Error during sign in:", error);
      setErrorMessage("Failed to sign in. Please try again.");
      setShowFailureModal(true);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    const handleRouteChangeError = (err: any) => {
      if (err.cancelled) {
        console.log("Route change cancelled");
      } else {
        console.error("Route change error:", err);
        setErrorMessage("Navigation failed. Please try again.");
        setShowFailureModal(true);
      }
    };

    router.events.on("routeChangeError", handleRouteChangeError);

    return () => {
      router.events.off("routeChangeError", handleRouteChangeError);
    };
  }, [router]);

  if (isLoading) {
    return (
      <div className="flex h-[100vh] items-center justify-center bg-light-bg dark:bg-dark-bg">
        <div className="text-center">
          <div className="mb-4 text-xl text-light-text dark:text-dark-text">
            Generating your keys...
          </div>
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-shopstr-purple dark:border-shopstr-yellow mx-auto"></div>
        </div>
      </div>
    );
  }

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
                  isLoading={isLoading || isNavigating}
                >
                  Sign In
                </Button>
              </div>
            </CardBody>
          </Card>
        </div>
      </div>
      <FailureModal
        bodyText={errorMessage || "No passphrase provided!"}
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
