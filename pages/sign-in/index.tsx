import { useState, useEffect, useContext } from "react";
import { withRouter, NextRouter } from "next/router";
import { nip19, getPublicKey } from "nostr-tools";
import CryptoJS from "crypto-js";
import {
  setLocalStorageDataOnSignIn,
  validateNSecKey,
} from "../../components/utility/nostr-helper-functions";
import { RelaysContext, CashuWalletContext } from "../../utils/context/context";
import { Card, CardBody, Button, Input, Image } from "@nextui-org/react";
import { SHOPSTRBUTTONCLASSNAMES } from "../../components/utility/STATIC-VARIABLES";
import { isAndroid } from "../../utils/platform-detection";
import FailureModal from "../../components/utility-components/failure-modal";

const LoginPage = ({ router }: { router: NextRouter }) => {
  const [privateKey, setPrivateKey] = useState<string>("");
  const [errorMessage, setErrorMessage] = useState<string>("");
  const [validPrivateKey, setValidPrivateKey] = useState<boolean>(false);
  const [passphrase, setPassphrase] = useState<string>("");

  const [isAndroidDevice, setIsAndroidDevice] = useState(false);

  const [showFailureModal, setShowFailureModal] = useState(false);
  const [failureText, setFailureText] = useState("");

  const relaysContext = useContext(RelaysContext);
  const cashuWalletContext = useContext(CashuWalletContext);

  useEffect(() => {
    setIsAndroidDevice(isAndroid());
  }, []);

  const handleSignIn = async () => {
    if (validPrivateKey) {
      if (passphrase === "" || passphrase === null) {
        setFailureText("No passphrase provided!");
        setShowFailureModal(true);
      } else {
        let { data: sk } = nip19.decode(privateKey);
        let pk = getPublicKey(sk as Uint8Array);
        let npub = nip19.npubEncode(pk);
        localStorage.setItem("npub", npub);

        let encryptedPrivateKey = CryptoJS.AES.encrypt(
          privateKey,
          passphrase,
        ).toString();

        localStorage.setItem("encryptedPrivateKey", encryptedPrivateKey);

        localStorage.setItem("signIn", "nsec");

        if (
          !relaysContext.isLoading &&
          relaysContext.relayList.length != 0 &&
          relaysContext.readRelayList &&
          relaysContext.writeRelayList
        ) {
          localStorage.setItem(
            "relays",
            JSON.stringify(relaysContext.relayList),
          );
          localStorage.setItem(
            "readRelays",
            JSON.stringify(relaysContext.readRelayList),
          );
          localStorage.setItem(
            "writeRelays",
            JSON.stringify(relaysContext.writeRelayList),
          );
        } else {
          localStorage.setItem(
            "relays",
            JSON.stringify([
              "wss://relay.damus.io",
              "wss://nos.lol",
              "wss://purplepag.es",
              "wss://relay.primal.net",
              "wss://relay.nostr.band",
            ]),
          );
        }

        if (!cashuWalletContext.isLoading) {
          if (cashuWalletContext.cashuWalletRelays.length != 0) {
            localStorage.setItem(
              "cashuWalletRelays",
              JSON.stringify(cashuWalletContext.cashuWalletRelays),
            );
          }
          if (cashuWalletContext.cashuMints.length != 0) {
            localStorage.setItem(
              "mints",
              JSON.stringify(cashuWalletContext.cashuMints),
            );
          } else {
            localStorage.setItem(
              "mints",
              JSON.stringify(["https://mint.minibits.cash/Bitcoin"]),
            );
          }
          if (cashuWalletContext.cashuProofs.length != 0) {
            localStorage.setItem(
              "tokens",
              JSON.stringify(cashuWalletContext.cashuProofs),
            );
          }
        }

        localStorage.setItem("wot", "3");

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
      if (
        !relaysContext.isLoading &&
        relaysContext.relayList.length != 0 &&
        relaysContext.readRelayList &&
        relaysContext.writeRelayList
      ) {
        localStorage.setItem("relays", JSON.stringify(relaysContext.relayList));
        localStorage.setItem(
          "readRelays",
          JSON.stringify(relaysContext.readRelayList),
        );
        localStorage.setItem(
          "writeRelays",
          JSON.stringify(relaysContext.writeRelayList),
        );
      } else {
        localStorage.setItem(
          "relays",
          JSON.stringify([
            "wss://relay.damus.io",
            "wss://nos.lol",
            "wss://purplepag.es",
            "wss://relay.primal.net",
            "wss://relay.nostr.band",
          ]),
        );
      }
      if (!cashuWalletContext.isLoading) {
        if (cashuWalletContext.cashuWalletRelays.length != 0) {
          localStorage.setItem(
            "cashuWalletRelays",
            JSON.stringify(cashuWalletContext.cashuWalletRelays),
          );
        }
        if (cashuWalletContext.cashuMints.length != 0) {
          localStorage.setItem(
            "mints",
            JSON.stringify(cashuWalletContext.cashuMints),
          );
        } else {
          localStorage.setItem(
            "mints",
            JSON.stringify(["https://mint.minibits.cash/Bitcoin"]),
          );
        }
        if (cashuWalletContext.cashuProofs.length != 0) {
          localStorage.setItem(
            "tokens",
            JSON.stringify(cashuWalletContext.cashuProofs),
          );
        }
      }
      localStorage.setItem("wot", "3");
      router.push("/");
    } catch (error) {
      setFailureText("Extension sign in failed!");
      setShowFailureModal(true);
    }
  };

  const startAmberLogin = async () => {
    try {
      const amberSignerUrl =
        "nostrsigner:?compressionType=none&returnType=signature&type=get_public_key";

      await navigator.clipboard.writeText("");

      window.open(amberSignerUrl, "_blank");

      const checkClipboard = async () => {
        try {
          if (!document.hasFocus()) {
            console.log("Document not focused, waiting for focus...");
            return;
          }

          const clipboardContent = await navigator.clipboard.readText();

          if (
            clipboardContent &&
            clipboardContent !== "" &&
            clipboardContent.startsWith("npub")
          ) {
            const pk = clipboardContent;

            if (pk) {
              if (
                !relaysContext.isLoading &&
                relaysContext.relayList.length >= 0 &&
                relaysContext.readRelayList &&
                relaysContext.writeRelayList
              ) {
                if (!cashuWalletContext.isLoading) {
                  const generalRelays = relaysContext.relayList;
                  const readRelays = relaysContext.readRelayList;
                  const writeRelays = relaysContext.writeRelayList;
                  setLocalStorageDataOnSignIn({
                    signInMethod: "amber",
                    npub: pk,
                    relays: generalRelays,
                    readRelays: readRelays,
                    writeRelays: writeRelays,
                    cashuWalletRelays:
                      cashuWalletContext.cashuWalletRelays.length != 0
                        ? cashuWalletContext.cashuWalletRelays
                        : [],
                    mints:
                      cashuWalletContext.cashuMints.length != 0
                        ? cashuWalletContext.cashuMints
                        : ["https://mint.minibits.cash/Bitcoin"],
                    wot: 3,
                  });
                } else {
                  const generalRelays = relaysContext.relayList;
                  const readRelays = relaysContext.readRelayList;
                  const writeRelays = relaysContext.writeRelayList;
                  setLocalStorageDataOnSignIn({
                    signInMethod: "amber",
                    npub: pk,
                    relays: generalRelays,
                    readRelays: readRelays,
                    writeRelays: writeRelays,
                    wot: 3,
                  });
                }
              } else {
                setLocalStorageDataOnSignIn({
                  signInMethod: "amber",
                  npub: pk,
                });
              }

              await navigator.clipboard.writeText("");

              clearInterval(intervalId);

              router.push("/");
            }
          }
        } catch (error) {
          console.error("Error reading clipboard:", error);
        }
      };

      checkClipboard();
      const intervalId = setInterval(checkClipboard, 1000);

      setTimeout(() => {
        clearInterval(intervalId);
        console.log("Amber sign in timeout");
        setFailureText("Amber sign in timed out. Please try again.");
        setShowFailureModal(true);
      }, 60000);
    } catch (error) {
      console.error("Amber sign in failed:", error);
      setFailureText("Amber sign in failed!");
      setShowFailureModal(true);
    }
  };

  useEffect(() => {
    setValidPrivateKey(validateNSecKey(privateKey));
  }, [privateKey]);

  return (
    <>
      <div className="flex h-full flex-col bg-light-bg pt-24 dark:bg-dark-bg">
        <div className="flex max-h-screen flex-row items-center justify-center">
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
                <h1
                  onClick={() => {
                    router.push("/");
                  }}
                  className="cursor-pointer text-center text-3xl font-bold text-shopstr-purple-light hover:text-purple-700 dark:text-shopstr-yellow-light"
                >
                  Shopstr
                </h1>
              </div>
              {errorMessage && (
                <div className="mb-4 rounded bg-red-500 px-4 py-2 text-light-text dark:text-dark-text">
                  {errorMessage}
                </div>
              )}
              <div className="mb-4 flex flex-col">
                <label className="text-xl">Private Key:</label>
                <Input
                  color={validPrivateKey ? "success" : "danger"}
                  type="password"
                  width="100%"
                  size="lg"
                  value={privateKey}
                  placeholder="nsec..."
                  onChange={(e) => setPrivateKey(e.target.value)}
                />
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
                    if (e.key === "Enter" && validPrivateKey) handleSignIn();
                  }}
                />
              </div>
              <div className="flex flex-row justify-between space-x-2">
                <Button
                  className={SHOPSTRBUTTONCLASSNAMES}
                  onClick={handleGenerateKeys}
                >
                  Create Account
                </Button>
                <Button
                  className={SHOPSTRBUTTONCLASSNAMES}
                  onClick={startExtensionLogin}
                >
                  Extension Sign In
                </Button>
                {isAndroidDevice && (
                  <Button
                    className={`${SHOPSTRBUTTONCLASSNAMES} w-full`}
                    onClick={startAmberLogin}
                  >
                    Amber Sign In
                  </Button>
                )}
                <Button
                  className={SHOPSTRBUTTONCLASSNAMES}
                  onClick={handleSignIn}
                  disabled={!validPrivateKey} // Disable the button only if both key strings are invalid or the button has already been clicked
                >
                  Sign In
                </Button>
              </div>
            </CardBody>
          </Card>
        </div>
      </div>
      <FailureModal
        bodyText={failureText}
        isOpen={showFailureModal}
        onClose={() => {
          setShowFailureModal(false);
          setFailureText("");
        }}
      />
    </>
  );
};

export default withRouter(LoginPage);
