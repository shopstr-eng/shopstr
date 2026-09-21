import { useContext, useEffect, useState } from "react";
import {
  NostrContext,
  SignerContext,
} from "@/components/utility-components/nostr-context-provider";
import {
  getPendingSellerLightningPayouts,
  PendingSellerLightningPayout,
} from "@/utils/payments/pending-lightning-payouts";
import {
  PendingPayoutResolution,
  resolvePendingSellerLightningPayout,
} from "@/utils/payments/resolve-pending-payouts";

function formatAge(timestamp: number): string {
  const minutes = Math.max(1, Math.floor((Date.now() - timestamp) / 60_000));
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function mintHost(mintUrl: string): string {
  try {
    return new URL(mintUrl).host;
  } catch {
    return mintUrl;
  }
}

const PendingPayouts = () => {
  const { nostr } = useContext(NostrContext);
  const { signer, pubkey } = useContext(SignerContext);
  const [records, setRecords] = useState<PendingSellerLightningPayout[]>([]);
  const [resolvingId, setResolvingId] = useState<string | null>(null);
  const [rowMessages, setRowMessages] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    // Records bound to a buyer pubkey belong to that account only. Records
    // without one predate account binding; they are shown with a warning.
    setRecords(
      getPendingSellerLightningPayouts().filter(
        (record) => !record.buyerPubkey || record.buyerPubkey === pubkey
      )
    );
  }, [pubkey]);

  if (records.length === 0) return null;

  const describeResolution = (result: PendingPayoutResolution): string => {
    switch (result.status) {
      case "completed":
        return "Payout completed — the mint paid the seller's Lightning invoice.";
      case "recovered":
        return `Recovered ${result.recoveredAmount} sats back to your wallet.`;
      case "not-owner":
        return "This payout belongs to a different account.";
      default:
        return result.reason;
    }
  };

  const handleResolve = async (record: PendingSellerLightningPayout) => {
    if (!nostr || !signer || !pubkey) {
      setRowMessages((prev) => ({
        ...prev,
        [record.meltQuoteId]: "Sign in to check or recover this payout.",
      }));
      return;
    }
    setResolvingId(record.meltQuoteId);
    setNotice(null);
    try {
      const result = await resolvePendingSellerLightningPayout(
        record,
        nostr,
        signer,
        pubkey
      );
      const message = describeResolution(result);
      if (result.status === "completed" || result.status === "recovered") {
        setNotice(message);
        setRowMessages((prev) => {
          const next = { ...prev };
          delete next[record.meltQuoteId];
          return next;
        });
      } else {
        setRowMessages((prev) => ({
          ...prev,
          [record.meltQuoteId]: message,
        }));
      }
    } catch (error) {
      setRowMessages((prev) => ({
        ...prev,
        [record.meltQuoteId]:
          error instanceof Error ? error.message : String(error),
      }));
    } finally {
      setResolvingId(null);
      setRecords(
        getPendingSellerLightningPayouts().filter(
          (record) => !record.buyerPubkey || record.buyerPubkey === pubkey
        )
      );
    }
  };

  return (
    <div className="mb-8 rounded-lg bg-white p-6 shadow-md dark:bg-gray-800">
      <h2 className="text-light-text dark:text-dark-text mb-1 text-lg font-semibold">
        Pending seller payouts
      </h2>
      <p className="mb-4 text-sm text-gray-500 dark:text-gray-400">
        These Lightning payouts did not finish during checkout. Check with the
        mint to either confirm payment or recover the funds.
      </p>
      {notice && (
        <p className="mb-4 rounded-md bg-green-50 p-3 text-sm text-green-800 dark:bg-green-900/30 dark:text-green-200">
          {notice}
        </p>
      )}
      <ul className="space-y-4">
        {records.map((record) => (
          <li
            key={record.meltQuoteId}
            className="rounded-md border border-gray-200 p-4 dark:border-gray-700"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="text-light-text dark:text-dark-text truncate text-sm font-medium">
                  Order {record.orderId} · {record.sellerAmount} sats ·{" "}
                  {mintHost(record.mintUrl)}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {record.status} · {formatAge(record.updatedAt)}
                </p>
              </div>
              {record.buyerPubkey && (
                <button
                  type="button"
                  disabled={resolvingId !== null}
                  onClick={() => handleResolve(record)}
                  className="rounded-md bg-shopstr-purple px-3 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-shopstr-yellow dark:text-black"
                >
                  {resolvingId === record.meltQuoteId
                    ? "Checking…"
                    : "Check & recover"}
                </button>
              )}
            </div>
            {!record.buyerPubkey && (
              <p className="mt-2 text-xs text-amber-600 dark:text-amber-400">
                Recorded before payouts were bound to an account, so it cannot
                be recovered here — any signed-in account could otherwise claim
                the funds. The proofs remain in this browser's storage for
                manual recovery.
              </p>
            )}
            {rowMessages[record.meltQuoteId] && (
              <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">
                {rowMessages[record.meltQuoteId]}
              </p>
            )}
            {!rowMessages[record.meltQuoteId] && record.errorMessage && (
              <p className="mt-2 truncate text-xs text-gray-400 dark:text-gray-500">
                {record.errorMessage}
              </p>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
};

export default PendingPayouts;
