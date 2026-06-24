import { useRouter } from "next/router";
import { Card, CardBody, Button, Image } from "@heroui/react";
import { ArrowLeftEndOnRectangleIcon } from "@heroicons/react/24/outline";
import { SHOPSTRBUTTONCLASSNAMES } from "@/utils/STATIC-VARIABLES";
import ShopProfileForm from "@/components/settings/shop-profile-form";

const OnboardingShopProfile = () => {
  const router = useRouter();

  const handleFinish = () => {
    router.push("/marketplace");
  };

  return (
    <div className="bg-light-bg dark:bg-dark-bg flex min-h-screen flex-col pt-24">
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
              <h1 className="text-shopstr-purple-light dark:text-shopstr-yellow-light cursor-pointer text-center text-3xl font-bold hover:text-purple-700">
                Shopstr
              </h1>
            </div>
            <div className="mb-4 text-center">
              <h2 className="text-light-text dark:text-dark-text text-2xl font-bold">
                Step 4: Set Up Your Shop
              </h2>
              <p className="text-light-text dark:text-dark-text">
                Set up your shop details or skip this step to finish onboarding.
              </p>
            </div>

            <ShopProfileForm isOnboarding={true} />

            <div className="mt-6 flex justify-center">
              <Button
                className={SHOPSTRBUTTONCLASSNAMES}
                onClick={handleFinish}
              >
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
