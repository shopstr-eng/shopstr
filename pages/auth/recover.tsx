import { useState, useContext } from "react";
import { useRouter } from "next/router";
import { Button, Input } from "@nextui-org/react";
import { SignerContext } from "@/components/utility-components/nostr-context-provider";
import { NostrNSecSigner } from "@/utils/nostr/signers/nostr-nsec-signer";
import { setLocalStorageDataOnSignIn } from "@/utils/nostr/nostr-helper-functions";
import { RelaysContext } from "@/utils/context/context";
import {
  ShieldCheckIcon,
  EnvelopeIcon,
  KeyIcon,
  CheckCircleIcon,
} from "@heroicons/react/24/outline";

type Step = "email" | "verify" | "reset" | "success";

export default function RecoverPage() {
  const router = useRouter();
  const { token: urlToken } = router.query;

  const { newSigner } = useContext(SignerContext);
  const relaysContext = useContext(RelaysContext);

  const [step, setStep] = useState<Step>(urlToken ? "verify" : "email");
  const [email, setEmail] = useState("");
  const [verifiedEmail, setVerifiedEmail] = useState("");
  const [token, setToken] = useState((urlToken as string) || "");
  const [recoveryKey, setRecoveryKey] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [emailSent, setEmailSent] = useState(false);
  const [authType, setAuthType] = useState<string>("email");

  const credentialLabel = authType === "email" ? "password" : "passphrase";

  const handleRequestRecovery = async () => {
    if (!email) {
      setError("Please enter your email address.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/auth/request-recovery", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to request recovery.");
        return;
      }
      setEmailSent(true);
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyToken = async () => {
    const activeToken = token || (urlToken as string);
    if (!activeToken) {
      setError("Please enter the recovery token.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/auth/verify-recovery-token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: activeToken }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Invalid or expired token.");
        return;
      }
      setVerifiedEmail(data.email);
      setAuthType(data.authType || "email");
      setToken(activeToken);
      setStep("reset");
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async () => {
    if (!recoveryKey) {
      setError("Please enter your recovery key.");
      return;
    }
    if (!newPassword) {
      setError(`Please enter a new ${credentialLabel}.`);
      return;
    }
    if (newPassword !== confirmPassword) {
      setError(
        `${
          credentialLabel === "password" ? "Passwords" : "Passphrases"
        } do not match.`
      );
      return;
    }
    if (newPassword.length < 6) {
      setError(
        `${
          credentialLabel === "password" ? "Password" : "Passphrase"
        } must be at least 6 characters.`
      );
      return;
    }
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          recoveryKey: recoveryKey.replace(/\s/g, ""),
          newPassword,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to reset password.");
        return;
      }

      if (data.nsec && data.pubkey) {
        const { encryptedPrivKey } = NostrNSecSigner.getEncryptedNSEC(
          data.nsec,
          newPassword
        );

        const signer = newSigner!("nsec", {
          encryptedPrivKey,
          pubkey: data.pubkey,
          passphrase: newPassword,
        });
        await signer.getPubKey();

        if (data.authType === "email") {
          localStorage.setItem("authProvider", "email");
          localStorage.setItem("authEmail", verifiedEmail);
        } else if (data.authType === "nsec") {
          localStorage.setItem("authProvider", "nsec");
        }

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
        }
      }

      setStep("success");
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-light-bg flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-md rounded-xl border-3 border-black bg-white p-8 shadow-lg">
        <div className="mb-6 text-center">
          <h1 className="text-2xl font-bold text-black">Account Recovery</h1>
          <p className="mt-2 text-sm text-gray-500">
            {step === "email" &&
              "Enter your email to start the recovery process."}
            {step === "verify" && "Verify your recovery link."}
            {step === "reset" &&
              `Enter your recovery key and choose a new ${credentialLabel}.`}
            {step === "success" && "Your account has been recovered!"}
          </p>
        </div>

        {error && (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {step === "email" && !emailSent && (
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-3 rounded-lg bg-gray-50 p-3">
              <EnvelopeIcon className="h-5 w-5 text-gray-500" />
              <p className="text-xs text-gray-600">
                We&apos;ll send a recovery link to your email address.
              </p>
            </div>
            <Input
              label="Email"
              type="email"
              value={email}
              onValueChange={setEmail}
              variant="bordered"
              classNames={{
                inputWrapper: "border-black",
                label: "text-black",
              }}
            />
            <Button
              className="w-full bg-black font-semibold text-white"
              onPress={handleRequestRecovery}
              isLoading={loading}
            >
              Send Recovery Link
            </Button>
            <button
              className="text-center text-sm text-gray-500 underline hover:text-gray-700"
              onClick={() => router.push("/")}
            >
              Back to Home
            </button>
          </div>
        )}

        {step === "email" && emailSent && (
          <div className="flex flex-col items-center gap-4">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
              <EnvelopeIcon className="h-8 w-8 text-green-600" />
            </div>
            <p className="text-center text-sm text-gray-700">
              If an account exists with <strong>{email}</strong>, a recovery
              link has been sent. Please check your inbox and click the link to
              continue.
            </p>
            <p className="text-center text-xs text-gray-500">
              The link will expire in 1 hour. Check your spam folder if you
              don&apos;t see it.
            </p>
            <Button
              variant="bordered"
              className="w-full border-black text-black"
              onPress={() => {
                setStep("verify");
              }}
            >
              I have my recovery link token
            </Button>
          </div>
        )}

        {step === "verify" && (
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-3 rounded-lg bg-gray-50 p-3">
              <ShieldCheckIcon className="h-5 w-5 text-gray-500" />
              <p className="text-xs text-gray-600">
                Enter the token from your recovery email, or click the link
                directly.
              </p>
            </div>
            <Input
              label="Recovery Token"
              value={token}
              onValueChange={setToken}
              variant="bordered"
              classNames={{
                inputWrapper: "border-black",
                label: "text-black",
              }}
            />
            <Button
              className="w-full bg-black font-semibold text-white"
              onPress={handleVerifyToken}
              isLoading={loading}
            >
              Verify Token
            </Button>
            <button
              className="text-center text-sm text-gray-500 underline hover:text-gray-700"
              onClick={() => {
                setStep("email");
                setEmailSent(false);
              }}
            >
              Request a new recovery link
            </button>
          </div>
        )}

        {step === "reset" && (
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-3 rounded-lg bg-blue-50 p-3">
              <KeyIcon className="h-5 w-5 text-blue-500" />
              <p className="text-xs text-blue-700">
                Recovering account for <strong>{verifiedEmail}</strong>
              </p>
            </div>
            <Input
              label="Recovery Key"
              placeholder="XXXX-XXXX-XXXX-XXXX-XXXX-XXXX"
              value={recoveryKey}
              onValueChange={setRecoveryKey}
              variant="bordered"
              classNames={{
                inputWrapper: "border-black",
                label: "text-black",
              }}
            />
            <Input
              label={authType === "email" ? "New Password" : "New Passphrase"}
              type="password"
              value={newPassword}
              onValueChange={setNewPassword}
              variant="bordered"
              classNames={{
                inputWrapper: "border-black",
                label: "text-black",
              }}
            />
            <Input
              label={
                authType === "email"
                  ? "Confirm New Password"
                  : "Confirm New Passphrase"
              }
              type="password"
              value={confirmPassword}
              onValueChange={setConfirmPassword}
              variant="bordered"
              classNames={{
                inputWrapper: "border-black",
                label: "text-black",
              }}
            />
            <Button
              className="w-full bg-black font-semibold text-white"
              onPress={handleResetPassword}
              isLoading={loading}
            >
              {authType === "email"
                ? "Reset Password & Sign In"
                : "Reset Passphrase & Sign In"}
            </Button>
          </div>
        )}

        {step === "success" && (
          <div className="flex flex-col items-center gap-4">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
              <CheckCircleIcon className="h-8 w-8 text-green-600" />
            </div>
            <p className="text-center text-sm text-gray-700">
              {authType === "email"
                ? "Your password has been reset and you're now signed in."
                : "Your passphrase has been reset and you're now signed in."}
            </p>
            <Button
              className="w-full bg-black font-semibold text-white"
              onPress={() => router.push("/marketplace")}
            >
              Go to Marketplace
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
