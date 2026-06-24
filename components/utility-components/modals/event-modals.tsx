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
    <Modal isOpen={isOpen} onClose={onClose} size="2xl" scrollBehavior="inside">
      <ModalContent>
        <ModalHeader>Raw Event JSON</ModalHeader>
        <ModalBody>
          <Snippet
            symbol=""
            codeString={JSON.stringify(rawEvent, null, 2)}
            className="w-full items-start"
          >
            <div className="max-h-[60vh] w-full overflow-y-auto">
              <pre className="font-mono text-xs break-all whitespace-pre-wrap">
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
    <Modal isOpen={isOpen} onClose={onClose} size="lg">
      <ModalContent>
        <ModalHeader>Event ID</ModalHeader>
        <ModalBody className="pb-6">
          <div className="flex flex-col gap-4">
            <div className="w-full">
              <p className="mb-1 text-sm font-semibold">Hex ID:</p>
              <Snippet symbol="" codeString={rawEvent?.id} className="w-full">
                <span className="font-mono text-sm break-all whitespace-normal">
                  {rawEvent?.id}
                </span>
              </Snippet>
            </div>

            {rawEvent && (
              <div className="w-full">
                <p className="mb-1 text-sm font-semibold">Bech32 Note ID:</p>
                <Snippet
                  symbol=""
                  codeString={nip19.noteEncode(rawEvent.id)}
                  className="w-full"
                >
                  <span className="font-mono text-sm break-all whitespace-normal">
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
