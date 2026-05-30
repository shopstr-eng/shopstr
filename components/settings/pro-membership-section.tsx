import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/router";
import {
  Button,
  Card,
  CardBody,
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  Spinner,
} from "@heroui/react";
import {
  ArrowDownTrayIcon,
  ArrowTopRightOnSquareIcon,
  InformationCircleIcon,
} from "@heroicons/react/24/outline";
import {
  BLACKBUTTONCLASSNAMES,
  BLUEBUTTONCLASSNAMES,
  WHITEBUTTONCLASSNAMES,
} from "@/utils/STATIC-VARIABLES";
import { useProMembership } from "@/components/utility-components/pro-membership-context";
import ProBadge from "@/components/pro/pro-badge";
import FailureModal from "@/components/utility-components/failure-modal";
import SuccessModal from "@/components/utility-components/success-modal";
import type {
  MembershipView,
  ProBillingHistoryItem,
} from "@/utils/pro/constants";

function formatDate(iso: string | null): string | null {
  if (!iso) return null;
  const ms = new Date(iso).getTime();
  if (!Number.isFinite(ms)) return null;
  return new Date(ms).toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function planLabel(membership: MembershipView): string {
  if (membership.term === "yearly") return "Pro · Yearly";
  if (membership.term === "monthly") return "Pro · Monthly";
  return "Pro";
}

function formatMoney(amountCents: number, currency: string): string {
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: (currency || "usd").toUpperCase(),
    }).format(amountCents / 100);
  } catch {
    return `$${(amountCents / 100).toFixed(2)}`;
  }
}

function formatCoverage(
  start: string | null,
  end: string | null
): string | null {
  const s = start ? new Date(start).getTime() : NaN;
  const e = end ? new Date(end).getTime() : NaN;
  if (!Number.isFinite(s) || !Number.isFinite(e)) return null;
  const opts: Intl.DateTimeFormatOptions = {
    year: "numeric",
    month: "short",
    day: "numeric",
  };
  const startStr = new Date(s).toLocaleDateString(undefined, opts);
  const endStr = new Date(e).toLocaleDateString(undefined, opts);
  return `${startStr} – ${endStr}`;
}

function termLabel(term: ProBillingHistoryItem["term"]): string {
  if (term === "yearly") return "Yearly";
  if (term === "monthly") return "Monthly";
  return "—";
}

function methodLabel(method: ProBillingHistoryItem["method"]): string {
  if (method === "stripe") return "Card";
  if (method === "bitcoin") return "Bitcoin";
  if (method === "fiat") return "Manual (fiat)";
  return method;
}

function statusDescription(membership: MembershipView): string {
  const renewal = formatDate(membership.currentPeriodEnd);
  const trialEnd = formatDate(membership.trialEnd);
  const graceUntil = formatDate(membership.graceUntil);
  const readonlyUntil = formatDate(membership.readonlyUntil);

  if (membership.isTrialing) {
    return trialEnd
      ? `Your free trial is active until ${trialEnd}.`
      : "Your free trial is active.";
  }
  if (membership.status === "active") {
    if (membership.cancelAtPeriodEnd) {
      return renewal
        ? `Your membership is set to cancel and will end on ${renewal}.`
        : "Your membership is set to cancel at the end of the current period.";
    }
    return renewal
      ? `Your membership renews on ${renewal}.`
      : "Your membership is active.";
  }
  if (membership.status === "grace") {
    return graceUntil
      ? `Your last payment didn't go through. Pro features stay active until ${graceUntil} while we retry.`
      : "Your last payment didn't go through. Update billing to keep Pro features.";
  }
  if (membership.isReadOnly) {
    return readonlyUntil
      ? `Your Pro plan has lapsed. Your shop stays live but locked for editing until ${readonlyUntil}. Re-subscribe to restore Pro.`
      : "Your Pro plan has lapsed. Re-subscribe to restore Pro features.";
  }
  if (membership.isHidden) {
    return "Your Pro plan has lapsed and your Pro content is hidden. Re-subscribe to restore it.";
  }
  return "";
}

