import { useContext, useEffect, useState } from "react";
import {
  NostrContext,
  SignerContext,
} from "@/components/utility-components/nostr-context-provider";
import { ChatsContext } from "@/utils/context/context";
import {
  getPendingSellerLightningPayouts,
  PendingSellerLightningPayout,
} from "@/utils/payments/pending-lightning-payouts";
import {
  PendingPayoutResolution,
  resolvePendingSellerLightningPayout,
} from "@/utils/payments/resolve-pending-payouts";
import { notifySellerOfCompletedPayout } from "@/utils/payments/seller-payout-notification";
import { sendBuyerOrderReceipt } from "@/utils/payments/buyer-receipt-notification";
import { buildLegacyPayoutExportToken } from "@/utils/payments/legacy-payout-export";
import { removePendingSellerLightningPayout } from "@/utils/payments/pending-lightning-payouts";

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
  const chatsContext = useContext(ChatsContext);
  const [records, setRecords] = useState<PendingSellerLightningPayout[]>([]);
  const [resolvingId, setResolvingId] = useState<string | null>(null);
  const [rowMessages, setRowMessages] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState<string | null>(null);
  const [exportTokens, setExportTokens] = useState<Record<string, string>>({});
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const refreshRecords = () => {
    setRecords(
      getPendingSellerLightningPayouts().filter(
        (record) => !record.buyerPubkey || record.buyerPubkey === pubkey
      )
    );
  };

  useEffect(() => {
    // Records bound to a buyer pubkey belong to that account only. Records
    // without one predate account binding; they are shown with an export
    // path instead of resolution.
    refreshRecords();
  }, [pubkey]);

  // Keep the completion notice visible even when the resolution just
  // cleared the last record — otherwise the buyer never sees the outcome
  // (including a receipt failure) for the payout they just resolved.
  if (records.length === 0 && !notice) return null;

  const describeResolution = (result: PendingPayoutResolution): string => {
    switch (result.status) {
      case "completed":
        return result.receiptError
          ? `Payout completed — the mint paid the seller's Lightning invoice, and the seller has been notified. Your order receipt could not be sent: ${result.receiptError}`
          : "Payout completed — the mint paid the seller's Lightning invoice, and the seller has been notified. Your order receipt is in your messages.";
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
        pubkey,
        {
          notifySeller: (resolvedRecord) =>
            notifySellerOfCompletedPayout({
              nostr,
              signer,
              record: resolvedRecord,
              buyerPubkey: pubkey,
            }),
          notifyBuyer: async (resolvedRecord) => {
            const receiptEvent = await sendBuyerOrderReceipt({
              nostr,
              signer,
              record: resolvedRecord,
              buyerPubkey: pubkey,
            });
            // Mirror the checkout receipt path: the buyer's own receipt is
            // added to their local chat history, not just published.
            chatsContext.addNewlyCreatedMessageEvent(
              { ...receiptEvent, sig: "", read: false },
              true
            );
          },
        }
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
      refreshRecords();
    }
  };

  // Legacy (unbound) records cannot be resolved to any account, but their
  // proofs already live in this browser's storage — exporting them as a
  // Cashu token reveals nothing the browser doesn't already hold and lets
  // the buyer redeem the funds in any Cashu wallet supporting the mint.
  const handleExport = (record: PendingSellerLightningPayout) => {
    try {
      const token = buildLegacyPayoutExportToken(record);
      setExportTokens((prev) => ({ ...prev, [record.meltQuoteId]: token }));
      setRowMessages((prev) => {
        const next = { ...prev };
        delete next[record.meltQuoteId];
        return next;
      });
    } catch (error) {
      setRowMessages((prev) => ({
        ...prev,
        [record.meltQuoteId]:
          error instanceof Error ? error.message : String(error),
      }));
    }
  };

  const handleCopyToken = async (record: PendingSellerLightningPayout) => {
    const token = exportTokens[record.meltQuoteId];
    if (!token) return;
    try {
      await navigator.clipboard.writeText(token);
      setCopiedId(record.meltQuoteId);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      setRowMessages((prev) => ({
        ...prev,
        [record.meltQuoteId]:
          "Could not copy automatically — select the token text and copy it manually.",
      }));
    }
  };

  const handleRemoveRecord = (record: PendingSellerLightningPayout) => {
    const confirmed = window.confirm(
      "Remove this record? Its payout proofs will be permanently deleted from this browser. Only continue after you have redeemed the exported token in another Cashu wallet."
    );
    if (!confirmed) return;
    removePendingSellerLightningPayout(record.meltQuoteId);
    setExportTokens((prev) => {
      const next = { ...prev };
      delete next[record.meltQuoteId];
      return next;
    });
    refreshRecords();
  };

  return (
    <div className="mb-8 rounded-lg bg-white p-6 shadow-md dark:bg-gray-800">
      {records.length > 0 && (
        <>
          <h2 className="text-light-text dark:text-dark-text mb-1 text-lg font-semibold">
            Pending seller payouts
          </h2>
          <p className="mb-4 text-sm text-gray-500 dark:text-gray-400">
            These Lightning payouts did not finish during checkout. Check with
            the mint to either confirm payment or recover the funds.
          </p>
        </>
      )}
      {notice && (
        <p
          className={`rounded-md bg-green-50 p-3 text-sm text-green-800 dark:bg-green-900/30 dark:text-green-200 ${
            records.length > 0 ? "mb-4" : ""
          }`}
        >
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
              {record.buyerPubkey ? (
                <button
                  type="button"
                  disabled={resolvingId !== null}
                  onClick={() => handleResolve(record)}
                  className="bg-shopstr-purple dark:bg-shopstr-yellow rounded-md px-3 py-2 text-sm font-medium text-white disabled:opacity-50 dark:text-black"
                >
                  {resolvingId === record.meltQuoteId
                    ? "Checking…"
                    : "Check & recover"}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => handleExport(record)}
                  className="border-shopstr-purple text-shopstr-purple dark:border-shopstr-yellow dark:text-shopstr-yellow rounded-md border px-3 py-2 text-sm font-medium"
                >
                  Export proofs
                </button>
              )}
            </div>
            {!record.buyerPubkey && (
              <div className="mt-2">
                <p className="text-xs text-amber-600 dark:text-amber-400">
                  Recorded before payouts were bound to an account, so it cannot
                  be recovered into this wallet. Export the proofs as a Cashu
                  token and redeem them in any Cashu wallet that supports{" "}
                  {mintHost(record.mintUrl)} (proofs already in this wallet are
                  left out).
                </p>
                {exportTokens[record.meltQuoteId] && (
                  <div className="mt-2 rounded-md border border-gray-200 p-3 dark:border-gray-700">
                    <textarea
                      readOnly
                      rows={3}
                      value={exportTokens[record.meltQuoteId]}
                      onFocus={(event) => event.currentTarget.select()}
                      className="text-light-text dark:text-dark-text w-full resize-none rounded-md border border-gray-300 bg-gray-50 p-2 font-mono text-xs break-all dark:border-gray-600 dark:bg-gray-900"
                    />
                    <div className="mt-2 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => handleCopyToken(record)}
                        className="bg-shopstr-purple dark:bg-shopstr-yellow rounded-md px-3 py-1.5 text-xs font-medium text-white dark:text-black"
                      >
                        {copiedId === record.meltQuoteId
                          ? "Copied!"
                          : "Copy token"}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleRemoveRecord(record)}
                        className="rounded-md border border-red-300 px-3 py-1.5 text-xs font-medium text-red-600 dark:border-red-700 dark:text-red-400"
                      >
                        Remove record
                      </button>
                    </div>
                  </div>
                )}
              </div>
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
