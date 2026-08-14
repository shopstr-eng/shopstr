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
import HodlArbiterControls from "@/components/dispute/hodl-arbiter-controls";
import {
  fetchHodlDisputeEvents,
  HodlRelayUnavailableError,
  type ParsedHodlDisputeEvent,
} from "@/utils/nostr/hodl-escrow-records";

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

  const [hodlDisputes, setHodlDisputes] = useState<ParsedHodlDisputeEvent[]>(
    []
  );
  const [isLoadingHodl, setIsLoadingHodl] = useState(true);
  const [hodlLoadError, setHodlLoadError] = useState<string | null>(null);

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

  useEffect(() => {
    if (!isArbiter || !nostr || !arbiterPubkey) {
      return;
    }

    let cancelled = false;

    const load = async () => {
      setIsLoadingHodl(true);
      try {
        const parsed = await fetchHodlDisputeEvents({ nostr, arbiterPubkey });
        if (cancelled) return;
        setHodlDisputes(parsed);
        setHodlLoadError(null);
      } catch (error) {
        if (cancelled) return;
        // An empty list means relays answered and held nothing; only an
        // unreachable relay is worth showing, because otherwise "no disputes"
        // and "we could not look" render identically.
        setHodlLoadError(
          error instanceof HodlRelayUnavailableError
            ? "Could not reach relays to load Lightning escrow disputes."
            : error instanceof Error
              ? error.message
              : String(error)
        );
        setHodlDisputes([]);
      } finally {
        if (!cancelled) setIsLoadingHodl(false);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [isArbiter, nostr, arbiterPubkey]);

  const handleRuled = (orderId: string) => {
    setDisputes((prev) => prev.filter((d) => d.orderId !== orderId));
  };

  const handleHodlResolved = (orderId: string) => {
    setHodlDisputes((prev) => prev.filter((d) => d.orderId !== orderId));
  };

  if (!isAuthStateResolved || !isArbiter) {
    return <div className="bg-light-bg dark:bg-dark-bg min-h-screen" />;
  }

  return (
    <div className="bg-light-bg dark:bg-dark-bg text-light-text dark:text-dark-text min-h-screen px-4 py-8">
      <h1 className="mb-2 text-2xl font-bold">Cashu Escrow Disputes</h1>
      <p className="mb-6 text-sm text-gray-500">
        2-of-3 P2PK escrow. Ruling here sends your signature share to the
        winning party.
      </p>
      {isLoading ? (
        <Spinner size="lg" />
      ) : disputes.length === 0 ? (
        <div>No open disputes.</div>
      ) : (
        <div className="flex flex-col gap-4">
          {disputes.map((dispute) => (
            <Card key={dispute.orderId}>
              <CardHeader className="flex flex-col items-start gap-1">
                {/* Disputes are keyed by H(escrow token), not the invoice
                    order id, so this identifier is intentionally a hash. */}
                <div className="font-semibold">
                  Escrow ID: {dispute.orderId}
                </div>
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

      <Divider className="my-10" />

      <h1 className="mb-2 text-2xl font-bold">Lightning Escrow Disputes</h1>
      <p className="mb-6 text-sm text-gray-500">
        Hold-invoice escrow. Ruling here settles or cancels the invoice
        directly, moving the sats immediately. Anyone can publish a dispute
        naming this arbiter, so treat each row as a claim — the server rejects
        rulings on orders these keys are not party to.
      </p>
      {isLoadingHodl ? (
        <Spinner size="lg" />
      ) : hodlLoadError ? (
        <div className="text-sm text-red-500">{hodlLoadError}</div>
      ) : hodlDisputes.length === 0 ? (
        <div>No open Lightning escrow disputes.</div>
      ) : (
        <div className="flex flex-col gap-4">
          {hodlDisputes.map((dispute) => (
            <Card key={dispute.orderId}>
              <CardHeader className="flex flex-col items-start gap-1">
                {/* The d tag is the hold invoice's payment hash — the same
                    identifier the buyer and seller see on their order. */}
                <div className="font-semibold break-all">
                  Payment hash: {dispute.orderId}
                </div>
                <div className="text-sm text-gray-500">
                  Raised {new Date(dispute.createdAt * 1000).toLocaleString()}
                </div>
              </CardHeader>
              <Divider />
              <CardBody className="flex flex-col gap-2">
                <div>
                  <span className="font-semibold">Reason: </span>
                  {dispute.description || "(none given)"}
                </div>
                {/* Deliberately labelled "raised by" and not "buyer"/"seller":
                    kind 30410 carries no role, and the event author is only a
                    claim until the server checks it against the order row. */}
                <div className="text-sm break-all">
                  <span className="font-semibold">Raised by: </span>
                  {dispute.authorPubkey}
                </div>
                <HodlArbiterControls
                  paymentHash={dispute.orderId}
                  description={dispute.description}
                  onResolved={() => handleHodlResolved(dispute.orderId)}
                />
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
