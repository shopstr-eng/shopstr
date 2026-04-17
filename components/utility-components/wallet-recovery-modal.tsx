import { useState } from "react";
import {
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  Button,
} from "@heroui/react";
import { useRouter } from "next/router";
import { ExclamationTriangleIcon } from "@heroicons/react/24/outline";
import {
  BLACKBUTTONCLASSNAMES,
  WHITEBUTTONCLASSNAMES,
} from "@/utils/STATIC-VARIABLES";
import SignInModal from "@/components/sign-in/SignInModal";

export interface WalletRecoveryModalProps {
  isOpen: boolean;
  onClose: () => void;
  amountSats: number;
  mintUrl?: string;
  isLoggedIn?: boolean;
  /**
   * When true, no proofs are stashed locally — the Lightning payment may have
   * settled at the mint but the in-page claim never completed (e.g. polling
   * timed out). The recovery boot will retry the claim on next sign-in.
   */
  pendingRecovery?: boolean;
}

export default function WalletRecoveryModal({
  isOpen,
  onClose,
  amountSats,
  mintUrl,
  isLoggedIn,
  pendingRecovery = false,
}: WalletRecoveryModalProps) {
  const router = useRouter();
  const [signInOpen, setSignInOpen] = useState(false);

  const goToWallet = () => {
    onClose();
    router.push("/wallet");
  };

  const headerText = pendingRecovery
    ? "Payment confirmation timed out"
    : "Funds saved to your local wallet";

  return (
    <>
      <Modal
        backdrop="blur"
        isOpen={isOpen}
        onClose={onClose}
        classNames={{
          wrapper: "shadow-neo",
          base: "border-2 border-black rounded-md",
          backdrop: "bg-black/20 backdrop-blur-sm",
          header: "border-b-2 border-black bg-white rounded-t-md text-black",
          body: "py-6 bg-white text-black",
          footer: "border-t-2 border-black bg-white rounded-b-md",
          closeButton:
            "hover:bg-gray-200 active:bg-gray-300 rounded-md text-black",
        }}
        isDismissable={true}
        scrollBehavior={"normal"}
        placement={"center"}
        size="2xl"
      >
        <ModalContent>
          <ModalHeader className="flex items-center justify-center text-black">
            <ExclamationTriangleIcon className="h-6 w-6 text-amber-500" />
            <div className="ml-2">{headerText}</div>
          </ModalHeader>
          <ModalBody className="flex flex-col gap-3 overflow-hidden text-black">
            {pendingRecovery ? (
              <>
                <p>
                  We couldn&apos;t confirm your Lightning payment of{" "}
                  <strong>{amountSats.toLocaleString()} sats</strong> within the
                  expected window
                  {mintUrl ? (
                    <>
                      {" "}
                      on{" "}
                      <code className="rounded bg-gray-100 px-1 py-0.5 text-sm break-all">
                        {mintUrl}
                      </code>
                    </>
                  ) : null}
                  .
                </p>
                <p>
                  If the payment did go through, your funds are still safe at
                  the mint. We&apos;ve saved a recovery record in this browser
                  and will automatically claim the eCash tokens the next time
                  you open your wallet.
                </p>
                {isLoggedIn ? (
                  <p>Open your wallet now to attempt the claim.</p>
                ) : (
                  <p>
                    To finish the claim, create an account (or sign in). The
                    recovery is queued in this browser, but an account is
                    required to back the recovered tokens up to your nostr
                    relays.
                  </p>
                )}
              </>
            ) : (
              <>
                <p>
                  We couldn&apos;t deliver your payment to the seller, but your{" "}
                  <strong>{amountSats.toLocaleString()} sats</strong> are safe —
                  the eCash tokens have been stored in this browser&apos;s local
                  wallet
                  {mintUrl ? (
                    <>
                      {" "}
                      on{" "}
                      <code className="rounded bg-gray-100 px-1 py-0.5 text-sm break-all">
                        {mintUrl}
                      </code>
                    </>
                  ) : null}
                  .
                </p>
                {isLoggedIn ? (
                  <p>
                    Open your wallet to view, back up, or send the recovered
                    tokens.
                  </p>
                ) : (
                  <p>
                    To access them, create an account (or sign in) — your wallet
                    lives in this browser, but an account is required to open
                    the wallet UI and back the tokens up to your nostr relays so
                    they aren&apos;t lost if you clear your browser.
                  </p>
                )}
              </>
            )}
            <p className="text-sm text-gray-600">
              Tip: don&apos;t clear your browser data for this site until your
              tokens are backed up or spent.
            </p>
          </ModalBody>
          <ModalFooter className="flex flex-col gap-2 sm:flex-row sm:justify-end">
            <Button className={WHITEBUTTONCLASSNAMES} onPress={onClose}>
              Dismiss
            </Button>
            {isLoggedIn ? (
              <Button className={BLACKBUTTONCLASSNAMES} onPress={goToWallet}>
                Go to wallet
              </Button>
            ) : (
              <Button
                className={BLACKBUTTONCLASSNAMES}
                onPress={() => setSignInOpen(true)}
              >
                Sign in / Create account
              </Button>
            )}
          </ModalFooter>
        </ModalContent>
      </Modal>
      <SignInModal isOpen={signInOpen} onClose={() => setSignInOpen(false)} />
    </>
  );
}
