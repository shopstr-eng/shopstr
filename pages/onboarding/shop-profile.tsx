import React from "react";
import { useRouter } from "next/router";
import { Card, CardBody, Button, Image } from "@nextui-org/react";
import { ArrowLeftEndOnRectangleIcon } from "@heroicons/react/24/outline";
import { SHOPSTRBUTTONCLASSNAMES } from "@/utils/STATIC-VARIABLES";
import ShopProfileForm from "@/components/settings/shop-profile-form";

const OnboardingShopProfile = () => {
  const router = useRouter();

  const handleFinish = () => {
    router.push("/marketplace");
  };

  return (
    <div className="flex h-[100vh] flex-col bg-light-bg pt-24 dark:bg-dark-bg">
      <div className="mx-auto w-full max-w-2xl px-4 py-6">
        <Card>
          <CardBody>
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
            <div className="mb-4 text-center">
              <h2 className="text-2xl font-bold text-light-text dark:text-dark-text">
                Step 4: Setup Your Shop
              </h2>
              <p className="text-light-text dark:text-dark-text">
                Set up your shop details or, if you&apos;re not a seller, skip
                this step to finish onboarding.
              </p>
            </div>

            <ShopProfileForm isOnboarding={true} />

            <div className="flex justify-center">
              <Button
                className={SHOPSTRBUTTONCLASSNAMES}
                onClick={handleFinish}
              >
                Finish <ArrowLeftEndOnRectangleIcon className="h-5 w-5" />
              </Button>
            </div>
          </CardBody>
        </Card>
      </div>
    </div>
  );
};

export default OnboardingShopProfile;
