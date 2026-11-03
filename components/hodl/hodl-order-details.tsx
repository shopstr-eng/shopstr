import { useContext, useEffect, useState } from "react";
import QRCode from "qrcode";
import { Button } from "@heroui/react";
import { SignerContext } from "@/components/utility-components/nostr-context-provider";
import {
  getHodlOrder,
  reconcileHodlPayout,
} from "@/utils/lightning/hodl-order-client";
import type { StoredHodlOrder } from "@/utils/db/hodl-order-store";

/** Private durable order data: usable after a reload or a missing order message. */
export default function HodlOrderDetails({
  paymentHash,
  showParties = false,
}: {
  paymentHash: string;
  showParties?: boolean;
}) {
  const { signer, pubkey } = useContext(SignerContext);
  const [order, setOrder] = useState<StoredHodlOrder | null>(null);
  const [owner, setOwner] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [qr, setQr] = useState("");
  const [pay, setPay] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    setOrder(null);
    const refresh = async () => {
      try {
        if (!signer) return;
        const next = await getHodlOrder(signer, paymentHash);
        if (!stopped) {
          setOrder(next);
          setOwner(pubkey ?? null);
          setError("");
        }
      } catch {
        if (!stopped)
          setError("Order details could not be refreshed. Retrying shortly.");
      } finally {
        if (!stopped) timer = setTimeout(refresh, 30000);
      }
    };
    void refresh();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [signer, paymentHash, pubkey]);
  useEffect(() => {
    let stopped = false;
    setQr("");
    if (pay && order?.invoice)
      void QRCode.toDataURL(order.invoice)
        .then((url) => {
          if (!stopped) setQr(url);
        })
        .catch(() => setError("Could not generate payment QR code"));
    return () => {
      stopped = true;
    };
  }, [pay, order?.invoice]);
  if (!order || owner !== pubkey)
    return error ? (
      <p role="status" className="text-sm text-red-500">
        {error}
      </p>
    ) : null;
  const remaining =
    order.holdExpiryHeight != null && order.observedBlockHeight != null
      ? order.holdExpiryHeight - order.observedBlockHeight
      : null;
  const expired =
    order.status === "open" &&
    Boolean(order.expiresAt && order.expiresAt * 1000 <= Date.now());
  return (
    <div className="flex max-w-lg flex-col gap-2 text-sm">
      {showParties && (
        <>
          <p>
            {order.details?.productTitle} · {order.amountSats} sats · quantity{" "}
            {order.details?.quantity ?? 1}
          </p>
          <p className="break-all">
            Buyer: {order.buyerPubkey}
            <br />
            Seller: {order.sellerPubkey}
          </p>
          <p>
            Escrow: {order.status} · Payout:{" "}
            {order.payoutStatus ?? "not released"}
          </p>
        </>
      )}
      {order.fulfillmentUpdates?.tracking && (
        <p>
          Shipped via {order.fulfillmentUpdates.carrier}:{" "}
          {order.fulfillmentUpdates.tracking}
        </p>
      )}
      {showParties && (
        <p className="whitespace-pre-wrap">
          {order.fulfillmentUpdates?.address ??
            order.details?.fulfillment?.address ??
            order.details?.fulfillment?.contact}
        </p>
      )}
      {order.status === "accepted" && (
        <div
          className={
            remaining === null || remaining <= 18
              ? "text-red-600"
              : "text-amber-700 dark:text-amber-400"
          }
        >
          <p>
            {remaining === null
              ? "Hold deadline unavailable. Do not hand over goods until it is verified."
              : `Lightning hold expires at block ${order.holdExpiryHeight}; ${Math.max(0, remaining)} blocks remain as of the last refresh. Resolve at least 18 blocks before expiry. Block timing varies.`}
          </p>
          {remaining !== null && remaining <= 18 && (
            <p>
              Expiry is close. Do not ship or hand over goods; unpaid settlement
              can no longer be relied on.
            </p>
          )}
          {order.acceptedAt && (
            <p>
              Seller dispute eligible after{" "}
              {new Date((order.acceptedAt + 14400) * 1000).toLocaleString()}.
            </p>
          )}
        </div>
      )}
      {order.status === "cancelled" && (
        <p>
          {order.acceptedAt
            ? "The held payment was cancelled; funds return through the payer’s wallet."
            : "Invoice expired or was cancelled without a completed held payment."}
        </p>
      )}
      {order.status === "open" && (
        <>
          <p>
            {expired
              ? "Invoice expired. Return to checkout to start a new order."
              : `Pay before ${new Date((order.expiresAt ?? 0) * 1000).toLocaleString()}.`}
          </p>
          {!expired && order.invoice && (
            <Button size="sm" onPress={() => setPay(!pay)}>
              {pay ? "Hide invoice" : "Resume payment"}
            </Button>
          )}
          {pay && !expired && order.invoice && (
            <div className="flex flex-col gap-2">
              {qr && (
                <img
                  src={qr}
                  width={220}
                  height={220}
                  alt="Escrow invoice QR code"
                />
              )}
              <textarea
                aria-label="Lightning escrow invoice"
                readOnly
                value={order.invoice}
                className="w-full bg-transparent break-all"
              />
              <a href={`lightning:${order.invoice}`}>Open Lightning wallet</a>
              <Button
                size="sm"
                onPress={() => {
                  void navigator.clipboard
                    .writeText(order.invoice!)
                    .catch(() =>
                      setError("Copy the invoice from the field above.")
                    );
                }}
              >
                Copy invoice
              </Button>
            </div>
          )}
        </>
      )}
      {order.status === "settled" &&
        order.payoutStatus !== "paid" &&
        pubkey !== order.buyerPubkey && (
          <>
            <p>
              {order.payoutStatus === "abandoned"
                ? "Payout needs operator review. Do not pay this seller manually until the recorded Lightning payment has been reconciled."
                : "Seller payout is pending. Automatic recovery will retry safely."}
            </p>
            <Button
              size="sm"
              isLoading={busy}
              onPress={async () => {
                if (!signer) return;
                setBusy(true);
                try {
                  await reconcileHodlPayout(signer, paymentHash);
                  setOrder(await getHodlOrder(signer, paymentHash));
                  setError("");
                } catch {
                  setError(
                    "Payout could not be reconciled. Give support the order payment hash."
                  );
                } finally {
                  setBusy(false);
                }
              }}
            >
              Check seller payout
            </Button>
            <p className="break-all">Support reference: {paymentHash}</p>
          </>
        )}
      {error && (
        <p role="status" className="text-red-500">
          {error}
        </p>
      )}
    </div>
  );
}
