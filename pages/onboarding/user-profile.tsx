import React from "react";
import { useRouter } from "next/router";
import { Button, Image } from "@nextui-org/react";
import { ArrowLongRightIcon } from "@heroicons/react/24/outline";
import UserProfileForm from "@/components/settings/user-profile-form";
import { NEO_BTN } from "@/utils/STATIC-VARIABLES";

const OnboardingUserProfile = () => {
  const router = useRouter();

  const handleNext = () => {
    router.push("/onboarding/wallet");
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#050505] p-4 pt-24">
      <div className="relative w-full max-w-2xl rounded-3xl border border-white/10 bg-[#1a1a1a] p-6 shadow-2xl md:p-12">
        {/* Step Pill */}
        <div className="absolute -top-5 left-1/2 -translate-x-1/2 rounded-full border-2 border-b-4 border-shopstr-yellow bg-[#222] px-6 py-2">
          <span className="text-xs font-bold uppercase tracking-widest text-shopstr-yellow">
            Step 2 of 4
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
            Setup Your Profile
          </h2>
          <p className="text-center text-gray-400">
            Set up your user profile or skip this step to continue.
          </p>
        </div>

        {/* Wrapper to force yellow color theme for internal components like checkboxes */}
        <div
          className="w-full"
          style={
            {
              "--nextui-primary": "252 211 77",
              "--nextui-primary-foreground": "0 0 0",
            } as React.CSSProperties
          }
        >
          <UserProfileForm isOnboarding={true} />
        </div>

        <div className="mt-8 flex flex-col items-center justify-between gap-4 sm:flex-row">
          <button
            onClick={handleNext}
            className="text-xs font-bold uppercase tracking-widest text-gray-600 transition-colors hover:text-white"
          >
            Skip for now
          </button>
          <div className="flex items-center gap-3 w-full sm:w-auto">
            <Button
              className={`${NEO_BTN} w-full sm:w-auto px-8 py-6 text-sm`}
              onClick={handleNext}
            >
              Next <ArrowLongRightIcon className="h-5 w-5" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default OnboardingUserProfile;
