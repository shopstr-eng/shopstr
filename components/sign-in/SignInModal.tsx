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
import {
  WHITEBUTTONCLASSNAMES,
  BLUEBUTTONCLASSNAMES,
} from "@/utils/STATIC-VARIABLES";
import {
  setLocalStorageDataOnSignIn,
  validateNSecKey,
  parseBunkerToken,
} from "@/utils/nostr/nostr-helper-functions";
import MilkMarketSpinner from "@/components/utility-components/mm-spinner";
import { RelaysContext } from "../../utils/context/context";
import { useRouter } from "next/router";
import FailureModal from "../../components/utility-components/failure-modal";
import { SignerContext } from "@/components/utility-components/nostr-context-provider";
import { NostrSigner } from "@/utils/nostr/signers/nostr-signer";
import { NostrNSecSigner } from "@/utils/nostr/signers/nostr-nsec-signer";
import { InformationCircleIcon } from "@heroicons/react/24/outline";

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

  const [showSignInOptions, setShowSignInOptions] = useState(false);
  const [showSignUpOptions, setShowSignUpOptions] = useState(false);
  const [showEmailSignIn, setShowEmailSignIn] = useState(false);
  const [showNostrSignUpOptions, setShowNostrSignUpOptions] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isEmailSignUp, setIsEmailSignUp] = useState(false);

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
      router.push("/marketplace");
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
    setShowNostrSignUpOptions(true);
  };

  const startNewAccountCreation = () => {
    router.push("/onboarding/new-account");
    onClose();
  };

  const startExtensionSignup = async () => {
    try {
      const signer = newSigner!("nip07", {});
      await signer.getPubKey();
      saveSigner(signer);
      onClose();
      router.push("/onboarding/user-type");
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
      router.push("/onboarding/user-type");
    } catch (error) {
      setFailureText("Bunker sign-up failed!");
      setShowFailureModal(true);
      setIsBunkerConnecting(false);
    }
  };

  const handleNsecSignup = async () => {
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
          onClose();
        }, 500);

        const signer = newSigner!("nsec", {
          encryptedPrivKey: encryptedPrivKey,
          pubkey,
        });
        await signer.getPubKey();
        saveSigner(signer);
        onClose();

        router.push("/onboarding/user-type");
      }
    } else {
      setFailureText(
        "The private key inputted was not valid! Generate a new key pair or try again."
      );
      setShowFailureModal(true);
    }
  };

  const handleEmailSignIn = async () => {
    if (!email || !password) {
      setFailureText("Email and password are required!");
      setShowFailureModal(true);
      return;
    }

    try {
      const endpoint = isEmailSignUp
        ? "/api/auth/email-signup"
        : "/api/auth/email-signin";
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      const data = await response.json();

      if (!response.ok) {
        setFailureText(data.error || "Authentication failed!");
        setShowFailureModal(true);
        return;
      }

      // Use password as passphrase to encrypt the nsec
      const { encryptedPrivKey, pubkey } = NostrNSecSigner.getEncryptedNSEC(
        data.nsec,
        password
      );

      const signer = newSigner!("nsec", {
        encryptedPrivKey: encryptedPrivKey,
        pubkey,
        passphrase: password, // Store passphrase to prevent modal prompts
      });
      await signer.getPubKey();
      saveSigner(signer);

      // Store email provider info
      localStorage.setItem("authProvider", "email");
      localStorage.setItem("authEmail", email);

      onClose();
      // Route to onboarding for sign-up, marketplace for sign-in
      router.push(isEmailSignUp ? "/onboarding/user-type" : "/marketplace");
    } catch (error) {
      setFailureText("Email sign-in failed: " + error);
      setShowFailureModal(true);
    }
  };

  const handleOAuthSignIn = (provider: "google" | "apple") => {
    // Use window.location.href to get the full URL including port
    const currentUrl = new URL(window.location.href);
    const redirectUri = `${currentUrl.protocol}//${currentUrl.host}/api/auth/oauth-callback`;
    window.location.href = `/api/auth/oauth-redirect?provider=${provider}&redirect_uri=${encodeURIComponent(
      redirectUri
    )}`;
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
          setShowSignInOptions(false);
          setShowSignUpOptions(false);
          setShowEmailSignIn(false);
          setShowNostrSignUpOptions(false);
          setEmail("");
          setPassword("");
          onClose();
        }}
        classNames={{
          body: "py-6 bg-white",
          backdrop: "bg-black/50 backdrop-opacity-60",
          base: "border-4 border-black rounded-md shadow-neo",
          header: "border-b-4 border-black bg-white rounded-t-md",
          footer: "border-t-4 border-black bg-white rounded-b-md",
          closeButton:
            "hover:bg-gray-100 active:bg-gray-200 text-black font-bold",
        }}
        isDismissable={true}
        scrollBehavior={"normal"}
        placement={"center"}
        size="2xl"
      >
        <ModalContent>
          <ModalBody className="flex flex-col overflow-hidden text-black">
            {!showSignInOptions && !showSignUpOptions ? (
              // Initial landing view - Your neobrutalist styled version
              <div className="flex flex-col items-center justify-center space-y-6 py-8">
                <div className="flex items-center justify-center">
                  <Image
                    alt="Milk Market logo"
                    height={80}
                    radius="sm"
                    src="/milk-market.png"
                    width={80}
                  />
                  <h1 className="ml-3 text-4xl font-bold text-black">
                    Milk Market
                  </h1>
                </div>

                {/* Signup image */}
                <div className="w-full max-w-md">
                  <Image src="signup.png" alt="sign up" className="w-full" />
                </div>

                {/* Action buttons */}
                <div className="flex w-full max-w-md flex-col space-y-4">
                  <div className="text-center">
                    <p className="mb-2 text-lg font-bold text-black">
                      New to Milk Market?
                    </p>
                    <p className="mb-4 text-sm text-black">
                      Sign up to get started!
                    </p>
                  </div>

                  <Button
                    className={`${WHITEBUTTONCLASSNAMES} w-full text-lg`}
                    onClick={() => setShowSignUpOptions(true)}
                    size="lg"
                  >
                    Sign Up
                  </Button>

                  <div className="text-center text-xs font-bold text-black">
                    ------ or ------
                  </div>

                  <Button
                    className={`${WHITEBUTTONCLASSNAMES} w-full text-lg`}
                    onClick={() => setShowSignInOptions(true)}
                    size="lg"
                  >
                    Sign In
                  </Button>
                </div>
              </div>
            ) : showSignUpOptions &&
              !showEmailSignIn &&
              !showNostrSignUpOptions ? (
              // Sign-up options view
              <div className="flex w-full flex-col">
                <div className="space-y-3">
                  <div className="mb-3 flex items-center justify-center gap-3">
                    <Image
                      alt="Milk Market logo"
                      height={50}
                      radius="sm"
                      src="/milk-market.png"
                      width={50}
                    />
                    <div className="text-2xl font-bold text-black">Sign Up</div>
                  </div>

                  {/* Email Sign-up */}
                  <Button
                    className={`${WHITEBUTTONCLASSNAMES} w-full`}
                    onClick={() => {
                      setShowEmailSignIn(true);
                      setIsEmailSignUp(true);
                    }}
                  >
                    Sign up with Email
                  </Button>

                  {/* OAuth Buttons */}
                  <Button
                    className={`${WHITEBUTTONCLASSNAMES} flex w-full items-center justify-center gap-2`}
                    onClick={() => handleOAuthSignIn("google")}
                  >
                    <Image
                      src="/google-icon.png"
                      alt="Google"
                      width={20}
                      height={20}
                      className="flex-shrink-0"
                    />
                    <span>Sign up with Google</span>
                  </Button>

                  {/* <Button
                    className={`${WHITEBUTTONCLASSNAMES} w-full`}
                    onClick={() => handleOAuthSignIn("apple")}
                  >
                    Sign up with Apple
                  </Button> */}

                  <div className="text-center text-xs font-bold text-black">
                    ------ or ------
                  </div>

                  {/* Nostr Sign-up */}
                  <Button
                    className={`${WHITEBUTTONCLASSNAMES} w-full`}
                    onClick={handleGenerateKeys}
                  >
                    Sign up with Nostr
                  </Button>

                  <div className="mt-4 text-center">
                    <button
                      className="text-sm font-bold text-blue-600 underline"
                      onClick={() => {
                        setShowSignUpOptions(false);
                        setShowSignInOptions(true);
                      }}
                    >
                      Already have an account? Sign in
                    </button>
                  </div>
                </div>
              </div>
            ) : showNostrSignUpOptions && !showEmailSignIn ? (
              // Nostr sign-up options view
              <div className="flex w-full flex-col">
                <div className="space-y-3">
                  <div className="mb-3 flex items-center justify-center gap-3">
                    <Image
                      alt="Milk Market logo"
                      height={50}
                      radius="sm"
                      src="/milk-market.png"
                      width={50}
                    />
                    <div className="text-2xl font-bold text-black">
                      Sign Up with Nostr
                    </div>
                  </div>

                  {/* Extension Sign-up */}
                  <Button
                    className={`${WHITEBUTTONCLASSNAMES} w-full`}
                    onClick={startExtensionSignup}
                  >
                    Nostr Extension Sign-up
                  </Button>

                  <div className="text-center text-xs font-bold text-black">
                    ------ or ------
                  </div>

                  {/* Bunker Sign-up */}
                  <div className="flex flex-col">
                    <div className="">
                      <Button
                        data-testid="bunker-signup-open-btn"
                        onClick={() => {
                          setShowNsecSignIn(false);
                          setShowBunkerSignIn(true);
                        }}
                        className={`${WHITEBUTTONCLASSNAMES} w-full ${
                          showBunkerSignIn ? "hidden" : ""
                        }`}
                      >
                        Nostr Bunker Sign-up
                      </Button>
                    </div>
                    <div
                      className={`flex flex-col justify-between space-y-3 ${
                        showBunkerSignIn ? "" : "hidden"
                      }`}
                    >
                      <div>
                        <label className="mb-2 block text-sm font-bold text-black">
                          Bunker Token:
                        </label>
                        <Input
                          color={validBunkerToken}
                          width="100%"
                          size="lg"
                          value={bunkerToken}
                          placeholder="Paste your bunker token (bunker://)..."
                          onChange={(e) => setBunkerToken(e.target.value)}
                          classNames={{
                            input: "!text-black font-medium",
                            inputWrapper:
                              "!bg-white border-3 border-black rounded-md shadow-none hover:!bg-white group-data-[hover=true]:!bg-white group-data-[hover=true]:border-black group-data-[focus=true]:border-3 group-data-[focus=true]:border-black group-data-[focus=true]:!bg-white transition-none",
                          }}
                        />
                      </div>
                      <div>
                        <Button
                          data-testid="bunker-signup-submit-btn"
                          className={`${BLUEBUTTONCLASSNAMES} w-full`}
                          onClick={startBunkerSignup}
                          isDisabled={validBunkerToken != "success"}
                        >
                          {isBunkerConnecting ? (
                            <div className="flex items-center justify-center">
                              <MilkMarketSpinner />
                            </div>
                          ) : (
                            <>Bunker Sign-up</>
                          )}
                        </Button>
                      </div>
                    </div>
                  </div>

                  <div className="text-center text-xs font-bold text-black">
                    ------ or ------
                  </div>

                  {/* nsec Sign-up */}
                  <div className="flex flex-col">
                    <div className="">
                      <Button
                        data-testid="nsec-signup-open-btn"
                        onClick={() => {
                          setShowBunkerSignIn(false);
                          setShowNsecSignIn(true);
                        }}
                        className={`${WHITEBUTTONCLASSNAMES} w-full ${
                          showNsecSignIn ? "hidden" : ""
                        }`}
                      >
                        Nostr nsec Sign-up
                      </Button>
                    </div>
                    <div
                      className={`flex flex-col justify-between space-y-3 ${
                        showNsecSignIn ? "" : "hidden"
                      }`}
                    >
                      <div>
                        <label className="mb-2 block text-sm font-bold text-black">
                          Private Key:
                        </label>
                        <Input
                          color={validPrivateKey}
                          type="password"
                          width="100%"
                          size="lg"
                          value={privateKey}
                          placeholder="Paste your Nostr private key..."
                          onChange={(e) => setPrivateKey(e.target.value)}
                          classNames={{
                            input: "!text-black font-medium",
                            inputWrapper:
                              "!bg-white border-3 border-black rounded-md shadow-none hover:!bg-white group-data-[hover=true]:!bg-white group-data-[hover=true]:border-black group-data-[focus=true]:border-3 group-data-[focus=true]:border-black group-data-[focus=true]:!bg-white transition-none",
                          }}
                        />
                      </div>
                      <div>
                        <label className="mb-2 block text-sm font-bold text-black">
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
                              handleNsecSignup();
                          }}
                          classNames={{
                            input: "!text-black font-medium",
                            inputWrapper:
                              "!bg-white border-3 border-black rounded-md shadow-none hover:!bg-white group-data-[hover=true]:!bg-white group-data-[hover=true]:border-black group-data-[focus=true]:border-3 group-data-[focus=true]:border-black group-data-[focus=true]:!bg-white transition-none",
                          }}
                        />
                      </div>
                      <div>
                        <Button
                          data-testid="nsec-signup-submit-btn"
                          className={`${BLUEBUTTONCLASSNAMES} w-full`}
                          onClick={handleNsecSignup}
                          isDisabled={validPrivateKey != "success"}
                        >
                          nsec Sign-up
                        </Button>
                      </div>
                    </div>
                  </div>

                  <div className="text-center text-xs font-bold text-black">
                    ------ or ------
                  </div>

                  {/* New Account Creation */}
                  <Button
                    className={`${WHITEBUTTONCLASSNAMES} w-full`}
                    onClick={startNewAccountCreation}
                  >
                    Create New Account
                  </Button>

                  <div className="mt-4 text-center">
                    <button
                      className="text-sm font-bold text-blue-600 underline"
                      onClick={() => {
                        setShowNostrSignUpOptions(false);
                        setShowBunkerSignIn(false);
                        setShowNsecSignIn(false);
                        setBunkerToken("");
                        setPrivateKey("");
                        setPassphrase("");
                      }}
                    >
                      Back to Sign Up Options
                    </button>
                  </div>
                </div>
              </div>
            ) : showSignInOptions && !showEmailSignIn ? (
              // Nostr sign-in options view
              <div className="flex w-full flex-col">
                <div className="space-y-3">
                  <div className="mb-3 flex items-center justify-center gap-3">
                    <Image
                      alt="Milk Market logo"
                      height={50}
                      radius="sm"
                      src="/milk-market.png"
                      width={50}
                    />
                    <div className="text-2xl font-bold text-black">
                      Milk Market
                    </div>
                  </div>

                  {/* Email/Password Sign-in */}
                  <Button
                    className={`${WHITEBUTTONCLASSNAMES} w-full`}
                    onClick={() => {
                      setShowEmailSignIn(true);
                      setIsEmailSignUp(false);
                    }}
                  >
                    Sign in with Email
                  </Button>

                  {/* OAuth Buttons */}
                  <Button
                    className={`${WHITEBUTTONCLASSNAMES} flex w-full items-center justify-center gap-2`}
                    onClick={() => handleOAuthSignIn("google")}
                  >
                    <Image
                      src="/google-icon.png"
                      alt="Google"
                      width={20}
                      height={20}
                      className="flex-shrink-0"
                    />
                    <span>Sign in with Google</span>
                  </Button>

                  {/* <Button
                    className={`${WHITEBUTTONCLASSNAMES} w-full`}
                    onClick={() => handleOAuthSignIn("apple")}
                  >
                    Sign in with Apple
                  </Button> */}

                  <div className="text-center text-xs font-bold text-black">
                    ------ or ------
                  </div>

                  <Button
                    className={`${WHITEBUTTONCLASSNAMES} w-full`}
                    onClick={startExtensionLogin}
                  >
                    Nostr Extension Sign-in
                  </Button>

                  <div className="text-center text-xs font-bold text-black">
                    ------ or ------
                  </div>

                  {/* Bunker Sign-in */}
                  <div className="flex flex-col">
                    <div className="">
                      <Button
                        data-testid="bunker-open-btn"
                        onClick={() => {
                          setShowNsecSignIn(false);
                          setShowBunkerSignIn(true);
                        }}
                        className={`${WHITEBUTTONCLASSNAMES} w-full ${
                          showBunkerSignIn ? "hidden" : ""
                        }`}
                      >
                        Nostr Bunker Sign-in
                      </Button>
                    </div>
                    <div
                      className={`flex flex-col justify-between space-y-3 ${
                        showBunkerSignIn ? "" : "hidden"
                      }`}
                    >
                      <div>
                        <label className="mb-2 block text-sm font-bold text-black">
                          Bunker Token:
                        </label>
                        <Input
                          color={validBunkerToken}
                          width="100%"
                          size="lg"
                          value={bunkerToken}
                          placeholder="Paste your bunker token (bunker://)..."
                          onChange={(e) => setBunkerToken(e.target.value)}
                          classNames={{
                            input: "!text-black font-medium",
                            inputWrapper:
                              "!bg-white border-3 border-black rounded-md shadow-none hover:!bg-white group-data-[hover=true]:!bg-white group-data-[hover=true]:border-black group-data-[focus=true]:border-3 group-data-[focus=true]:border-black group-data-[focus=true]:!bg-white transition-none",
                          }}
                        />
                      </div>
                      <div>
                        <Button
                          data-testid="bunker-submit-btn"
                          className={`${BLUEBUTTONCLASSNAMES} w-full`}
                          onClick={startBunkerLogin}
                          isDisabled={validBunkerToken != "success"}
                        >
                          {isBunkerConnecting ? (
                            <div className="flex items-center justify-center">
                              <MilkMarketSpinner />
                            </div>
                          ) : (
                            <>Bunker Sign-in</>
                          )}
                        </Button>
                      </div>
                    </div>
                  </div>

                  <div className="text-center text-xs font-bold text-black">
                    ------ or ------
                  </div>
                </div>

                {/* nsec Sign-in */}
                <div className="flex flex-col">
                  <div className="">
                    <Button
                      data-testid="nsec-open-btn"
                      onClick={() => {
                        setShowBunkerSignIn(false);
                        setShowNsecSignIn(true);
                      }}
                      className={`${WHITEBUTTONCLASSNAMES} w-full ${
                        showNsecSignIn ? "hidden" : ""
                      }`}
                    >
                      Nostr nsec Sign-in
                    </Button>
                  </div>
                  <div
                    className={`flex flex-col justify-between space-y-3 ${
                      showNsecSignIn ? "" : "hidden"
                    }`}
                  >
                    <div>
                      <label className="mb-2 block text-sm font-bold text-black">
                        Private Key:
                      </label>
                      <Input
                        color={validPrivateKey}
                        type="password"
                        width="100%"
                        size="lg"
                        value={privateKey}
                        placeholder="Paste your Nostr private key..."
                        onChange={(e) => setPrivateKey(e.target.value)}
                        classNames={{
                          input: "!text-black font-medium",
                          inputWrapper:
                            "!bg-white border-3 border-black rounded-md shadow-none hover:!bg-white group-data-[hover=true]:!bg-white group-data-[hover=true]:border-black group-data-[focus=true]:border-3 group-data-[focus=true]:border-black group-data-[focus=true]:!bg-white transition-none",
                        }}
                      />
                    </div>
                    <div>
                      <label className="mb-2 block text-sm font-bold text-black">
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
                        classNames={{
                          input: "!text-black font-medium",
                          inputWrapper:
                            "!bg-white border-3 border-black rounded-md shadow-none hover:!bg-white group-data-[hover=true]:!bg-white group-data-[hover=true]:border-black group-data-[focus=true]:border-3 group-data-[focus=true]:border-black group-data-[focus=true]:!bg-white transition-none",
                        }}
                      />
                    </div>
                    <div>
                      <Button
                        data-testid="nsec-submit-btn"
                        className={`${BLUEBUTTONCLASSNAMES} w-full`}
                        onClick={handleSignIn}
                        isDisabled={validPrivateKey != "success"}
                      >
                        nsec Sign-in
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              // Email/Password Sign-in Form
              <div className="flex w-full flex-col">
                <div className="space-y-3">
                  <div className="mb-3 flex items-center justify-center gap-3">
                    <Image
                      alt="Milk Market logo"
                      height={50}
                      radius="sm"
                      src="/milk-market.png"
                      width={50}
                    />
                    <div className="text-2xl font-bold text-black">
                      {isEmailSignUp ? "Sign Up" : "Sign In"} with Email
                    </div>
                  </div>

                  <div>
                    <label className="mb-2 block text-sm font-bold text-black">
                      Email:
                    </label>
                    <Input
                      type="email"
                      width="100%"
                      size="lg"
                      value={email}
                      placeholder="Enter your email..."
                      onChange={(e) => setEmail(e.target.value)}
                      classNames={{
                        input: "!text-black font-medium",
                        inputWrapper:
                          "!bg-white border-3 border-black rounded-md shadow-none hover:!bg-white group-data-[hover=true]:!bg-white group-data-[hover=true]:border-black group-data-[focus=true]:border-3 group-data-[focus=true]:border-black group-data-[focus=true]:!bg-white transition-none",
                      }}
                    />
                  </div>

                  <div>
                    <label className="mb-2 block text-sm font-bold text-black">
                      Password:
                    </label>
                    <Input
                      type="password"
                      width="100%"
                      size="lg"
                      value={password}
                      placeholder="Enter your password..."
                      onChange={(e) => setPassword(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleEmailSignIn();
                      }}
                      classNames={{
                        input: "!text-black font-medium",
                        inputWrapper:
                          "!bg-white border-3 border-black rounded-md shadow-none hover:!bg-white group-data-[hover=true]:!bg-white group-data-[hover=true]:border-black group-data-[focus=true]:border-3 group-data-[focus=true]:border-black group-data-[focus=true]:!bg-white transition-none",
                      }}
                    />
                    {isEmailSignUp && (
                      <div className="mt-2 flex items-start gap-2 rounded-md border-2 border-yellow-500 bg-yellow-50 p-3">
                        <InformationCircleIcon className="mt-0.5 h-5 w-5 flex-shrink-0 text-yellow-700" />
                        <p className="text-xs font-medium text-yellow-900">
                          Passwords cannot currently be recovered or changed.
                          Please store your password securely.
                        </p>
                      </div>
                    )}
                  </div>

                  <Button
                    className={`${BLUEBUTTONCLASSNAMES} w-full`}
                    onClick={handleEmailSignIn}
                  >
                    {isEmailSignUp ? "Sign Up" : "Sign In"}
                  </Button>

                  <div className="text-center">
                    <button
                      className="text-sm font-bold text-blue-600 underline"
                      onClick={() => setIsEmailSignUp(!isEmailSignUp)}
                    >
                      {isEmailSignUp
                        ? "Already have an account? Sign in"
                        : "Don't have an account? Sign up"}
                    </button>
                  </div>

                  <div className="text-center text-xs font-bold text-black">
                    ------ or ------
                  </div>

                  <Button
                    className={`${WHITEBUTTONCLASSNAMES} w-full`}
                    onClick={() => {
                      setShowEmailSignIn(false);
                      setEmail("");
                      setPassword("");
                      setIsEmailSignUp(false);
                    }}
                  >
                    Back to {showSignUpOptions ? "Sign Up" : "Sign In"} Options
                  </Button>
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
