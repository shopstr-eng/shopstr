import { useState, useEffect } from "react";
import { useRouter } from "next/router";
import { Card, CardBody, Button, Image } from "@heroui/react";
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
    <div className="bg-light-bg dark:bg-dark-bg flex min-h-screen flex-col pt-24">
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
              <h1 className="text-shopstr-purple-light dark:text-shopstr-yellow-light cursor-pointer text-center text-3xl font-bold hover:text-purple-700">
                Shopstr
              </h1>
            </div>
            <div className="mb-8 text-center">
              <h2 className="text-light-text dark:text-dark-text mb-3 text-2xl font-bold">
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
                    : "bg-light-fg hover:bg-light-bg dark:border-dark-fg dark:bg-dark-fg dark:hover:bg-dark-bg border-gray-300"
                }`}
              >
                <UserIcon className="text-light-text dark:text-dark-text mb-4 h-16 w-16 stroke-[2.5]" />
                <h3 className="text-light-text dark:text-dark-text mb-3 text-xl font-bold">
                  Buyer
                </h3>
                <p className="text-light-text dark:text-dark-text text-center text-sm font-medium">
                  Browse and purchase products from local sellers
                </p>
              </button>

              <button
                onClick={() => setSelectedType("seller")}
                className={`flex flex-1 flex-col items-center justify-center rounded-lg border-2 p-8 transition-all ${
                  selectedType === "seller"
                    ? "border-shopstr-purple bg-shopstr-yellow dark:border-shopstr-yellow dark:bg-shopstr-yellow"
                    : "bg-light-fg hover:bg-light-bg dark:border-dark-fg dark:bg-dark-fg dark:hover:bg-dark-bg border-gray-300"
                }`}
              >
                <ShoppingBagIcon className="text-light-text dark:text-dark-text mb-4 h-16 w-16 stroke-[2.5]" />
                <h3 className="text-light-text dark:text-dark-text mb-3 text-xl font-bold">
                  Seller
                </h3>
                <p className="text-light-text dark:text-dark-text text-center text-sm font-medium">
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