const ProMembershipSection = () => {
  const router = useRouter();
  const { membership, loading, cancel, fetchHistory } = useProMembership();

  const [showCancelModal, setShowCancelModal] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [successText, setSuccessText] = useState("");
  const [showFailureModal, setShowFailureModal] = useState(false);
  const [failureText, setFailureText] = useState("");

  const [history, setHistory] = useState<ProBillingHistoryItem[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState("");

  const loadHistory = useCallback(async () => {
    setHistoryLoading(true);
    setHistoryError("");
    try {
      const items = await fetchHistory();
      setHistory(items);
    } catch (error) {
      setHistoryError(
        error instanceof Error
          ? error.message
          : "Couldn't load your billing history."
      );
    } finally {
      setHistoryLoading(false);
    }
  }, [fetchHistory]);

  // Load past charges once the seller has (or had) a paid plan. Free sellers
  // who never subscribed have nothing to show.
  const hasBillingAccount = membership.status !== "free";
  useEffect(() => {
    if (hasBillingAccount) void loadHistory();
  }, [hasBillingAccount, loadHistory]);

  const handleCancel = async () => {
    setIsCancelling(true);
    try {
      await cancel();
      setShowCancelModal(false);
      setSuccessText(
        "Your membership has been canceled. You'll keep your Pro features until the end of the current billing period."
      );
      setShowSuccessModal(true);
    } catch (error) {
      setShowCancelModal(false);
      setFailureText(
        error instanceof Error
          ? error.message
          : "Failed to cancel your membership. Please try again."
      );
      setShowFailureModal(true);
    } finally {
      setIsCancelling(false);
    }
  };

  const renderBody = () => {
    if (loading) {
      return (
        <div className="flex items-center gap-2 text-gray-600">
          <Spinner size="sm" />
          <span className="text-sm">Loading your membership…</span>
        </div>
      );
    }

    // Non-Pro sellers (never subscribed) see an upgrade nudge.
    if (membership.status === "free") {
      return (
        <Card className="shadow-neo rounded-md border-2 border-black bg-white">
          <CardBody className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-base font-semibold text-black">
                You&apos;re on the Free plan
              </p>
              <p className="text-sm text-gray-600">
                Upgrade to Pro for advanced storefronts, custom domains, email
                flows, custom product pages, shipping, and the MCP API.
              </p>
            </div>
            <Button
              className={`${BLUEBUTTONCLASSNAMES} shrink-0`}
              onClick={() => router.push("/pro")}
            >
              Upgrade to Pro
            </Button>
          </CardBody>
        </Card>
      );
    }

    const description = statusDescription(membership);
    const canCancel =
      membership.isPro &&
      membership.billingMethod === "stripe" &&
      !membership.cancelAtPeriodEnd;
    const showResubscribe = membership.isReadOnly || membership.isHidden;

    return (
      <Card className="shadow-neo rounded-md border-2 border-black bg-white">
        <CardBody className="flex flex-col gap-4">
          <div className="flex items-center gap-3">
            <span className="text-lg font-bold text-black">
              {planLabel(membership)}
            </span>
            <ProBadge variant={membership.isTrialing ? "trial" : "active"} />
          </div>

          {description && (
            <p className="text-sm text-gray-700">{description}</p>
          )}

          {membership.billingMethod === "manual" && membership.isPro && (
            <div className="flex items-start gap-2 text-sm text-gray-600">
              <InformationCircleIcon className="mt-0.5 h-5 w-5 flex-shrink-0" />
              <p>
                Your membership is paid manually (Bitcoin or fiat). Renew from
                the Pro page before it expires to keep your features.
              </p>
            </div>
          )}

          <div className="flex flex-wrap gap-3">
            {canCancel && (
              <Button
                color="danger"
                variant="light"
                onClick={() => setShowCancelModal(true)}
              >
                Cancel membership
              </Button>
            )}
            {showResubscribe ? (
              <Button
                className={BLUEBUTTONCLASSNAMES}
                onClick={() => router.push("/pro")}
              >
                Re-subscribe
              </Button>
            ) : (
              <Button
                className={WHITEBUTTONCLASSNAMES}
                onClick={() => router.push("/pro")}
              >
                {membership.billingMethod === "manual"
                  ? "Renew membership"
                  : "View plans"}
              </Button>
            )}
          </div>
        </CardBody>
      </Card>
    );
  };

  const renderHistory = () => {
    if (!hasBillingAccount) return null;

    return (
      <div className="mt-6">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-lg font-bold text-black">Billing history</h3>
          {!historyLoading && (
            <Button
              size="sm"
              variant="light"
              onClick={() => void loadHistory()}
            >
              Refresh
            </Button>
          )}
        </div>

        <Card className="shadow-neo rounded-md border-2 border-black bg-white">
          <CardBody className="flex flex-col gap-3">
            {historyLoading ? (
              <div className="flex items-center gap-2 text-gray-600">
                <Spinner size="sm" />
                <span className="text-sm">Loading your charges…</span>
              </div>
            ) : historyError ? (
              <div className="flex flex-col gap-2">
                <p className="text-sm text-red-600">{historyError}</p>
                <Button
                  size="sm"
                  className={`${WHITEBUTTONCLASSNAMES} w-fit`}
                  onClick={() => void loadHistory()}
                >
                  Try again
                </Button>
              </div>
            ) : history.length === 0 ? (
              <p className="text-sm text-gray-600">
                No charges yet. Your trial doesn&apos;t include a payment —
                receipts will appear here after your first paid term.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b-2 border-black text-gray-700">
                      <th className="py-2 pr-4 font-semibold">Date</th>
                      <th className="py-2 pr-4 font-semibold">Covers</th>
                      <th className="py-2 pr-4 font-semibold">Amount</th>
                      <th className="py-2 pr-4 font-semibold">Term</th>
                      <th className="py-2 pr-4 font-semibold">Method</th>
                      <th className="py-2 font-semibold">Receipt</th>
                    </tr>
                  </thead>
                  <tbody>
                    {history.map((item) => (
                      <tr
                        key={`${item.source}-${item.id}`}
                        className="border-b border-gray-200 last:border-b-0"
                      >
                        <td className="py-2 pr-4 text-black">
                          {formatDate(item.paidAt) ?? "—"}
                        </td>
                        <td className="py-2 pr-4 whitespace-nowrap text-black">
                          {formatCoverage(
                            item.coverageStart,
                            item.coverageEnd
                          ) ?? "—"}
                        </td>
                        <td className="py-2 pr-4 text-black">
                          {formatMoney(item.amountCents, item.currency)}
                        </td>
                        <td className="py-2 pr-4 text-black">
                          {termLabel(item.term)}
                        </td>
                        <td className="py-2 pr-4 text-black">
                          {methodLabel(item.method)}
                        </td>
                        <td className="py-2">
                          {item.receiptUrl || item.invoicePdfUrl ? (
                            <div className="flex items-center gap-3">
                              {item.receiptUrl && (
                                <a
                                  href={item.receiptUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1 text-blue-600 hover:underline"
                                >
                                  <ArrowTopRightOnSquareIcon className="h-4 w-4" />
                                  View
                                </a>
                              )}
                              {item.invoicePdfUrl && (
                                <a
                                  href={item.invoicePdfUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1 text-blue-600 hover:underline"
                                >
                                  <ArrowDownTrayIcon className="h-4 w-4" />
                                  PDF
                                </a>
                              )}
                            </div>
                          ) : (
                            <span className="text-gray-500">—</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardBody>
        </Card>
      </div>
    );
  };

  return (
    <div className="mb-8">
      <h2 className="mb-4 text-2xl font-bold">Membership</h2>

      {renderBody()}

      {!loading && renderHistory()}

      {/* Cancel confirmation modal */}
      <Modal
        backdrop="blur"
        isOpen={showCancelModal}
        onClose={() => {
          if (!isCancelling) setShowCancelModal(false);
        }}
        classNames={{
          body: "py-6 bg-white",
          backdrop: "bg-black/50 backdrop-opacity-60",
          header: "border-b-3 border-black bg-white rounded-t-xl",
          footer: "border-t-3 border-black bg-white rounded-b-xl",
          base: "border-3 border-black rounded-xl",
          closeButton: "hover:bg-gray-100 active:bg-gray-200",
        }}
        scrollBehavior={"outside"}
        size="2xl"
      >
        <ModalContent>
          <ModalHeader className="flex flex-col gap-1 font-bold text-black">
            Cancel Pro membership?
          </ModalHeader>
          <ModalBody className="text-black">
            <p>
              Your Pro features will stay active until the end of your current
              billing period
              {formatDate(membership.currentPeriodEnd)
                ? ` (${formatDate(membership.currentPeriodEnd)})`
                : ""}
              . After that, your shop will revert to the Free plan. You can
              re-subscribe at any time.
            </p>
          </ModalBody>
          <ModalFooter>
            <Button
              className={WHITEBUTTONCLASSNAMES}
              onClick={() => setShowCancelModal(false)}
              isDisabled={isCancelling}
            >
              Keep membership
            </Button>
            <Button
              className={BLACKBUTTONCLASSNAMES}
              onClick={handleCancel}
              isLoading={isCancelling}
            >
              {isCancelling ? "Canceling…" : "Cancel membership"}
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      <SuccessModal
        bodyText={successText}
        isOpen={showSuccessModal}
        onClose={() => setShowSuccessModal(false)}
      />
      <FailureModal
        bodyText={failureText}
        isOpen={showFailureModal}
        onClose={() => setShowFailureModal(false)}
      />
    </div>
  );
};

export default ProMembershipSection;
