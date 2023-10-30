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
import { getNsecWithPassphrase } from "../nostr-helpers";
import { on } from "events";
import ConfirmActionDropdown from "./confirm-action-dropdown";
import { SHOPSTRBUTTONCLASSNAMES } from "./STATIC-VARIABLES";
import { useRouter } from "next/router";

export default function RequestPassphraseModal({
  passphrase,
  isOpen,
  onPassphraseChange,
  startCheckoutProcess,
  setRequestPassphrase,
}) {
  const router = useRouter();
  const passphraseInputRef = useRef(null);
  const isButtonDisabled = useMemo(() => {
    if (passphrase === "") return true; // nsec needs passphrase
    try {
      let nsec = getNsecWithPassphrase(passphrase);
      if (!nsec) return true; // invalid passphrase
    } catch (e) {
      return true; // invalid passphrase
    }
    return false;
  }, [passphrase]);

  const buttonClassName = useMemo(() => {
    const disabledStyle = " from-gray-300 to-gray-400 cursor-not-allowed";
    const enabledStyle = SHOPSTRBUTTONCLASSNAMES;
    const className =
      "text-white shadow-lg bg-gradient-to-tr" +
      (isButtonDisabled ? disabledStyle : enabledStyle);
    return className;
  }, [isButtonDisabled]);

  return (
    <Modal
      backdrop="blur"
      isOpen={isOpen}
      onClose={() => setRequestPassphrase(false)}
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
        <ModalHeader className="flex flex-col gap-1">
          Enter Passphrase
        </ModalHeader>
        <ModalBody>
          <Input
            autoFocus
            ref={passphraseInputRef}
            variant="flat"
            label="Passphrase"
            labelPlacement="inside"
            onChange={(e) => onPassphraseChange(e.target.value)}
            value={passphrase}
          />
        </ModalBody>

        <ModalFooter>
          <Button
            color="danger"
            variant="light"
            onClick={() => {
              router.push("/");
            }}
          >
            Cancel
          </Button>

          <Button
            className={buttonClassName}
            type="submit"
            onClick={(e) => {
              if (isButtonDisabled && passphraseInputRef.current) {
                e.preventDefault();
                passphraseInputRef.current.focus();
              } else if (!isButtonDisabled) {
                setRequestPassphrase(false);
                startCheckoutProcess(); // submits the passphrase validated by isButtonDisabled
              }
            }}
          >
            Submit
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}
