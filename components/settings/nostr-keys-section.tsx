import { useEffect, useState, useContext } from "react";
import { Button, Input, Tooltip } from "@heroui/react";
import {
  InformationCircleIcon,
  ShieldCheckIcon,
} from "@heroicons/react/24/outline";
import RecoveryKeyModal from "@/components/sign-in/RecoveryKeyModal";
import { SignerContext } from "@/components/utility-components/nostr-context-provider";
import { NostrNSecSigner } from "@/utils/nostr/signers/nostr-nsec-signer";
import { copyToClipboard } from "@/utils/clipboard";

const NostrKeysSection = () => {
  const {
    signer,
    pubkey: userPubkey,
    npub: userNPub,
  } = useContext(SignerContext);

  const [isNPubCopied, setIsNPubCopied] = useState(false);
  const [isNSecCopied, setIsNSecCopied] = useState(false);
  const [isNSecVisible, setIsNSecVisible] = useState(false);
  const [userNSec, setUserNSec] = useState("");
  const [isNcryptsecCopied, setIsNcryptsecCopied] = useState(false);
  const [isNcryptsecVisible, setIsNcryptsecVisible] = useState(false);
  const [userNcryptsec, setUserNcryptsec] = useState("");

  const [showRecoverySetup, setShowRecoverySetup] = useState(false);
  const [recoveryEmail, setRecoveryEmail] = useState("");
  const [maskedRecoveryEmail, setMaskedRecoveryEmail] = useState("");
  const [recoverySetupLoading, setRecoverySetupLoading] = useState(false);
  const [recoverySetupError, setRecoverySetupError] = useState("");
  const [showRecoveryKeyModal, setShowRecoveryKeyModal] = useState(false);
  const [generatedRecoveryKey, setGeneratedRecoveryKey] = useState("");
  const [hasRecoverySetup, setHasRecoverySetup] = useState(false);
  const [verificationCode, setVerificationCode] = useState("");
  const [verificationSent, setVerificationSent] = useState(false);
  const [verificationLoading, setVerificationLoading] = useState(false);

  useEffect(() => {
    if (!userPubkey) return;
    fetch("/api/auth/check-recovery", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pubkey: userPubkey }),
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.hasRecovery) {
          setHasRecoverySetup(true);
          setMaskedRecoveryEmail(data.maskedEmail || "");
        }
      })
      .catch(() => {});
  }, [userPubkey]);

  return (
    <>
      {/* Nostr Info Box */}
      <div className="mb-6 flex w-full items-start gap-3 rounded-md border-3 border-black bg-white p-4">
        <InformationCircleIcon className="h-6 w-6 flex-shrink-0 text-black" />
        <p className="text-sm text-black">
          Accounts are created using{" "}
          <a
            href="https://nostr.com"
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary-yellow font-bold hover:underline"
          >
            Nostr keys
          </a>
          . Please back up your keys in a secure location to ensure you
          don&apos;t lose access to your account.
        </p>
      </div>

      {/* NPub Display */}
      <div className="mb-4 flex items-center justify-between gap-2 overflow-hidden rounded-md border-3 border-black bg-white p-3">
        <p className="min-w-0 flex-1 font-mono text-sm font-medium break-all text-black">
          {userNPub!}
        </p>
        <Tooltip
          content={isNPubCopied ? "Copied!" : "Copy npub"}
          classNames={{
            content: "text-black bg-white border border-black rounded-md",
          }}
          closeDelay={100}
        >
          <Button
            isIconOnly
            variant="light"
            className="h-6 w-6 min-w-0 flex-shrink-0 p-0 text-black"
            onClick={async () => {
              await copyToClipboard(userNPub!);
              setIsNPubCopied(true);
              setTimeout(() => setIsNPubCopied(false), 2000);
            }}
          >
            {isNPubCopied ? "✅" : "📋"}
          </Button>
        </Tooltip>
      </div>

      {/* NSec Display */}
      {(userNSec || signer instanceof NostrNSecSigner) && (
        <div className="mb-4 flex items-center justify-between gap-2 overflow-hidden rounded-md border-3 border-black bg-white p-3">
          <p className="min-w-0 flex-1 font-mono text-sm font-medium break-all text-black">
            {isNSecVisible
              ? userNSec
              : "•••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••"}
          </p>
          <div className="flex flex-shrink-0 gap-2">
            <Tooltip
              content={isNSecVisible ? "Hide nsec" : "Show nsec"}
              classNames={{
                content: "text-black bg-white border border-black rounded-md",
              }}
              closeDelay={100}
            >
              <Button
                isIconOnly
                variant="light"
                className="h-6 w-6 min-w-0 p-0 text-black"
                onClick={async () => {
                  if (!userNSec && signer instanceof NostrNSecSigner) {
                    try {
                      const nsec = await (signer as NostrNSecSigner)._getNSec();
                      setUserNSec(nsec);
                    } catch (err) {
                      console.error(err);
                    }
                  }
                  setIsNSecVisible(!isNSecVisible);
                }}
              >
                {isNSecVisible ? "👁️⃠" : "👁️"}
              </Button>
            </Tooltip>
            <Tooltip
              content={isNSecCopied ? "Copied!" : "Copy nsec"}
              classNames={{
                content: "text-black bg-white border border-black rounded-md",
              }}
              closeDelay={100}
            >
              <Button
                isIconOnly
                variant="light"
                className="h-6 w-6 min-w-0 p-0 text-black"
                onClick={async () => {
                  await copyToClipboard(userNSec);
                  setIsNSecCopied(true);
                  setTimeout(() => setIsNSecCopied(false), 2000);
                }}
              >
                {isNSecCopied ? "✅" : "📋"}
              </Button>
            </Tooltip>
          </div>
        </div>
      )}

      {/* NCryptsec Display */}
      {(userNcryptsec || signer instanceof NostrNSecSigner) && (
        <div className="mb-2 flex items-center justify-between gap-2 overflow-hidden rounded-md border-3 border-black bg-white p-3">
          <div className="min-w-0 flex-1">
            <p className="mb-1 text-xs font-bold text-gray-500">ncryptsec</p>
            <p className="font-mono text-sm font-medium break-all text-black">
              {isNcryptsecVisible
                ? userNcryptsec
                : "•••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••"}
            </p>
          </div>
          <div className="flex flex-shrink-0 gap-2">
            <Tooltip
              content={isNcryptsecVisible ? "Hide ncryptsec" : "Show ncryptsec"}
              classNames={{
                content: "text-black bg-white border border-black rounded-md",
              }}
              closeDelay={100}
            >
              <Button
                isIconOnly
                variant="light"
                className="h-6 w-6 min-w-0 p-0 text-black"
                onClick={() => {
                  if (!userNcryptsec && signer instanceof NostrNSecSigner) {
                    const nsecSigner = signer as NostrNSecSigner;
                    const encKey = nsecSigner.getEncryptedPrivKey();
                    if (encKey && encKey.startsWith("ncryptsec")) {
                      setUserNcryptsec(encKey);
                    }
                  }
                  setIsNcryptsecVisible(!isNcryptsecVisible);
                }}
              >
                {isNcryptsecVisible ? "👁️⃠" : "👁️"}
              </Button>
            </Tooltip>
            <Tooltip
              content={isNcryptsecCopied ? "Copied!" : "Copy ncryptsec"}
              classNames={{
                content: "text-black bg-white border border-black rounded-md",
              }}
              closeDelay={100}
            >
              <Button
                isIconOnly
                variant="light"
                className="h-6 w-6 min-w-0 p-0 text-black"
                onClick={async () => {
                  await copyToClipboard(userNcryptsec);
                  setIsNcryptsecCopied(true);
                  setTimeout(() => setIsNcryptsecCopied(false), 2000);
                }}
              >
                {isNcryptsecCopied ? "✅" : "📋"}
              </Button>
            </Tooltip>
          </div>
        </div>
      )}

      {userNcryptsec && (
        <p className="mb-6 text-xs text-gray-500">
          Your ncryptsec is your nsec in encrypted form. It is safer to use your
          ncryptsec instead of your nsec to sign in across devices, as it cannot
          be used without your passphrase.
        </p>
      )}

      {/* Account Recovery */}
      {(userNSec || signer instanceof NostrNSecSigner) && (
        <div className="mb-8 rounded-md border-3 border-black bg-white p-4">
          <div className="mb-3 flex items-center gap-2">
            <ShieldCheckIcon className="h-5 w-5 text-black" />
            <h3 className="text-sm font-bold text-black">Account Recovery</h3>
          </div>

          {hasRecoverySetup ? (
            <div className="flex flex-col gap-2">
              <p className="text-xs text-gray-600">
                Recovery is set up for <strong>{maskedRecoveryEmail}</strong>.
                If you forget your passphrase, you can recover your account
                using your recovery key and email verification.
              </p>
              {!showRecoverySetup ? (
                <Button
                  size="sm"
                  variant="bordered"
                  className="self-start border-black text-black"
                  onPress={() => {
                    setShowRecoverySetup(true);
                    setRecoveryEmail("");
                    setVerificationCode("");
                    setVerificationSent(false);
                    setRecoverySetupError("");
                  }}
                >
                  Generate New Recovery Key
                </Button>
              ) : (
                <div className="mt-1 flex flex-col gap-3 rounded-md border border-gray-200 bg-gray-50 p-3">
                  <p className="text-xs text-gray-600">
                    Enter your recovery email to verify ownership, then a new
                    recovery key will be generated.
                  </p>
                  <Input
                    label="Recovery Email"
                    type="email"
                    size="sm"
                    value={recoveryEmail}
                    onValueChange={setRecoveryEmail}
                    isDisabled={verificationSent}
                    variant="bordered"
                    classNames={{
                      inputWrapper: "border-black",
                      label: "text-black",
                    }}
                  />
                  {verificationSent && (
                    <Input
                      label="Verification Code"
                      size="sm"
                      value={verificationCode}
                      onValueChange={setVerificationCode}
                      placeholder="Enter 6-digit code"
                      variant="bordered"
                      classNames={{
                        inputWrapper: "border-black",
                        label: "text-black",
                      }}
                    />
                  )}
                  {recoverySetupError && (
                    <p className="text-xs text-red-600">{recoverySetupError}</p>
                  )}
                  <div className="flex gap-2">
                    {!verificationSent ? (
                      <Button
                        size="sm"
                        className="bg-black text-white"
                        isLoading={verificationLoading}
                        onPress={async () => {
                          if (!recoveryEmail || !userPubkey) {
                            setRecoverySetupError(
                              "Please enter an email address."
                            );
                            return;
                          }
                          setVerificationLoading(true);
                          setRecoverySetupError("");
                          try {
                            const res = await fetch(
                              "/api/auth/send-recovery-verification",
                              {
                                method: "POST",
                                headers: {
                                  "Content-Type": "application/json",
                                },
                                body: JSON.stringify({
                                  email: recoveryEmail,
                                  pubkey: userPubkey,
                                }),
                              }
                            );
                            const data = await res.json();
                            if (!res.ok) {
                              setRecoverySetupError(
                                data.error || "Failed to send verification."
                              );
                              return;
                            }
                            setVerificationSent(true);
                          } catch {
                            setRecoverySetupError("Something went wrong.");
                          } finally {
                            setVerificationLoading(false);
                          }
                        }}
                      >
                        Send Verification Code
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        className="bg-black text-white"
                        isLoading={recoverySetupLoading}
                        onPress={async () => {
                          if (
                            !verificationCode ||
                            !recoveryEmail ||
                            !userPubkey ||
                            !userNSec
                          ) {
                            setRecoverySetupError(
                              "Please enter the verification code."
                            );
                            return;
                          }
                          setRecoverySetupLoading(true);
                          setRecoverySetupError("");
                          try {
                            const res = await fetch(
                              "/api/auth/setup-recovery",
                              {
                                method: "POST",
                                headers: {
                                  "Content-Type": "application/json",
                                },
                                body: JSON.stringify({
                                  pubkey: userPubkey,
                                  email: recoveryEmail,
                                  nsec: userNSec,
                                  verificationCode,
                                  authType:
                                    localStorage.getItem("authProvider") ||
                                    "nsec",
                                }),
                              }
                            );
                            const data = await res.json();
                            if (!res.ok) {
                              setRecoverySetupError(
                                data.error ||
                                  "Failed to regenerate recovery key."
                              );
                              return;
                            }
                            setGeneratedRecoveryKey(data.recoveryKey);
                            setMaskedRecoveryEmail(
                              recoveryEmail.slice(0, 2) +
                                "***@" +
                                recoveryEmail.split("@")[1]
                            );
                            setShowRecoveryKeyModal(true);
                            setShowRecoverySetup(false);
                            setVerificationSent(false);
                            setVerificationCode("");
                          } catch {
                            setRecoverySetupError("Something went wrong.");
                          } finally {
                            setRecoverySetupLoading(false);
                          }
                        }}
                      >
                        Verify &amp; Generate Key
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="bordered"
                      className="border-black text-black"
                      onPress={() => {
                        setShowRecoverySetup(false);
                        setRecoverySetupError("");
                        setVerificationSent(false);
                        setVerificationCode("");
                      }}
                    >
                      Cancel
                    </Button>
                  </div>
                  <p className="text-xs text-yellow-700">
                    Generating a new key will invalidate your previous recovery
                    key.
                  </p>
                </div>
              )}
            </div>
          ) : !showRecoverySetup ? (
            <div className="flex flex-col gap-2">
              <p className="text-xs text-gray-600">
                Set up account recovery so you can reset your passphrase if you
                ever forget it. You&apos;ll need an email address for
                verification.
              </p>
              <Button
                size="sm"
                className="self-start bg-black text-white"
                onPress={() => setShowRecoverySetup(true)}
              >
                Set Up Recovery
              </Button>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              <p className="text-xs text-gray-600">
                Enter the email address you&apos;d like to use for recovery.
                We&apos;ll send a verification code to confirm you own it.
              </p>
              <Input
                label="Recovery Email"
                type="email"
                size="sm"
                value={recoveryEmail}
                onValueChange={setRecoveryEmail}
                isDisabled={verificationSent}
                variant="bordered"
                classNames={{
                  inputWrapper: "border-black",
                  label: "text-black",
                }}
              />
              {verificationSent && (
                <Input
                  label="Verification Code"
                  size="sm"
                  value={verificationCode}
                  onValueChange={setVerificationCode}
                  placeholder="Enter 6-digit code"
                  variant="bordered"
                  classNames={{
                    inputWrapper: "border-black",
                    label: "text-black",
                  }}
                />
              )}
              {recoverySetupError && (
                <p className="text-xs text-red-600">{recoverySetupError}</p>
              )}
              <div className="flex gap-2">
                {!verificationSent ? (
                  <Button
                    size="sm"
                    className="bg-black text-white"
                    isLoading={verificationLoading}
                    onPress={async () => {
                      if (!recoveryEmail || !userPubkey) {
                        setRecoverySetupError("Please enter an email address.");
                        return;
                      }
                      setVerificationLoading(true);
                      setRecoverySetupError("");
                      try {
                        const res = await fetch(
                          "/api/auth/send-recovery-verification",
                          {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({
                              email: recoveryEmail,
                              pubkey: userPubkey,
                            }),
                          }
                        );
                        const data = await res.json();
                        if (!res.ok) {
                          setRecoverySetupError(
                            data.error || "Failed to send verification."
                          );
                          return;
                        }
                        setVerificationSent(true);
                      } catch {
                        setRecoverySetupError("Something went wrong.");
                      } finally {
                        setVerificationLoading(false);
                      }
                    }}
                  >
                    Send Verification Code
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    className="bg-black text-white"
                    isLoading={recoverySetupLoading}
                    onPress={async () => {
                      if (
                        !verificationCode ||
                        !recoveryEmail ||
                        !userPubkey ||
                        !userNSec
                      ) {
                        setRecoverySetupError(
                          "Please enter the verification code."
                        );
                        return;
                      }
                      setRecoverySetupLoading(true);
                      setRecoverySetupError("");
                      try {
                        const res = await fetch("/api/auth/setup-recovery", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({
                            pubkey: userPubkey,
                            email: recoveryEmail,
                            nsec: userNSec,
                            verificationCode,
                            authType:
                              localStorage.getItem("authProvider") || "nsec",
                          }),
                        });
                        const data = await res.json();
                        if (!res.ok) {
                          setRecoverySetupError(
                            data.error || "Failed to set up recovery."
                          );
                          return;
                        }
                        setGeneratedRecoveryKey(data.recoveryKey);
                        setHasRecoverySetup(true);
                        setMaskedRecoveryEmail(
                          recoveryEmail.slice(0, 2) +
                            "***@" +
                            recoveryEmail.split("@")[1]
                        );
                        setShowRecoveryKeyModal(true);
                        setShowRecoverySetup(false);
                        setVerificationSent(false);
                        setVerificationCode("");
                      } catch {
                        setRecoverySetupError("Something went wrong.");
                      } finally {
                        setRecoverySetupLoading(false);
                      }
                    }}
                  >
                    Verify &amp; Set Up Recovery
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="bordered"
                  className="border-black text-black"
                  onPress={() => {
                    setShowRecoverySetup(false);
                    setRecoverySetupError("");
                    setVerificationSent(false);
                    setVerificationCode("");
                  }}
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      <RecoveryKeyModal
        isOpen={showRecoveryKeyModal}
        onClose={() => {
          setShowRecoveryKeyModal(false);
          setGeneratedRecoveryKey("");
        }}
        recoveryKey={generatedRecoveryKey}
        email={recoveryEmail}
      />
    </>
  );
};

export default NostrKeysSection;
