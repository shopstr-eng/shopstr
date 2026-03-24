import { useRouter } from "next/router";
import { Card, CardBody, Button, Image } from "@nextui-org/react";
import {
  ArrowLongRightIcon,
  ArrowLeftEndOnRectangleIcon,
} from "@heroicons/react/24/outline";
import { BLUEBUTTONCLASSNAMES } from "@/utils/STATIC-VARIABLES";
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
      router.push("/marketplace");
    }
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
                Step 3: Set Up Your Profile
              </h2>
              <p className="font-medium text-black">
                {isBuyer
                  ? "Set up your buyer profile or skip this step to finish onboarding."
                  : "Set up your user profile or skip this step to continue."}
              </p>
            </div>

            {isBuyer ? (
              <BuyerProfileForm isOnboarding={true} />
            ) : (
              <UserProfileForm isOnboarding={true} />
            )}

            <div className="mt-6 flex justify-center">
              <Button className={BLUEBUTTONCLASSNAMES} onClick={handleNext}>
                {isBuyer ? (
                  <>
                    Finish (or skip){" "}
                    <ArrowLeftEndOnRectangleIcon className="ml-1 h-5 w-5" />
                  </>
                ) : (
                  <>
                    Next (or skip){" "}
                    <ArrowLongRightIcon className="ml-1 h-5 w-5" />
                  </>
                )}
              </Button>
            </div>
          </CardBody>
        </Card>
      </div>
    </div>
  );
};

export default OnboardingUserProfile;
