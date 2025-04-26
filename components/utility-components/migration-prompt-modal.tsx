import React, { useState } from "react";
import {
  Modal,
  ModalContent,
  ModalBody,
  Button,
  Input,
} from "@nextui-org/react";
import { migrateToNip49 } from "@/utils/nostr/encryption-migration";

interface MigrationPromptModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export default function MigrationPromptModal({
  isOpen,
  onClose,
  onSuccess,
}: MigrationPromptModalProps) {
  const [passphrase, setPassphrase] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleMigration = async () => {
    if (!passphrase) {
      setError("Please enter your passphrase");
      return;
    }

    setIsLoading(true);
    try {
      const success = await migrateToNip49(passphrase);
      if (success) {
        onSuccess();
        onClose();
      } else {
        console.error("❌ Migration failed");
        setError(
          "Migration failed. Please try again with the correct passphrase."
        );
      }
      return success;
    } catch (err) {
      console.error("❌ Migration error:", err);
      setError(
        "Failed to decrypt with the provided passphrase. Please try again."
      );
      return false;
    } finally {
      setIsLoading(false);
    }
  };

  const resetModal = () => {
    setPassphrase("");
    setError("");
    setIsLoading(false);
  };

  return (
    <Modal
      backdrop="blur"
      isOpen={isOpen}
      onClose={() => {
        resetModal();
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
      size="md"
    >
      <ModalContent>
        <ModalBody className="flex flex-col overflow-hidden text-light-text dark:text-dark-text">
          <div className="mb-4 text-center">
            <h3 className="text-lg font-semibold">Encryption Upgrade</h3>
            <p className="mt-2 text-sm">
              We&apos;ve upgraded our encryption to the NIP-49 standard for
              better security! Please enter your existing passphrase so we can
              safely decrypt your current key and re-encrypt it with the new
              standard.
            </p>
          </div>

          <div className="mb-4">
            <Input
              type="password"
              label="Your Passphrase"
              placeholder="Enter your passphrase..."
              width="100%"
              value={passphrase}
              onChange={(e) => setPassphrase(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && passphrase) handleMigration();
              }}
              isInvalid={!!error}
              errorMessage={error}
            />
          </div>

          <div className="flex justify-end space-x-2">
            <Button
              color="default"
              variant="light"
              onClick={() => {
                resetModal();
                onClose();
              }}
            >
              Later
            </Button>
            <Button
              color="primary"
              onClick={handleMigration}
              isLoading={isLoading}
              isDisabled={!passphrase || isLoading}
            >
              Upgrade Encryption
            </Button>
          </div>
        </ModalBody>
      </ModalContent>
    </Modal>
  );
}
