import React, { cloneElement, useCallback, useState } from "react";
import {
  Button,
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
} from "@heroui/react";

type ConfirmActionTriggerProps = {
  disabled?: boolean;
  isDisabled?: boolean;
  onClick?: React.MouseEventHandler<HTMLElement>;
};

type ConfirmActionModalProps = {
  helpText: string;
  buttonLabel: string;
  onConfirm: () => void | Promise<void>;
  children: React.ReactElement<ConfirmActionTriggerProps>;
};

export default function ConfirmActionModal({
  helpText,
  buttonLabel,
  onConfirm,
  children,
}: ConfirmActionModalProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);

  const closeModal = useCallback(() => {
    setIsOpen(false);
    setIsConfirming(false);
  }, []);
  const openModal = useCallback(() => setIsOpen(true), []);

  const handleTriggerClick: React.MouseEventHandler<HTMLElement> = (event) => {
    children.props.onClick?.(event);
    if (
      event.defaultPrevented ||
      children.props.disabled ||
      children.props.isDisabled
    ) {
      return;
    }
    openModal();
  };

  const handleConfirm = useCallback(async () => {
    if (isConfirming) return;
    setIsConfirming(true);
    try {
      await onConfirm();
    } finally {
      closeModal();
    }
  }, [closeModal, isConfirming, onConfirm]);

  return (
    <>
      {cloneElement(children, { onClick: handleTriggerClick })}
      <Modal
        backdrop="blur"
        isOpen={isOpen}
        onClose={closeModal}
        placement="center"
        size="md"
        classNames={{
          body: "py-6",
          backdrop: "bg-[#292f46]/50 backdrop-opacity-60",
          header: "border-b-[1px] border-[#292f46]",
          footer: "border-t-[1px] border-[#292f46]",
          closeButton: "hover:bg-black/5 active:bg-white/10",
        }}
      >
        <ModalContent>
          <ModalHeader className="text-light-text dark:text-dark-text flex flex-col">
            Confirm action
          </ModalHeader>
          <ModalBody className="text-light-text dark:text-dark-text">
            <p>{helpText}</p>
          </ModalBody>
          <ModalFooter>
            <Button
              type="button"
              variant="light"
              isDisabled={isConfirming}
              onPress={closeModal}
            >
              Cancel
            </Button>
            <Button
              type="button"
              color="danger"
              isDisabled={isConfirming}
              isLoading={isConfirming}
              onPress={handleConfirm}
            >
              {buttonLabel}
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </>
  );
}
