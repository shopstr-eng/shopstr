import { useState, useEffect, useContext } from "react";
import { useRouter } from "next/router";
import { Card, CardBody, Button, Image, Spinner } from "@nextui-org/react";
import {
  ArrowLeftEndOnRectangleIcon,
  CreditCardIcon,
  ArrowTopRightOnSquareIcon,
  CheckCircleIcon,
} from "@heroicons/react/24/outline";
import {
  BLUEBUTTONCLASSNAMES,
  WHITEBUTTONCLASSNAMES,
} from "@/utils/STATIC-VARIABLES";
import { SignerContext } from "@/components/utility-components/nostr-context-provider";
import { createAuthEventTemplate } from "@/utils/stripe/verify-nostr-auth";

const OnboardingStripeConnect = () => {
  const router = useRouter();
  const { pubkey, signer } = useContext(SignerContext);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [setupComplete, setSetupComplete] = useState(false);
  const [isCheckingStatus, setIsCheckingStatus] = useState(false);

  const isSuccess = router.query.success === "true";
  const isRefresh = router.query.refresh === "true";

  const signAuthEvent = async () => {
    if (!signer || !signer.sign || !pubkey) {
      throw new Error("No signer available");
    }
    const template = createAuthEventTemplate(pubkey);
    return await signer.sign(template);
  };

  useEffect(() => {
    if (isSuccess && pubkey && signer) {
      setIsCheckingStatus(true);
      const checkStatus = async () => {
        try {
          const signedEvent = await signAuthEvent();
          const res = await fetch("/api/stripe/connect/account-status", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ pubkey, signedEvent }),
          });
          if (res.ok) {
            const data = await res.json();
            if (data.chargesEnabled) {
              setSetupComplete(true);
            }
          }
        } catch {
          console.error("Failed to check Stripe status");
        } finally {
          setIsCheckingStatus(false);
        }
      };
      checkStatus();
    }
  }, [isSuccess, pubkey, signer]);

  useEffect(() => {
    if (isRefresh && pubkey && signer) {
      handleSetupStripe();
    }
  }, [isRefresh, pubkey, signer]);

  const handleSetupStripe = async () => {
    if (!pubkey || !signer) return;
    setIsLoading(true);
    setError(null);

    try {
      const signedEvent = await signAuthEvent();

      const createRes = await fetch("/api/stripe/connect/create-account", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pubkey, signedEvent }),
      });

      if (!createRes.ok) {
        const errData = await createRes.json();
        throw new Error(errData.error || "Failed to create Stripe account");
      }

      const { accountId } = await createRes.json();

      const linkRes = await fetch("/api/stripe/connect/create-account-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accountId,
          pubkey,
          signedEvent,
          returnPath: "/onboarding/stripe-connect?success=true",
          refreshPath: "/onboarding/stripe-connect?refresh=true",
        }),
      });

      if (!linkRes.ok) {
        throw new Error("Failed to create onboarding link");
      }

      const { url } = await linkRes.json();
      window.open(url, "_blank");
    } catch (err) {
      console.error("Stripe setup error:", err);
      setError(
        err instanceof Error
          ? err.message
          : "Something went wrong. Please try again."
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleSkip = () => {
    router.push("/marketplace");
  };

  const handleFinish = () => {
    router.push("/marketplace");
  };

  return (
    <div className="flex min-h-screen flex-col bg-white pt-24">
      <div className="mx-auto w-full max-w-2xl px-4 py-6">
        <Card className="rounded-md border-4 border-black bg-white shadow-neo">
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
            <div className="mb-6 text-center">
              <h2 className="mb-3 text-2xl font-bold text-black">
                Step 5: Accept Card Payments
              </h2>
              <p className="font-medium text-black">
                Set up Stripe to accept credit card payments from buyers.
              </p>
            </div>

            {isCheckingStatus ? (
              <div className="flex flex-col items-center justify-center py-8">
                <Spinner size="lg" color="primary" />
                <p className="mt-4 text-sm font-medium text-black">
                  Checking your Stripe account status...
                </p>
              </div>
            ) : setupComplete ? (
              <div className="flex flex-col items-center justify-center rounded-md border-2 border-black bg-green-50 p-8">
                <CheckCircleIcon className="mb-4 h-16 w-16 text-green-500" />
                <h3 className="mb-2 text-xl font-bold text-black">
                  Stripe Account Connected!
                </h3>
                <p className="text-center text-sm font-medium text-black">
                  You can now accept credit card payments on all your listings.
                </p>
                <Button
                  className={`${BLUEBUTTONCLASSNAMES} mt-6`}
                  onClick={handleFinish}
                >
                  Continue to Marketplace{" "}
                  <ArrowLeftEndOnRectangleIcon className="ml-1 h-5 w-5" />
                </Button>
              </div>
            ) : (
              <>
                <div className="mb-6 rounded-md border-2 border-black bg-gray-50 p-6">
                  <div className="mb-4 flex items-center gap-3">
                    <CreditCardIcon className="h-8 w-8 text-primary-blue" />
                    <h3 className="text-lg font-bold text-black">
                      Why connect Stripe?
                    </h3>
                  </div>
                  <div className="space-y-3">
                    <div className="flex items-start gap-2">
                      <span className="mt-0.5 font-bold text-primary-blue">
                        &bull;
                      </span>
                      <span className="text-sm text-black">
                        Accept Visa, Mastercard, and other major cards
                      </span>
                    </div>
                    <div className="flex items-start gap-2">
                      <span className="mt-0.5 font-bold text-primary-blue">
                        &bull;
                      </span>
                      <span className="text-sm text-black">
                        Get paid directly to your bank account
                      </span>
                    </div>
                    <div className="flex items-start gap-2">
                      <span className="mt-0.5 font-bold text-primary-blue">
                        &bull;
                      </span>
                      <span className="text-sm text-black">
                        Secure payment processing handled by Stripe
                      </span>
                    </div>
                    <div className="flex items-start gap-2">
                      <span className="mt-0.5 font-bold text-primary-blue">
                        &bull;
                      </span>
                      <span className="text-sm text-black">
                        Setup takes just a few minutes
                      </span>
                    </div>
                  </div>
                </div>

                {error && (
                  <p className="mb-4 text-center text-sm font-medium text-red-500">
                    {error}
                  </p>
                )}

                <div className="flex flex-col gap-3">
                  <Button
                    className={BLUEBUTTONCLASSNAMES}
                    onClick={handleSetupStripe}
                    isLoading={isLoading}
                    startContent={
                      !isLoading ? (
                        <ArrowTopRightOnSquareIcon className="h-5 w-5" />
                      ) : undefined
                    }
                  >
                    Set Up Stripe Account
                  </Button>
                  <Button
                    className={WHITEBUTTONCLASSNAMES}
                    onClick={handleSkip}
                  >
                    Skip for Now{" "}
                    <ArrowLeftEndOnRectangleIcon className="ml-1 h-5 w-5" />
                  </Button>
                </div>
              </>
            )}
          </CardBody>
        </Card>
      </div>
    </div>
  );
};

export default OnboardingStripeConnect;
