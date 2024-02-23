import React, { useEffect, useState } from "react";
import {
  Modal,
  ModalContent,
  ModalBody,
  Button,
  Image,
  Input,
} from "@nextui-org/react";
import { SHOPSTRBUTTONCLASSNAMES } from "@/components/utility/STATIC-VARIABLES";
import { validateNSecKey } from "@/components/utility/nostr-helper-functions";
import { getPublicKey, nip19 } from "nostr-tools";
import * as CryptoJS from "crypto-js";

import { useRouter } from "next/router";
import useIsSignedIn from "../hooks/use-is-signed-in";
export default function SignInModal({
  opened,
  some,
}: {
  opened: boolean;
  some: number;
}) {
  const [privateKey, setPrivateKey] = useState<string>("");
  const [validPrivateKey, setValidPrivateKey] = useState<boolean>(false);
  const [passphrase, setPassphrase] = useState<string>("");

  const [showNsecSignIn, setShowNsecSignIn] = useState(false);
  const [showModal, setShowModal] = useState(false);

  const router = useRouter();

  const startExtensionLogin = async () => {
    try {
      // @ts-ignore
      var pk = await window.nostr.getPublicKey();
      let npub = nip19.npubEncode(pk);
      localStorage.setItem("npub", npub);
      localStorage.setItem("signIn", "extension");
      localStorage.setItem(
        "relays",
        JSON.stringify([
          "wss://relay.damus.io",
          "wss://nos.lol",
          "wss://nostr.mutinywallet.com",
        ]),
      );
      // alert('Signed in as ' + npub + '.');
      router.push("/");
    } catch (error) {
      alert("Extension sign in failed!");
    }
  };
  const handleGenerateKeys = () => {
    setShowModal(false);
    router.push("/keys");
  };

  const handleSignIn = async () => {
    if (validPrivateKey) {
      if (passphrase === "" || passphrase === null) {
        alert("No passphrase provided!");
      } else {
        let { data: sk } = nip19.decode(privateKey);
        let pk = getPublicKey(sk);
        let npub = nip19.npubEncode(pk);
        localStorage.setItem("npub", npub);

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

        // alert('Signed in as ' + npub + '.');
        // router.push('/');
        setShowModal(false);
      }
    } else {
      alert(
        "The private key inputted was not valid! Generate a new key pair or try again.",
      );
    }
  };

  useEffect(() => {
    setValidPrivateKey(validateNSecKey(privateKey));
  }, [privateKey]);

  useEffect(() => {
    setShowModal(opened);
  }, [opened, some]);

  const isSignedIn = useIsSignedIn();

  return !isSignedIn ? (
    <>
      <Modal
        backdrop="blur"
        isOpen={showModal}
        onClose={() => setShowModal(false)}
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
                </div>
                <div className="flex flex-col	">
                  <div className="">
                    <Button
                      onClick={() => setShowNsecSignIn(true)}
                      className={`mt-2 w-full ${
                        showNsecSignIn ? "hidden" : ""
                      }`}
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
                        color={validPrivateKey ? "success" : "error"}
                        type="password"
                        width="100%"
                        size="large"
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
                        type="text"
                        width="100%"
                        size="large"
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
    </>
  ) : null;
}
