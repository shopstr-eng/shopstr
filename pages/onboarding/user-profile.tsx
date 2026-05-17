import { useRouter } from "next/router";
import { Card, CardBody, Button, Image } from "@heroui/react";
import { ArrowLongRightIcon } from "@heroicons/react/24/outline";
import { SHOPSTRBUTTONCLASSNAMES } from "@/utils/STATIC-VARIABLES";
import UserProfileForm from "@/components/settings/user-profile-form";
import BuyerProfileForm from "@/components/settings/buyer-profile-form";

const OnboardingUserProfile = () => {
  const router = useRouter();
  const { type } = router.query;
  const isBuyer = type === "buyer";
  const isSeller = type === "seller";

  const handleNext = () => {
    if (isSeller) {
      router.push("/onboarding/shop-profile");
    } else {
      router.push("/onboarding/wallet?type=buyer");
    }
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
                Step 3: Set Up Your Profile
              </h2>
              <p className="text-light-text dark:text-dark-text">
                Set up your profile or skip this step to continue.
              </p>
            </div>

            {isBuyer ? (
              <BuyerProfileForm isOnboarding={true} />
            ) : (
              <UserProfileForm isOnboarding={true} />
            )}

            <div className="mt-8 flex justify-center">
              <Button className={SHOPSTRBUTTONCLASSNAMES} onClick={handleNext}>
                Next (or skip) <ArrowLongRightIcon className="ml-1 h-5 w-5" />
              </Button>
            </div>
          </CardBody>
        </Card>
      </div>
    </div>
  );
};

export default OnboardingUserProfile;
