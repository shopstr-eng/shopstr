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
import { useRouter } from "next/router";
import { NEO_BTN } from "@/utils/STATIC-VARIABLES";

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
        base: "bg-[#161616] border border-zinc-800 rounded-2xl",
        body: "py-8",
        backdrop: "bg-black/80 backdrop-blur-sm",
        header: "border-b border-zinc-800",
        footer: "border-t border-zinc-800",
        closeButton: "hover:bg-white/10 text-white",
      }}
      scrollBehavior={"outside"}
      size="md"
      isDismissable={false}
    >
      <ModalContent>
        <ModalHeader className="flex flex-col gap-1 font-black uppercase tracking-tighter text-white">
          Enter Passphrase
        </ModalHeader>
        <ModalBody>
          <Input
            autoFocus
            ref={passphraseInputRef}
            variant="bordered"
            label="PASSPHRASE"
            labelPlacement="outside"
            classNames={{
              label: "text-zinc-500 font-bold uppercase tracking-wider text-xs",
              input: "text-white text-base", 
              inputWrapper:
                "bg-[#111] border-zinc-700 data-[hover=true]:border-zinc-500 group-data-[focus=true]:border-yellow-400 h-12",
            }}
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
              className="h-4 w-4 rounded border-zinc-700 bg-zinc-900 text-yellow-400 focus:ring-yellow-400 accent-yellow-400"
            />
            <label className="text-sm font-bold text-zinc-400">
              Remember passphrase for this session
            </label>
          </div>
          {error && (
            <div className="mt-2 text-sm text-red-500">{error.message}</div>
          )}
        </ModalBody>

        <ModalFooter>
          <Button
            className="font-bold uppercase tracking-wider text-red-500 hover:bg-red-500/10"
            color="danger"
            variant="light"
            onClick={onCancel}
          >
            Cancel
          </Button>

          <Button className={`${NEO_BTN} h-10 px-6 text-xs`} type="submit" onClick={onSubmit}>
            Submit
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}
