import {
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  Button,
} from "@heroui/react";
import { ExclamationTriangleIcon } from "@heroicons/react/24/outline";
import {
  PRIMARYBUTTONCLASSNAMES,
  DANGERBUTTONCLASSNAMES,
} from "@/utils/STATIC-VARIABLES";

interface ConfirmationModalProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  isDangerous?: boolean;
  isLoading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ConfirmationModal({
  isOpen,
  title,
  message,
  confirmText = "Confirm",
  cancelText = "Cancel",
  isDangerous = false,
  isLoading = false,
  onConfirm,
  onCancel,
}: ConfirmationModalProps) {
  return (
    <Modal
      backdrop="blur"
      isOpen={isOpen}
      onClose={onCancel}
      classNames={{
        body: "py-6 bg-white",
        backdrop: "bg-black/50 backdrop-opacity-60",
        header: "border-b-3 border-black bg-white rounded-t-xl",
        footer: "border-t-3 border-black bg-white rounded-b-xl",
        base: "border-3 border-black rounded-xl",
        closeButton: "hover:bg-gray-100 active:bg-gray-200",
      }}
      isDismissable={!isLoading}
      scrollBehavior={"normal"}
      placement={"center"}
      size="md"
    >
      <ModalContent>
        <ModalHeader className="flex items-center justify-center gap-2 font-bold text-black">
          {isDangerous && (
            <ExclamationTriangleIcon className="h-6 w-6 text-red-500" />
          )}
          <div>{title}</div>
        </ModalHeader>
        <ModalBody className="flex flex-col overflow-hidden text-black">
          <div className="flex items-center justify-center text-center">
            {message}
          </div>
        </ModalBody>
        <ModalFooter>
          <Button
            variant="light"
            onClick={onCancel}
            isDisabled={isLoading}
            className="font-bold text-black"
          >
            {cancelText}
          </Button>
          <Button
            className={
              isDangerous ? DANGERBUTTONCLASSNAMES : PRIMARYBUTTONCLASSNAMES
            }
            onClick={onConfirm}
            isLoading={isLoading}
          >
            {confirmText}
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}
