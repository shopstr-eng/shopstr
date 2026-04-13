import { useState, useEffect, useContext } from "react";
import type React from "react";
import { Button, useDisclosure } from "@heroui/react";
import { CreditCardIcon } from "@heroicons/react/24/outline";
import { BLUEBUTTONCLASSNAMES } from "@/utils/STATIC-VARIABLES";
import { SignerContext } from "@/components/utility-components/nostr-context-provider";
import {
  buildMcpRequestProofTemplate,
  buildStripeAccountStatusProof,
} from "@/utils/mcp/request-proof";
import StripeConnectModal from "./StripeConnectModal";

interface StripeConnectBannerProps {
  returnPath?: string;
  refreshPath?: string;
}

const StripeConnectBanner: React.FC<StripeConnectBannerProps> = ({
  returnPath,
  refreshPath,
}) => {
  const { pubkey, signer } = useContext(SignerContext);
  const { isOpen, onOpen, onClose } = useDisclosure();
  const [hasStripeAccount, setHasStripeAccount] = useState<boolean | null>(
    null
  );
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (!pubkey || !signer) return;

    const checkStatus = async () => {
      try {
        const signedEvent = await signer.sign(
          buildMcpRequestProofTemplate(buildStripeAccountStatusProof(pubkey))
        );

        const res = await fetch("/api/stripe/connect/account-status", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ pubkey, signedEvent }),
        });
        if (res.ok) {
          const data = await res.json();
          setHasStripeAccount(data.chargesEnabled);
        }
      } catch {
        setHasStripeAccount(false);
      }
    };

    checkStatus();
  }, [pubkey, signer]);

  if (!pubkey || hasStripeAccount === null || hasStripeAccount || dismissed) {
    return null;
  }

  return (
    <>
      <div className="bg-primary-yellow shadow-neo mx-auto mb-4 w-full max-w-4xl rounded-md border-2 border-black p-4">
        <div className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
          <div className="flex items-center gap-3">
            <CreditCardIcon className="h-6 w-6 flex-shrink-0 text-black" />
            <div>
              <p className="text-sm font-bold text-black">
                Accept Credit Card Payments
              </p>
              <p className="text-xs text-black/70">
                Set up Stripe to let buyers pay with their cards.
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button
              size="sm"
              className="border-2 border-black bg-white px-3 py-1 text-xs font-bold text-black"
              onClick={() => setDismissed(true)}
            >
              Dismiss
            </Button>
            <Button
              size="sm"
              className={`${BLUEBUTTONCLASSNAMES} px-3 py-1 text-xs`}
              onClick={onOpen}
            >
              Set Up Stripe
            </Button>
          </div>
        </div>
      </div>
      <StripeConnectModal
        isOpen={isOpen}
        onClose={onClose}
        pubkey={pubkey}
        returnPath={returnPath}
        refreshPath={refreshPath}
      />
    </>
  );
};

export default StripeConnectBanner;
