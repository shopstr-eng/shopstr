import { Button } from "@nextui-org/react"
import { SHOPSTRBUTTONCLASSNAMES } from "../utility/STATIC-VARIABLES"
import { validPassphrase } from "../utility/nostr-helper-functions";
import { encryptWalletToLocalStorageWithPassphrase, generateLiquidDescriptor, generateNewMnemonic, generateNewSigner, getNetwork, isValidDescriptor } from "@/pages/wallet/lib";
import { useWalletContext } from "./wallet-context";
import { useState } from "react";

interface RecoverWalletProps {
  onRecoverSuccess: (passphrase: string) => void;
}

export const RecoverWallet = ({ onRecoverSuccess }: RecoverWalletProps ) => {
  const { changePassphrase, changeDescriptor } = useWalletContext();
  const [descriptorInput, setDescriptorInput] = useState("");

  const handleRecoverWallet = () => {
    let isPassphraseValid = false;

    while (!isPassphraseValid) {
      const passphrase = window.prompt("Enter your passphrase: ") || "";
      isPassphraseValid = validPassphrase(passphrase);

      if (isPassphraseValid) {
        changePassphrase(passphrase);
        
        if (isValidDescriptor(descriptorInput.trim())) {
            changeDescriptor(descriptorInput);
            encryptWalletToLocalStorageWithPassphrase(passphrase, descriptorInput);
            onRecoverSuccess(passphrase);
        } else {
            alert("Invalid descriptor!")
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
            placeholder="Enter your CT descriptor here"
            className="text-black bg-gray-300 min-w-[400px] rounded px-4 py-2 min-h-[180px]"
            onChange={(val) => setDescriptorInput(val.target.value)}
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