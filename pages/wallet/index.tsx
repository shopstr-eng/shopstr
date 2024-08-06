import { useEffect, useMemo, useState } from "react";
import { getAddress, getBalance, getDecryptedDescriptorFromLocalStorage, isValidPassphraseWallet } from "./lib";
import { GenerateWallet } from "@/components/wallet/generate-wallet";
import { useWalletContext } from "@/components/wallet/wallet-context";
import { WolletDescriptor } from "lwk_wasm";

const Wallet = () => {
  const [walletExists, toggleWalletExists] = useState(false);
  const { descriptor, passphrase, changeDescriptor, changePassphrase } = useWalletContext();
  const [balance, setBalance] = useState(0n);
  
  const receiveAddress = useMemo(() => {
    if (descriptor) {
      const wolletDescriptor = new WolletDescriptor(descriptor)
      return getAddress(wolletDescriptor).address();
    } else {
      return null;
    }
  }, [descriptor])

  const onGenerateSuccess = (passphrase: string) => {
    const descriptor = getDecryptedDescriptorFromLocalStorage(passphrase);
    changeDescriptor(descriptor);
    changePassphrase(passphrase);
    toggleWalletExists(true);
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
        const lBalance = getBalance(wolletDescriptor).values().next().value;
        setBalance(BigInt(lBalance))
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [descriptor])

  return (
    <div className="flex min-h-screen flex-col bg-light-bg pb-20 pt-6 dark:bg-dark-bg sm:ml-[120px] md:ml-[250px]">
      { walletExists ? (
        <section className="flex flex-col gap-y-4">
          <center>
            <h2 className="text-3xl font-bold">Shopstr Liquid Wallet</h2>
          </center>
          <center>
            <div className="flex flex-col gap-y-12 items-center px-4">
              <h4 className="break-all">{receiveAddress?.toString()}</h4>
              <img src={receiveAddress?.QRCodeUri()} style={{ imageRendering: "pixelated"}} className="w-32 mx-auto"/>
            </div>
          </center>
          <center>
            <strong>Balance: </strong><span>{balance.toString()}</span>
          </center>
        </section>
      ) : (
        <>
          <GenerateWallet onGenerateSuccess={onGenerateSuccess}/>
        </>
      )}
    </div>
  );
};

export default Wallet;
