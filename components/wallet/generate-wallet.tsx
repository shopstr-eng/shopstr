import { Button } from "@nextui-org/react"
import { SHOPSTRBUTTONCLASSNAMES } from "../utility/STATIC-VARIABLES"
import { validPassphrase } from "../utility/nostr-helper-functions";
import { encryptWalletToLocalStorageWithPassphrase, generateLiquidDescriptor, generateNewMnemonic, generateNewSigner, getNetwork } from "@/pages/wallet/lib";
import { useWalletContext } from "./wallet-context";

interface GenerateWalletProps {
  onGenerateSuccess: (passphrase: string) => void;
}

export const GenerateWallet = ({ onGenerateSuccess }: GenerateWalletProps ) => {
  const { changePassphrase } = useWalletContext();

  const handleGenerateWallet = () => {
    let isPassphraseValid = false;

    while (!isPassphraseValid) {
      const passphrase = window.prompt("Enter your passphrase: ") || "";
      isPassphraseValid = validPassphrase(passphrase);

      if (isPassphraseValid) {
        changePassphrase(passphrase);

        const network = getNetwork();
        const mnemonic = generateNewMnemonic();
        const signer = generateNewSigner(mnemonic, network);
        const descriptor = generateLiquidDescriptor(signer);

        encryptWalletToLocalStorageWithPassphrase(passphrase, descriptor);
        alert(`Keep these words safe, for recovery! \n\nRecovery phrase:\n****\n${mnemonic}\n****`);
        onGenerateSuccess(passphrase);
      } else {
        alert("Incorrect passphrase.");
      }
    }
  }
  return (
    <div className="w-max mx-auto flex flex-col items-center">
      <h2 className="text-4xl font-bold">You don't have a wallet yet!</h2>
      <Button
        className={SHOPSTRBUTTONCLASSNAMES + " m-2"}
        onClick={() => handleGenerateWallet() }
      >
        Generate a New Wallet
      </Button>
    </div>
  )
}