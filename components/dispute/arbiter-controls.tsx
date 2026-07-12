import { useContext, useState } from "react";
import { Button } from "@heroui/react";
import { SHOPSTRBUTTONCLASSNAMES } from "@/utils/STATIC-VARIABLES";
import { SignerContext } from "@/components/utility-components/nostr-context-provider";
import ConfirmationModal from "@/components/utility-components/confirmation-modal";

interface ArbiterControlsProps {
  orderId: string;
  token: string;
  buyerNostrPubkey: string;
  sellerNostrPubkey: string;
  reason: string;
  onRuled: (ruling: "buyer" | "seller") => void;
}

export default function ArbiterControls({
  orderId,
  token,
  buyerNostrPubkey,
  sellerNostrPubkey,
  reason,
  onRuled,
}: ArbiterControlsProps) {
  const { pubkey: userPubkey } = useContext(SignerContext);
  const [pendingRuling, setPendingRuling] = useState<"buyer" | "seller" | null>(
    null
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const arbiterPubkey = process.env.NEXT_PUBLIC_ARBITER_NOSTR_PUBKEY;
  if (!arbiterPubkey || userPubkey !== arbiterPubkey) {
    return null;
  }

  const handleConfirmRuling = async () => {
    if (!pendingRuling) return;
    setIsSubmitting(true);
    setError(null);
    try {
      const winnerNostrPubkey =
        pendingRuling === "buyer" ? buyerNostrPubkey : sellerNostrPubkey;
      const res = await fetch("/api/arbiter/rule", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.NEXT_PUBLIC_ARBITER_API_SECRET}`,
        },
        body: JSON.stringify({
          orderId,
          token,
          rulingFor: pendingRuling,
          winnerNostrPubkey,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error ?? "Ruling failed.");
      }
      onRuled(pendingRuling);
      setPendingRuling(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-2">
        <Button
          className={SHOPSTRBUTTONCLASSNAMES}
          onPress={() => setPendingRuling("buyer")}
        >
          Rule for Buyer
        </Button>
        <Button
          className={SHOPSTRBUTTONCLASSNAMES}
          onPress={() => setPendingRuling("seller")}
        >
          Rule for Seller
        </Button>
      </div>
      {error ? <div className="text-sm text-red-500">{error}</div> : null}
      <ConfirmationModal
        isOpen={pendingRuling !== null}
        title="Confirm Ruling"
        message={`Rule for the ${pendingRuling}? This will send the arbiter's signature for order "${orderId}" (reason: "${reason}") to the ${pendingRuling}'s Nostr identity and cannot be undone.`}
        confirmText="Confirm Ruling"
        isDangerous
        isLoading={isSubmitting}
        onConfirm={handleConfirmRuling}
        onCancel={() => {
          if (!isSubmitting) setPendingRuling(null);
        }}
      />
    </div>
  );
}
