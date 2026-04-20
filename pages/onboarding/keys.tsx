import { useState, useEffect, useContext } from "react";
import { useRouter } from "next/router";
import {
  InformationCircleIcon,
  EyeIcon,
  EyeSlashIcon,
  ArrowLongRightIcon,
} from "@heroicons/react/24/outline";
import { Card, CardBody, Button, Input, Image, Tooltip } from "@heroui/react";
import { SHOPSTRBUTTONCLASSNAMES } from "@/utils/STATIC-VARIABLES";
import {
  generateKeys,
  setLocalStorageDataOnSignIn,
} from "@/utils/nostr/nostr-helper-functions";
import { RelaysContext } from "../../utils/context/context";
import { SignerContext } from "@/components/utility-components/nostr-context-provider";
import { NostrSigner } from "@/utils/nostr/signers/nostr-signer";
import { NostrNSecSigner } from "@/utils/nostr/signers/nostr-nsec-signer";
import FailureModal from "../../components/utility-components/failure-modal";

const Keys = () => {
  const router = useRouter();
  const { preselect } = router.query;

  const [privateKey, setPrivateKey] = useState<string>("");
  const [passphrase, setPassphrase] = useState<string>("");
  const [showPassphrase, setShowPassphrase] = useState(false);
  const [showFailureModal, setShowFailureModal] = useState(false);

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
      const { nsec } = await generateKeys();
      setPrivateKey(nsec);
    };

    fetchKeys();
  }, []);

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
      router.push(
        preselect === "seller"
          ? "/onboarding/user-type?preselect=seller"
          : "/onboarding/user-type"
      );
    }
  };

  return (
    <>
      <div className="bg-light-bg dark:bg-dark-bg flex h-[100vh] flex-col pt-24">
        <div className="mx-auto w-full max-w-2xl px-4 py-6">
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
                <h1 className="text-shopstr-purple-light dark:text-shopstr-yellow-light cursor-pointer text-center text-3xl font-bold hover:text-purple-700">
                  Shopstr
                </h1>
              </div>

              <div className="mb-6 text-center">
                <h2 className="text-light-text dark:text-dark-text text-2xl font-bold">
                  Step 1: Account Creation
                </h2>
                <p className="text-light-text dark:text-dark-text text-sm">
                  Enter a passphrase to make sure your data is secured. You can
                  view your account information under your profile settings.
                </p>
              </div>

              <div className="mb-6 flex flex-col space-y-2">
                <div className="flex items-center gap-2">
                  <label className="text-light-text dark:text-dark-text text-xl font-bold">
                    Passphrase <span className="text-red-500">*</span>
                  </label>
                  <Tooltip
                    content="This passphrase acts as a password and is used to keep your account secure. Remember it and keep it safe as it can't be recovered!"
                    placement="right"
                    closeDelay={100}
                  >
                    <button
                      type="button"
                      className="flex items-center justify-center"
                      aria-label="Passphrase information"
                    >
                      <InformationCircleIcon className="text-light-text dark:text-dark-text h-6 w-6 cursor-help" />
                    </button>
                  </Tooltip>
                </div>
                <Input
                  type={showPassphrase ? "text" : "password"}
                  fullWidth
                  size="lg"
                  value={passphrase}
                  placeholder="Enter a passphrase of your choice..."
                  onChange={(e: any) => setPassphrase(e.target.value)}
                  onKeyDown={(e: any) => {
                    if (
                      e.key === "Enter" &&
                      !(passphrase === "" || passphrase === null)
                    )
                      handleNext();
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

              <div className="mt-4 flex justify-center">
                <Button
                  className={SHOPSTRBUTTONCLASSNAMES}
                  onClick={handleNext}
                >
                  Next <ArrowLongRightIcon className="ml-1 h-5 w-5" />
                </Button>
              </div>
            </CardBody>
          </Card>
        </div>
      </div>
      <FailureModal
        bodyText="No passphrase provided!"
        isOpen={showFailureModal}
        onClose={() => setShowFailureModal(false)}
      />
    </>
  );
};

export default Keys;
