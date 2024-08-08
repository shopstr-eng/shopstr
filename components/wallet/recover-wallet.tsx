import { Button } from "@nextui-org/react"
import { SHOPSTRBUTTONCLASSNAMES } from "../utility/STATIC-VARIABLES"
import { validPassphrase } from "../utility/nostr-helper-functions";
import { encryptWalletToLocalStorageWithPassphrase, getRecoveryTypeIfValid, recoverDescriptorByMnemonic } from "@/pages/wallet/lib";
import { useWalletContext } from "./wallet-context";
import { useState } from "react";

interface RecoverWalletProps {
  onRecoverSuccess: (passphrase: string) => void;
}

export const RecoverWallet = ({ onRecoverSuccess }: RecoverWalletProps ) => {
  const { changePassphrase, changeDescriptor } = useWalletContext();
  const [keyInput, setKeyInput] = useState("");

  const handleRecoverWallet = () => {
    let isPassphraseValid = false;
    let recoverType: "descriptor" | "xpub" | "mnemonic" | null = null;

    while (!isPassphraseValid) {
      const passphrase = window.prompt("Enter your passphrase: ") || "";
      isPassphraseValid = validPassphrase(passphrase);

      if (isPassphraseValid) {
        changePassphrase(passphrase);
        
        recoverType = getRecoveryTypeIfValid(keyInput);
        let inDescriptor;
        if (recoverType) {
          switch (recoverType) {
            case "descriptor":
              inDescriptor = keyInput;
              break;
            case "mnemonic":
              inDescriptor = recoverDescriptorByMnemonic(keyInput);
              break;
          }
          changeDescriptor(inDescriptor);
          encryptWalletToLocalStorageWithPassphrase(passphrase, inDescriptor);
          onRecoverSuccess(passphrase);
        } else {
            alert("Invalid input!")
            break;
        }

      } else {
        alert("Incorrect passphrase.");
      }
    }
  }
  return (
    <div className="w-max mx-auto flex flex-col items-center justify-center gap-y-6 pt-12">
        <textarea 
            placeholder="Enter your CT descriptor or mnemonic here"
            className="text-black bg-gray-300 min-w-[400px] rounded px-4 py-2 min-h-[180px]"
            onChange={(val) => setKeyInput(val.target.value)}
        />
        <Button
            className={SHOPSTRBUTTONCLASSNAMES}
            onClick={() => handleRecoverWallet() }
        >
            Recover Wallet
        </Button>
    </div>
  )
}