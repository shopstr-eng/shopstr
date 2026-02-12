import { useState } from "react";
import { useRouter } from "next/router";
import { Button, Image } from "@nextui-org/react";
import {
  WalletIcon,
  ExclamationCircleIcon,
} from "@heroicons/react/24/outline";
import { saveNWCString } from "@/utils/nostr/nostr-helper-functions";
import { webln } from "@getalby/sdk";
import { NEO_BTN } from "@/utils/STATIC-VARIABLES";

const OnboardingWallet = () => {
  const router = useRouter();
  const [nwcString, setNwcString] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleNext = () => {
    router.push("/onboarding/shop-profile");
  };

  const handleConnect = async () => {
    setIsLoading(true);
    setError(null);
    let nwc: webln.NostrWebLNProvider | null = null;

    try {
      if (!nwcString || !nwcString.startsWith("nostr+walletconnect://")) {
        throw new Error(
          "Invalid connection string. Must start with 'nostr+walletconnect://'"
        );
      }

      nwc = new webln.NostrWebLNProvider({ nostrWalletConnectUrl: nwcString });
      await nwc.enable();
      const info = await nwc.getInfo();

      saveNWCString(nwcString);
      localStorage.setItem("nwcInfo", JSON.stringify(info));

      handleNext();
    } catch (e: any) {
      console.error("NWC Connection failed:", e);
      setError(
        e.message || "Failed to connect. Please check your connection string."
      );
    } finally {
      setIsLoading(false);
      if (nwc) {
        nwc.close();
      }
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#050505] p-4 pt-24">
      <div className="relative w-full max-w-2xl rounded-3xl border border-white/10 bg-[#1a1a1a] p-6 shadow-2xl md:p-12">
        {/* Step Pill */}
        <div className="absolute -top-5 left-1/2 -translate-x-1/2 rounded-full border-2 border-b-4 border-shopstr-yellow bg-[#222] px-6 py-2">
          <span className="text-xs font-bold uppercase tracking-widest text-shopstr-yellow">
            Step 3 of 4
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
            Connect Wallet
          </h2>
          <p className="text-center text-gray-400">
            Connect your NWC-enabled Lightning wallet to pay invoices
            seamlessly.
          </p>
        </div>

        <div className="space-y-6">
          <div>
            <label className="mb-3 block text-xs font-bold uppercase tracking-widest text-white/50">
              Nostr Wallet Connect String
            </label>
            <div className="relative">
              <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-4">
                <WalletIcon className="h-5 w-5 text-gray-500" />
              </div>
              <input
                type="text"
                className="w-full rounded-xl border border-white/10 bg-[#111] py-4 pl-12 pr-4 text-white text-base placeholder-gray-600 transition-colors focus:border-white/30 focus:outline-none"
                placeholder="nostr+walletconnect://..."
                value={nwcString}
                onChange={(e) => setNwcString(e.target.value)}
              />
            </div>
          </div>

          {error && (
            <div className="flex items-center rounded-xl border border-red-500/50 bg-red-900/20 p-4 text-red-200">
              <ExclamationCircleIcon className="mr-3 h-5 w-5 flex-shrink-0" />
              <span className="text-sm font-medium">{error}</span>
            </div>
          )}

          <div className="mt-8 flex flex-col items-center justify-between gap-4 sm:flex-row">
            <button
              onClick={handleNext}
              className="text-xs font-bold uppercase tracking-widest text-gray-600 transition-colors hover:text-white"
            >
              Skip for now
            </button>
            <Button
              className={`${NEO_BTN} w-full sm:w-auto px-8 py-6 text-sm`}
              onClick={handleConnect}
              isLoading={isLoading}
              isDisabled={!nwcString}
            >
              Connect & Continue
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default OnboardingWallet;
