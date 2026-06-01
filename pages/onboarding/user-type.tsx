import { useState, useEffect } from "react";
import { useRouter } from "next/router";
import { Button, Image } from "@heroui/react";
import {
  ArrowLongRightIcon,
  ShoppingBagIcon,
  UserIcon,
} from "@heroicons/react/24/outline";
import { NEO_BTN } from "@/utils/STATIC-VARIABLES";

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
    <div className="relative flex min-h-screen flex-col bg-[#111] pt-24 text-white selection:bg-yellow-400 selection:text-black">
      <div className="pointer-events-none absolute inset-0 z-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] [mask-image:radial-gradient(ellipse_70%_55%_at_50%_0%,#000_65%,transparent_100%)] bg-[size:24px_24px]" />
      <div className="relative z-10 mx-auto w-full max-w-4xl px-4 py-10">
        <div className="rounded-2xl border border-zinc-800 bg-[#161616] p-5 shadow-2xl shadow-black/30 md:p-8">
          <div className="mb-9 flex flex-col items-center justify-center text-center">
            <div className="mb-4 flex items-center gap-3">
              <Image
                alt="Shopstr logo"
                height={52}
                radius="sm"
                src="/shopstr-2000x2000.png"
                width={52}
              />
              <span className="text-3xl font-black tracking-tighter text-white uppercase">
                Shopstr
              </span>
            </div>
            <h1 className="text-4xl font-black tracking-tight text-white uppercase md:text-5xl">
              Choose Your Role
            </h1>
            <p className="mt-3 max-w-xl text-zinc-400">
              Set up your account for buying, selling, or both. You can always
              change how you use Shopstr later.
            </p>
          </div>

          <div className="mb-8 grid gap-4 md:grid-cols-2">
            {[
              {
                key: "buyer" as const,
                icon: UserIcon,
                title: "Buyer",
                body: "Browse listings, pay with Bitcoin-native options, and manage orders privately.",
              },
              {
                key: "seller" as const,
                icon: ShoppingBagIcon,
                title: "Seller",
                body: "Create a shop, publish listings, and sell directly through Nostr-powered commerce.",
              },
            ].map(({ key, icon: Icon, title, body }) => {
              const selected = selectedType === key;
              return (
                <button
                  key={key}
                  onClick={() => setSelectedType(key)}
                  className={`group flex min-h-60 flex-col items-start rounded-xl border p-6 text-left transition-all ${
                    selected
                      ? "border-yellow-400 bg-yellow-400 text-black shadow-[0_0_0_4px_rgba(250,204,21,0.16)]"
                      : "border-zinc-800 bg-[#111] text-white hover:-translate-y-1 hover:border-yellow-400/60"
                  }`}
                >
                  <div
                    className={`mb-6 flex h-14 w-14 items-center justify-center rounded-lg border ${
                      selected
                        ? "border-black/20 bg-black/10"
                        : "border-yellow-400/30 bg-yellow-400/10"
                    }`}
                  >
                    <Icon
                      className={`h-8 w-8 ${selected ? "text-black" : "text-yellow-300"}`}
                    />
                  </div>
                  <h2 className="text-3xl font-black tracking-tight uppercase">
                    {title}
                  </h2>
                  <p
                    className={`mt-3 leading-6 ${selected ? "text-black/70" : "text-zinc-400"}`}
                  >
                    {body}
                  </p>
                </button>
              );
            })}
          </div>

          <div className="flex justify-center">
            <Button
              className={`${NEO_BTN} h-12 px-8 text-sm`}
              onClick={handleNext}
              isDisabled={!selectedType}
            >
              Next <ArrowLongRightIcon className="ml-1 h-5 w-5" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default UserTypeSelection;
