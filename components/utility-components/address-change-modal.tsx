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
import { BLUEBUTTONCLASSNAMES } from "@/utils/STATIC-VARIABLES";

interface AddressChangeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (newAddress: string) => Promise<void>;
  isLoading: boolean;
  orderId?: string;
  productTitle?: string;
  currentAddress?: string;
  subscriptionId?: string;
}

const AddressChangeModal = ({
  isOpen,
  onClose,
  onSubmit,
  isLoading,
  orderId,
  productTitle,
  currentAddress,
  subscriptionId,
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
        wrapper: "shadow-neo",
        base: "border-2 border-black rounded-md",
        backdrop: "bg-black/20 backdrop-blur-sm",
        header: "border-b-2 border-black bg-white rounded-t-md text-black",
        body: "py-6 bg-white",
        footer: "border-t-2 border-black bg-white rounded-b-md",
        closeButton: "hover:bg-black/5 active:bg-white/10",
      }}
      scrollBehavior={"outside"}
      size="2xl"
    >
      <ModalContent>
        <ModalHeader className="flex flex-col gap-1 text-black">
          Change Delivery Address
        </ModalHeader>
        <form onSubmit={handleSubmit(handleFormSubmit)}>
          <ModalBody>
            {(orderId || productTitle || currentAddress || subscriptionId) && (
              <div className="mb-4 rounded-md border-2 border-black bg-gray-50 p-3">
                {orderId && (
                  <p className="text-sm text-black">
                    <span className="font-bold">Order:</span>{" "}
                    {orderId.substring(0, 8)}...
                  </p>
                )}
                {productTitle && (
                  <p className="text-sm text-black">
                    <span className="font-bold">Product:</span> {productTitle}
                  </p>
                )}
                {currentAddress && (
                  <p className="text-sm text-black">
                    <span className="font-bold">Current Address:</span>{" "}
                    {currentAddress}
                  </p>
                )}
                {subscriptionId && (
                  <p className="text-sm text-black">
                    <span className="font-bold">Subscription:</span>{" "}
                    {subscriptionId.substring(0, 12)}...
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
                    className="text-black"
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
              className={BLUEBUTTONCLASSNAMES}
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
