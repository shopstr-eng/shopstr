import { useState, useEffect } from "react";
import { useRouter } from "next/router";
import { Card, CardBody, Button, Image } from "@heroui/react";
import { BLUEBUTTONCLASSNAMES } from "@/utils/STATIC-VARIABLES";

const UserTypeSelection = () => {
  const router = useRouter();
  const preselect = router.query.preselect as string | undefined;
  const [selectedType, setSelectedType] = useState<"seller" | "buyer" | null>(
    preselect === "seller" ? "seller" : null
  );

  const migrate = router.query.migrate as string | undefined;
  const migrateSuffix = migrate
    ? `&migrate=${encodeURIComponent(migrate)}`
    : "";
  const plan = router.query.plan as string | undefined;
  const planSuffix = plan ? `&plan=${encodeURIComponent(plan)}` : "";

  useEffect(() => {
    if (!router.isReady) return;
    // Sellers coming through the Shopify migration funnel already have an
    // implicit role — skip this step entirely.
    if (migrate === "shopify") {
      router.replace(
        `/onboarding/choose-plan?type=seller&migrate=shopify${planSuffix}`
      );
      return;
    }
    if (preselect === "seller") {
      setSelectedType("seller");
    }
  }, [preselect, migrate, router]);

  const handleNext = () => {
    if (selectedType === "seller") {
      router.push(
        `/onboarding/choose-plan?type=seller${planSuffix}${migrateSuffix}`
      );
    } else if (selectedType === "buyer") {
      router.push(`/onboarding/market-profile?type=buyer${migrateSuffix}`);
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-white pt-24">
      <div className="mx-auto w-full max-w-2xl px-4 py-6">
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
                Step 2: Choose Your Role
              </h2>
              <p className="font-medium text-black">
                Are you here to buy or sell products?
              </p>
            </div>

            <div className="mb-8 flex flex-col gap-4 md:flex-row">
              <button
                onClick={() => setSelectedType("buyer")}
                className={`flex flex-1 flex-col items-center justify-center rounded-md border-4 border-black p-8 transition-all ${
                  selectedType === "buyer"
                    ? "bg-primary-yellow shadow-neo -translate-y-1 transform"
                    : "bg-white hover:bg-gray-50"
                }`}
              >
                <span aria-hidden="true" className="mb-4 text-4xl leading-none">
                  👤
                </span>
                <h3 className="mb-3 text-xl font-bold text-black">Shopper</h3>
                <p className="text-center text-sm font-medium text-black">
                  Browse and purchase products from local sellers
                </p>
              </button>

              <button
                onClick={() => setSelectedType("seller")}
                className={`flex flex-1 flex-col items-center justify-center rounded-md border-4 border-black p-8 transition-all ${
                  selectedType === "seller"
                    ? "bg-primary-yellow shadow-neo -translate-y-1 transform"
                    : "bg-white hover:bg-gray-50"
                }`}
              >
                <span aria-hidden="true" className="mb-4 text-4xl leading-none">
                  🛍️
                </span>
                <h3 className="mb-3 text-xl font-bold text-black">Vendor</h3>
                <p className="text-center text-sm font-medium text-black">
                  List and sell your products to buyers
                </p>
              </button>
            </div>

            <div className="flex justify-center">
              <Button
                className={BLUEBUTTONCLASSNAMES}
                onClick={handleNext}
                isDisabled={!selectedType}
              >
                Next{" "}
                <span aria-hidden="true" className="ml-1 text-lg leading-none">
                  ➡️
                </span>
              </Button>
            </div>
          </CardBody>
        </Card>
      </div>
    </div>
  );
};

export default UserTypeSelection;
