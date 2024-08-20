import { Button } from "@nextui-org/react"
import { SHOPSTRBUTTONCLASSNAMES } from "../utility/STATIC-VARIABLES"
import { getNsecWithPassphrase, validPassphrase } from "../utility/nostr-helper-functions";
import { encryptWalletToLocalStorageWithPassphrase, getNetwork, getRecoveryTypeIfValid, recoverDescriptorByMnemonic } from "@/components/wallet/wasm/lib";
import { useWalletContext } from "./wallet-context";
import { useState } from "react";
import { Jade, WolletDescriptor } from "lwk_wasm";

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

  const handleRecoverFromJade = async () => {
    let isPassphraseValid = false;
    const nsecExists = localStorage.getItem("encryptedPrivateKey");
    let jade: Jade | null | unknown = null;
    
    try {
      jade = await Promise.race([
        new Jade(getNetwork(), false),
        new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout: No device selected")), 5000))
      ]).catch(() => {
        throw new Error("problem")
      })
      console.log("jade initialized successfully");
    } catch (e) {
      console.error(`Error: ${e}`);
    }

    if (!jade) return;

    if (nsecExists) {
      while (!isPassphraseValid) {
        const passphrase = window.prompt("Enter passphrase for wallet:");
        
        if (!getNsecWithPassphrase(passphrase ?? "")) {
          return;
        } else {
          try {
            if (jade) {
              console.log({jade})
              // @ts-expect-error
              const descriptorJade = await jade.wpkh();
              changeDescriptor(descriptorJade.toString());
              encryptWalletToLocalStorageWithPassphrase(passphrase!, descriptorJade.toString());
              onRecoverSuccess(passphrase!);
            }
          } catch (e) {
            console.error(`${e}`)
          }

        }
      }
    } else {
      const passphrase = window.prompt("Enter new passphrase: ") ?? "";

      try {
        const jade = new Jade(getNetwork(), true);
        
        if (jade) {
          const descriptorJade = await jade.wpkh();
          changeDescriptor(descriptorJade.toString());
          encryptWalletToLocalStorageWithPassphrase(passphrase, descriptorJade.toString());
          onRecoverSuccess(passphrase);
        }
      } catch (e) {
        console.error(`${e}`)
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
        <Button
            className={SHOPSTRBUTTONCLASSNAMES}
            onClick={() => handleRecoverFromJade() }
        >
            Connect JADE
        </Button>
    </div>
  )
}