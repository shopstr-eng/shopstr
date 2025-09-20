import React, { useEffect, useContext, useRef, useState, useMemo } from "react";
import { Button, Input, Modal, ModalContent, ModalFooter, ModalHeader, ModalBody } from "@nextui-org/react";
import { ArrowUturnLeftIcon, ShieldCheckIcon } from "@heroicons/react/24/outline";
import { SHOPSTRBUTTONCLASSNAMES } from "@/utils/STATIC-VARIABLES";
import { getPublicKey } from "nostr-tools"; 
import {
  constructGiftWrappedEvent,
  constructMessageSeal,
  constructMessageGiftWrap,
  sendGiftWrappedMessageEvent,
  createPartialRedemption,
  publishDisputeResolutionEvent
} from "@/utils/nostr/nostr-helper-functions";
import { DisputeData } from "../../utils/types/types";
import { NostrContext, SignerContext } from "@/components/utility-components/nostr-context-provider";
import ChatMessage from "../messages/chat-message"; 

interface DisputePanelProps {
  handleGoBack: () => void;
  disputesMap: Map<string, DisputeData>;
  currentDisputeId: string;
}

const DisputePanel = ({
  handleGoBack,
  disputesMap,
  currentDisputeId,
}: DisputePanelProps) => {
  const { nostr } = useContext(NostrContext);
  const { signer, pubkey: userPubkey } = useContext(SignerContext);

  const dispute = disputesMap.get(currentDisputeId);
  const messages = useMemo(() => dispute?.messages || [], [dispute]);

  const [messageInput, setMessageInput] = useState("");
  const [isSending, setIsSending] = useState(false);
  const bottomDivRef = useRef<HTMLDivElement>(null);

  const [isRuleModalOpen, setIsRuleModalOpen] = useState(false);
  const [ruleFor, setRuleFor] = useState<"buyer" | "seller" | null>(null);

  useEffect(() => {
    bottomDivRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isSending]);

  const isArbiter = dispute?.participants.arbiter === userPubkey;

  const sendDisputeMessage = async (msg: string, recipient: string) => {
    if (!dispute || !signer || !nostr || !userPubkey) return;

    const privBytes = window.crypto.getRandomValues(new Uint8Array(32));
    const tempRandomPubKey = getPublicKey(privBytes);
    const tempRandomPrivKey = privBytes;

    const giftWrapped = await constructGiftWrappedEvent(
      userPubkey,
      recipient,
      msg,
      "dispute-message",
      { orderId: dispute.orderId }
    );
    const sealed = await constructMessageSeal(signer, giftWrapped, userPubkey, recipient);
    const wrapped = await constructMessageGiftWrap(
        sealed,
        tempRandomPubKey,
        tempRandomPrivKey,
        recipient
    );
    await sendGiftWrappedMessageEvent(wrapped);
  };

  const onSend = async () => {
    if (!messageInput.trim() || !dispute) return;
    setIsSending(true);
    
    const participants = Object.values(dispute.participants);
    for (const p of participants) {
        if (p !== userPubkey) { 
            await sendDisputeMessage(messageInput.trim(), p);
        }
    }
    
    setMessageInput("");
    setIsSending(false);
  };

  const onRule = async (forWhom: "buyer" | "seller") => {
    if (!dispute || !signer || !nostr || !dispute.escrowToken?.length) {
      alert("Error: No escrowed proofs to sign.");
      return;
    }

    // This helper now simply signs each proof.secret with the arbiter's key:
    const { inputs, signatures } = await createPartialRedemption(
      dispute.escrowToken,
      signer
    );

    const rulingPayload = { inputs, signatures };
    const rulingMessage = `RULING_FOR_${forWhom.toUpperCase()}:${JSON.stringify(rulingPayload)}`;
    // Send it only to the winner:
    const winnerPubkey = forWhom === "buyer"
      ? dispute.participants.buyer
      : dispute.participants.seller;

    await sendDisputeMessage(rulingMessage, winnerPubkey);
    //Publish a resolution event so UI badges update via kind=30007
    await publishDisputeResolutionEvent(signer, nostr, dispute.orderId, forWhom);
    alert(`Ruling sent. Funds will be released to the ${forWhom}.`);
    setIsRuleModalOpen(false);
  };

  if (!dispute) {
    return (
      <div className="flex h-full items-center justify-center p-10">
        <span className="text-gray-500">Select a dispute to view details</span>
      </div>
    );
  }
  
  return (
    <div className="absolute flex h-full w-full flex-col overflow-clip bg-light-bg px-2 pb-20 dark:bg-dark-bg md:relative md:h-[85vh] md:pb-0 lg:pb-0">
      {/* Header */}
      <h2 className="flex h-[60px] w-full items-center justify-between text-shopstr-purple-light dark:text-shopstr-yellow-light">
        <div className="flex items-center">
            <ArrowUturnLeftIcon
                onClick={handleGoBack}
                className="mx-3 h-9 w-9 cursor-pointer rounded-md p-1 hover:bg-shopstr-yellow hover:text-purple-700 dark:hover:bg-shopstr-purple"
            />
            <div className="flex flex-col">
                <span className="font-bold">Dispute for Order</span>
                <code className="text-xs text-gray-500">{dispute.orderId}</code>
            </div>
        </div>
        <span className="mr-4 rounded-full bg-gray-200 px-3 py-1 text-sm font-semibold capitalize text-gray-700 dark:bg-gray-700 dark:text-gray-200">
            {dispute.status.replace("-", " ")}
        </span>
      </h2>

      {/* Message thread */}
      <div className="my-2 h-full overflow-y-scroll rounded-md border-2 border-light-fg bg-light-fg p-3 dark:border-dark-fg dark:bg-dark-fg">
        {messages.map((m, i) => (
          <ChatMessage
            key={m.id || i}
            messageEvent={m}
            index={i}
            currentChatPubkey={userPubkey!}
            setBuyerPubkey={() => {}}
            setCanReview={() => {}}
            setProductAddress={() => {}}
            setOrderId={() => {}}
          />
        ))}
        <div ref={bottomDivRef} />
      </div>

      {/* Footer */}
      <div className="border-t-2 border-light-fg pt-2 dark:border-dark-fg">
        {/* Arbiter Ruling Buttons */}
        {isArbiter && (
          <div className="mb-2 rounded-lg border-2 border-dashed border-blue-500 bg-blue-50 p-3 text-center dark:bg-blue-900/20">
            <h4 className="flex items-center justify-center gap-2 font-bold text-blue-600 dark:text-blue-400">
                <ShieldCheckIcon className="h-5 w-5" />
                Arbiter Controls
            </h4>
            <p className="my-1 text-sm text-gray-600 dark:text-gray-300">This action is final and will release the funds.</p>
            <div className="flex justify-center gap-4 pt-1">
                <Button
                    color="success"
                    onClick={() => { setRuleFor("buyer"); setIsRuleModalOpen(true); }}
                >
                    Rule for Buyer
                </Button>
                <Button
                    color="danger"
                    onClick={() => { setRuleFor("seller"); setIsRuleModalOpen(true); }}
                >
                    Rule for Seller
                </Button>
            </div>
          </div>
        )}

        {/* New Message Input */}
        <div className="flex items-center p-2">
          <Input
            fullWidth
            placeholder="Type dispute message…"
            value={messageInput}
            onChange={(e) => setMessageInput(e.target.value)}
            onKeyDown={async (e) => {
              if (e.key === "Enter" && messageInput.trim() && !isSending) await onSend();
            }}
          />
          <Button
            className={`${SHOPSTRBUTTONCLASSNAMES} ml-2`}
            onClick={onSend}
            isDisabled={!messageInput.trim() || isSending}
            isLoading={isSending}
          >
            Send
          </Button>
        </div>
      </div>

      {/* Ruling Confirmation Modal */}
      <Modal isOpen={isRuleModalOpen} onClose={() => setIsRuleModalOpen(false)} backdrop="blur">
        <ModalContent>
          <ModalHeader>
            Confirm Ruling for {ruleFor === "buyer" ? "Buyer" : "Seller"}
          </ModalHeader>
          <ModalBody>
            <p>
              This will create and send a partially-signed Cashu redemption payload
              to the {ruleFor}. This action cannot be undone.
            </p>
          </ModalBody>
          <ModalFooter>
            <Button variant="light" onClick={() => setIsRuleModalOpen(false)}>
              Cancel
            </Button>
            <Button
              color={ruleFor === "buyer" ? "success" : "danger"}
              onClick={() => onRule(ruleFor!)}
            >
              Yes, Rule for {ruleFor === "buyer" ? "Buyer" : "Seller"}
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </div>
  );
};

export default DisputePanel;