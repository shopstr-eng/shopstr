import {
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  Snippet,
} from "@nextui-org/react";
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
      classNames={{
        wrapper: "shadow-neo",
        base: "border-2 border-black rounded-md",
        backdrop: "bg-black/20 backdrop-blur-sm",
        header: "border-b-2 border-black bg-white rounded-t-md text-black",
        body: "bg-white",
        closeButton: "hover:bg-black/5 active:bg-white/10",
      }}
    >
      <ModalContent>
        <ModalHeader className="text-black">Raw Event JSON</ModalHeader>
        <ModalBody>
          <Snippet
            symbol=""
            codeString={JSON.stringify(rawEvent, null, 2)}
            className="w-full items-start rounded-md border-2 border-black bg-white"
          >
            <div className="max-h-[60vh] w-full overflow-y-auto">
              <pre className="whitespace-pre-wrap break-all font-mono text-xs text-black">
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
      classNames={{
        wrapper: "shadow-neo",
        base: "border-2 border-black rounded-md",
        backdrop: "bg-black/20 backdrop-blur-sm",
        header: "border-b-2 border-black bg-white rounded-t-md text-black",
        body: "bg-white",
        closeButton: "hover:bg-black/5 active:bg-white/10",
      }}
    >
      <ModalContent>
        <ModalHeader className="text-black">Event ID</ModalHeader>
        <ModalBody className="pb-6">
          <div className="flex flex-col gap-4">
            <div className="w-full">
              <p className="mb-1 text-sm font-semibold text-black">Hex ID:</p>
              <Snippet
                symbol=""
                codeString={rawEvent?.id}
                className="w-full rounded-md border-2 border-black bg-white"
              >
                <span className="whitespace-normal break-all font-mono text-sm text-black">
                  {rawEvent?.id}
                </span>
              </Snippet>
            </div>

            {rawEvent && (
              <div className="w-full">
                <p className="mb-1 text-sm font-semibold text-black">
                  Bech32 Note ID:
                </p>
                <Snippet
                  symbol=""
                  codeString={nip19.noteEncode(rawEvent.id)}
                  className="w-full rounded-md border-2 border-black bg-white"
                >
                  <span className="whitespace-normal break-all font-mono text-sm text-black">
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
