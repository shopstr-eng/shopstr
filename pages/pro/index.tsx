import { useState } from "react";
import { useRouter } from "next/router";
import { Card, CardBody, Button, Image } from "@heroui/react";
import {
  CheckCircleIcon,
  ArrowLongRightIcon,
  SparklesIcon,
} from "@heroicons/react/24/outline";
import { BLUEBUTTONCLASSNAMES } from "@/utils/STATIC-VARIABLES";
import ProtectedRoute from "@/components/utility-components/protected-route";
import ProCheckout from "@/components/pro/pro-checkout";
import { useProMembership } from "@/components/utility-components/pro-membership-context";
import { FREE_FEATURES, PRO_FEATURES } from "@/components/pro/plan-features";

const ProUpgradePage = () => {
  const router = useRouter();
  const { membership, loading, refresh } = useProMembership();
  const [completion, setCompletion] = useState<"paid" | "pending" | null>(null);

  const handleComplete = (status: "paid" | "pending") => {
    setCompletion(status);
    void refresh();
  };

  return (
    <ProtectedRoute>
      <div className="flex min-h-screen flex-col bg-white pt-24">
        <div className="mx-auto w-full max-w-3xl px-4 py-6">
          <Card className="shadow-neo rounded-md border-4 border-black bg-white">
            <CardBody className="p-8">
              <div className="mb-6 flex flex-row items-center justify-center gap-3">
                <Image
                  alt="Milk Market logo"
                  height={50}
                  radius="sm"
                  src="/milk-market.png"
                  width={50}
                />
                <h1 className="text-center text-3xl font-bold text-black">
                  Milk Market Pro
                </h1>
              </div>

              {loading ? (
                <div className="flex justify-center py-12">
                  <div className="h-10 w-10 animate-spin rounded-full border-4 border-gray-200 border-t-black" />
                </div>
              ) : completion ? (
                <div className="flex flex-col items-center justify-center rounded-md border-2 border-black bg-green-50 p-8 text-center">
                  <CheckCircleIcon className="mb-4 h-16 w-16 text-green-600" />
                  <h2 className="mb-2 text-2xl font-bold text-black">
                    {completion === "paid"
                      ? "Welcome to Pro!"
                      : "Invoice created"}
                  </h2>
                  <p className="mb-6 max-w-md text-sm font-medium text-black">
                    {completion === "paid"
                      ? "Your Pro features are now unlocked. Head to your stall to start customizing."
                      : "We'll activate Pro as soon as your payment is confirmed. You can keep using your stall in the meantime."}
                  </p>
                  <Button
                    className={BLUEBUTTONCLASSNAMES}
                    onClick={() => router.push("/settings/stall")}
                  >
                    Go to my stall{" "}
                    <ArrowLongRightIcon className="ml-1 h-5 w-5" />
                  </Button>
                </div>
              ) : membership.isPro ? (
                <div className="bg-primary-yellow flex flex-col items-center justify-center rounded-md border-2 border-black p-8 text-center">
                  <SparklesIcon className="mb-4 h-16 w-16 text-black" />
                  <h2 className="mb-2 text-2xl font-bold text-black">
                    You&apos;re a Pro member
                  </h2>
                  <p className="mb-6 max-w-md text-sm font-medium text-black">
                    All Pro features are unlocked. Manage your membership and
                    billing from your account settings.
                  </p>
                  <div className="flex flex-wrap justify-center gap-3">
                    <Button
                      className={BLUEBUTTONCLASSNAMES}
                      onClick={() => router.push("/settings/stall")}
                    >
                      Customize my stall
                    </Button>
                    <Button
                      className="shadow-neo rounded-md border-2 border-black bg-white font-bold text-black"
                      onClick={() => router.push("/settings/account")}
                    >
                      Manage membership
                    </Button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="mb-8 text-center">
                    <h2 className="mb-3 text-2xl font-bold text-black">
                      {membership.isReadOnly || membership.isHidden
                        ? "Re-subscribe to restore Pro"
                        : "Upgrade to unlock everything"}
                    </h2>
                    <p className="font-medium text-black">
                      Advanced storefronts, custom domains, email flows, custom
                      product pages, Shippo shipping (coming soon), and the MCP
                      API.
                    </p>
                  </div>

                  <div className="mb-8 grid gap-4 md:grid-cols-2">
                    <PlanCard
                      title="Free"
                      price="$0"
                      cadence="forever"
                      features={FREE_FEATURES}
                      muted
                    />
                    <PlanCard
                      title="Pro"
                      price="$21"
                      cadence="/mo · or $168/yr"
                      features={PRO_FEATURES}
                    />
                  </div>

                  <ProCheckout onComplete={handleComplete} />
                </>
              )}
            </CardBody>
          </Card>
        </div>
      </div>
    </ProtectedRoute>
  );
};

function PlanCard({
  title,
  price,
  cadence,
  features,
  muted,
}: {
  title: string;
  price: string;
  cadence: string;
  features: string[];
  muted?: boolean;
}) {
  return (
    <div
      className={`shadow-neo rounded-md border-2 border-black p-5 ${
        muted ? "bg-white" : "bg-primary-yellow"
      }`}
    >
      <h3 className="text-lg font-black text-black">{title}</h3>
      <p className="mb-3">
        <span className="text-3xl font-black text-black">{price}</span>{" "}
        <span className="text-sm font-medium text-zinc-700">{cadence}</span>
      </p>
      <ul className="space-y-2">
        {features.map((f) => (
          <li key={f} className="flex items-start gap-2 text-sm text-black">
            <CheckCircleIcon className="mt-0.5 h-4 w-4 shrink-0 text-green-600" />
            {f}
          </li>
        ))}
      </ul>
    </div>
  );
}

export default ProUpgradePage;
