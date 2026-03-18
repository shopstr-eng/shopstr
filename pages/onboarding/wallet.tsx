import { useState } from "react";
import { useRouter } from "next/router";
import { Card, CardBody, Button, Image, Input } from "@nextui-org/react";
import {
  ArrowLongRightIcon,
  WalletIcon,
  ExclamationCircleIcon,
} from "@heroicons/react/24/outline";
import { SHOPSTRBUTTONCLASSNAMES } from "@/utils/STATIC-VARIABLES";
import { saveNWCString } from "@/utils/nostr/nostr-helper-functions";
import { webln } from "@getalby/sdk";

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
            <div className="mb-6 text-center">
              <h2 className="text-2xl font-bold text-light-text dark:text-dark-text">
                Step 3: Connect Wallet
              </h2>
              <p className="text-light-text dark:text-dark-text">
                Connect your NWC-enabled Lightning wallet to pay invoices
                seamlessly.
              </p>
            </div>

            <div className="space-y-6">
              <Input
                isClearable
                label="Nostr Wallet Connect String"
                placeholder="nostr+walletconnect://..."
                value={nwcString}
                onValueChange={setNwcString}
                variant="bordered"
                startContent={<WalletIcon className="h-5 w-5 text-gray-400" />}
                classNames={{
                  label: "text-light-text dark:text-dark-text",
                  input: "text-light-text dark:text-dark-text",
                }}
              />

              {error && (
                <div className="flex items-center rounded border border-red-400 bg-red-100 p-3 text-red-700">
                  <ExclamationCircleIcon className="mr-2 h-5 w-5" />
                  <span className="text-sm">{error}</span>
                </div>
              )}

              <div className="flex flex-col gap-3">
                <Button
                  className={SHOPSTRBUTTONCLASSNAMES}
                  onClick={handleConnect}
                  isLoading={isLoading}
                  isDisabled={!nwcString}
                >
                  Connect & Continue
                </Button>

                <Button
                  variant="light"
                  className="text-gray-500 dark:text-gray-400"
                  onClick={handleNext}
                >
                  Skip for now <ArrowLongRightIcon className="ml-1 h-4 w-4" />
                </Button>
              </div>
            </div>
          </CardBody>
        </Card>
      </div>
    </div>
  );
};

export default OnboardingWallet;
