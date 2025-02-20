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
  generateKeys,
  setLocalStorageDataOnSignIn,
  validateNSecKey,
  parseBunkerToken,
  sendBunkerRequest,
  awaitBunkerResponse,
} from "@/components/utility/nostr-helper-functions";
import { RelaysContext } from "../../utils/context/context";
import { getPublicKey, nip19 } from "nostr-tools";
import CryptoJS from "crypto-js";
import { useRouter } from "next/router";
import FailureModal from "../../components/utility-components/failure-modal";

export default function SignInModal({
  isOpen,
  onClose,
}: {
  isOpen: boolean;
  onClose: () => void;
}) {
  const [bunkerToken, setBunkerToken] = useState("");
  const [validBunkerToken, setValidBunkerToken] =
    useState<InputProps["color"]>("default");

  const [privateKey, setPrivateKey] = useState<string>("");
  const [validPrivateKey, setValidPrivateKey] =
    useState<InputProps["color"]>("default");
  const [passphrase, setPassphrase] = useState<string>("");

  const [showBunkerSignIn, setShowBunkerSignIn] = useState(false);

  const [showNsecSignIn, setShowNsecSignIn] = useState(false);

  const [showFailureModal, setShowFailureModal] = useState(false);
  const [failureText, setFailureText] = useState("");

  const relaysContext = useContext(RelaysContext);

  const router = useRouter();

  const startExtensionLogin = async () => {
    let isValidExtenstion = true;
    try {
      if (!window.nostr.nip44) {
        isValidExtenstion = false;
        throw new Error(
          "Please use a NIP-44 compatible extension like Alby or nos2x",
        );
      }
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
      if (!isValidExtenstion) {
        setFailureText(
          "Extension sign-in failed! Please use a NIP-44 compatible extension like Alby or nos2x.",
        );
        setShowFailureModal(true);
      } else {
        setFailureText("Extension sign-in failed!");
        setShowFailureModal(true);
      }
    }
  };

  const startBunkerLogin = async () => {
    try {
      const bunkerTokenParams = parseBunkerToken(bunkerToken);
      if (bunkerTokenParams) {
        const { remotePubkey, relays, secret } = bunkerTokenParams;
        let clientPubkey;
        let clientPrivkey;
        const { nsec, npub } = await generateKeys();
        clientPubkey = npub;
        clientPrivkey = nsec;
        const connectId = crypto.randomUUID();
        await sendBunkerRequest(
          "connect",
          connectId,
          undefined,
          undefined,
          undefined,
          clientPubkey,
          clientPrivkey,
          remotePubkey,
          relays,
          secret,
        );
        let ack;
        while (!ack) {
          ack = await awaitBunkerResponse(
            connectId,
            clientPubkey,
            clientPrivkey,
            remotePubkey,
            relays,
          );
          if (!ack) {
            await new Promise((resolve) => setTimeout(resolve, 2100));
          }
        }

        if (ack) {
          const gpkId = crypto.randomUUID();
          await sendBunkerRequest(
            "get_public_key",
            gpkId,
            undefined,
            undefined,
            undefined,
            clientPubkey,
            clientPrivkey,
            remotePubkey,
            relays,
            secret,
          );
          let pk;
          while (!pk) {
            pk = await awaitBunkerResponse(
              gpkId,
              clientPubkey,
              clientPrivkey,
              remotePubkey,
              relays,
            );
            if (!pk) {
              await new Promise((resolve) => setTimeout(resolve, 2100));
            }
          }
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
              signInMethod: "bunker",
              pubkey: pk,
              relays: generalRelays,
              readRelays: readRelays,
              writeRelays: writeRelays,
              clientPubkey: clientPubkey,
              clientPrivkey: clientPrivkey,
              bunkerRemotePubkey: remotePubkey,
              bunkerRelays: relays,
              bunkerSecret: secret,
            });
          } else {
            setLocalStorageDataOnSignIn({
              signInMethod: "bunker",
              pubkey: pk,
              clientPubkey: clientPubkey,
              clientPrivkey: clientPrivkey,
              bunkerRemotePubkey: remotePubkey,
              bunkerRelays: relays,
              bunkerSecret: secret,
            });
          }
          onClose();
        } else {
          throw new Error("Bunker sign-in failed!");
        }
      }
    } catch (error) {
      setFailureText("Bunker sign-in failed!");
      setShowFailureModal(true);
    }
  };

  useEffect(() => {
    if (bunkerToken === "") {
      setValidBunkerToken("default");
    } else {
      setValidBunkerToken(parseBunkerToken(bunkerToken) ? "success" : "danger");
    }
  }, [bunkerToken]);

  const handleGenerateKeys = () => {
    router.push("/keys");
    onClose();
  };

  const handleSignIn = async () => {
    if (validPrivateKey) {
      if (passphrase === "" || passphrase === null) {
        setFailureText("No passphrase provided!");
        setShowFailureModal(true);
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
          const generalRelays = relaysContext.relayList;
          const readRelays = relaysContext.readRelayList;
          const writeRelays = relaysContext.writeRelayList;
          setLocalStorageDataOnSignIn({
            signInMethod: "nsec",
            pubkey: pk,
            encryptedPrivateKey: encryptedPrivateKey,
            relays: generalRelays,
            readRelays: readRelays,
            writeRelays: writeRelays,
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
      setFailureText(
        "The private key inputted was not valid! Generate a new key pair or try again.",
      );
      setShowFailureModal(true);
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
    <>
      <Modal
        backdrop="blur"
        isOpen={isOpen}
        onClose={() => {
          setShowBunkerSignIn(false);
          setBunkerToken("");
          setShowNsecSignIn(false);
          setPrivateKey("");
          setPassphrase("");
          onClose();
        }}
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
                    Extension Sign-in
                  </Button>
                  <div className="text-center">------ or ------</div>
                  <div className="flex flex-col	">
                    <div className="">
                      <Button
                        onClick={() => setShowBunkerSignIn(true)}
                        className={`${SHOPSTRBUTTONCLASSNAMES} w-full ${
                          showBunkerSignIn ? "hidden" : ""
                        }`}
                      >
                        Bunker Sign-in
                      </Button>
                    </div>
                    <div
                      className={`mb-4 flex flex-col justify-between space-y-4 ${
                        showBunkerSignIn ? "" : "hidden"
                      }`}
                    >
                      <div>
                        <label>Bunker Token:</label>
                        <Input
                          color={validBunkerToken}
                          width="100%"
                          size="lg"
                          value={bunkerToken}
                          placeholder="Paste your bunker token (bunker://)..."
                          onChange={(e) => setBunkerToken(e.target.value)}
                        />
                      </div>
                      <div>
                        <Button
                          className={`${SHOPSTRBUTTONCLASSNAMES} w-full`}
                          onClick={startBunkerLogin}
                          isDisabled={validBunkerToken != "success"} // Disable the button only if both key strings are invalid or the button has already been clicked
                        >
                          Bunker Sign-in
                        </Button>
                      </div>
                    </div>
                  </div>
                  <div className="text-center">------ or ------</div>
                </div>
                <div className="flex flex-col	">
                  <div className="">
                    <Button
                      onClick={() => setShowNsecSignIn(true)}
                      className={`mt-2 w-full ${
                        showNsecSignIn ? "hidden" : ""
                      }`}
                    >
                      nsec Sign-in
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
                        isDisabled={validPrivateKey != "success"} // Disable the button only if both key strings are invalid or the button has already been clicked
                      >
                        nsec Sign-in
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
}
