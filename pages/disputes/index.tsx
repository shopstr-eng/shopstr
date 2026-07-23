import { useContext, useEffect, useState } from "react";
import { useRouter } from "next/router";
import { Card, CardBody, CardHeader, Divider, Spinner } from "@heroui/react";
import ProtectedRoute from "@/components/utility-components/protected-route";
import {
  NostrContext,
  SignerContext,
} from "@/components/utility-components/nostr-context-provider";
import {
  fetchDisputeEvents,
  parseDisputeEvent,
  ParsedDisputeEvent,
} from "@/utils/nostr/dispute-records";
import {
  findIncomingEscrowPayload,
  EscrowDisputePayload,
} from "@/utils/cashu/dispute-redemption";
import { formatWithCommas } from "@/components/utility-components/display-monetary-info";
import ArbiterControls from "@/components/dispute/arbiter-controls";

interface DisputeRow extends ParsedDisputeEvent {
  token?: string;
  amount?: number;
}

function DisputesDashboard() {
  const {
    signer,
    pubkey: userPubkey,
    isAuthStateResolved,
  } = useContext(SignerContext);
  const { nostr } = useContext(NostrContext);
  const router = useRouter();

  const arbiterPubkey = process.env.NEXT_PUBLIC_ARBITER_NOSTR_PUBKEY;
  const isArbiter = !!arbiterPubkey && userPubkey === arbiterPubkey;

  const [disputes, setDisputes] = useState<DisputeRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!isAuthStateResolved) return;
    if (!isArbiter) {
      router.replace("/");
    }
  }, [isAuthStateResolved, isArbiter, router]);

  useEffect(() => {
    if (!isArbiter || !nostr || !signer || !arbiterPubkey || !userPubkey) {
      return;
    }

    let cancelled = false;

    const load = async () => {
      setIsLoading(true);
      const events = await fetchDisputeEvents({ nostr, arbiterPubkey });
      const parsed = events
        .map(parseDisputeEvent)
        .filter((d): d is ParsedDisputeEvent => d !== null);

      const enriched = await Promise.all(
        parsed.map(async (dispute) => {
          const dm = await findIncomingEscrowPayload<EscrowDisputePayload>(
            nostr,
            signer,
            userPubkey,
            dispute.orderId,
            "escrow-dispute",
            {
              expectedSenderPubkeys: [
                dispute.buyerPubkey,
                dispute.sellerPubkey,
              ],
            }
          );
          return { ...dispute, token: dm?.token, amount: dm?.amount };
        })
      );

      if (!cancelled) {
        setDisputes(enriched);
        setIsLoading(false);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [isArbiter, nostr, signer, arbiterPubkey, userPubkey]);

  const handleRuled = (orderId: string) => {
    setDisputes((prev) => prev.filter((d) => d.orderId !== orderId));
  };

  if (!isAuthStateResolved || !isArbiter) {
    return <div className="bg-light-bg dark:bg-dark-bg min-h-screen" />;
  }

  return (
    <div className="bg-light-bg dark:bg-dark-bg text-light-text dark:text-dark-text min-h-screen px-4 py-8">
      <h1 className="mb-6 text-2xl font-bold">Open Disputes</h1>
      {isLoading ? (
        <Spinner size="lg" />
      ) : disputes.length === 0 ? (
        <div>No open disputes.</div>
      ) : (
        <div className="flex flex-col gap-4">
          {disputes.map((dispute) => (
            <Card key={dispute.orderId}>
              <CardHeader className="flex flex-col items-start gap-1">
                <div className="font-semibold">Order: {dispute.orderId}</div>
                {dispute.amount !== undefined ? (
                  <div className="text-sm">
                    Amount: {formatWithCommas(dispute.amount, "sats")}
                  </div>
                ) : null}
              </CardHeader>
              <Divider />
              <CardBody className="flex flex-col gap-2">
                <div>
                  <span className="font-semibold">Reason: </span>
                  {dispute.reason}
                </div>
                <div className="text-sm break-all">
                  <span className="font-semibold">Buyer: </span>
                  {dispute.buyerPubkey}
                </div>
                <div className="text-sm break-all">
                  <span className="font-semibold">Seller: </span>
                  {dispute.sellerPubkey}
                </div>
                {dispute.token ? (
                  <ArbiterControls
                    orderId={dispute.orderId}
                    token={dispute.token}
                    buyerNostrPubkey={dispute.buyerPubkey}
                    sellerNostrPubkey={dispute.sellerPubkey}
                    reason={dispute.reason}
                    onRuled={() => handleRuled(dispute.orderId)}
                  />
                ) : (
                  <div className="text-sm text-gray-500 italic">
                    Awaiting order details from buyer...
                  </div>
                )}
              </CardBody>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

export default function DisputesPage() {
  return (
    <ProtectedRoute>
      <DisputesDashboard />
    </ProtectedRoute>
  );
}
