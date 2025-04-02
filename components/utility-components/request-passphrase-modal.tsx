import React, { useMemo, useRef, useState } from "react";
import {
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  Input,
  Button,
} from "@nextui-org/react";
import { SHOPSTRBUTTONCLASSNAMES } from "@/utils/STATIC-VARIABLES";
import { useRouter } from "next/router";

export default function PassphraseChallengeModal({
  actionOnSubmit,
  actionOnCancel,
  isOpen,
  setIsOpen,
  onCancelRouteTo,
  error,
}: {
  actionOnSubmit?: (passphrase: string, remind: boolean) => void;
  actionOnCancel?: () => void;
  isOpen: boolean;
  setIsOpen: (value: boolean) => void;
  onCancelRouteTo?: string; // route to go to on cancel
  error?: Error;
}) {
  const [remindToggled, setRemindToggled] = useState(false);
  const [passphraseInput, setPassphraseInput] = useState("");
  const isButtonDisabled = useMemo(() => {
    return passphraseInput.trim().length === 0;
  }, [passphraseInput]);
  const router = useRouter();
  const passphraseInputRef = useRef<HTMLInputElement>(null);

  const buttonClassName = useMemo(() => {
    const enabledStyle = SHOPSTRBUTTONCLASSNAMES;
    const className = "text-white shadow-lg bg-gradient-to-tr" + enabledStyle;
    return className;
  }, []);

  const onSubmit = () => {
    if (isButtonDisabled && passphraseInputRef.current) {
      passphraseInputRef.current.focus();
    } else if (!isButtonDisabled) {
      setIsOpen(false);
      if (actionOnSubmit) {
        actionOnSubmit(passphraseInput, remindToggled);
      }
    }
  };

  const onCancel = () => {
    if (actionOnCancel) actionOnCancel();
    setIsOpen(false);
    onCancelRouteTo
      ? router.push(onCancelRouteTo)
      : router.push("/marketplace");
  };

  return (
    <Modal
      backdrop="blur"
      isOpen={isOpen}
      onClose={onCancel}
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
      isDismissable={false}
    >
      <ModalContent>
        <ModalHeader className="flex flex-col gap-1 text-light-text dark:text-dark-text">
          Enter Passphrase
        </ModalHeader>
        <ModalBody>
          <Input
            className="text-light-text dark:text-dark-text"
            autoFocus
            ref={passphraseInputRef}
            variant="flat"
            label="Passphrase"
            labelPlacement="inside"
            type="password"
            onChange={(e) => setPassphraseInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") onSubmit();
            }}
            value={passphraseInput}
          />
          <div className="mt-4 flex items-center gap-2">
            <input
              type="checkbox"
              checked={remindToggled}
              onChange={() => setRemindToggled(!remindToggled)}
            />
            <label className="text-light-text dark:text-dark-text">
              Remember passphrase for this session
            </label>
          </div>
          {error && (
            <div className="mt-2 text-sm text-red-500">{error.message}</div>
          )}
        </ModalBody>

        <ModalFooter>
          <Button color="danger" variant="light" onClick={onCancel}>
            Cancel
          </Button>

          <Button className={buttonClassName} type="submit" onClick={onSubmit}>
            Submit
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}
