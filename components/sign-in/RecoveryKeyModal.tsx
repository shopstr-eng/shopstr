import { useState } from "react";
import {
  Modal,
  ModalContent,
  ModalBody,
  Button,
  Checkbox,
} from "@nextui-org/react";
import {
  ShieldCheckIcon,
  DocumentArrowDownIcon,
  ClipboardDocumentIcon,
  ClipboardDocumentCheckIcon,
} from "@heroicons/react/24/outline";

export default function RecoveryKeyModal({
  isOpen,
  onClose,
  recoveryKey,
  email,
}: {
  isOpen: boolean;
  onClose: () => void;
  recoveryKey: string;
  email: string;
}) {
  const [acknowledged, setAcknowledged] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(recoveryKey);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      const textArea = document.createElement("textarea");
      textArea.value = recoveryKey;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand("copy");
      document.body.removeChild(textArea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleDownload = () => {
    const content = [
      "MILK MARKET — ACCOUNT RECOVERY KEY",
      "===================================",
      "",
      `Email: ${email}`,
      `Date: ${new Date().toISOString().split("T")[0]}`,
      "",
      "Recovery Key:",
      recoveryKey,
      "",
      "-----------------------------------",
      "IMPORTANT:",
      "- Store this file in a safe place.",
      "- You will need this key to recover your account if you forget your password or passphrase.",
      "- This key is shown only once and cannot be retrieved later.",
      "- Without this key, account recovery is not possible.",
      "-----------------------------------",
    ].join("\n");

    const blob = new Blob([content], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `milk-market-recovery-key-${
      new Date().toISOString().split("T")[0]
    }.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={() => {}}
      isDismissable={false}
      hideCloseButton
      size="lg"
      classNames={{
        body: "py-6 bg-white",
        backdrop: "bg-black/50 backdrop-opacity-60",
        base: "border-4 border-black rounded-md shadow-neo bg-white",
      }}
    >
      <ModalContent>
        <ModalBody>
          <div className="flex flex-col items-center gap-4">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
              <ShieldCheckIcon className="h-8 w-8 text-green-600" />
            </div>

            <h2 className="text-center text-xl font-bold">
              Save Your Recovery Key
            </h2>

            <p className="text-light-text text-center text-sm opacity-70">
              This key is the <strong>only way</strong> to recover your account
              if you forget your password or passphrase. Save it somewhere safe
              — it will not be shown again.
            </p>

            <div className="w-full rounded-lg border border-yellow-200 bg-yellow-50 p-4">
              <p className="select-all break-all text-center font-mono text-lg font-bold tracking-wider text-yellow-800">
                {recoveryKey}
              </p>
            </div>

            <div className="flex w-full gap-3">
              <Button
                className="flex-1"
                variant="bordered"
                startContent={
                  copied ? (
                    <ClipboardDocumentCheckIcon className="h-4 w-4" />
                  ) : (
                    <ClipboardDocumentIcon className="h-4 w-4" />
                  )
                }
                onPress={handleCopy}
              >
                {copied ? "Copied!" : "Copy"}
              </Button>
              <Button
                className="flex-1"
                variant="bordered"
                startContent={<DocumentArrowDownIcon className="h-4 w-4" />}
                onPress={handleDownload}
              >
                Download .txt
              </Button>
            </div>

            <div className="mt-2 w-full">
              <Checkbox
                isSelected={acknowledged}
                onValueChange={setAcknowledged}
                size="sm"
                classNames={{
                  label: "text-sm",
                }}
              >
                I have saved my recovery key in a safe place
              </Checkbox>
            </div>

            <Button
              className="w-full bg-black font-semibold text-white"
              isDisabled={!acknowledged}
              onPress={onClose}
              size="lg"
            >
              Continue
            </Button>
          </div>
        </ModalBody>
      </ModalContent>
    </Modal>
  );
}
