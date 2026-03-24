import {
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  Button,
} from "@nextui-org/react";
// Import your primary button style
import {
  WHITEBUTTONCLASSNAMES,
  PRIMARYBUTTONCLASSNAMES,
} from "@/utils/STATIC-VARIABLES";
import { useRouter } from "next/router";

function sanitizeURL(s: string) {
  try {
    const url = new URL(s);
    if (url.protocol !== "https:" && url.protocol !== "http:")
      throw new Error("invalid protocol");
    return url.href;
  } catch (e) {
    return null;
  }
}

export default function AuthChallengeModal({
  actionOnCancel,
  isOpen,
  setIsOpen,
  challenge,
  onCancelRouteTo,
  error,
}: {
  actionOnCancel?: () => void;
  isOpen: boolean;
  setIsOpen: (value: boolean) => void;
  challenge: string;
  onCancelRouteTo?: string; // route to go to on cancel
  error?: Error;
}) {
  const router = useRouter();

  const challengeUrl = sanitizeURL(challenge);

  const onCancel = () => {
    if (actionOnCancel) actionOnCancel();
    setIsOpen(false);
    onCancelRouteTo
      ? router.push(onCancelRouteTo)
      : router.push("/marketplace");
  };

  return (
    <Modal
      backdrop="blur"
      isOpen={isOpen}
      onClose={onCancel}
      classNames={{
        // Updated modal styles
        wrapper: "shadow-neo",
        base: "border-2 border-black rounded-md",
        backdrop: "bg-black/20 backdrop-blur-sm",
        header: "border-b-2 border-black bg-white rounded-t-md text-black",
        body: "py-6 bg-white",
        footer: "border-t-2 border-black bg-white rounded-b-md",
        closeButton:
          "hover:bg-gray-200 active:bg-gray-300 rounded-md text-black",
      }}
      scrollBehavior={"outside"}
      size="2xl"
      isDismissable={false}
    >
      <ModalContent>
        {/* Updated text color */}
        <ModalHeader className="flex flex-col gap-1 text-black">
          Waiting for confirmation
        </ModalHeader>
        <ModalBody>
          {/* Updated text color */}
          <div className="text-black">
            {challengeUrl
              ? "Please confirm this action on your remote signer"
              : challenge}
          </div>

          {error && (
            <div className="mt-2 text-sm text-red-500">{error.message}</div>
          )}
        </ModalBody>

        <ModalFooter>
          {/* Updated "Cancel" button style */}
          <Button className={WHITEBUTTONCLASSNAMES} onClick={onCancel}>
            Cancel
          </Button>
          {challengeUrl && (
            <Button
              // Updated "Open Signer" button style
              className={PRIMARYBUTTONCLASSNAMES}
              type="submit"
              onClick={() => {
                window.open(challengeUrl, "_blank");
              }}
            >
              Open Signer
            </Button>
          )}
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}
