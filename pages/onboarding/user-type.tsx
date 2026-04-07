import { useState, useEffect } from "react";
import { useRouter } from "next/router";
import { Card, CardBody, Button, Image } from "@nextui-org/react";
import {
  ArrowLongRightIcon,
  ShoppingBagIcon,
  UserIcon,
} from "@heroicons/react/24/outline";
import { SHOPSTRBUTTONCLASSNAMES } from "@/utils/STATIC-VARIABLES";

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
      router.push("/onboarding/user-profile?type=seller");
    } else if (selectedType === "buyer") {
      router.push("/onboarding/user-profile?type=buyer");
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-light-bg pt-24 dark:bg-dark-bg">
      <div className="mx-auto w-full max-w-2xl px-4 py-6">
        <Card>
          <CardBody className="p-8">
            <div className="mb-4 flex flex-row items-center justify-center">
              <Image
                alt="Shopstr logo"
                height={50}
                radius="sm"
                src="/shopstr-2000x2000.png"
                width={50}
              />
              <h1 className="cursor-pointer text-center text-3xl font-bold text-shopstr-purple-light hover:text-purple-700 dark:text-shopstr-yellow-light">
                Shopstr
              </h1>
            </div>
            <div className="mb-8 text-center">
              <h2 className="mb-3 text-2xl font-bold text-light-text dark:text-dark-text">
                Step 2: Choose Your Role
              </h2>
              <p className="text-light-text dark:text-dark-text">
                Are you here to buy or sell products?
              </p>
            </div>

            <div className="mb-8 flex flex-col gap-4 md:flex-row">
              <button
                onClick={() => setSelectedType("buyer")}
                className={`flex flex-1 flex-col items-center justify-center rounded-lg border-2 p-8 transition-all ${
                  selectedType === "buyer"
                    ? "border-shopstr-purple bg-shopstr-yellow dark:border-shopstr-yellow dark:bg-shopstr-yellow"
                    : "border-gray-300 bg-light-fg hover:bg-light-bg dark:border-dark-fg dark:bg-dark-fg dark:hover:bg-dark-bg"
                }`}
              >
                <UserIcon className="mb-4 h-16 w-16 stroke-[2.5] text-light-text dark:text-dark-text" />
                <h3 className="mb-3 text-xl font-bold text-light-text dark:text-dark-text">
                  Buyer
                </h3>
                <p className="text-center text-sm font-medium text-light-text dark:text-dark-text">
                  Browse and purchase products from local sellers
                </p>
              </button>

              <button
                onClick={() => setSelectedType("seller")}
                className={`flex flex-1 flex-col items-center justify-center rounded-lg border-2 p-8 transition-all ${
                  selectedType === "seller"
                    ? "border-shopstr-purple bg-shopstr-yellow dark:border-shopstr-yellow dark:bg-shopstr-yellow"
                    : "border-gray-300 bg-light-fg hover:bg-light-bg dark:border-dark-fg dark:bg-dark-fg dark:hover:bg-dark-bg"
                }`}
              >
                <ShoppingBagIcon className="mb-4 h-16 w-16 stroke-[2.5] text-light-text dark:text-dark-text" />
                <h3 className="mb-3 text-xl font-bold text-light-text dark:text-dark-text">
                  Seller
                </h3>
                <p className="text-center text-sm font-medium text-light-text dark:text-dark-text">
                  List and sell your products to buyers
                </p>
              </button>
            </div>

            <div className="flex justify-center">
              <Button
                className={SHOPSTRBUTTONCLASSNAMES}
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
