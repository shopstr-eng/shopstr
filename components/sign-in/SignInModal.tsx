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
import { SHOPSTRBUTTONCLASSNAMES } from "@/utils/STATIC-VARIABLES";
import {
  setLocalStorageDataOnSignIn,
  validateNSecKey,
  parseBunkerToken,
} from "@/utils/nostr/nostr-helper-functions";
import ShopstrSpinner from "@/components/utility-components/shopstr-spinner";
import { RelaysContext } from "../../utils/context/context";
import { useRouter } from "next/router";
import FailureModal from "../../components/utility-components/failure-modal";
import { SignerContext } from "@/components/utility-components/nostr-context-provider";
import { NostrSigner } from "@/utils/nostr/signers/nostr-signer";
import { NostrNSecSigner } from "@/utils/nostr/signers/nostr-nsec-signer";
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

  const [passphrase, setPassphrase] = useState<string>("");
  const [privateKey, setPrivateKey] = useState<string>("");
  const [validPrivateKey, setValidPrivateKey] =
    useState<InputProps["color"]>("default");

  const [showBunkerSignIn, setShowBunkerSignIn] = useState(false);
  const [isBunkerConnecting, setIsBunkerConnecting] = useState(false);

  const [showNsecSignIn, setShowNsecSignIn] = useState(false);

  const [showFailureModal, setShowFailureModal] = useState(false);
  const [failureText, setFailureText] = useState("");

  const relaysContext = useContext(RelaysContext);

  const router = useRouter();
  const { newSigner } = useContext(SignerContext);

  const saveSigner = (signer: NostrSigner) => {
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
  };

  const startExtensionLogin = async () => {
    setShowBunkerSignIn(false);
    setShowNsecSignIn(false);
    try {
      const signer = newSigner!("nip07", {});
      await signer.getPubKey();
      saveSigner(signer);
      onClose();
      router.push("/onboarding/user-profile");
    } catch (error) {
      setFailureText("Extension sign-in failed! " + error);
      setShowFailureModal(true);
    }
  };

  const startBunkerLogin = async () => {
    setIsBunkerConnecting(true);
    try {
      const signer = newSigner!("nip46", { bunker: bunkerToken });
      await signer.connect();
      saveSigner(signer);
      setIsBunkerConnecting(false);
      await signer.getPubKey();
      onClose();
      router.push("/onboarding/user-profile");
    } catch (error) {
      setFailureText("Bunker sign-in failed!");
      setShowFailureModal(true);
      setIsBunkerConnecting(false);
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
    router.push("/onboarding/keys");
    onClose();
  };

  const handleSignIn = async () => {
    if (validPrivateKey) {
      if (passphrase === "" || passphrase === null) {
        setFailureText("No passphrase provided!");
        setShowFailureModal(true);
      } else {
        const { encryptedPrivKey, pubkey } = NostrNSecSigner.getEncryptedNSEC(
          privateKey,
          passphrase
        );

        setTimeout(() => {
          onClose(); // avoids tree walker issue by closing modal
        }, 500);

        const signer = newSigner!("nsec", {
          encryptedPrivKey: encryptedPrivKey,
          pubkey,
        });
        await signer.getPubKey();
        saveSigner(signer);
        onClose();

        router.push("/onboarding/user-profile");
      }
    } else {
      setFailureText(
        "The private key inputted was not valid! Generate a new key pair or try again."
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
          setIsBunkerConnecting(false);
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
                        onClick={() => {
                          setShowNsecSignIn(false);
                          setShowBunkerSignIn(true);
                        }}
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
                          {isBunkerConnecting ? (
                            <div className="flex items-center justify-center">
                              <ShopstrSpinner />
                            </div>
                          ) : (
                            <>Bunker Sign-in</>
                          )}
                        </Button>
                      </div>
                    </div>
                  </div>
                  <div className="text-center">------ or ------</div>
                </div>
                <div className="flex flex-col	">
                  <div className="">
                    <Button
                      onClick={() => {
                        setShowBunkerSignIn(false);
                        setShowNsecSignIn(true);
                      }}
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
