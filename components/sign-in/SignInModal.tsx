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
import { NEO_BTN } from "@/utils/STATIC-VARIABLES";

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
        classNames={{
          base: "bg-[#161616] border border-zinc-800",
          body: "py-8 text-zinc-300",
          backdrop: "bg-black/80 backdrop-blur-sm",
          header: "border-b border-zinc-800",
          footer: "border-t border-zinc-800",
          closeButton: "hover:bg-white/10 active:bg-white/20 text-white",
        }}
        isDismissable={true}
        scrollBehavior={"normal"}
        placement={"center"}
        size="2xl"
      >
        <ModalContent>
          <ModalBody className="flex flex-col overflow-hidden">
            <div className="flex flex-row">
              <div className="hidden flex-col justify-between border-r border-zinc-800 pr-6 md:flex md:basis-1/2">
                <div className="mb-4">
                  <Image src="signup.png" alt="sign up"></Image>
                </div>
                <div className="flex flex-col gap-4 rounded-xl bg-[#111] p-4">
                  <div>
                    <p className="text-lg font-bold text-white">
                      New to Nostr?
                    </p>
                    <p className="text-xs text-zinc-500">
                      {" "}
                      Sign up to get started!
                    </p>
                  </div>
                  <Button
                    className="h-10 rounded-lg border border-zinc-600 bg-transparent text-sm font-bold uppercase tracking-wider text-white hover:border-white hover:bg-zinc-800"
                    onClick={handleGenerateKeys}
                  >
                    Sign Up
                  </Button>
                </div>
              </div>

              <div className="flex w-full flex-col pl-0 md:basis-1/2 md:pl-6">
                <div className="space-y-2">
                  <div className="mb-6 flex items-center justify-center gap-3">
                    <Image
                      alt="Shopstr logo"
                      height={50}
                      radius="sm"
                      src="/shopstr-2000x2000.png"
                      width={50}
                    />
                    <div className="text-2xl font-black uppercase tracking-tighter text-white">
                      Shopstr
                    </div>
                  </div>
                  <Button
                    className={`${NEO_BTN} h-12 w-full text-sm`}
                    onClick={startExtensionLogin}
                  >
                    Extension Sign-in
                  </Button>
                  <div className="text-center text-xs font-mono text-zinc-600">
                    ------ or ------
                  </div>
                  <div className="flex flex-col ">
                    <div className="">
                      <Button
                        data-testid="bunker-open-btn"
                        onClick={() => {
                          setShowNsecSignIn(false);
                          setShowBunkerSignIn(true);
                        }}
                        className={`${NEO_BTN} h-12 w-full text-sm ${
                          showBunkerSignIn ? "hidden" : ""
                        }`}
                      >
                        Bunker Sign-in
                      </Button>
                    </div>
                    <div
                      className={`mb-4 flex flex-col justify-between space-y-4 rounded-xl border border-dashed border-zinc-700 bg-[#111] p-4 ${
                        showBunkerSignIn ? "" : "hidden"
                      }`}
                    >
                      <div>
                        <label className="mb-1 block text-xs font-bold uppercase text-zinc-500">
                          Bunker Token:
                        </label>
                        <Input
                          color={validBunkerToken}
                          variant="bordered"
                          classNames={{
                            input: "text-white text-base md:text-sm",
                            inputWrapper:
                              "bg-[#161616] border-zinc-700 data-[hover=true]:border-zinc-500 group-data-[focus=true]:border-yellow-400",
                          }}
                          width="100%"
                          size="lg"
                          value={bunkerToken}
                          placeholder="Paste your bunker token (bunker://)..."
                          onChange={(e) => setBunkerToken(e.target.value)}
                        />
                      </div>
                      <div>
                        <Button
                          data-testid="bunker-submit-btn"
                          className={`${NEO_BTN} h-10 w-full text-xs shadow-sm`}
                          onClick={startBunkerLogin}
                          isDisabled={validBunkerToken != "success"}
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
                  <div className="text-center text-xs font-mono text-zinc-600">
                    ------ or ------
                  </div>
                </div>
                <div className="flex flex-col ">
                  <div className="">
                    <Button
                      data-testid="nsec-open-btn"
                      onClick={() => {
                        setShowBunkerSignIn(false);
                        setShowNsecSignIn(true);
                      }}
                      className={`${NEO_BTN} mt-2 h-12 w-full text-sm ${
                        showNsecSignIn ? "hidden" : ""
                      }`}
                    >
                      nsec Sign-in
                    </Button>
                  </div>
                  <div
                    className={`mb-4 flex flex-col justify-between space-y-4 rounded-xl border border-dashed border-zinc-700 bg-[#111] p-4 ${
                      showNsecSignIn ? "" : "hidden"
                    }`}
                  >
                    <div>
                      <label className="mb-1 block text-xs font-bold uppercase text-zinc-500">
                        Private Key:
                      </label>
                      <Input
                        color={validPrivateKey}
                        variant="bordered"
                        classNames={{
                          input: "text-white text-base md:text-sm",
                          inputWrapper:
                            "bg-[#161616] border-zinc-700 data-[hover=true]:border-zinc-500 group-data-[focus=true]:border-yellow-400",
                        }}
                        type="password"
                        width="100%"
                        size="lg"
                        value={privateKey}
                        placeholder="Paste your Nostr private key..."
                        onChange={(e) => setPrivateKey(e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-bold uppercase text-zinc-500">
                        Encryption Passphrase:
                        <span className="text-red-500">*</span>
                      </label>
                      <Input
                        type="password"
                        variant="bordered"
                        classNames={{
                          input: "text-white text-base md:text-sm",
                          inputWrapper:
                            "bg-[#161616] border-zinc-700 data-[hover=true]:border-zinc-500 group-data-[focus=true]:border-yellow-400",
                        }}
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
                        data-testid="nsec-submit-btn"
                        className={`${NEO_BTN} h-10 w-full text-xs shadow-sm`}
                        onClick={handleSignIn}
                        isDisabled={validPrivateKey != "success"}
                      >
                        nsec Sign-in
                      </Button>
                    </div>
                  </div>
                </div>
                <div className="flex flex-col md:hidden">
                  <div className="mt-6 flex justify-center">
                    <Image src="signup.png" alt="sign up"></Image>
                  </div>
                  <div className="mt-4 flex flex-col items-center gap-3 rounded-xl border border-zinc-800 bg-[#111] p-4 text-center">
                    <div>
                      <p className="text-lg font-bold text-white">
                        New to Nostr?
                      </p>
                      <p className="text-xs text-zinc-500">
                        {" "}
                        Sign up to get started!
                      </p>
                    </div>
                    <Button
                      className="h-10 w-full rounded-lg border border-zinc-600 bg-transparent text-sm font-bold uppercase tracking-wider text-white hover:border-white hover:bg-zinc-800"
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
