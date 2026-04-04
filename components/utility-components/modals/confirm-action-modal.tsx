"use client";

import React from "react";
import {
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  Button,
  useDisclosure,
} from "@nextui-org/react";

type ConfirmActionModalProps = {
  title?: string;
  description: string;
  confirmLabel: string;
  onConfirm: () => void;
  isLoading?: boolean;
  children: React.ReactNode;
};

/**
 * A reusable confirmation modal that wraps a trigger element.
 * Replaces the defunct ConfirmActionDropdown to align with modern UI patterns.
 */
export default function ConfirmActionModal({
  title = "Confirm Action",
  description,
  confirmLabel,
  onConfirm,
  isLoading = false,
  children,
}: ConfirmActionModalProps) {
  const { isOpen, onOpen, onOpenChange } = useDisclosure();

  const handleConfirm = () => {
    onConfirm();
    onOpenChange();
  };

  return (
    <>
      <span
        onClick={(e) => {
          e.stopPropagation();
          onOpen();
        }}
        className="cursor-pointer inline-block"
      >
        {children}
      </span>
      <Modal
        isOpen={isOpen}
        onOpenChange={onOpenChange}
        backdrop="blur"
        placement="center"
        classNames={{
          backdrop: "bg-[#292f46]/50 backdrop-opacity-60",
          base: "border-[#292f46] bg-light-bg dark:bg-dark-bg text-light-text dark:text-dark-text",
          header: "border-b-[1px] border-[#292f46]",
          footer: "border-t-[1px] border-[#292f46]",
          closeButton: "hover:bg-black/5 active:bg-white/10",
        }}
      >
        <ModalContent>
          {(onClose) => (
            <>
              <ModalHeader className="flex flex-col gap-1 text-light-text dark:text-dark-text">
                {title}
              </ModalHeader>
              <ModalBody className="text-light-text dark:text-dark-text">
                <p>{description}</p>
              </ModalBody>
              <ModalFooter>
                <Button variant="light" onPress={onClose} className="text-light-text dark:text-dark-text">
                  Cancel
                </Button>
                <Button
                  color="danger"
                  onPress={handleConfirm}
                  isLoading={isLoading}
                >
                  {confirmLabel}
                </Button>
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </Modal>
    </>
  );
}
