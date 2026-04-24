import { useState, useEffect } from "react";
import { useRouter } from "next/router";
import { Card, CardBody, Button, Image } from "@heroui/react";
import {
  ArrowLongRightIcon,
  ShoppingBagIcon,
  UserIcon,
} from "@heroicons/react/24/outline";
import { BLUEBUTTONCLASSNAMES } from "@/utils/STATIC-VARIABLES";

const UserTypeSelection = () => {
  const router = useRouter();
  const preselect = router.query.preselect as string | undefined;
  const [selectedType, setSelectedType] = useState<"seller" | "buyer" | null>(
    preselect === "seller" ? "seller" : null
  );

  useEffect(() => {
    if (preselect === "seller") {
      setSelectedType("seller");
    }
  }, [preselect]);

  const handleNext = () => {
    if (selectedType === "seller") {
      router.push("/onboarding/market-profile?type=seller");
    } else if (selectedType === "buyer") {
      router.push("/onboarding/market-profile?type=buyer");
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
                <UserIcon className="mb-4 h-16 w-16 stroke-[2.5] text-black" />
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
                <ShoppingBagIcon className="mb-4 h-16 w-16 stroke-[2.5] text-black" />
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
                Next <ArrowLongRightIcon className="ml-1 h-5 w-5" />
              </Button>
            </div>
          </CardBody>
        </Card>
      </div>
    </div>
  );
};

export default UserTypeSelection;
