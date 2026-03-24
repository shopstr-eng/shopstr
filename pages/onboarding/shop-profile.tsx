import { useRouter } from "next/router";
import { Card, CardBody, Button, Image } from "@nextui-org/react";
import { ArrowLeftEndOnRectangleIcon } from "@heroicons/react/24/outline";
import { BLUEBUTTONCLASSNAMES } from "@/utils/STATIC-VARIABLES";
import ShopProfileForm from "@/components/settings/shop-profile-form";

const OnboardingShopProfile = () => {
  const router = useRouter();

  const handleFinish = () => {
    router.push("/onboarding/stripe-connect");
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
                Step 4: Set Up Your Shop
              </h2>
              <p className="font-medium text-black">
                Set up your shop details or skip this step to finish onboarding.
              </p>
            </div>

            <ShopProfileForm isOnboarding={true} />

            <div className="mt-6 flex justify-center">
              <Button className={BLUEBUTTONCLASSNAMES} onClick={handleFinish}>
                Finish (or skip){" "}
                <ArrowLeftEndOnRectangleIcon className="ml-1 h-5 w-5" />
              </Button>
            </div>
          </CardBody>
        </Card>
      </div>
    </div>
  );
};

export default OnboardingShopProfile;
