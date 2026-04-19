import { useContext, useEffect, useState } from "react";
import {
  Input,
  Button,
  Card,
  CardBody,
  CardHeader,
  Spinner,
} from "@heroui/react";
import { SettingsBreadCrumbs } from "@/components/settings/settings-bread-crumbs";
import { SHOPSTRBUTTONCLASSNAMES } from "@/utils/STATIC-VARIABLES";
import {
  CheckCircleIcon,
  ExclamationCircleIcon,
  WalletIcon,
} from "@heroicons/react/24/outline";
import { NostrWebLNProvider } from "@getalby/sdk";
import { formatWithCommas } from "@/components/utility-components/display-monetary-info";
import ProtectedRoute from "@/components/utility-components/protected-route";
import { NWCContext } from "@/components/utility-components/nostr-context-provider";

const NWCSettingsPage = () => {
  const {
    nwcString: unlockedNWCString,
    nwcInfo: storedNWCInfo,
    hasStoredConnection,
    isUnlocked,
    saveConnection,
    ensureUnlocked,
    lockConnection,
    removeConnection,
  } = useContext(NWCContext);
  const [nwcString, setNwcString] = useState("");
  const [passphrase, setPassphrase] = useState("");
  const [walletInfo, setWalletInfo] = useState<any>(null);
  const [balance, setBalance] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSaved, setIsSaved] = useState(false);

  useEffect(() => {
    setWalletInfo(storedNWCInfo || null);
    if (unlockedNWCString) {
      setNwcString(unlockedNWCString);
      if (storedNWCInfo?.methods?.includes("get_balance")) {
        fetchBalance(unlockedNWCString);
      }
    } else {
      setNwcString("");
      setBalance(null);
    }
  }, [hasStoredConnection, storedNWCInfo, unlockedNWCString]);

  const fetchBalance = async (connectionString: string | null) => {
    if (!connectionString) return;
    let nwc: NostrWebLNProvider | null = null;
    try {
      nwc = new NostrWebLNProvider({
        nostrWalletConnectUrl: connectionString,
      });
      await nwc.enable();
      const balanceRes = await nwc.getBalance();
      setBalance(balanceRes.balance / 1000); // Convert msats to sats
    } catch (e) {
      console.error("Failed to fetch balance", e);
      setBalance(null); // Clear balance on error
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
      if (!passphrase || passphrase.trim() === "") {
        throw new Error("A passphrase is required to save this wallet.");
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

      saveConnection?.(nwcString, info, passphrase.trim());
      setWalletInfo(info);
      setIsSaved(true);
      setPassphrase("");

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
    } finally {
      setIsLoading(false);
      if (nwc) {
        nwc.close();
      }
    }
  };

  const handleUnlock = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const connectionString = await ensureUnlocked?.();
      if (walletInfo?.methods?.includes("get_balance")) {
        await fetchBalance(connectionString || null);
      }
    } catch (e: any) {
      setError(e?.message || "Failed to unlock NWC connection.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleRemove = () => {
    setNwcString("");
    setPassphrase("");
    setWalletInfo(null);
    setBalance(null);
    setError(null);
    removeConnection?.();
  };

  const handleLock = () => {
    setBalance(null);
    setError(null);
    lockConnection?.();
  };

  return (
    <ProtectedRoute>
      <div className="bg-light-bg dark:bg-dark-bg flex h-full flex-col pt-24">
        <div className="bg mx-auto h-screen w-full lg:w-1/2 lg:pl-4">
          <SettingsBreadCrumbs />
          <div className="p-4">
            <h2 className="text-light-text dark:text-dark-text mb-4 text-xl font-bold">
              NWC Connection
            </h2>
            <p className="text-light-text dark:text-dark-text mb-4 text-sm">
              Connect your wallet using a Nostr Wallet Connect (NIP-47)
              connection string (e.g., from Alby, Mutiny, or Umbrel). This
              allows Shopstr to request payments directly from your wallet. The
              raw connection secret stays encrypted at rest and is only kept in
              memory after you unlock it for the active session.
            </p>

            <Input
              isClearable
              label="Nostr Wallet Connect String"
              placeholder="nostr+walletconnect://..."
              value={nwcString}
              onValueChange={setNwcString}
              className="mb-4"
              isDisabled={hasStoredConnection && !isUnlocked}
              classNames={{
                label: "text-light-text dark:text-dark-text",
                input: "text-light-text dark:text-dark-text",
              }}
            />

            <Input
              label="Wallet Passphrase"
              placeholder="Enter a passphrase to encrypt this connection"
              value={passphrase}
              onValueChange={setPassphrase}
              type="password"
              className="mb-4"
              isDisabled={hasStoredConnection && !isUnlocked}
              classNames={{
                label: "text-light-text dark:text-dark-text",
                input: "text-light-text dark:text-dark-text",
              }}
            />

            {error && (
              <div className="mb-4 flex items-center rounded border border-red-400 bg-red-100 p-3 text-red-700">
                <ExclamationCircleIcon className="mr-2 h-5 w-5" />
                <span className="text-sm">{error}</span>
              </div>
            )}

            {isSaved && !error && (
              <div className="mb-4 flex items-center rounded border border-green-400 bg-green-100 p-3 text-green-700">
                <CheckCircleIcon className="mr-2 h-5 w-5" />
                <span className="text-sm">Wallet connected successfully!</span>
              </div>
            )}

            <div className="flex items-center">
              {hasStoredConnection && !isUnlocked ? (
                <Button
                  className={SHOPSTRBUTTONCLASSNAMES}
                  onClick={handleUnlock}
                  isLoading={isLoading}
                >
                  {isLoading ? "Unlocking..." : "Unlock Wallet"}
                </Button>
              ) : (
                <Button
                  className={SHOPSTRBUTTONCLASSNAMES}
                  onClick={handleSave}
                  isLoading={isLoading}
                >
                  {isLoading
                    ? "Connecting..."
                    : isSaved
                      ? "Saved!"
                      : "Save Connection"}
                </Button>
              )}

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

              {walletInfo && isUnlocked && (
                <Button variant="light" className="ml-4" onClick={handleLock}>
                  Lock Wallet
                </Button>
              )}
            </div>

            {walletInfo && (
              <Card className="bg-light-fg dark:bg-dark-fg mt-6">
                <CardHeader>
                  <WalletIcon className="text-light-text dark:text-dark-text mr-2 h-5 w-5" />
                  <h3 className="text-light-text dark:text-dark-text font-bold">
                    Connected Wallet: {walletInfo.alias || "Unknown"}
                  </h3>
                </CardHeader>
                <CardBody>
                  {balance !== null ? (
                    <p className="text-light-text dark:text-dark-text">
                      Balance: {formatWithCommas(balance, "sats")}
                    </p>
                  ) : walletInfo.methods.includes("get_balance") ? (
                    <Spinner size="sm" />
                  ) : (
                    <p className="text-sm text-gray-500">
                      Balance: Not available
                    </p>
                  )}
                  <p className="mt-2 text-sm text-gray-500">
                    Supports: {walletInfo.methods.join(", ")}
                  </p>
                </CardBody>
              </Card>
            )}
          </div>
        </div>
      </div>
    </ProtectedRoute>
  );
};

export default NWCSettingsPage;
