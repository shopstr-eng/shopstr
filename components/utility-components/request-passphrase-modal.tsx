import { useEffect, useMemo, useRef, useState } from "react";
import {
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  Input,
  Button,
} from "@nextui-org/react";
import { PRIMARYBUTTONCLASSNAMES } from "@/utils/STATIC-VARIABLES";
import { useRouter } from "next/router";
import MilkMarketSpinner from "@/components/utility-components/mm-spinner";

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
  onCancelRouteTo?: string;
  error?: Error;
}) {
  const [remindToggled, setRemindToggled] = useState(false);
  const [passphraseInput, setPassphraseInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const isButtonDisabled = useMemo(() => {
    return passphraseInput.trim().length === 0;
  }, [passphraseInput]);
  const router = useRouter();

  useEffect(() => {
    if (!isOpen) {
      setIsLoading(false);
    }
  }, [isOpen]);

  useEffect(() => {
    if (error) {
      setIsLoading(false);
    }
  }, [error]);
  const passphraseInputRef = useRef<HTMLInputElement>(null);

  const onSubmit = () => {
    if (isButtonDisabled && passphraseInputRef.current) {
      passphraseInputRef.current.focus();
    } else if (!isButtonDisabled) {
      setIsLoading(true);
      if (actionOnSubmit) {
        setTimeout(() => {
          actionOnSubmit(passphraseInput, remindToggled);
        }, 0);
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
        body: "py-6 bg-white",
        backdrop: "bg-black/50 backdrop-opacity-60",
        header: "border-b-2 border-black bg-white rounded-t-md",
        footer: "border-t-2 border-black bg-white rounded-b-md",
        closeButton: "hover:bg-gray-100 active:bg-gray-200 text-black",
        wrapper: "items-center justify-center",
        base: "border-2 border-black shadow-neo rounded-md",
      }}
      scrollBehavior={"outside"}
      size="2xl"
      isDismissable={false}
    >
      <ModalContent>
        <ModalHeader className="flex flex-col gap-1">
          <h2 className="text-2xl font-bold text-black">Enter Passphrase</h2>
        </ModalHeader>
        <ModalBody>
          <Input
            autoFocus
            ref={passphraseInputRef}
            variant="bordered"
            label={<span className="font-semibold text-black">Passphrase</span>}
            labelPlacement="outside"
            placeholder="Enter your passphrase"
            type="password"
            onChange={(e) => setPassphraseInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") onSubmit();
            }}
            value={passphraseInput}
            classNames={{
              input: "text-black font-semibold placeholder:text-gray-400",
              label: "text-black font-semibold",
              inputWrapper:
                "border-2 border-black rounded-md shadow-neo bg-white hover:bg-gray-50 data-[hover=true]:bg-gray-50",
            }}
          />
          <div className="mt-4 flex items-center gap-3">
            <input
              type="checkbox"
              checked={remindToggled}
              onChange={() => setRemindToggled(!remindToggled)}
              className="h-5 w-5 cursor-pointer rounded border-2 border-black accent-primary-yellow"
            />
            <label className="cursor-pointer text-sm font-semibold text-black">
              Remember passphrase for this session
            </label>
          </div>
          {error && (
            <div className="mt-3 rounded-md border-2 border-red-500 bg-red-50 p-3">
              <p className="text-sm font-semibold text-red-600">
                {error.message}
              </p>
            </div>
          )}
        </ModalBody>

        <ModalFooter className="gap-3">
          <Button
            className="rounded-md border-2 border-black bg-red-500 px-4 py-2 font-bold text-white shadow-neo transition-transform hover:-translate-y-0.5 active:translate-y-0.5"
            onClick={onCancel}
            isDisabled={isLoading}
          >
            Cancel
          </Button>

          <Button
            className={PRIMARYBUTTONCLASSNAMES}
            type="submit"
            onClick={onSubmit}
            isDisabled={isButtonDisabled || isLoading}
          >
            {isLoading ? (
              <div className="flex items-center justify-center">
                <MilkMarketSpinner />
              </div>
            ) : (
              "Submit"
            )}
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}
