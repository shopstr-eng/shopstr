import { useState, useEffect, useContext } from "react";
import { useRouter } from "next/router";
import { Square2StackIcon } from "@heroicons/react/24/outline";
import { Button, Image } from "@nextui-org/react";
import { ArrowLongRightIcon } from "@heroicons/react/24/outline";
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
import { NEO_BTN } from "@/utils/STATIC-VARIABLES";

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
      <div className="flex min-h-screen items-center justify-center bg-[#050505] p-4 pt-24">
        <div className="relative w-full max-w-2xl rounded-3xl border border-white/10 bg-[#1a1a1a] p-8 shadow-2xl md:p-12">
          {/* Step Pill */}
          <div className="absolute -top-5 left-1/2 -translate-x-1/2 rounded-full border-2 border-b-4 border-shopstr-yellow bg-[#111] px-6 py-2">
            <span className="text-xs font-bold uppercase tracking-widest text-shopstr-yellow">
              Step 1 of 4
            </span>
          </div>

          <div className="flex flex-col items-center">
            <div className="mb-6 flex items-center gap-3">
              <Image
                alt="Shopstr logo"
                height={40}
                radius="sm"
                src="/shopstr-2000x2000.png"
                width={40}
              />
              <h1 className="text-3xl font-bold text-white">Shopstr</h1>
            </div>

            <h2 className="mb-4 text-center text-4xl font-black text-white">
              Secure Your Keys
            </h2>
            <p className="mb-10 max-w-lg text-center text-gray-400">
              Make sure to save your public and private keys in a secure format!
              You can always view them again under your profile settings.
            </p>
          </div>

          <div className="space-y-6">
            {/* Public Key Section */}
            <div>
              <label className="mb-3 block text-xs font-bold uppercase tracking-widest text-white/50">
                Public Key
              </label>
              {npub && (
                <div
                  className="group flex cursor-pointer items-center justify-between rounded-xl border border-white/10 bg-[#111] px-4 py-3 transition-colors hover:border-white/20"
                  onClick={handleCopyPubkey}
                >
                  <span className="min-w-0 flex-1 truncate pr-4 font-mono text-gray-400">
                    {npub}
                  </span>
                  <Square2StackIcon className="h-5 w-5 flex-shrink-0 text-gray-500 transition-colors group-hover:text-white" />
                </div>
              )}
            </div>

            <div>
              <label className="mb-3 block text-xs font-bold uppercase tracking-widest text-white/50">
                Private Key
              </label>
              {privateKey && (
                <div className="group relative flex items-center rounded-xl border border-white/10 bg-[#111] px-4 py-3 transition-colors hover:border-white/20">
                  <div
                    className="mr-auto min-w-0 flex-1 cursor-pointer truncate font-mono text-gray-400"
                    onClick={() =>
                      setViewState(viewState === "shown" ? "hidden" : "shown")
                    }
                  >
                    {viewState === "shown"
                      ? privateKey
                      : "••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••"}
                  </div>
                  <div className="flex items-center gap-3 pl-2">
                    <button onClick={handleCopyPrivkey}>
                      <Square2StackIcon className="h-5 w-5 text-gray-500 transition-colors hover:text-white" />
                    </button>
                  </div>
                </div>
              )}
            </div>

            <div>
              <label className="mb-3 block text-xs font-bold uppercase tracking-widest text-white/50">
                Encryption Passphrase <span className="text-red-500">*</span>
              </label>
              <input
                type="password"
                className="w-full rounded-xl border border-white/10 bg-[#111] px-4 py-3 font-mono text-base text-white placeholder-gray-600 transition-colors focus:border-white/30 focus:outline-none"
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
              <p className="mt-2 text-xs text-gray-600">
                This will encrypt your keys locally on this device.
              </p>
            </div>

            <div className="flex justify-end pt-4">
              <Button
                className={`${NEO_BTN} px-8 py-6 text-sm`}
                onClick={handleNext}
              >
                Next <ArrowLongRightIcon className="h-5 w-5" />
              </Button>
            </div>
          </div>
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
