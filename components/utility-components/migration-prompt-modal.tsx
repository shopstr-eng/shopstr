import React, { useState } from "react";
import {
  Modal,
  ModalContent,
  ModalBody,
  Button,
  Input,
} from "@nextui-org/react";
import { migrateToNip49 } from "@/utils/nostr/encryption-migration";
import { NEO_BTN } from "@/utils/STATIC-VARIABLES";

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
        base: "bg-[#161616] border border-zinc-800 rounded-2xl",
        body: "py-8",
        backdrop: "bg-black/80 backdrop-blur-sm",
        closeButton: "hover:bg-white/10 text-white",
      }}
      isDismissable={true}
      scrollBehavior={"normal"}
      placement={"center"}
      size="md"
    >
      <ModalContent>
        <ModalBody className="flex flex-col overflow-hidden">
          <div className="mb-4 text-center">
            <h3 className="text-2xl font-black uppercase tracking-tighter text-white">
              Encryption Upgrade
            </h3>
            <p className="mt-2 text-sm text-zinc-400">
              We&apos;ve upgraded our encryption to the NIP-49 standard for
              better security! Please enter your existing passphrase so we can
              safely decrypt your current key and re-encrypt it with the new
              standard.
            </p>
          </div>

          <div className="mb-4">
            <Input
              type="password"
              label="YOUR PASSPHRASE"
              labelPlacement="outside"
              placeholder="Enter your passphrase..."
              variant="bordered"
              classNames={{
                label:
                  "text-zinc-500 font-bold uppercase tracking-wider text-xs",
                input: "text-white text-base md:text-sm", // Prevents iOS auto-zoom
                inputWrapper:
                  "bg-[#111] border-zinc-700 data-[hover=true]:border-zinc-500 group-data-[focus=true]:border-yellow-400 h-12",
              }}
              value={passphrase}
              onChange={(e) => setPassphrase(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && passphrase) handleMigration();
              }}
              isInvalid={!!error}
              errorMessage={error}
            />
          </div>

          <div className="flex flex-col justify-end gap-3 sm:flex-row sm:space-x-4">
            <Button
              className="order-2 h-12 font-bold uppercase tracking-wider text-zinc-500 hover:text-white sm:order-1 sm:h-10"
              variant="light"
              onClick={() => {
                resetModal();
                onClose();
              }}
            >
              Later
            </Button>
            <Button
              className={`${NEO_BTN} order-1 h-12 px-6 text-xs sm:order-2 sm:h-10`}
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
