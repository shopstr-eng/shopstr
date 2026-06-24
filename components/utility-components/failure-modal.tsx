import { Modal, ModalContent, ModalHeader, ModalBody } from "@heroui/react";
import { XCircleIcon } from "@heroicons/react/24/outline";

export default function FailureModal({
  bodyText,
  isOpen,
  onClose,
}: {
  bodyText: string;
  isOpen: boolean;
  onClose: () => void;
}) {
  return (
    <>
      <Modal
        backdrop="blur"
        isOpen={isOpen}
        onClose={onClose}
        // className="bg-light-fg dark:bg-dark-fg text-black dark:text-white"
        classNames={{
          body: "py-6 ",
          backdrop: "bg-[#292f46]/50 backdrop-opacity-60",
          header: "border-b-[1px] border-[#292f46]",
          footer: "border-t-[1px] border-[#292f46]",
          closeButton: "hover:bg-black/5 active:bg-white/10",
        }}
        isDismissable={true}
        scrollBehavior={"normal"}
        placement={"center"}
        size="2xl"
      >
        <ModalContent>
          <ModalHeader className="text-light-text dark:text-dark-text flex items-center justify-center">
            <XCircleIcon className="h-6 w-6 text-red-500" />
            <div className="ml-2">Error</div>
          </ModalHeader>
          <ModalBody className="text-light-text dark:text-dark-text flex flex-col overflow-hidden">
            <div className="flex items-center justify-center">{bodyText}</div>
          </ModalBody>
        </ModalContent>
      </Modal>
    </>
  );
}
