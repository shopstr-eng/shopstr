import React from "react";
import { useRouter } from "next/router";
import { Button, Image } from "@nextui-org/react";
import { ArrowRightStartOnRectangleIcon } from "@heroicons/react/24/outline";
import ShopProfileForm from "@/components/settings/shop-profile-form";
import { NEO_BTN } from "@/utils/STATIC-VARIABLES";

const OnboardingShopProfile = () => {
  const router = useRouter();

  const handleFinish = () => {
    router.push("/marketplace");
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#050505] p-4 pt-24">
      <div className="relative w-full max-w-2xl rounded-3xl border border-white/10 bg-[#1a1a1a] p-6 shadow-2xl md:p-12">
        {/* Step Pill */}
        <div className="absolute -top-5 left-1/2 -translate-x-1/2 rounded-full border-2 border-b-4 border-shopstr-yellow bg-[#222] px-6 py-2">
          <span className="text-xs font-bold uppercase tracking-widest text-shopstr-yellow">
            Step 4 of 4
          </span>
        </div>

        <div className="mb-8 flex flex-col items-center">
          <div className="mb-6 flex items-center gap-3">
            <Image
              alt="Shopstr logo"
              height={40}
              radius="sm"
              src="/shopstr-2000x2000.png"
              width={40}
            />
            <h1 className="text-3xl font-bold text-white">Shopstr</h1>
          </div>
          <h2 className="mb-4 text-center text-3xl md:text-4xl font-black text-white">
            Setup Your Shop
          </h2>
          <p className="text-center text-gray-400">
            Set up your shop details or, if you&apos;re not a seller, skip this
            step to finish onboarding.
          </p>
        </div>

        <ShopProfileForm isOnboarding={true} />

        <div className="mt-6 flex justify-center w-full">
          <Button
            className={`${NEO_BTN} w-full md:w-auto px-12 py-6 text-lg font-black tracking-widest`}
            onClick={handleFinish}
          >
            Finish <ArrowRightStartOnRectangleIcon className="h-6 w-6" />
          </Button>
        </div>
      </div>
    </div>
  );
};

export default OnboardingShopProfile;