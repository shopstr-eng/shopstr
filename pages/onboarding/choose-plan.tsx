import { useState, useEffect } from "react";
import { useRouter } from "next/router";
import { Card, CardBody, Button, Image } from "@heroui/react";
import {
  ArrowLongRightIcon,
  CheckCircleIcon,
} from "@heroicons/react/24/outline";
import { BLUEBUTTONCLASSNAMES } from "@/utils/STATIC-VARIABLES";
import ProCheckout from "@/components/pro/pro-checkout";
import { FREE_FEATURES, PRO_FEATURES } from "@/components/pro/plan-features";

const OnboardingChoosePlan = () => {
  const router = useRouter();

  const migrate = router.query.migrate as string | undefined;
  const planParam = router.query.plan as string | undefined;
  const [selected, setSelected] = useState<"free" | "pro" | null>(null);

  // Honor a plan intent deep-linked from the landing page (e.g. "Go Pro").
  useEffect(() => {
    if (!router.isReady) return;
    if (planParam === "pro") setSelected("pro");
    else if (planParam === "free") setSelected("free");
  }, [router.isReady, planParam]);

  const buildQuery = (plan: "free" | "pro") => {
    const params = new URLSearchParams();
    params.set("type", "seller");
    params.set("plan", plan);
    if (migrate) params.set("migrate", migrate);
    return `?${params.toString()}`;
  };

  const continueWith = (plan: "free" | "pro") => {
    router.push(`/onboarding/market-profile${buildQuery(plan)}`);
  };

  return (
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
                Milk Market
              </h1>
            </div>
            <div className="mb-8 text-center">
              <h2 className="mb-3 text-2xl font-bold text-black">
                Step 3: Choose Your Plan
              </h2>
              <p className="font-medium text-black">
                Start free and upgrade anytime, or go Pro now to unlock
                everything from day one.
              </p>
            </div>

            <div className="mb-8 flex flex-col gap-4 md:flex-row">
              <button
                onClick={() => setSelected("free")}
                className={`flex flex-1 flex-col rounded-md border-4 border-black p-6 text-left transition-all ${
                  selected === "free"
                    ? "bg-primary-yellow shadow-neo -translate-y-1 transform"
                    : "bg-white hover:bg-gray-50"
                }`}
              >
                <h3 className="text-xl font-black text-black">Free</h3>
                <p className="mb-3">
                  <span className="text-3xl font-black text-black">$0</span>{" "}
                  <span className="text-sm font-medium text-zinc-700">
                    forever
                  </span>
                </p>
                <ul className="space-y-2">
                  {FREE_FEATURES.map((f) => (
                    <li
                      key={f}
                      className="flex items-start gap-2 text-sm text-black"
                    >
                      <CheckCircleIcon className="mt-0.5 h-4 w-4 shrink-0 text-green-600" />
                      {f}
                    </li>
                  ))}
                </ul>
              </button>

              <button
                onClick={() => setSelected("pro")}
                className={`flex flex-1 flex-col rounded-md border-4 border-black p-6 text-left transition-all ${
                  selected === "pro"
                    ? "bg-primary-yellow shadow-neo -translate-y-1 transform"
                    : "bg-white hover:bg-gray-50"
                }`}
              >
                <h3 className="text-xl font-black text-black">Pro</h3>
                <p className="mb-3">
                  <span className="text-3xl font-black text-black">$21</span>{" "}
                  <span className="text-sm font-medium text-zinc-700">
                    /mo · or $168/yr
                  </span>
                </p>
                <ul className="space-y-2">
                  {PRO_FEATURES.map((f) => (
                    <li
                      key={f}
                      className="flex items-start gap-2 text-sm text-black"
                    >
                      <CheckCircleIcon className="mt-0.5 h-4 w-4 shrink-0 text-green-600" />
                      {f}
                    </li>
                  ))}
                </ul>
              </button>
            </div>

            {selected === "pro" && (
              <div className="mb-6 rounded-md border-2 border-black bg-gray-50 p-6">
                <h3 className="mb-4 text-center text-lg font-bold text-black">
                  Set up your Pro membership
                </h3>
                <ProCheckout onComplete={() => continueWith("pro")} />
              </div>
            )}

            <div className="flex flex-col items-center gap-3">
              {selected !== "pro" && (
                <Button
                  className={BLUEBUTTONCLASSNAMES}
                  onClick={() => continueWith("free")}
                  isDisabled={!selected}
                >
                  Continue with Free{" "}
                  <ArrowLongRightIcon className="ml-1 h-5 w-5" />
                </Button>
              )}
              <button
                onClick={() => continueWith("free")}
                className="text-sm font-bold text-black underline hover:text-gray-700"
              >
                Skip for now &mdash; I&apos;ll decide later
              </button>
            </div>
          </CardBody>
        </Card>
      </div>
    </div>
  );
};

export default OnboardingChoosePlan;
