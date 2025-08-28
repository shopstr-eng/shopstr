import React from "react";
import {
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  Button,
} from "@nextui-org/react";
import { WHITEBUTTONCLASSNAMES } from "@/utils/STATIC-VARIABLES";
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
        body: "py-6 bg-dark-fg",
        backdrop: "bg-[#292f46]/50 backdrop-opacity-60",
        header: "border-b-[1px] border-[#292f46] bg-dark-fg rounded-t-lg",
        footer: "border-t-[1px] border-[#292f46] bg-dark-fg rounded-b-lg",
        closeButton: "hover:bg-black/5 active:bg-white/10",
      }}
      scrollBehavior={"outside"}
      size="2xl"
      isDismissable={false}
    >
      <ModalContent>
        <ModalHeader className="flex flex-col gap-1 text-dark-text">
          Waiting for confirmation
        </ModalHeader>
        <ModalBody>
          <div className="text-dark-text">
            {challengeUrl
              ? "Please confirm this action on your remote signer"
              : challenge}
          </div>

          {error && (
            <div className="mt-2 text-sm text-red-500">{error.message}</div>
          )}
        </ModalBody>

        <ModalFooter>
          <Button color="danger" variant="light" onClick={onCancel}>
            Cancel
          </Button>
          {challengeUrl && (
            <Button
              className={
                "bg-gradient-to-tr text-white shadow-lg" + WHITEBUTTONCLASSNAMES
              }
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
