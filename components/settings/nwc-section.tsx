import { useState, useEffect } from "react";
import {
  Input,
  Button,
  Card,
  CardBody,
  CardHeader,
  Spinner,
} from "@heroui/react";
import {
  CheckCircleIcon,
  ExclamationCircleIcon,
  InformationCircleIcon,
  WalletIcon,
} from "@heroicons/react/24/outline";
import { NostrWebLNProvider } from "@getalby/sdk";
import {
  getLocalStorageData,
  saveNWCString,
} from "@/utils/nostr/nostr-helper-functions";
import { BLUEBUTTONCLASSNAMES } from "@/utils/STATIC-VARIABLES";
import { formatWithCommas } from "@/components/utility-components/display-monetary-info";

const NWCSection = () => {
  const [nwcString, setNwcString] = useState("");
  const [walletInfo, setWalletInfo] = useState<any>(null);
  const [balance, setBalance] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSaved, setIsSaved] = useState(false);

  useEffect(() => {
    const loadInfo = () => {
      const { nwcString: savedString, nwcInfo: savedInfo } =
        getLocalStorageData();
      if (savedString) {
        setNwcString(savedString);
      }
      if (savedInfo) {
        try {
          const info = JSON.parse(savedInfo);
          setWalletInfo(info);
          if (info.methods.includes("get_balance") && savedString) {
            fetchBalance(savedString);
          }
        } catch (e) {
          console.error("Failed to parse saved NWC info", e);
        }
      }
    };
    loadInfo();

    window.addEventListener("storage", loadInfo);
    return () => window.removeEventListener("storage", loadInfo);
  }, []);

  const fetchBalance = async (connectionString: string | null) => {
    if (!connectionString) return;
    let nwc: NostrWebLNProvider | null = null;
    try {
      nwc = new NostrWebLNProvider({
        nostrWalletConnectUrl: connectionString,
      });
      await nwc.enable();
      const balanceRes = await nwc.getBalance();
      setBalance(balanceRes.balance / 1000);
    } catch (e) {
      console.error("Failed to fetch balance", e);
      setBalance(null);
    } finally {
      nwc?.close();
    }
  };

  const handleSave = async () => {
    let nwc: NostrWebLNProvider | null = null;
    setIsLoading(true);
    setError(null);
    setIsSaved(false);
    setWalletInfo(null);
    setBalance(null);

    try {
      if (!nwcString || !nwcString.startsWith("nostr+walletconnect://")) {
        throw new Error(
          "Invalid Nostr Wallet Connect string. It must start with 'nostr+walletconnect://'"
        );
      }

      const url = new URL(nwcString);
      const secret = url.searchParams.get("secret");
      const relay = url.searchParams.get("relay");

      if (!secret || secret.length !== 64) {
        throw new Error(
          "Invalid or missing 'secret' parameter (must be 64 hex chars)."
        );
      }
      if (!relay) {
        throw new Error("Missing 'relay' parameter in the connection string.");
      }

      nwc = new NostrWebLNProvider({ nostrWalletConnectUrl: nwcString });
      await nwc.enable();
      const info = await nwc.getInfo();

      saveNWCString(nwcString);
      localStorage.setItem("nwcInfo", JSON.stringify(info));
      setWalletInfo(info);
      setIsSaved(true);

      if (info.methods && info.methods.includes("get_balance")) {
        await fetchBalance(nwcString);
      }
    } catch (e: any) {
      console.error("Failed to validate or connect NWC wallet:", e);
      setError(
        `Failed to connect: ${
          e.message ||
          "Please check the connection string and wallet permissions."
        }`
      );
      saveNWCString("");
      localStorage.removeItem("nwcInfo");
    } finally {
      setIsLoading(false);
      if (nwc) {
        nwc.close();
      }
    }
  };

  const handleRemove = () => {
    setNwcString("");
    setWalletInfo(null);
    setBalance(null);
    setError(null);
    saveNWCString("");
    localStorage.removeItem("nwcInfo");
  };

  return (
    <div className="mb-8">
      <h2 className="mb-4 text-2xl font-bold">Nostr Wallet Connect</h2>

      <Input
        isClearable
        label="Nostr Wallet Connect String"
        placeholder="nostr+walletconnect://..."
        value={nwcString}
        onValueChange={setNwcString}
        className="mb-4"
        classNames={{
          label: "text-black",
          input: "!text-black",
          inputWrapper:
            "rounded-md border-2 border-black bg-white shadow-neo data-[hover=true]:bg-white data-[focus=true]:bg-white group-data-[focus=true]:bg-white",
          innerWrapper: "text-black",
        }}
      />

      <div className="mb-4 flex items-start gap-2 text-sm text-gray-600">
        <InformationCircleIcon className="mt-0.5 h-5 w-5 flex-shrink-0" />
        <p>
          Connect your wallet using a Nostr Wallet Connect (NIP-47) connection
          string (e.g., from Alby, Mutiny, or Umbrel). This allows Milk Market
          to request payments directly from your wallet.
        </p>
      </div>

      {error && (
        <div className="shadow-neo mb-4 flex items-center rounded-md border-2 border-black bg-red-100 p-3 text-red-700">
          <ExclamationCircleIcon className="mr-2 h-5 w-5" />
          <span className="text-sm">{error}</span>
        </div>
      )}

      {isSaved && !error && (
        <div className="shadow-neo mb-4 flex items-center rounded-md border-2 border-black bg-green-100 p-3 text-green-700">
          <CheckCircleIcon className="mr-2 h-5 w-5" />
          <span className="text-sm">Wallet connected successfully!</span>
        </div>
      )}

      <div className="flex items-center">
        <Button
          className={BLUEBUTTONCLASSNAMES}
          onClick={handleSave}
          isLoading={isLoading}
        >
          {isLoading ? "Connecting..." : isSaved ? "Saved!" : "Save Connection"}
        </Button>

        {walletInfo && (
          <Button
            color="danger"
            variant="light"
            className="ml-4"
            onClick={handleRemove}
          >
            Disconnect Wallet
          </Button>
        )}
      </div>

      {walletInfo && (
        <Card className="shadow-neo mt-6 rounded-md border-2 border-black bg-white">
          <CardHeader className="border-b-2 border-black">
            <WalletIcon className="mr-2 h-5 w-5 text-black" />
            <h3 className="font-bold text-black">
              Connected Wallet: {walletInfo.alias || "Unknown"}
            </h3>
          </CardHeader>
          <CardBody>
            {balance !== null ? (
              <p className="text-black">
                Balance: {formatWithCommas(balance, "sats")}
              </p>
            ) : walletInfo.methods.includes("get_balance") ? (
              <Spinner size="sm" />
            ) : (
              <p className="text-sm text-gray-600">Balance: Not available</p>
            )}
            <p className="mt-2 text-sm text-gray-600">
              Supports: {walletInfo.methods.join(", ")}
            </p>
          </CardBody>
        </Card>
      )}
    </div>
  );
};

export default NWCSection;
