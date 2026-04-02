import { useEffect, useState, useContext } from "react";
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
import * as nip49 from "nostr-tools/nip49";
import { getPublicKey } from "nostr-tools";
import ShopstrSpinner from "@/components/utility-components/shopstr-spinner";
import { RelaysContext } from "../../utils/context/context";
import { useRouter } from "next/router";
import FailureModal from "../../components/utility-components/failure-modal";
import { SignerContext } from "@/components/utility-components/nostr-context-provider";
import { NostrSigner } from "@/utils/nostr/signers/nostr-signer";
import { NostrNSecSigner } from "@/utils/nostr/signers/nostr-nsec-signer";
import { EyeIcon, EyeSlashIcon } from "@heroicons/react/24/outline";

export default function SignInModal({
  isOpen,
  onClose,
  sellerFlow,
}: {
  isOpen: boolean;
  onClose: () => void;
  sellerFlow?: boolean;
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
  const [isNcryptsec, setIsNcryptsec] = useState(false);
  const [ncryptsecError, setNcryptsecError] = useState("");

  const [showFailureModal, setShowFailureModal] = useState(false);
  const [failureText, setFailureText] = useState("");

  const [showPrivateKey, setShowPrivateKey] = useState(false);
  const [showPassphrase, setShowPassphrase] = useState(false);

  const [showSignInOptions, setShowSignInOptions] = useState(false);
  const [showSignUpOptions, setShowSignUpOptions] = useState(false);

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

  const resetModalState = () => {
    setShowBunkerSignIn(false);
    setIsBunkerConnecting(false);
    setBunkerToken("");
    setShowNsecSignIn(false);
    setPrivateKey("");
    setPassphrase("");
    setShowPrivateKey(false);
    setShowPassphrase(false);
    setIsNcryptsec(false);
    setNcryptsecError("");
    setShowSignInOptions(false);
    setShowSignUpOptions(false);
  };

  // Sign-in functions (go to marketplace)
  const startExtensionLogin = async () => {
    setShowBunkerSignIn(false);
    setShowNsecSignIn(false);
    try {
      const signer = newSigner!("nip07", {});
      await signer.getPubKey();
      saveSigner(signer);
      onClose();
      router.push("/marketplace");
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
    } 
    catch (error) {
      router.push("/marketplace");
      setFailureText("Bunker sign-in failed!");
      setShowFailureModal(true);
      setIsBunkerConnecting(false);
    }
  };

  // Sign-up functions (go to user-type onboarding)
  const startExtensionSignup = async () => {
    try {
      const signer = newSigner!("nip07", {});
      await signer.getPubKey();
      saveSigner(signer);
      onClose();
      router.push(
        sellerFlow
          ? "/onboarding/user-type?preselect=seller"
          : "/onboarding/user-type"
      );
    } catch (error) {
      setFailureText("Extension sign-up failed! " + error);
      setShowFailureModal(true);
    }
  };

  const startBunkerSignup = async () => {
    setIsBunkerConnecting(true);
    try {
      const signer = newSigner!("nip46", { bunker: bunkerToken });
      await signer.connect();
      saveSigner(signer);
      setIsBunkerConnecting(false);
      await signer.getPubKey();
      onClose();
      router.push(
        sellerFlow
          ? "/onboarding/user-type?preselect=seller"
          : "/onboarding/user-type"
      );
    } catch (error) {
      setFailureText("Bunker sign-up failed!");
      setShowFailureModal(true);
      setIsBunkerConnecting(false);
    }
  };

  const handleNsecSignup = async () => {
    if (validPrivateKey === "success" || isNcryptsec) {
      if (passphrase === "" || passphrase === null) {
        setFailureText("No passphrase provided!");
        setShowFailureModal(true);
      } else {
        let encryptedPrivKey: string;
        let pubkey: string;

        if (isNcryptsec) {
          try {
            setNcryptsecError("");
            const decryptedSecretKey = await nip49.decrypt(
              privateKey,
              passphrase
            );
            pubkey = getPublicKey(decryptedSecretKey);
            encryptedPrivKey = privateKey;
          } catch (e) {
            setNcryptsecError("Incorrect passphrase or invalid ncryptsec.");
            setFailureText(
              "Could not decrypt ncryptsec. Check your passphrase and try again."
            );
            setShowFailureModal(true);
            return;
          }
        } else {
          ({ encryptedPrivKey, pubkey } = NostrNSecSigner.getEncryptedNSEC(
            privateKey,
            passphrase
          ));
        }

        setTimeout(() => {
          onClose();
        }, 500);

        const signer = newSigner!("nsec", {
          encryptedPrivKey: encryptedPrivKey,
          pubkey,
        });
        await signer.getPubKey();
        saveSigner(signer);
        onClose();

        router.push(
          sellerFlow
            ? "/onboarding/user-type?preselect=seller"
            : "/onboarding/user-type"
        );
      }
    } else {
      setFailureText(
        "The private key inputted was not valid! Generate a new key pair or try again."
      );
      setShowFailureModal(true);
    }
  };

  const startNewAccountCreation = () => {
    router.push(
      sellerFlow ? "/onboarding/keys?preselect=seller" : "/onboarding/keys"
    );
    onClose();
  };

  useEffect(() => {
    if (bunkerToken === "") {
      setValidBunkerToken("default");
    } else {
      setValidBunkerToken(parseBunkerToken(bunkerToken) ? "success" : "danger");
    }
  }, [bunkerToken]);

  const handleSignIn = async () => {
    if (validPrivateKey === "success" || isNcryptsec) {
      if (passphrase === "" || passphrase === null) {
        setFailureText("No passphrase provided!");
        setShowFailureModal(true);
      } else {
        let encryptedPrivKey: string;
        let pubkey: string;

        if (isNcryptsec) {
          try {
            setNcryptsecError("");
            const decryptedSecretKey = await nip49.decrypt(
              privateKey,
              passphrase
            );
            pubkey = getPublicKey(decryptedSecretKey);
            encryptedPrivKey = privateKey;
          } catch {
            setNcryptsecError("Incorrect passphrase or invalid ncryptsec.");
            setFailureText(
              "Could not decrypt ncryptsec. Check your passphrase and try again."
            );
            setShowFailureModal(true);
            return;
          }
        } else {
          ({ encryptedPrivKey, pubkey } = NostrNSecSigner.getEncryptedNSEC(
            privateKey,
            passphrase
          ));
        }

        setTimeout(() => {
          onClose();
        }, 500);

        const signer = newSigner!("nsec", {
          encryptedPrivKey: encryptedPrivKey,
          pubkey,
        });
        await signer.getPubKey();
        saveSigner(signer);
        onClose();

        router.push("/marketplace");
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
      setIsNcryptsec(false);
      setNcryptsecError("");
    } else if (privateKey.startsWith("ncryptsec")) {
      setIsNcryptsec(true);
      setValidPrivateKey("success");
      setNcryptsecError("");
    } else {
      setIsNcryptsec(false);
      setNcryptsecError("");
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
          resetModalState();
          onClose();
        }}
        classNames={{
          body: "py-6",
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
            {!showSignInOptions && !showSignUpOptions ? (
              // Landing view
              <div className="flex flex-col items-center justify-center space-y-6 py-8">
                <div className="flex items-center justify-center">
                  <Image
                    alt="Shopstr logo"
                    height={80}
                    radius="sm"
                    src="/shopstr-2000x2000.png"
                    width={80}
                  />
                  <h1 className="ml-3 text-4xl font-bold text-shopstr-purple-light dark:text-shopstr-yellow-light">
                    Shopstr
                  </h1>
                </div>

                <div className="w-full max-w-md">
                  <Image src="signup.png" alt="sign up" className="w-full" />
                </div>

                <div className="flex w-full max-w-md flex-col space-y-4">
                  <div className="text-center">
                    <p className="mb-2 text-lg font-bold text-light-text dark:text-dark-text">
                      New to Shopstr?
                    </p>
                    <p className="mb-4 text-sm text-light-text dark:text-dark-text">
                      Sign up to get started!
                    </p>
                  </div>

                  <Button
                    className={`${SHOPSTRBUTTONCLASSNAMES} w-full text-lg`}
                    onClick={() => setShowSignUpOptions(true)}
                    size="lg"
                  >
                    Sign Up
                  </Button>

                  <div className="text-center text-xs font-bold text-light-text dark:text-dark-text">
                    ------ or ------
                  </div>

                  <Button
                    className={`w-full text-lg`}
                    onClick={() => setShowSignInOptions(true)}
                    size="lg"
                  >
                    Sign In
                  </Button>
                </div>
              </div>
            ) : showSignUpOptions ? (
              // Sign-up options view (Nostr sign-up)
              <div className="flex w-full flex-col">
                <div className="space-y-3">
                  <div className="mb-3 flex items-center justify-center gap-3">
                    <Image
                      alt="Shopstr logo"
                      height={50}
                      radius="sm"
                      src="/shopstr-2000x2000.png"
                      width={50}
                    />
                    <div className="text-2xl font-bold text-shopstr-purple-light dark:text-shopstr-yellow-light">
                      Sign Up
                    </div>
                  </div>

                  {/* Extension Sign-up */}
                  <Button
                    className={`${SHOPSTRBUTTONCLASSNAMES} w-full`}
                    onClick={startExtensionSignup}
                  >
                    Nostr Extension Sign-up
                  </Button>

                  <div className="text-center text-xs font-bold text-light-text dark:text-dark-text">
                    ------ or ------
                  </div>

                  {/* Bunker Sign-up */}
                  <div className="flex flex-col">
                    <Button
                      data-testid="bunker-signup-open-btn"
                      onClick={() => {
                        setShowNsecSignIn(false);
                        setShowBunkerSignIn(true);
                      }}
                      className={`w-full ${showBunkerSignIn ? "hidden" : ""}`}
                    >
                      Bunker Sign-up
                    </Button>
                    <div
                      className={`flex flex-col justify-between space-y-3 ${
                        showBunkerSignIn ? "" : "hidden"
                      }`}
                    >
                      <div>
                        <label className="text-light-text dark:text-dark-text">
                          Bunker Token:
                        </label>
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
                          data-testid="bunker-signup-submit-btn"
                          className={`${SHOPSTRBUTTONCLASSNAMES} w-full`}
                          onClick={startBunkerSignup}
                          isDisabled={validBunkerToken !== "success"}
                        >
                          {isBunkerConnecting ? (
                            <div className="flex items-center justify-center">
                              <ShopstrSpinner />
                            </div>
                          ) : (
                            <>Bunker Sign-up</>
                          )}
                        </Button>
                      </div>
                    </div>
                  </div>

                  <div className="text-center text-xs font-bold text-light-text dark:text-dark-text">
                    ------ or ------
                  </div>

                  {/* nsec / ncryptsec Sign-up */}
                  <div className="flex flex-col">
                    <Button
                      data-testid="nsec-signup-open-btn"
                      onClick={() => {
                        setShowBunkerSignIn(false);
                        setShowNsecSignIn(true);
                      }}
                      className={`w-full ${showNsecSignIn ? "hidden" : ""}`}
                    >
                      nsec / ncryptsec Sign-up
                    </Button>
                    <div
                      className={`flex flex-col justify-between space-y-4 ${
                        showNsecSignIn ? "" : "hidden"
                      }`}
                    >
                      <div>
                        <label className="text-light-text dark:text-dark-text">
                          {isNcryptsec
                            ? "Encrypted Private Key (ncryptsec):"
                            : "Private Key:"}
                        </label>
                        <Input
                          color={validPrivateKey}
                          type={showPrivateKey ? "text" : "password"}
                          width="100%"
                          size="lg"
                          value={privateKey}
                          placeholder="Paste your nsec or ncryptsec..."
                          onChange={(e) => setPrivateKey(e.target.value)}
                          endContent={
                            <button
                              type="button"
                              onClick={() => setShowPrivateKey((v) => !v)}
                              className="text-gray-400"
                            >
                              {showPrivateKey ? (
                                <EyeSlashIcon className="h-5 w-5" />
                              ) : (
                                <EyeIcon className="h-5 w-5" />
                              )}
                            </button>
                          }
                        />
                        {isNcryptsec && (
                          <p className="mt-1 text-xs text-green-600">
                            ncryptsec detected — enter the passphrase used to
                            encrypt it.
                          </p>
                        )}
                      </div>
                      <div>
                        <label className="text-light-text dark:text-dark-text">
                          {isNcryptsec
                            ? "Decryption Passphrase:"
                            : "Encryption Passphrase:"}
                          <span className="text-red-500">*</span>
                        </label>
                        <Input
                          type={showPassphrase ? "text" : "password"}
                          width="100%"
                          size="lg"
                          value={passphrase}
                          placeholder={
                            isNcryptsec
                              ? "Enter the passphrase used to encrypt..."
                              : "Enter a passphrase of your choice..."
                          }
                          onChange={(e) => setPassphrase(e.target.value)}
                          onKeyDown={(e) => {
                            if (
                              e.key === "Enter" &&
                              (validPrivateKey === "success" || isNcryptsec)
                            )
                              handleNsecSignup();
                          }}
                          endContent={
                            <button
                              type="button"
                              onClick={() => setShowPassphrase((v) => !v)}
                              className="text-gray-400"
                            >
                              {showPassphrase ? (
                                <EyeSlashIcon className="h-5 w-5" />
                              ) : (
                                <EyeIcon className="h-5 w-5" />
                              )}
                            </button>
                          }
                        />
                      </div>
                      <div>
                        <Button
                          data-testid="nsec-signup-submit-btn"
                          className={`${SHOPSTRBUTTONCLASSNAMES} w-full`}
                          onClick={handleNsecSignup}
                          isDisabled={
                            validPrivateKey !== "success" && !isNcryptsec
                          }
                        >
                          {isNcryptsec ? "ncryptsec Sign-up" : "nsec Sign-up"}
                        </Button>
                      </div>
                    </div>
                  </div>

                  <div className="text-center text-xs font-bold text-light-text dark:text-dark-text">
                    ------ or ------
                  </div>

                  {/* New Account Creation */}
                  <Button
                    className={`${SHOPSTRBUTTONCLASSNAMES} w-full`}
                    onClick={startNewAccountCreation}
                  >
                    Create New Account
                  </Button>

                  <div className="mt-4 text-center">
                    <button
                      className="text-sm font-bold text-shopstr-purple-light underline dark:text-shopstr-yellow-light"
                      onClick={() => {
                        setShowSignUpOptions(false);
                        setShowSignInOptions(true);
                        setShowBunkerSignIn(false);
                        setShowNsecSignIn(false);
                        setBunkerToken("");
                        setPrivateKey("");
                        setPassphrase("");
                      }}
                    >
                      Already have an account? Sign in
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              // Sign-in options view
              <div className="flex w-full flex-col">
                <div className="space-y-2">
                  <div className="flex items-center justify-center">
                    <Image
                      alt="Shopstr logo"
                      height={50}
                      radius="sm"
                      src="/shopstr-2000x2000.png"
                      width={50}
                    />
                    <div className="ml-2 text-2xl font-bold text-shopstr-purple-light dark:text-shopstr-yellow-light">
                      Shopstr
                    </div>
                  </div>

                  <Button
                    className={`${SHOPSTRBUTTONCLASSNAMES} w-full`}
                    onClick={startExtensionLogin}
                  >
                    Extension Sign-in
                  </Button>

                  <div className="text-center">------ or ------</div>

                  <div className="flex flex-col">
                    <Button
                      data-testid="bunker-open-btn"
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
                    <div
                      className={`mb-4 flex flex-col justify-between space-y-4 ${
                        showBunkerSignIn ? "" : "hidden"
                      }`}
                    >
                      <div>
                        <label className="text-light-text dark:text-dark-text">
                          Bunker Token:
                        </label>
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
                          data-testid="bunker-submit-btn"
                          className={`${SHOPSTRBUTTONCLASSNAMES} w-full`}
                          onClick={startBunkerLogin}
                          isDisabled={validBunkerToken !== "success"}
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

                <div className="flex flex-col">
                  <Button
                    data-testid="nsec-open-btn"
                    onClick={() => {
                      setShowBunkerSignIn(false);
                      setShowNsecSignIn(true);
                    }}
                    className={`mt-2 w-full ${showNsecSignIn ? "hidden" : ""}`}
                  >
                    nsec / ncryptsec Sign-in
                  </Button>
                  <div
                    className={`mb-4 flex flex-col justify-between space-y-4 ${
                      showNsecSignIn ? "" : "hidden"
                    }`}
                  >
                    <div>
                      <label className="text-light-text dark:text-dark-text">
                        {isNcryptsec
                          ? "Encrypted Private Key (ncryptsec):"
                          : "Private Key:"}
                      </label>
                      <Input
                        color={validPrivateKey}
                        type={showPrivateKey ? "text" : "password"}
                        width="100%"
                        size="lg"
                        value={privateKey}
                        placeholder="Paste your nsec or ncryptsec..."
                        onChange={(e) => setPrivateKey(e.target.value)}
                        endContent={
                          <button
                            type="button"
                            onClick={() => setShowPrivateKey((v) => !v)}
                            className="text-gray-400"
                          >
                            {showPrivateKey ? (
                              <EyeSlashIcon className="h-5 w-5" />
                            ) : (
                              <EyeIcon className="h-5 w-5" />
                            )}
                          </button>
                        }
                      />
                      {isNcryptsec && (
                        <p className="mt-1 text-xs text-green-600">
                          ncryptsec detected — enter the passphrase used to
                          encrypt it.
                        </p>
                      )}
                    </div>
                    <div>
                      <label className="text-light-text dark:text-dark-text">
                        {isNcryptsec
                          ? "Decryption Passphrase:"
                          : "Encryption Passphrase:"}
                        <span className="text-red-500">*</span>
                      </label>
                      <Input
                        type={showPassphrase ? "text" : "password"}
                        width="100%"
                        size="lg"
                        value={passphrase}
                        placeholder={
                          isNcryptsec
                            ? "Enter the passphrase used to encrypt..."
                            : "Enter a passphrase of your choice..."
                        }
                        onChange={(e) => setPassphrase(e.target.value)}
                        onKeyDown={(e) => {
                          if (
                            e.key === "Enter" &&
                            (validPrivateKey === "success" || isNcryptsec)
                          )
                            handleSignIn();
                        }}
                        endContent={
                          <button
                            type="button"
                            onClick={() => setShowPassphrase((v) => !v)}
                            className="text-gray-400"
                          >
                            {showPassphrase ? (
                              <EyeSlashIcon className="h-5 w-5" />
                            ) : (
                              <EyeIcon className="h-5 w-5" />
                            )}
                          </button>
                        }
                      />
                      {ncryptsecError && (
                        <p className="mt-1 text-xs text-red-500">
                          {ncryptsecError}
                        </p>
                      )}
                    </div>
                    <div>
                      <Button
                        data-testid="nsec-submit-btn"
                        className={`${SHOPSTRBUTTONCLASSNAMES} w-full`}
                        onClick={handleSignIn}
                        isDisabled={
                          validPrivateKey !== "success" && !isNcryptsec
                        }
                      >
                        {isNcryptsec ? "ncryptsec Sign-in" : "nsec Sign-in"}
                      </Button>
                    </div>
                  </div>
                </div>

                <div className="mt-4 text-center">
                  <button
                    className="text-sm font-bold text-shopstr-purple-light underline dark:text-shopstr-yellow-light"
                    onClick={() => {
                      setShowSignInOptions(false);
                      setShowSignUpOptions(true);
                      setShowBunkerSignIn(false);
                      setShowNsecSignIn(false);
                      setBunkerToken("");
                      setPrivateKey("");
                      setPassphrase("");
                    }}
                  >
                    New to Shopstr? Sign up
                  </button>
                </div>
              </div>
            )}
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
