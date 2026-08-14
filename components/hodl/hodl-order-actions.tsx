import { useCallback, useContext, useEffect, useState } from "react";
import { Button, Spinner } from "@heroui/react";
import { SHOPSTRBUTTONCLASSNAMES } from "@/utils/STATIC-VARIABLES";
import {
  NostrContext,
  SignerContext,
} from "@/components/utility-components/nostr-context-provider";
import ConfirmationModal from "@/components/utility-components/confirmation-modal";
import {
  publishHodlConfirmEvent,
  publishHodlDisputeEvent,
} from "@/utils/nostr/hodl-escrow-records";
import {
  getClientArbiterNostrPubkey,
  getHodlOrderStatus,
  settleHodlInvoice,
  type HodlEscrowOrderStatus,
  type HodlOrderRole,
  type HodlRequestError,
} from "@/utils/lightning/hodl-order-client";

const DISABLED_BUTTON_CLASSNAMES =
  "min-w-fit cursor-not-allowed bg-gray-400 text-gray-600 opacity-60";

interface HodlOrderActionsProps {
  paymentHash: string;
  /** True when the viewer is the seller on this order. */
  isSale: boolean;
}

type PendingAction = "confirm" | "dispute" | null;

/**
 * Buyer and seller controls for a hold-invoice escrow order.
 *
 * One component serves both roles because the underlying endpoints do not care
 * who calls them — settle authorizes off the buyer's signed confirmation event
 * on relays, never off the requester. So the split here is about what each
 * party should be *offered*, not about what each is permitted to do.
 *
 * The status is re-read from the server rather than trusted from the order DM:
 * the DM records what was true at checkout, and everything interesting about an
 * escrow order happens afterwards.
 */
