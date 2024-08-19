import { Button } from "@nextui-org/react"
import { SHOPSTRBUTTONCLASSNAMES } from "../utility/STATIC-VARIABLES"
import { validPassphrase } from "../utility/nostr-helper-functions";
import { encryptWalletToLocalStorageWithPassphrase, generateLiquidDescriptor, generateNewMnemonic, generateNewSigner, getNetwork } from "@/pages/wallet/lib";
import { useWalletContext } from "./wallet-context";
import { Dialog, DialogContent } from "../utility/shadcn/Dialog";
import { useState } from "react";
import { DialogTitle } from "@radix-ui/react-dialog";
import Icon from "@mdi/react";
import { mdiAlert } from "@mdi/js";

interface GenerateWalletProps {
  onGenerateSuccess: (passphrase: string) => void;
}

export const GenerateWallet = ({ onGenerateSuccess }: GenerateWalletProps ) => {
  const { changePassphrase, passphrase, descriptor, changeDescriptor } = useWalletContext();
  const [mnemonic, setMnemonic] = useState<string[]>([]);
  const [showSeedDialog, setShowSeedDialog] = useState(false);

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
        changeDescriptor(descriptor);
        setMnemonic(mnemonic?.split(" "));
        setShowSeedDialog(true);
      } else {
        alert("Incorrect passphrase.");
      }
    }
  }

  const handleConfirm = () => {
    const confirmAgain = window.confirm("Are you really sure?");
    if (confirmAgain) {
      encryptWalletToLocalStorageWithPassphrase(passphrase, descriptor);
      onGenerateSuccess(passphrase);
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
      <Dialog open={showSeedDialog} onOpenChange={(val) => setShowSeedDialog(val)}>
        <DialogContent className="border-shopstr-yellow text-center px-2">
          <DialogTitle className="flex flex-col gap-y-3 items-center">
            <Icon path={mdiAlert} className="w-24 text-shopstr-yellow-light" />
            <p className="text-4xl font-bold text-white text-center">Secure your recovery phrase</p>
            <p className="text-muted">
              The combination of words bellow are called your recovery phrase. The recovery phrase allows you to
              access and restore your wallet. Write them down on a piece of paper in the exact order.
            </p>
          </DialogTitle>
          <main className="flex flex-col justify-center items-center gap-y-4">
            <section className="grid grid-cols-2 gap-x-4">
              <div className="flex flex-col gap-y-2">
                { mnemonic && mnemonic?.slice(0, 6)?.map((word, i) => (
                    <span className="text-md font-bold text-white" key={i}><span className="font-light text-md">{i + 1}: </span> {word}</span>
                  ))
                }
              </div>
              <div className="flex flex-col gap-y-2">
                { mnemonic && mnemonic?.slice(6)?.map((word, i) => (
                    <span className="text-md font-bold text-white" key={i}><span className="font-light text-md">{i + 6 + 1}: </span> {word}</span>
                  ))
                }
              </div>
            </section>
            <section className="flex flex-col gap-y-3">
              <p className="text-muted">
                If  you lose it or write it down incorrectly, you will permanently lose access to your funds.
                Do not photograph the recovery phrase and do not store it digitally.
              </p>
              <p className="text-lg font-bold">The recovery phrase IS NOT stored on our servers, and we cannot help you recover it.</p>
            </section>
            <footer>
              <Button className={SHOPSTRBUTTONCLASSNAMES} onClick={() => handleConfirm()}>I have written it down safely!</Button>
            </footer>
          </main>
        </DialogContent>
      </Dialog>
    </div>
  )
}