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
        classNames={{
          // Updated modal styles
          wrapper: "shadow-neo",
          base: "border-2 border-black rounded-md",
          backdrop: "bg-black/20 backdrop-blur-sm",
          header: "border-b-2 border-black bg-white rounded-t-md text-black",
          body: "py-6 bg-white rounded-b-md",
          closeButton:
            "hover:bg-gray-200 active:bg-gray-300 rounded-md text-black",
        }}
        isDismissable={true}
        scrollBehavior={"normal"}
        placement={"center"}
        size="2xl"
      >
        <ModalContent>
          {/* Updated text color */}
          <ModalHeader className="flex items-center justify-center text-black">
            <XCircleIcon className="h-6 w-6 text-red-500" />
            <div className="ml-2">Error</div>
          </ModalHeader>
          {/* Updated text color */}
          <ModalBody className="flex flex-col overflow-hidden text-black">
            <div className="flex items-center justify-center">{bodyText}</div>
          </ModalBody>
        </ModalContent>
      </Modal>
    </>
  );
}
