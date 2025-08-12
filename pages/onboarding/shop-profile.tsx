import React from "react";
import { useRouter } from "next/router";
import { Card, CardBody, Button, Image } from "@nextui-org/react";
import { ArrowLeftEndOnRectangleIcon } from "@heroicons/react/24/outline";
import { WHITEBUTTONCLASSNAMES } from "@/utils/STATIC-VARIABLES";
import ShopProfileForm from "@/components/settings/shop-profile-form";

const OnboardingShopProfile = () => {
  const router = useRouter();

  const handleFinish = () => {
    router.push("/marketplace");
  };

  return (
    <div className="flex min-h-screen flex-col bg-light-bg pt-24">
      <div className="mx-auto w-full max-w-2xl px-4 py-6">
        <Card className="bg-dark-fg">
          <CardBody>
            <div className="mb-4 flex flex-row items-center justify-center">
              <Image
                alt="Milk Market logo"
                height={50}
                radius="sm"
                src="/milk-market.png"
                width={50}
              />
              <h1 className="cursor-pointer text-center text-3xl font-bold text-dark-text">
                Milk Market
              </h1>
            </div>
            <div className="mb-4 text-center">
              <h2 className="text-2xl font-bold text-dark-text">
                Step 3: Set Up Your Shop
              </h2>
              <p className="text-dark-text">
                Set up your shop details or, if you&apos;re not a seller, skip
                this step to finish onboarding.
              </p>
            </div>

            <ShopProfileForm isOnboarding={true} />

            <div className="flex justify-center">
              <Button className={WHITEBUTTONCLASSNAMES} onClick={handleFinish}>
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
