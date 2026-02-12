import React from "react";
import {
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  Button,
} from "@nextui-org/react";
import { useRouter } from "next/router";
import { NEO_BTN } from "@/utils/STATIC-VARIABLES";

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
        base: "bg-[#161616] border border-zinc-800",
        body: "py-8",
        backdrop: "bg-black/80 backdrop-blur-sm",
        header: "border-b border-zinc-800",
        footer: "border-t border-zinc-800",
        closeButton: "hover:bg-white/10 text-white",
      }}
      scrollBehavior={"outside"}
      size="md"
      isDismissable={false}
    >
      <ModalContent>
        <ModalHeader className="flex flex-col gap-1 font-black uppercase tracking-tighter text-white">
          Waiting for confirmation
        </ModalHeader>
        <ModalBody>
          <div className="break-words text-zinc-300">
            {challengeUrl
              ? "Please confirm this action on your remote signer"
              : challenge}
          </div>

          {error && (
            <div className="mt-2 text-sm text-red-500">{error.message}</div>
          )}
        </ModalBody>

        <ModalFooter>
          <Button
            className="font-bold uppercase tracking-wider text-red-500 hover:bg-red-500/10"
            color="danger"
            variant="light"
            onClick={onCancel}
          >
            Cancel
          </Button>
          {challengeUrl && (
            <Button
              className={`${NEO_BTN} h-10 px-6 text-xs`}
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
