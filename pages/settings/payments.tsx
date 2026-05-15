import { useContext, useEffect, useState } from "react";
import { useRouter } from "next/router";
import { Button, useDisclosure } from "@heroui/react";
import {
  CreditCardIcon,
  ArrowTopRightOnSquareIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
  PencilSquareIcon,
} from "@heroicons/react/24/outline";
import {
  BLUEBUTTONCLASSNAMES,
  WHITEBUTTONCLASSNAMES,
} from "@/utils/STATIC-VARIABLES";
import ProtectedRoute from "@/components/utility-components/protected-route";
import { SettingsBreadCrumbs } from "@/components/settings/settings-bread-crumbs";
import { SignerContext } from "@/components/utility-components/nostr-context-provider";
import {
  buildMcpRequestProofTemplate,
  buildStripeAccountStatusProof,
  buildStripeManageLinkProof,
} from "@/utils/mcp/request-proof";
import StripeConnectModal from "@/components/stripe-connect/StripeConnectModal";
import MilkMarketSpinner from "@/components/utility-components/mm-spinner";

interface AccountStatus {
  hasAccount: boolean;
  accountId?: string;
  onboardingComplete: boolean;
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
}

const PaymentsSettingsPage = () => {
  const router = useRouter();
  const { pubkey, signer } = useContext(SignerContext);
  const { isOpen, onOpen, onClose } = useDisclosure();

  const [status, setStatus] = useState<AccountStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<
    "dashboard" | "update" | null
  >(null);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const loadStatus = async () => {
    if (!pubkey || !signer?.sign) return;
    setLoading(true);
    setError(null);
    try {
      const signedEvent = await signer.sign(
        buildMcpRequestProofTemplate(buildStripeAccountStatusProof(pubkey))
      );
      const res = await fetch("/api/stripe/connect/account-status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pubkey, signedEvent }),
      });
      if (!res.ok) {
        throw new Error("Failed to load Stripe account status");
      }
      const data = (await res.json()) as AccountStatus;
      setStatus(data);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Failed to load Stripe account status"
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pubkey, signer]);

  useEffect(() => {
    if (router.query.stripe === "updated") {
      setInfo("Stripe details updated. Status refreshed.");
    } else if (router.query.stripe === "refresh") {
      setInfo("Stripe link expired. Please try again.");
    }
  }, [router.query.stripe]);

  const openManageLink = async (mode: "dashboard" | "update") => {
    if (!pubkey || !signer?.sign || !status?.accountId) return;
    setActionLoading(mode);
    setError(null);
    try {
      const signedEvent = await signer.sign(
        buildMcpRequestProofTemplate(
          buildStripeManageLinkProof({
            pubkey,
            accountId: status.accountId,
            mode,
          })
        )
      );
      const res = await fetch("/api/stripe/connect/manage-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pubkey,
          accountId: status.accountId,
          mode,
          signedEvent,
          returnPath: "/settings/payments?stripe=updated",
          refreshPath: "/settings/payments?stripe=refresh",
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data?.fallback === "update" && mode === "dashboard") {
          setError(
            data.error ||
              "Stripe dashboard isn't available yet. Use 'Update Account Info' to finish onboarding."
          );
        } else {
          throw new Error(data?.error || "Failed to open Stripe");
        }
        return;
      }
      window.open(data.url, "_blank", "noopener");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to open Stripe");
    } finally {
      setActionLoading(null);
    }
  };

  return (
    <ProtectedRoute>
      <div className="flex min-h-screen flex-col bg-white pt-24 pb-20">
        <div className="mx-auto w-full max-w-3xl px-4">
          <SettingsBreadCrumbs />
          <div className="mb-6 flex items-center gap-3">
            <CreditCardIcon className="text-primary-blue h-8 w-8" />
            <h1 className="text-3xl font-bold text-black">Payments</h1>
          </div>
          <p className="mb-6 text-sm text-gray-700">
            Manage your Stripe Connect account — payout schedules, bank
            accounts, business details, tax info, and verification — directly
            from your Stripe Express dashboard.
          </p>

          {loading ? (
            <MilkMarketSpinner />
          ) : (
            <div className="shadow-neo space-y-4 rounded-md border-2 border-black bg-white p-5">
              {!status?.hasAccount ? (
                <div className="space-y-4">
                  <div className="flex items-start gap-3">
                    <ExclamationTriangleIcon className="mt-0.5 h-6 w-6 flex-shrink-0 text-yellow-600" />
                    <div>
                      <p className="font-bold text-black">
                        No Stripe account connected
                      </p>
                      <p className="text-sm text-gray-700">
                        Connect Stripe to accept credit card payments and
                        receive payouts to your bank account.
                      </p>
                    </div>
                  </div>
                  <Button
                    className={BLUEBUTTONCLASSNAMES}
                    startContent={
                      <ArrowTopRightOnSquareIcon className="h-4 w-4" />
                    }
                    onClick={onOpen}
                  >
                    Set Up Stripe
                  </Button>
                </div>
              ) : (
                <div className="space-y-5">
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                    <StatusPill
                      label="Onboarding"
                      ok={status.onboardingComplete}
                    />
                    <StatusPill
                      label="Card payments"
                      ok={status.chargesEnabled}
                    />
                    <StatusPill label="Payouts" ok={status.payoutsEnabled} />
                  </div>

                  {!status.onboardingComplete && (
                    <div className="rounded-md border-2 border-yellow-500 bg-yellow-50 p-3 text-sm text-black">
                      Your Stripe onboarding isn&apos;t finished yet. Use
                      &quot;Update Account Info&quot; below to complete the
                      remaining steps. Once onboarding is complete, you&apos;ll
                      be able to open the full Stripe Express dashboard.
                    </div>
                  )}

                  <div className="space-y-3">
                    <div>
                      <p className="font-bold text-black">
                        Stripe Express Dashboard
                      </p>
                      <p className="text-sm text-gray-700">
                        Manage payouts, connected bank accounts, accepted
                        payment methods, business profile, tax forms, and view
                        your transaction history on Stripe.
                      </p>
                      <Button
                        className={`${BLUEBUTTONCLASSNAMES} mt-2`}
                        startContent={
                          <ArrowTopRightOnSquareIcon className="h-4 w-4" />
                        }
                        isLoading={actionLoading === "dashboard"}
                        isDisabled={!status.chargesEnabled}
                        onClick={() => openManageLink("dashboard")}
                      >
                        Open Stripe Dashboard
                      </Button>
                    </div>

                    <div>
                      <p className="font-bold text-black">
                        Update Account Info
                      </p>
                      <p className="text-sm text-gray-700">
                        Update verification details, business owners, address,
                        or any information Stripe is requesting. Use this if
                        Stripe has flagged your account for additional
                        information or you need to fix the data you originally
                        submitted.
                      </p>
                      <Button
                        className={`${WHITEBUTTONCLASSNAMES} mt-2`}
                        startContent={<PencilSquareIcon className="h-4 w-4" />}
                        isLoading={actionLoading === "update"}
                        onClick={() => openManageLink("update")}
                      >
                        Update Account Info
                      </Button>
                    </div>
                  </div>

                  <p className="text-xs text-gray-500">
                    Account ID:{" "}
                    <span className="font-mono">{status.accountId}</span>
                  </p>
                </div>
              )}

              {info && (
                <p className="text-sm font-medium text-green-700">{info}</p>
              )}
              {error && (
                <p className="text-sm font-medium text-red-600">{error}</p>
              )}
            </div>
          )}

          {pubkey && (
            <StripeConnectModal
              isOpen={isOpen}
              onClose={() => {
                onClose();
                loadStatus();
              }}
              pubkey={pubkey}
              returnPath="/settings/payments?stripe=updated"
              refreshPath="/settings/payments?stripe=refresh"
            />
          )}
        </div>
      </div>
    </ProtectedRoute>
  );
};

const StatusPill = ({ label, ok }: { label: string; ok: boolean }) => (
  <div
    className={`flex items-center gap-2 rounded-md border-2 border-black p-2 text-sm font-bold ${
      ok ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-700"
    }`}
  >
    {ok ? (
      <CheckCircleIcon className="h-5 w-5 text-green-700" />
    ) : (
      <ExclamationTriangleIcon className="h-5 w-5 text-gray-500" />
    )}
    <span>
      {label}: {ok ? "Active" : "Pending"}
    </span>
  </div>
);

export default PaymentsSettingsPage;
