import { Modal, ModalContent, ModalHeader, ModalBody } from "@nextui-org/react";
import { CheckCircleIcon } from "@heroicons/react/24/outline";

export default function FailureModal({
  bodyText,
  isOpen,
  onClose,
}: {
  bodyText: string;
  isOpen: boolean;
  onClose: () => void;
}) {
  return (
    <>
      <Modal
        backdrop="blur"
        isOpen={isOpen}
        onClose={onClose}
        classNames={{
          base: "bg-[#161616] border border-zinc-800 rounded-2xl",
          body: "py-8",
          backdrop: "bg-black/80 backdrop-blur-sm",
          header: "border-b border-zinc-800 text-white",
          closeButton: "hover:bg-white/10 text-white",
        }}
        isDismissable={true}
        scrollBehavior={"normal"}
        placement={"center"}
        size="2xl"
      >
        <ModalContent>
          <ModalHeader className="flex items-center justify-center font-black uppercase tracking-tighter">
            <CheckCircleIcon className="h-6 w-6 text-green-500" />
            <div className="ml-2">Success</div>
          </ModalHeader>
          <ModalBody className="flex flex-col overflow-hidden text-zinc-300 font-medium">
            <div className="flex items-center justify-center">{bodyText}</div>
          </ModalBody>
        </ModalContent>
      </Modal>
    </>
  );
}
