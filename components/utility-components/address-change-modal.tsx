"use client";

import { useForm, Controller } from "react-hook-form";
import {
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  Input,
  Button,
} from "@heroui/react";
import { SHOPSTRBUTTONCLASSNAMES } from "@/utils/STATIC-VARIABLES";

interface AddressChangeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (newAddress: string) => Promise<void>;
  isLoading: boolean;
  orderId?: string;
  productTitle?: string;
  currentAddress?: string;
}

const AddressChangeModal = ({
  isOpen,
  onClose,
  onSubmit,
  isLoading,
  orderId,
  productTitle,
  currentAddress,
}: AddressChangeModalProps) => {
  const { handleSubmit, control, reset } = useForm({
    defaultValues: {
      newAddress: "",
    },
  });

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleFormSubmit = async (data: { newAddress: string }) => {
    await onSubmit(data.newAddress);
    reset();
  };

  return (
    <Modal
      backdrop="blur"
      isOpen={isOpen}
      onClose={handleClose}
      classNames={{
        body: "py-6",
        backdrop: "bg-[#292f46]/50 backdrop-opacity-60",
        header: "border-b-[1px] border-[#292f46]",
        footer: "border-t-[1px] border-[#292f46]",
        closeButton: "hover:bg-black/5 active:bg-white/10",
      }}
      scrollBehavior={"outside"}
      size="2xl"
    >
      <ModalContent>
        <ModalHeader className="text-light-text dark:text-dark-text flex flex-col gap-1">
          Change Delivery Address
        </ModalHeader>
        <form onSubmit={handleSubmit(handleFormSubmit)}>
          <ModalBody>
            {(orderId || productTitle || currentAddress) && (
              <div className="mb-4 rounded-lg bg-gray-50 p-3 dark:bg-gray-800">
                {orderId && (
                  <p className="text-light-text dark:text-dark-text text-sm">
                    <span className="font-bold">Order:</span>{" "}
                    {orderId.substring(0, 8)}...
                  </p>
                )}
                {productTitle && (
                  <p className="text-light-text dark:text-dark-text text-sm">
                    <span className="font-bold">Product:</span> {productTitle}
                  </p>
                )}
                {currentAddress && (
                  <p className="text-light-text dark:text-dark-text text-sm">
                    <span className="font-bold">Current Address:</span>{" "}
                    {currentAddress}
                  </p>
                )}
              </div>
            )}
            <Controller
              name="newAddress"
              control={control}
              rules={{
                required: "New address is required.",
                minLength: {
                  value: 10,
                  message: "Please enter a complete address.",
                },
              }}
              render={({
                field: { onChange, onBlur, value },
                fieldState: { error },
              }) => {
                const isErrored = error !== undefined;
                const errorMessage: string = error?.message
                  ? error.message
                  : "";
                return (
                  <Input
                    autoFocus
                    label="New Delivery Address"
                    placeholder="Enter your new delivery address"
                    variant="bordered"
                    isInvalid={isErrored}
                    errorMessage={errorMessage}
                    className="text-light-text dark:text-dark-text"
                    onChange={onChange}
                    onBlur={onBlur}
                    value={value}
                  />
                );
              }}
            />
          </ModalBody>
          <ModalFooter>
            <Button color="danger" variant="light" onClick={handleClose}>
              Cancel
            </Button>
            <Button
              className={SHOPSTRBUTTONCLASSNAMES}
              type="submit"
              isLoading={isLoading}
            >
              Update Address
            </Button>
          </ModalFooter>
        </form>
      </ModalContent>
    </Modal>
  );
};

export default AddressChangeModal;