export default function HodlOrderActions({
  paymentHash,
  isSale,
}: HodlOrderActionsProps) {
  const { signer } = useContext(SignerContext);
  const { nostr } = useContext(NostrContext);

  const [status, setStatus] = useState<HodlEscrowOrderStatus | null>(null);
  const [role, setRole] = useState<HodlOrderRole | null>(null);
  const [isLoadingStatus, setIsLoadingStatus] = useState(true);
  const [statusError, setStatusError] = useState<string | null>(null);

  const [pendingAction, setPendingAction] = useState<PendingAction>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const arbiterPubkey = getClientArbiterNostrPubkey();

  const refreshStatus = useCallback(async () => {
    // No signer means the status route cannot be called at all — it is
    // NIP-98 authenticated. Settle for the inert label rather than spinning
    // forever waiting for a request that will never be made.
    if (!signer) {
      setIsLoadingStatus(false);
      return;
    }
    try {
      const result = await getHodlOrderStatus(signer, paymentHash);
      setStatus(result.status);
      setRole(result.role);
      setStatusError(null);
    } catch (error) {
      // A 404 here is the ordinary case for an order that was never
      // registered — an old DM, or a listing paid for some other way — so it
      // reads as "no escrow to act on", not as a failure.
      const status = (error as HodlRequestError).status;
      setStatusError(
        status === 404
          ? null
          : error instanceof Error
            ? error.message
            : String(error)
      );
      setStatus(null);
    } finally {
      setIsLoadingStatus(false);
    }
  }, [signer, paymentHash]);

  useEffect(() => {
    let isActive = true;
    const load = async () => {
      await refreshStatus();
      if (!isActive) return;
    };
    load();
    return () => {
      isActive = false;
    };
  }, [refreshStatus]);

  const handleConfirmReceipt = async () => {
    setIsSubmitting(true);
    setActionError(null);
    setNotice(null);
    try {
      if (!signer || !nostr) throw new Error("Signer not available.");

      // Order matters: the settle endpoint looks this event up on relays, so
      // publishing has to finish before the release is attempted. The publisher
      // waits for the relay round-trip for exactly this reason.
      await publishHodlConfirmEvent({ paymentHash, nostr, signer });
      await settleHodlInvoice(paymentHash);

      setPendingAction(null);
      await refreshStatus();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : String(error));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCollect = async () => {
    setIsSubmitting(true);
    setActionError(null);
    setNotice(null);
    try {
      await settleHodlInvoice(paymentHash);
      await refreshStatus();
    } catch (error) {
      // Not an error condition: the seller pressed Collect before the buyer
      // confirmed, which is the normal state of an escrow order in transit.
      if ((error as HodlRequestError).reason === "no_confirmation") {
        setNotice(
          "The buyer has not confirmed receipt yet. The sats stay locked until they do."
        );
      } else {
        setActionError(error instanceof Error ? error.message : String(error));
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRaiseDispute = async () => {
    setIsSubmitting(true);
    setActionError(null);
    setNotice(null);
    try {
      if (!signer || !nostr) throw new Error("Signer not available.");
      if (!arbiterPubkey) throw new Error("No arbiter is configured.");

      await publishHodlDisputeEvent({
        paymentHash,
        arbiterPubkey,
        nostr,
        signer,
      });

      setPendingAction(null);
      setNotice(
        "Dispute raised. The arbiter can now review this order and release the funds either way."
      );
    } catch (error) {
      setActionError(error instanceof Error ? error.message : String(error));
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoadingStatus) {
    return <Spinner size="sm" />;
  }

  // Either no escrow order exists for this payment hash, or the viewer is not
  // one of its two parties. Fall through to whatever the dashboard renders for
  // an order with no actions.
  if (!status) {
    return statusError ? (
      <span className="text-sm text-red-500">{statusError}</span>
    ) : (
      <span className="text-gray-600 dark:text-gray-400">Lightning Escrow</span>
    );
  }

  if (status === "settled") {
    return (
      <span className="text-green-600 dark:text-green-400">
        {isSale ? "Payment Released" : "Payment Sent"}
      </span>
    );
  }

  if (status === "cancelled") {
    return (
      <span className="text-gray-600 dark:text-gray-400">
        {isSale ? "Escrow Cancelled" : "Refunded"}
      </span>
    );
  }

  if (status === "open") {
    return (
      <span className="text-gray-600 dark:text-gray-400">
        Awaiting escrow payment
      </span>
    );
  }

  // status === "accepted": funds are locked and the order is live.
  const isBuyer = role === "buyer";

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        {isBuyer ? (
          <Button
            className={
              isSubmitting
                ? DISABLED_BUTTON_CLASSNAMES
                : SHOPSTRBUTTONCLASSNAMES
            }
            isDisabled={isSubmitting}
            onPress={() => setPendingAction("confirm")}
          >
            Confirm Receipt
          </Button>
        ) : (
          <Button
            className={
              isSubmitting
                ? DISABLED_BUTTON_CLASSNAMES
                : SHOPSTRBUTTONCLASSNAMES
            }
            isDisabled={isSubmitting}
            onPress={handleCollect}
          >
            {isSubmitting ? <Spinner size="sm" /> : "Collect"}
          </Button>
        )}

        {arbiterPubkey && (
          <Button
            className={
              isSubmitting
                ? DISABLED_BUTTON_CLASSNAMES
                : SHOPSTRBUTTONCLASSNAMES
            }
            isDisabled={isSubmitting}
            onPress={() => setPendingAction("dispute")}
          >
            Raise Dispute
          </Button>
        )}
      </div>

      {notice ? (
        <div className="text-sm text-gray-600 dark:text-gray-400">{notice}</div>
      ) : null}
      {actionError ? (
        <div className="text-sm text-red-500">{actionError}</div>
      ) : null}

      <ConfirmationModal
        isOpen={pendingAction === "confirm"}
        title="Confirm Receipt"
        message="Release the escrowed sats to the seller? Do this only once you have the order in hand — it pays out immediately and cannot be undone."
        confirmText="Confirm Receipt"
        isDangerous
        isLoading={isSubmitting}
        onConfirm={handleConfirmReceipt}
        onCancel={() => {
          if (!isSubmitting) setPendingAction(null);
        }}
      />

      <ConfirmationModal
        isOpen={pendingAction === "dispute"}
        title="Raise Dispute"
        message="Hand this order to the Shopstr arbiter to decide? They will be able to release the escrowed sats to either party, and the dispute cannot be withdrawn."
        confirmText="Raise Dispute"
        isDangerous
        isLoading={isSubmitting}
        onConfirm={handleRaiseDispute}
        onCancel={() => {
          if (!isSubmitting) setPendingAction(null);
        }}
      />
    </div>
  );
}
