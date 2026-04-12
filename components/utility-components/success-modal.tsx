import { Modal, ModalContent, ModalHeader, ModalBody } from "@heroui/react";
import { CheckCircleIcon } from "@heroicons/react/24/outline";

export default function SuccessModal({
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
          wrapper: "shadow-neo", // Apply shadow to the modal wrapper
          base: "border-2 border-black rounded-md", // Apply border and radius
          backdrop: "bg-black/20 backdrop-blur-sm",
          header: "border-b-2 border-black bg-white rounded-t-md text-black",
          body: "py-6 bg-white rounded-b-md", // Added bottom radius as there's no footer
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
            <CheckCircleIcon className="h-6 w-6 text-green-500" />
            <div className="ml-2">Success</div>
          </ModalHeader>
          {/* Updated text color */}
          <ModalBody className="text-black">
            <div className="flex items-center justify-center">{bodyText}</div>
          </ModalBody>
        </ModalContent>
      </Modal>
    </>
  );
}
