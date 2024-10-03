import React, { useEffect, useState, useContext } from "react";
import {
  Modal,
  ModalContent,
  ModalBody,
  Button,
  Image,
  Input,
  InputProps,
} from "@nextui-org/react";
import { SHOPSTRBUTTONCLASSNAMES } from "@/components/utility/STATIC-VARIABLES";
import {
  setLocalStorageDataOnSignIn,
  validateNSecKey,
} from "@/components/utility/nostr-helper-functions";
import { RelaysContext } from "../../utils/context/context";
import { getPublicKey, nip19 } from "nostr-tools";
import CryptoJS from "crypto-js";
import { useRouter } from "next/router";

export default function SignInModal({
  isOpen,
  onClose,
}: {
  isOpen: boolean;
  onClose: () => void;
}) {
  const [privateKey, setPrivateKey] = useState<string>("");
  const [validPrivateKey, setValidPrivateKey] =
    useState<InputProps["color"]>("default");
  const [passphrase, setPassphrase] = useState<string>("");

  const [showNsecSignIn, setShowNsecSignIn] = useState(false);

  const relaysContext = useContext(RelaysContext);

  const router = useRouter();

  const startExtensionLogin = async () => {
    try {
      // @ts-ignore
      var pk = await window.nostr.getPublicKey();
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
          signInMethod: "extension",
          pubkey: pk,
          relays: generalRelays,
          readRelays: readRelays,
          writeRelays: writeRelays,
        });
      } else {
        setLocalStorageDataOnSignIn({
          signInMethod: "extension",
          pubkey: pk,
        });
      }
      onClose();
    } catch (error) {
      alert("Extension sign in failed!");
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
                const generalRelays = relaysContext.relayList;
                const readRelays = relaysContext.readRelayList;
                const writeRelays = relaysContext.writeRelayList;
                setLocalStorageDataOnSignIn({
                  signInMethod: "amber",
                  npub: pk,
                  relays: generalRelays,
                  readRelays: readRelays,
                  writeRelays: writeRelays,
                });
              } else {
                setLocalStorageDataOnSignIn({
                  signInMethod: "amber",
                  npub: pk,
                });
              }

              await navigator.clipboard.writeText("");

              clearInterval(intervalId);
              onClose();
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
        alert("Amber sign in timed out. Please try again.");
      }, 60000);
    } catch (error) {
      console.error("Amber sign in failed:", error);
      alert("Amber sign in failed!");
    }
  };

  const handleGenerateKeys = () => {
    router.push("/keys");
    onClose();
  };

  const handleSignIn = async () => {
    if (validPrivateKey) {
      if (passphrase === "" || passphrase === null) {
        alert("No passphrase provided!");
      } else {
        let { data: sk } = nip19.decode(privateKey);
        let pk = getPublicKey(sk as Uint8Array);
        let encryptedPrivateKey = CryptoJS.AES.encrypt(
          privateKey,
          passphrase,
        ).toString();

        setTimeout(() => {
          onClose(); // avoids tree walker issue by closing modal
        }, 500);

        if (
          !relaysContext.isLoading &&
          relaysContext.relayList.length >= 0 &&
          relaysContext.readRelayList &&
          relaysContext.writeRelayList
        ) {
          const allRelays = [
            ...relaysContext.relayList,
            ...relaysContext.readRelayList,
            ...relaysContext.writeRelayList,
          ];
          setLocalStorageDataOnSignIn({
            signInMethod: "nsec",
            pubkey: pk,
            encryptedPrivateKey: encryptedPrivateKey,
            relays: allRelays,
          });
        } else {
          setLocalStorageDataOnSignIn({
            signInMethod: "nsec",
            pubkey: pk,
            encryptedPrivateKey: encryptedPrivateKey,
          });
        }
      }
    } else {
      alert(
        "The private key inputted was not valid! Generate a new key pair or try again.",
      );
    }
  };

  useEffect(() => {
    if (privateKey === "") {
      setValidPrivateKey("default");
    } else {
      setValidPrivateKey(validateNSecKey(privateKey) ? "success" : "danger");
    }
  }, [privateKey]);

  if (!isOpen) return null;

  return (
    <Modal
      backdrop="blur"
      isOpen={isOpen}
      onClose={onClose}
      // className="bg-light-fg dark:bg-dark-fg text-black dark:text-white"
      classNames={{
        body: "py-6 ",
        backdrop: "bg-[#292f46]/50 backdrop-opacity-60",
        header: "border-b-[1px] border-[#292f46]",
        footer: "border-t-[1px] border-[#292f46]",
        closeButton: "hover:bg-black/5 active:bg-white/10",
      }}
      isDismissable={true}
      scrollBehavior={"normal"}
      placement={"center"}
      size="2xl"
    >
      <ModalContent>
        <ModalBody className="flex flex-col overflow-hidden text-light-text dark:text-dark-text">
          <div className="flex flex-row">
            <div className="hidden basis-1/2 flex-col md:flex">
              <div className="mr-3">
                <Image src="signup.png" alt="sign up"></Image>
              </div>
              <div className="mt-10 flex">
                <div>
                  <p>New to Nostr?</p>
                  <p> Sign up to get started!</p>
                </div>
                <Button
                  className={"ml-10 self-center"}
                  onClick={handleGenerateKeys}
                >
                  Sign Up
                </Button>
              </div>
            </div>

            <div className="flex w-full grow basis-1/2 flex-col">
              <div className="space-y-2">
                <div className="flex items-center justify-center">
                  <Image
                    alt="Shopstr logo"
                    height={50}
                    radius="sm"
                    src="/shopstr-2000x2000.png"
                    width={50}
                  />
                  <div>Shopstr</div>
                </div>
                <Button
                  className={`${SHOPSTRBUTTONCLASSNAMES} w-full`}
                  onClick={startExtensionLogin}
                >
                  Extension Sign In
                </Button>
                <div className="text-center">------ or ------</div>
                <Button
                  className={`${SHOPSTRBUTTONCLASSNAMES} w-full`}
                  onClick={startAmberLogin}
                >
                  Amber Sign In
                </Button>
                <div className="text-center">------ or ------</div>
              </div>
              <div className="flex flex-col	">
                <div className="">
                  <Button
                    onClick={() => setShowNsecSignIn(true)}
                    className={`mt-2 w-full ${showNsecSignIn ? "hidden" : ""}`}
                  >
                    nsec Sign In
                  </Button>
                </div>
                <div
                  className={`mb-4 flex flex-col justify-between space-y-4 ${
                    showNsecSignIn ? "" : "hidden"
                  }`}
                >
                  <div>
                    <label>Private Key:</label>
                    <Input
                      color={validPrivateKey}
                      type="password"
                      width="100%"
                      size="lg"
                      value={privateKey}
                      placeholder="Paste your Nostr private key..."
                      onChange={(e) => setPrivateKey(e.target.value)}
                    />
                  </div>
                  <div>
                    <label>
                      Encryption Passphrase:
                      <span className="text-red-500">*</span>
                    </label>
                    <Input
                      type="password"
                      width="100%"
                      size="lg"
                      value={passphrase}
                      placeholder="Enter a passphrase of your choice..."
                      onChange={(e) => setPassphrase(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && validPrivateKey)
                          handleSignIn();
                      }}
                    />
                  </div>
                  <div>
                    <Button
                      className={`${SHOPSTRBUTTONCLASSNAMES} w-full`}
                      onClick={handleSignIn}
                      isDisabled={!validPrivateKey} // Disable the button only if both key strings are invalid or the button has already been clicked
                    >
                      nsec Sign In
                    </Button>
                  </div>
                </div>
              </div>
              <div className="sd:flex flex-col md:hidden">
                <div className="mt-2">
                  <Image src="signup.png" alt="sign up"></Image>
                </div>
                <div className="ml-5 mt-2 flex">
                  <div>
                    <p>New to Nostr?</p>
                    <p> Sign up to get started!</p>
                  </div>
                  <Button
                    className={"ml-10 self-center"}
                    onClick={handleGenerateKeys}
                  >
                    Sign Up
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </ModalBody>
      </ModalContent>
    </Modal>
  );
}
