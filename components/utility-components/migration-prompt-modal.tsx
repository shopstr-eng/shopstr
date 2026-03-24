import { useState } from "react";
import {
  Modal,
  ModalContent,
  ModalBody,
  Button,
  Input,
} from "@nextui-org/react";
import { migrateToNip49 } from "@/utils/nostr/encryption-migration";
// Import your new button styles
import {
  WHITEBUTTONCLASSNAMES,
  PRIMARYBUTTONCLASSNAMES,
} from "@/utils/STATIC-VARIABLES";

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
        // Updated modal styles
        wrapper: "shadow-neo",
        base: "border-2 border-black rounded-md",
        backdrop: "bg-black/20 backdrop-blur-sm",
        // This modal only has a body, so add all border radius here
        body: "py-6 bg-white rounded-md",
        closeButton:
          "hover:bg-gray-200 active:bg-gray-300 rounded-md text-black",
      }}
      isDismissable={true}
      scrollBehavior={"normal"}
      placement={"center"}
      size="md"
    >
      <ModalContent>
        {/* Updated text color */}
        <ModalBody className="flex flex-col overflow-hidden text-black">
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
            {/* Updated Input styles */}
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
              classNames={{
                input: "bg-white !text-black placeholder:!text-gray-500",
                inputWrapper:
                  "bg-white border-2 border-black rounded-md data-[hover=true]:bg-white group-data-[focus=true]:border-primary-yellow",
                label: "text-black",
              }}
            />
          </div>

          <div className="flex justify-end space-x-2">
            {/* Updated "Later" button */}
            <Button
              className={WHITEBUTTONCLASSNAMES}
              onClick={() => {
                resetModal();
                onClose();
              }}
              A-
            >
              Later
            </Button>
            {/* Updated "Upgrade" button */}
            <Button
              className={PRIMARYBUTTONCLASSNAMES}
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
