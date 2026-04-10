import {
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  Button,
} from "@nextui-org/react";
import { ExclamationTriangleIcon } from "@heroicons/react/24/outline";
import { SHOPSTRBUTTONCLASSNAMES } from "@/utils/STATIC-VARIABLES";

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
        body: "py-6",
        backdrop: "bg-[#292f46]/50 backdrop-opacity-60",
        header: "border-b-[1px] border-[#292f46]",
        footer: "border-t-[1px] border-[#292f46]",
        closeButton: "hover:bg-black/5 active:bg-white/10",
      }}
      isDismissable={!isLoading}
      scrollBehavior={"normal"}
      placement={"center"}
      size="md"
    >
      <ModalContent>
        <ModalHeader className="flex items-center justify-center gap-2 text-light-text dark:text-dark-text">
          {isDangerous && (
            <ExclamationTriangleIcon className="h-6 w-6 text-red-500" />
          )}
          <div>{title}</div>
        </ModalHeader>
        <ModalBody className="flex flex-col overflow-hidden text-light-text dark:text-dark-text">
          <div className="flex items-center justify-center text-center">
            {message}
          </div>
        </ModalBody>
        <ModalFooter>
          <Button
            color="default"
            variant="light"
            onClick={onCancel}
            isDisabled={isLoading}
          >
            {cancelText}
          </Button>
          <Button
            className={
              isDangerous
                ? "bg-red-500 text-white hover:bg-red-600"
                : SHOPSTRBUTTONCLASSNAMES
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
