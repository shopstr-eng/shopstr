import { useEffect, useState } from "react";
import { getDecryptedDescriptorFromLocalStorage, isValidPassphraseWallet } from "./lib";

interface WalletState {
  descriptor: string;
}

const Wallet = () => {
  const [walletExists, toggleWalletExists] = useState(false);
  const [walletState, setWalletState] = useState<WalletState>({ descriptor: "" });

  const handleWalletStateChange = (props: { [key: string]: string }) => {
    setWalletState({
      ...walletState,
      ...props
    })
  }

  useEffect(() => {
    const walletDescriptor = window.localStorage.getItem("liquid-wallet-ct-descriptor");
    if (walletDescriptor) { 
      toggleWalletExists(true);
      let isPassphraseValid = false;
      let descriptor = "";

      while(!isPassphraseValid) {
        const passphrase = window.prompt("Enter your passphrase: ") || "";
        isPassphraseValid = isValidPassphraseWallet(passphrase);
        
        if (isPassphraseValid) {
          descriptor = getDecryptedDescriptorFromLocalStorage(passphrase)
          handleWalletStateChange({ descriptor: descriptor });
          toggleWalletExists(true);
        }
      }
    };
  }, [])

  return (
    <div className="flex min-h-screen flex-col bg-light-bg pb-20 pt-6 dark:bg-dark-bg sm:ml-[120px] md:ml-[250px]">
      { walletExists ? (
        <div>exists</div>
      ) : (
        <div>doesnt exist</div>
      )}
    </div>
  );
};

export default Wallet;
