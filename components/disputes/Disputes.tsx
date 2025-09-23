import React, { useState, useEffect, useContext } from "react";
import { Button, useDisclosure } from "@nextui-org/react";
import ShopstrSpinner from "../utility-components/shopstr-spinner";
import FailureModal from "../utility-components/failure-modal";
import SignInModal from "../sign-in/SignInModal";
import DisputeButton from "./DisputeButton";
import DisputePanel from "./DisputePanel";
import type { DisputeData, NostrMessageEvent } from "@/utils/types/types";
import { fetchDisputes } from "@/utils/nostr/fetch-service";
import { unwrapGiftWrap } from "@/utils/nostr/nostr-helper-functions";
import { DisputeContext, ChatsContext } from "@/utils/context/context";
import { SignerContext, NostrContext } from "@/components/utility-components/nostr-context-provider";
import { useKeyPress } from "@/utils/keypress-handler";
import { SHOPSTRBUTTONCLASSNAMES } from "@/utils/STATIC-VARIABLES";
import { getDecodedToken, Proof } from "@cashu/cashu-ts";

export default function Disputes() {
  const { isOpen, onOpen, onClose } = useDisclosure();
  const { pubkey: userPubkey, signer } = useContext(SignerContext);
  const { nostr } = useContext(NostrContext);
  const chatsContext = useContext(ChatsContext);

  const [disputesMap, setDisputesMap] = useState<Map<string, DisputeData>>(new Map());
  const [isLoading, setIsLoading] = useState(true);
  const [currentDisputeId, setCurrentDisputeId] = useState<string>("");

  const [showFailureModal, setShowFailureModal] = useState(false);
  const [failureText, setFailureText] = useState("");

  const [isClient, setIsClient] = useState(false);
  const arrowUpPressed = useKeyPress("ArrowUp");
  const arrowDownPressed = useKeyPress("ArrowDown");
  const escapePressed = useKeyPress("Escape");

  useEffect(() => {
    if (!nostr || !userPubkey || chatsContext.isLoading) return;
    (async () => {
      try {
        const disputeEvents = await fetchDisputes(nostr, userPubkey);
        const newMap = new Map<string, DisputeData>();

        for (const event of disputeEvents) {
          const orderId = event.tags.find((t) => t[0] === "d")?.[1];
          if (!orderId) continue;

          let escrowToken: Proof[] = [];
          for (const chat of chatsContext.chatsMap.values()) {
            const paymentMessage = chat.find(
              (msg) =>
                msg.tags.some((t) => t[0] === "subject" && t[1] === "order-payment") &&
                msg.tags.some((t) => t[0] === "order" && t[1] === orderId)
            );
            if (paymentMessage) {
              const match = paymentMessage.content.match(/cashuA[A-Za-z0-9_=-]+/);
              if (match) {
                const decoded = getDecodedToken(match[0]);
                escrowToken = decoded.proofs ?? [];
              }
              break;
            }
          }

          const participants = event.tags.filter((t) => t[0] === "p").map((t) => t[1]);
          newMap.set(orderId, {
            disputeId: event.id,
            orderId,
            escrowToken,
            status: "open",
            participants: {
              buyer: participants[0] || "",
              seller: participants[1] || "",
              arbiter: participants[2] || "",
            },
            messages: [],
          });
        }

        setDisputesMap(newMap);
      } catch (err: any) {
        setFailureText("Failed to load disputes.");
        setShowFailureModal(true);
      } finally {
        setIsLoading(false);
      }
    })();
  }, [nostr, userPubkey, chatsContext.isLoading, chatsContext.chatsMap]);

  useEffect(() => {
    setIsClient(true);
  }, []);

  useEffect(() => {
    if (isLoading || disputesMap.size === 0) return;
    const keys = Array.from(disputesMap.keys());
    let idx = keys.indexOf(currentDisputeId);
    if (arrowUpPressed) {
      idx = idx <= 0 ? 0 : idx - 1;
      setCurrentDisputeId(keys[idx] ?? "");
    }
    if (arrowDownPressed) {
      idx = idx < 0 ? 0 : Math.min(keys.length - 1, idx + 1);
      setCurrentDisputeId(keys[idx] ?? "");
    }
    if (escapePressed) {
      setCurrentDisputeId("");
    }
  }, [arrowUpPressed, arrowDownPressed, escapePressed, isLoading, currentDisputeId, disputesMap]);

  useEffect(() => {
    if (!currentDisputeId || !nostr || !signer || !userPubkey) return;
    (async () => {
      try {
        const filter = {
          kinds: [1059],
          "#d": [currentDisputeId],
          "#p": [userPubkey],
        };
        const events = await nostr.fetch([filter], {}, undefined);

        const decrypted: NostrMessageEvent[] = [];
        for (const evt of events) {
          const msg = await unwrapGiftWrap(signer, evt);
          if (msg) decrypted.push({ ...msg, read: true } as NostrMessageEvent);
        }
        decrypted.sort((a, b) => a.created_at - b.created_at);

        setDisputesMap((prev) => {
          const next = new Map(prev);
          const d = next.get(currentDisputeId);
          if (d) next.set(currentDisputeId, { ...d, messages: decrypted });
          return next;
        });
      } catch (e) {
        console.error("Failed fetching dispute messages", e);
      }
    })();
  }, [currentDisputeId, nostr, signer, userPubkey]);

  const handleReload = () => window.location.reload();

  const sorted = Array.from(disputesMap.entries()).sort((a, b) => {
    const aLast = a[1].messages.slice(-1)[0]?.created_at || 0;
    const bLast = b[1].messages.slice(-1)[0]?.created_at || 0;
    return bLast - aLast;
  });

  return (
    <DisputeContext.Provider value={{ disputesMap, isLoading }}>
      <div className="min-h-screen bg-light-bg dark:bg-dark-bg text-light-text dark:text-dark-text">
        <div className="container mx-auto px-4 py-10">
          {isLoading ? (
            <div className="flex h-[66vh] items-center justify-center">
              <ShopstrSpinner />
            </div>
          ) : disputesMap.size === 0 ? (
            <div className="flex h-[66vh] items-center justify-center">
              <div className="mx-auto w-full max-w-lg rounded-xl bg-white p-10 shadow-xl transition-all dark:bg-gray-800">
                <div className="text-center">
                  {isClient && userPubkey ? (
                    <div className="space-y-6">
                      <h2 className="text-3xl font-semibold text-gray-700 dark:text-gray-100">
                        No disputes... yet!
                      </h2>
                      <div className="mt-2 text-base text-gray-600 dark:text-gray-300">
                        <p>Just logged in?</p>
                        <p className="mt-1 font-medium">
                          Try reloading the page.
                        </p>
                      </div>
                      <div className="pt-4">
                        <Button
                          onClick={handleReload}
                          className={`${SHOPSTRBUTTONCLASSNAMES} mt-6`}
                        >
                          Reload
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-6">
                      <h2 className="text-3xl font-semibold text-gray-700 dark:text-gray-100">
                        You must be signed in to view disputes.
                      </h2>
                      <div className="pt-4">
                        <Button onClick={onOpen} className={SHOPSTRBUTTONCLASSNAMES}>
                          Sign In
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="flex flex-row">
              <div className="w-full max-w-xs overflow-y-auto border-r border-light-fg dark:border-dark-fg">
                {sorted.map(([id, dispute]) => (
                  <DisputeButton
                    key={id}
                    disputeData={dispute}
                    openedDisputeId={currentDisputeId}
                    handleClickDispute={setCurrentDisputeId}
                  />
                ))}
              </div>
              {currentDisputeId && (
                <div className="flex-1">
                  <DisputePanel
                    disputesMap={disputesMap}
                    currentDisputeId={currentDisputeId}
                    handleGoBack={() => setCurrentDisputeId("")}
                  />
                </div>
              )}
            </div>
          )}
        </div>

        <SignInModal isOpen={isOpen} onClose={onClose} />
        <FailureModal
          isOpen={showFailureModal}
          bodyText={failureText}
          onClose={() => setShowFailureModal(false)}
        />
      </div>
    </DisputeContext.Provider>
  );
}
