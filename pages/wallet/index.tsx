import { useEffect, useMemo, useState } from "react";
import { getAddress, getBalance, getDecryptedDescriptorFromLocalStorage, isValidPassphraseWallet } from "./lib";
import { GenerateWallet } from "@/components/wallet/generate-wallet";
import { useWalletContext } from "@/components/wallet/wallet-context";
import { WolletDescriptor } from "lwk_wasm";
import Transactions from "@/components/wallet/transactions";
import { SHOPSTRBUTTONCLASSNAMES } from "@/components/utility/STATIC-VARIABLES";
import { Button } from "@nextui-org/react";
import { BitcoinPriceResponse, fetchBitcoinPrice, formatFiatBalance, shortenString } from "@/components/utility/wallet-helper";
import { RecoverWallet } from "@/components/wallet/recover-wallet";
import { Dialog, DialogContent, DialogFooter, DialogHeader } from "@/components/utility/shadcn/Dialog";

const Wallet = () => {
  const [walletExists, toggleWalletExists] = useState(false);
  const { descriptor, passphrase, changeDescriptor, changePassphrase } = useWalletContext();
  const [balance, setBalance] = useState(0n);
  const [transactions, setTransactions] = useState<any>();
  const [bitcoinPrice, setBitcoinPrice] = useState<BitcoinPriceResponse>();
  const [fiatCurrency, setFiatCurrency] = useState<BitcoinPriceResponse['bpi']['USD']['code']>("USD");
  const [swapDialogOpen, setSwapDialogOpen] = useState({ open: false, type: ""})
  
  const receiveAddress = useMemo(() => {
    if (descriptor) {
      const wolletDescriptor = new WolletDescriptor(descriptor)
      return getAddress(wolletDescriptor, transactions?.length + 1).address();
    } else {
      return null;
    }
  }, [descriptor, transactions])

  const onWalletSetupSuccess = (passphrase: string) => {
    const descriptor = getDecryptedDescriptorFromLocalStorage(passphrase);
    changeDescriptor(descriptor);
    changePassphrase(passphrase);
    toggleWalletExists(true);
  }

  const handleCopyToClipboard = (val: string) => {
    navigator.clipboard.writeText(val);
  }

  const handleCycleFiat = () => {
    const fiats = ['USD', 'EUR', 'GBP'];
    const newFiatCurrency = fiats.filter(fiat => fiat !== fiatCurrency)[Math.floor(Math.random() * (fiats.length - 1))] as "USD" | "EUR" | "GBP";
    setFiatCurrency(newFiatCurrency)
  }

  const handleDisconnectWallet = () => {
    const confirm = window.confirm("Really disconnect wallet?");
    if (!confirm) return;
    let isPassphraseValid = false;

      while(!isPassphraseValid) {
        const passphrase = window.prompt("Enter your passphrase: ") || "";
        try {
          isPassphraseValid = isValidPassphraseWallet(passphrase);
        } catch (_) {
          isPassphraseValid = false;
        }
        
        if (isPassphraseValid) {
          localStorage.removeItem("liquid-wallet-ct-descriptor");
          setBalance(0n);
          setTransactions([])
          changeDescriptor("");
          changePassphrase(passphrase);
          toggleWalletExists(false);
          break;
        } else {
          alert("Incorrect passphrase.");
        }
      }
  }

  useEffect(() => {
    const walletDescriptor = window.localStorage.getItem("liquid-wallet-ct-descriptor");
    if (walletDescriptor) { 
      let isPassphraseValid = false;
      let descriptor = "";

      while(!isPassphraseValid) {
        const passphrase = window.prompt("Enter your passphrase: ") || "";
        try {
          isPassphraseValid = isValidPassphraseWallet(passphrase);
        } catch (_) {
          isPassphraseValid = false;
        }
        
        if (isPassphraseValid) {
          descriptor = getDecryptedDescriptorFromLocalStorage(passphrase)
          changeDescriptor(descriptor);
          changePassphrase(passphrase);
          toggleWalletExists(true);

          if (descriptor) {
            const wolletDescriptor = new WolletDescriptor(descriptor);
            getBalance(wolletDescriptor).then((value) => {
              const balanceMap: Map<string, string> = value?.balance;
              const balance = balanceMap.values().next().value;
              setBalance(BigInt(balance));
              setTransactions(value?.transactions)
            })
            fetchBitcoinPrice().then((value) => {
              setBitcoinPrice(value);
            });
          }
          break;
        } else {
          alert("Incorrect passphrase.");
        }
      }
    };
  }, [])

  useEffect(() => {
    const interval = setInterval(() => {
      if (descriptor) {
        const wolletDescriptor = new WolletDescriptor(descriptor);
        getBalance(wolletDescriptor).then((value) => {
          const balanceMap: Map<string, string> = value?.balance;
          const balance = balanceMap.values().next().value;
          setBalance(BigInt(balance));
          setTransactions(value?.transactions)
        })
      }
    }, 15 * 1000);

    return () => clearInterval(interval);
  }, [descriptor])

  useEffect(() => {
    const interval = setInterval(() => {
      fetchBitcoinPrice().then((value) => {
        setBitcoinPrice(value);
      });
    }, 5 * 60 * 1000);

    return () => clearInterval(interval);
  }, [])

  return (
    <div className="flex min-h-screen flex-col bg-light-bg pb-20 pt-6 dark:bg-dark-bg sm:ml-[120px] md:ml-[250px]">
      { walletExists ? (
        <section className="flex flex-col gap-y-4">
          <center>
            <h2 className="text-3xl font-bold">Shopstr Liquid Wallet</h2>
          </center>
          <center>
            <div className="flex flex-col gap-y-6 items-center px-4">
              <div className="flex flex-col gap-y-2 items-center justify-center">
                <h4 className="break-all">{shortenString(receiveAddress?.toString()!, 8)}</h4>
                <div className="flex gap-x-4">
                  <Button className={SHOPSTRBUTTONCLASSNAMES} onClick={() => handleCopyToClipboard(receiveAddress?.toString()!)}>Copy Receive Address</Button>
                  <Button className={SHOPSTRBUTTONCLASSNAMES} onClick={() => handleCopyToClipboard(descriptor)}>Copy CT Descriptor</Button>
                </div>
                <div className="flex gap-x-4">
                  <Button className={SHOPSTRBUTTONCLASSNAMES} onClick={() => setSwapDialogOpen({ open: true, type: "receive" })}>Receive LN</Button>
                  {/* <Button className={SHOPSTRBUTTONCLASSNAMES} onClick={() => setSwapDialogOpen({ open: true, type: "send"})}>Pay LN</Button> */}
                </div>
                <Button className="bg-red-500 rounded px-2 py-[2px] h-min text-xs" onClick={() => handleDisconnectWallet()}>Disconnect Wallet</Button>
              </div>
              <img 
                src={receiveAddress?.QRCodeUri()} 
                style={{ imageRendering: "pixelated"}} 
                className="w-32 mx-auto p-2 bg-white"
                onClick={() => handleCopyToClipboard(receiveAddress?.toString()!)}
              />
            </div>
          </center>
          <center className="flex flex-col">
            <strong className="text-xl">Balance</strong>
            <span className="text-2xl">{balance.toLocaleString()} sats</span>
            <span 
              onClick={() => handleCycleFiat()} 
              className="text-lg text-grey-50 select-none cursor-pointer"
            >
              {formatFiatBalance(fiatCurrency, bitcoinPrice?.bpi[fiatCurrency].rate_float ?? 0, balance).display_string}
            </span>
          </center>
          <center>
            <Transactions transactions={transactions}/>
          </center>
          <Dialog open={swapDialogOpen.open} onOpenChange={(val) => setSwapDialogOpen({ open: val, type: ""})}>
            <DialogContent>
              <h5 className="text-2xl font-bold">{swapDialogOpen.type}</h5>
              <div className="w-full h-full min-w-[450px] min-h-[500px]">
                <iframe src="https://boltz.exchange" className="w-full h-full"></iframe>
              </div>
              <div className="flex gap-x-2 w-full justify-end">
                <Button className={SHOPSTRBUTTONCLASSNAMES + " w-min"} onClick={() => handleCopyToClipboard(receiveAddress?.toString()!)}>Copy Your Receive Address</Button>
              </div>
            </DialogContent>
          </Dialog>
        </section>
      ) : (
        <>
          <GenerateWallet onGenerateSuccess={onWalletSetupSuccess}/>
          <RecoverWallet onRecoverSuccess={onWalletSetupSuccess}/>
        </>
      )}
    </div>
  );
};

export default Wallet;
