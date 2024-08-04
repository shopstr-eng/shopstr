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
import {
  getNsecWithPassphrase,
  validPassphrase,
} from "../utility/nostr-helper-functions";
import { SHOPSTRBUTTONCLASSNAMES } from "../utility/STATIC-VARIABLES";
import { useRouter } from "next/router";

export default function RequestPassphraseModal({
  passphrase,
  setCorrectPassphrase,
  isOpen,
  setIsOpen,
  actionOnSubmit,
  onCancelRouteTo,
}: {
  passphrase?: string;
  setCorrectPassphrase?: (passphrase: string) => void;
  isOpen: boolean;
  setIsOpen: (value: boolean) => void;
  actionOnSubmit?: (passphrase: string) => void; // callback function to be called after getting correct passphrase (delete listing)
  onCancelRouteTo?: string; // route to go to on cancel
}) {
  const [passphraseInput, setPassphraseInput] = useState(
    passphrase ? passphrase : "",
  ); // passphrase to be entered by user
  const router = useRouter();
  const passphraseInputRef = useRef<HTMLInputElement>(null);
  const isButtonDisabled = useMemo(() => {
    return !validPassphrase(passphraseInput);
  }, [passphraseInput]);

  const buttonClassName = useMemo(() => {
    const disabledStyle = " from-gray-300 to-gray-400 cursor-not-allowed";
    const enabledStyle = SHOPSTRBUTTONCLASSNAMES;
    const className =
      "text-white shadow-lg bg-gradient-to-tr" +
      (isButtonDisabled ? disabledStyle : enabledStyle);
    return className;
  }, [isButtonDisabled]);

  const onSubmit = () => {
    if (isButtonDisabled && passphraseInputRef.current) {
      passphraseInputRef.current.focus();
    } else if (!isButtonDisabled) {
      setIsOpen(false);
      if (setCorrectPassphrase) {
        setCorrectPassphrase(passphraseInput);
      }
      if (actionOnSubmit) {
        actionOnSubmit(passphraseInput);
      }
    }
  };

  const onCancel = () => {
    setIsOpen(false);
    onCancelRouteTo ? router.push(onCancelRouteTo) : router.push("/");
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
