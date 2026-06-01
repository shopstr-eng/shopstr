import {
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  Snippet,
} from "@heroui/react";
import { Event, nip19 } from "nostr-tools";

interface RawEventModalProps {
  isOpen: boolean;
  onClose: () => void;
  rawEvent: Event | undefined;
}

export const RawEventModal = ({
  isOpen,
  onClose,
  rawEvent,
}: RawEventModalProps) => {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      size="2xl"
      scrollBehavior="inside"
      backdrop="blur"
      classNames={{
        base: "bg-[#161616] border border-zinc-800 rounded-2xl",
        header: "border-b border-zinc-800 text-white",
        body: "p-0 bg-[#111]",
        closeButton: "hover:bg-white/10 text-white",
      }}
    >
      <ModalContent>
        <ModalHeader className="font-black tracking-tighter uppercase">
          Raw Event JSON
        </ModalHeader>
        <ModalBody>
          <Snippet
            symbol=""
            codeString={JSON.stringify(rawEvent, null, 2)}
            className="w-full items-start overflow-hidden bg-transparent p-4 text-zinc-300"
            hideCopyButton={false}
          >
            <div className="max-h-[50vh] w-full overflow-y-auto pr-2 md:max-h-[60vh]">
              <pre className="font-mono text-[10px] break-all whitespace-pre-wrap text-green-400 md:text-xs">
                {JSON.stringify(rawEvent, null, 2)}
              </pre>
            </div>
          </Snippet>
        </ModalBody>
      </ModalContent>
    </Modal>
  );
};

interface EventIdModalProps {
  isOpen: boolean;
  onClose: () => void;
  rawEvent: Event | undefined;
}

export const EventIdModal = ({
  isOpen,
  onClose,
  rawEvent,
}: EventIdModalProps) => {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      size="lg"
      backdrop="blur"
      classNames={{
        base: "bg-[#161616] border border-zinc-800 rounded-2xl",
        header: "border-b border-zinc-800 text-white",
        body: "py-6 text-zinc-300",
        closeButton: "hover:bg-white/10 text-white",
      }}
    >
      <ModalContent>
        <ModalHeader className="font-black tracking-tighter uppercase">
          Event ID
        </ModalHeader>
        <ModalBody className="pb-6">
          <div className="flex flex-col gap-4">
            <div className="w-full">
              <p className="mb-2 text-xs font-bold tracking-wider text-zinc-500 uppercase">
                Hex ID:
              </p>
              <Snippet
                symbol=""
                codeString={rawEvent?.id}
                className="w-full rounded-xl border border-zinc-800 bg-[#111] py-3 text-zinc-300"
                classNames={{ pre: "font-mono" }}
              >
                <span className="font-mono text-xs break-all whitespace-normal md:text-sm">
                  {rawEvent?.id}
                </span>
              </Snippet>
            </div>

            {rawEvent && (
              <div className="w-full">
                <p className="mb-2 text-xs font-bold tracking-wider text-zinc-500 uppercase">
                  Bech32 Note ID:
                </p>
                <Snippet
                  symbol=""
                  codeString={nip19.noteEncode(rawEvent.id)}
                  className="w-full rounded-xl border border-zinc-800 bg-[#111] py-3 text-zinc-300"
                  classNames={{ pre: "font-mono" }}
                >
                  <span className="font-mono text-xs break-all whitespace-normal md:text-sm">
                    {nip19.noteEncode(rawEvent.id)}
                  </span>
                </Snippet>
              </div>
            )}
          </div>
        </ModalBody>
      </ModalContent>
    </Modal>
  );
};
