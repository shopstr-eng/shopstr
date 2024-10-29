import {
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  Button,
  Input,
  Textarea,
} from "@nextui-org/react";
import {
  Controller,
  Control,
  UseFormHandleSubmit,
  FieldValues,
} from "react-hook-form";
import { SHOPSTRBUTTONCLASSNAMES } from "./utility/STATIC-VARIABLES";

export default function ContactForm({
  showContactModal,
  handleToggleContactModal,
  handleContactSubmit,
  onContactSubmit,
  contactControl,
}: {
  showContactModal: boolean;
  handleToggleContactModal: () => void;
  handleContactSubmit: UseFormHandleSubmit<FieldValues>;
  onContactSubmit: (data: FieldValues) => void;
  contactControl: Control<FieldValues>;
}) {
  return (
    <Modal
      backdrop="blur"
      isOpen={showContactModal}
      onClose={handleToggleContactModal}
      classNames={{
        body: "py-6",
        backdrop: "bg-[#292f46]/50 backdrop-opacity-60",
        // base: "border-[#292f46] bg-[#19172c] dark:bg-[#19172c] text-[#a8b0d3]",
        header: "border-b-[1px] border-[#292f46]",
        footer: "border-t-[1px] border-[#292f46]",
        closeButton: "hover:bg-black/5 active:bg-white/10",
      }}
      scrollBehavior={"outside"}
      size="2xl"
    >
      <ModalContent>
        <ModalHeader className="flex flex-col gap-1 text-light-text dark:text-dark-text">
          Enter Contact Info
        </ModalHeader>
        <form onSubmit={handleContactSubmit(onContactSubmit)}>
          <ModalBody>
            <Controller
              name="Contact"
              control={contactControl}
              rules={{
                required: "A contact is required.",
                maxLength: {
                  value: 50,
                  message: "This input exceed maxLength of 50.",
                },
              }}
              render={({
                field: { onChange, onBlur, value },
                fieldState: { error },
              }) => {
                let isErrored = error !== undefined;
                let errorMessage: string = error?.message ? error.message : "";
                return (
                  <Input
                    className="text-light-text dark:text-dark-text"
                    autoFocus
                    variant="bordered"
                    fullWidth={true}
                    label="Contact"
                    labelPlacement="inside"
                    placeholder="shopstr@shopstr.store"
                    isInvalid={isErrored}
                    errorMessage={errorMessage}
                    // controller props
                    onChange={onChange} // send value to hook form
                    onBlur={onBlur} // notify when input is touched/blur
                    value={value}
                  />
                );
              }}
            />

            <Controller
              name="Contact Type"
              control={contactControl}
              rules={{
                required: "A contact type is required.",
                maxLength: {
                  value: 50,
                  message: "This input exceed maxLength of 50.",
                },
              }}
              render={({
                field: { onChange, onBlur, value },
                fieldState: { error },
              }) => {
                let isErrored = error !== undefined;
                let errorMessage: string = error?.message ? error.message : "";
                return (
                  <Input
                    className="text-light-text dark:text-dark-text"
                    autoFocus
                    variant="bordered"
                    fullWidth={true}
                    label="Contact type"
                    labelPlacement="inside"
                    placeholder="Nostr, Signal, Telegram, email, phone, etc."
                    isInvalid={isErrored}
                    errorMessage={errorMessage}
                    // controller props
                    onChange={onChange} // send value to hook form
                    onBlur={onBlur} // notify when input is touched/blur
                    value={value}
                  />
                );
              }}
            />

            <Controller
              name="Instructions"
              control={contactControl}
              rules={{
                required: "Delivery instructions are required.",
              }}
              render={({
                field: { onChange, onBlur, value },
                fieldState: { error },
              }) => {
                let isErrored = error !== undefined;
                let errorMessage: string = error?.message ? error.message : "";
                return (
                  <Textarea
                    className="text-light-text dark:text-dark-text"
                    variant="bordered"
                    fullWidth={true}
                    label="Delivery instructions"
                    labelPlacement="inside"
                    placeholder="Meet me by . . .; Send file to . . ."
                    isInvalid={isErrored}
                    errorMessage={errorMessage}
                    // controller props
                    onChange={onChange} // send value to hook form
                    onBlur={onBlur} // notify when input is touched/blur
                    value={value}
                  />
                );
              }}
            />
          </ModalBody>

          <ModalFooter>
            <Button
              color="danger"
              variant="light"
              onClick={handleToggleContactModal}
            >
              Cancel
            </Button>

            <Button className={SHOPSTRBUTTONCLASSNAMES} type="submit">
              Submit
            </Button>
          </ModalFooter>
        </form>
      </ModalContent>
    </Modal>
  );
}
