import { useContext, useState } from "react";
import { Button } from "@heroui/react";
import { SHOPSTRBUTTONCLASSNAMES } from "@/utils/STATIC-VARIABLES";
import {
  NostrContext,
  SignerContext,
} from "@/components/utility-components/nostr-context-provider";
import ConfirmationModal from "@/components/utility-components/confirmation-modal";
import {
  publishHodlReleaseEvent,
  type HodlReleaseDecision,
} from "@/utils/nostr/hodl-escrow-records";
import {
  resolveHodlDispute,
  type HodlRequestError,
} from "@/utils/lightning/hodl-order-client";

interface HodlArbiterControlsProps {
  paymentHash: string;
  description: string;
  onResolved: (decision: HodlReleaseDecision) => void;
}

function formatRemaining(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.ceil((seconds % 3600) / 60);
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

/**
 * The arbiter's ruling controls for a hold-invoice escrow dispute.
 *
 * Two steps, in this order: publish the signed kind-30409 ruling to relays,
 * then ask the server to act on it. The resolve endpoint takes only a payment
 * hash and goes and finds the ruling itself, so a ruling that has not reached
 * relays yet reads to the server as no ruling at all.
 */
export default function HodlArbiterControls({
  paymentHash,
  description,
  onResolved,
}: HodlArbiterControlsProps) {
  const { signer, pubkey: userPubkey } = useContext(SignerContext);
  const { nostr } = useContext(NostrContext);

  const [pendingDecision, setPendingDecision] =
    useState<HodlReleaseDecision | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const arbiterPubkey = process.env.NEXT_PUBLIC_ARBITER_NOSTR_PUBKEY;
  // Second gate. The page already redirects non-arbiters; this makes the
  // controls inert even if they are ever rendered somewhere that does not.
  if (!arbiterPubkey || userPubkey !== arbiterPubkey) {
    return null;
  }

  const handleConfirmRuling = async () => {
    if (!pendingDecision) return;
    setIsSubmitting(true);
    setError(null);
    setNotice(null);
    try {
      if (!signer || !nostr) {
        throw new Error("Signer not available.");
      }

      await publishHodlReleaseEvent({
        paymentHash,
        decision: pendingDecision,
        nostr,
        signer,
      });
      await resolveHodlDispute(paymentHash);

      onResolved(pendingDecision);
      setPendingDecision(null);
    } catch (err) {
      const requestError = err as HodlRequestError;
      // A seller's dispute is deliberately not ruleable until the timeout has
      // run. That is a "not yet", not a failure, so it gets a countdown rather
      // than an error message.
      if (
        requestError.reason === "dispute_not_yet_actionable" &&
        typeof requestError.remainingSeconds === "number"
      ) {
        setNotice(
          `This dispute cannot be ruled on for another ${formatRemaining(
            requestError.remainingSeconds
          )}. The ruling has been published and can be applied once the window closes.`
        );
        setPendingDecision(null);
      } else {
        setError(err instanceof Error ? err.message : String(err));
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const decisionLabel =
    pendingDecision === "release:buyer" ? "the buyer" : "the seller";

  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-2">
        <Button
          className={SHOPSTRBUTTONCLASSNAMES}
          isDisabled={isSubmitting}
          onPress={() => setPendingDecision("release:buyer")}
        >
          Release to Buyer
        </Button>
        <Button
          className={SHOPSTRBUTTONCLASSNAMES}
          isDisabled={isSubmitting}
          onPress={() => setPendingDecision("release:seller")}
        >
          Release to Seller
        </Button>
      </div>
      {notice ? (
        <div className="text-sm text-gray-600 dark:text-gray-400">{notice}</div>
      ) : null}
      {error ? <div className="text-sm text-red-500">{error}</div> : null}
      <ConfirmationModal
        isOpen={pendingDecision !== null}
        title="Confirm Ruling"
        message={`Release the escrowed sats to ${decisionLabel}? This settles escrow order "${paymentHash}" (dispute: "${description}") and cannot be undone.`}
        confirmText="Confirm Ruling"
        isDangerous
        isLoading={isSubmitting}
        onConfirm={handleConfirmRuling}
        onCancel={() => {
          if (!isSubmitting) setPendingDecision(null);
        }}
      />
    </div>
  );
}
