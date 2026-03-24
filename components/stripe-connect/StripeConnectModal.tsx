import { useState, useContext } from "react";
import type React from "react";
import {
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  Button,
} from "@nextui-org/react";
import {
  CreditCardIcon,
  ArrowTopRightOnSquareIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import {
  BLUEBUTTONCLASSNAMES,
  WHITEBUTTONCLASSNAMES,
} from "@/utils/STATIC-VARIABLES";
import { SignerContext } from "@/components/utility-components/nostr-context-provider";
import { createAuthEventTemplate } from "@/utils/stripe/verify-nostr-auth";

interface StripeConnectModalProps {
  isOpen: boolean;
  onClose: () => void;
  pubkey: string;
  returnPath?: string;
  refreshPath?: string;
}

const StripeConnectModal: React.FC<StripeConnectModalProps> = ({
  isOpen,
  onClose,
  pubkey,
  returnPath,
  refreshPath,
}) => {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { signer } = useContext(SignerContext);

  const signAuthEvent = async () => {
    if (!signer || !signer.sign) {
      throw new Error("No signer available. Please log in first.");
    }
    const template = createAuthEventTemplate(pubkey);
    const signed = await signer.sign(template);
    return signed;
  };

  const handleSetupStripe = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const signedEvent = await signAuthEvent();

      const createRes = await fetch("/api/stripe/connect/create-account", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pubkey, signedEvent }),
      });

      if (!createRes.ok) {
        const errData = await createRes.json();
        throw new Error(errData.error || "Failed to create Stripe account");
      }

      const { accountId } = await createRes.json();

      const linkRes = await fetch("/api/stripe/connect/create-account-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accountId,
          pubkey,
          signedEvent,
          returnPath: returnPath || "/settings/shop-profile?stripe=success",
          refreshPath: refreshPath || "/settings/shop-profile?stripe=refresh",
        }),
      });

      if (!linkRes.ok) {
        throw new Error("Failed to create onboarding link");
      }

      const { url } = await linkRes.json();
      window.open(url, "_blank");
      onClose();
    } catch (err) {
      console.error("Stripe setup error:", err);
      setError(
        err instanceof Error
          ? err.message
          : "Something went wrong. Please try again."
      );
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Modal
      backdrop="blur"
      isOpen={isOpen}
      onClose={onClose}
      classNames={{
        wrapper: "shadow-neo",
        base: "border-2 border-black rounded-md",
        backdrop: "bg-black/20 backdrop-blur-sm",
        header: "border-b-2 border-black bg-white rounded-t-md text-black",
        body: "py-6 bg-white",
        footer: "border-t-2 border-black bg-white rounded-b-md",
        closeButton:
          "hover:bg-gray-200 active:bg-gray-300 rounded-md text-black",
      }}
      isDismissable={true}
      scrollBehavior="normal"
      placement="center"
      size="lg"
    >
      <ModalContent>
        <ModalHeader className="flex items-center gap-2 text-black">
          <CreditCardIcon className="h-6 w-6 text-primary-blue" />
          <span>Set Up Stripe Payments</span>
        </ModalHeader>
        <ModalBody className="text-black">
          <p className="text-base font-medium">
            Connect your Stripe account to accept credit card payments from
            buyers on Milk Market.
          </p>
          <div className="mt-3 space-y-2">
            <div className="flex items-start gap-2">
              <span className="mt-0.5 text-lg font-bold text-primary-blue">
                1.
              </span>
              <span className="text-sm">
                Click &quot;Set Up Stripe&quot; to create your connected account
              </span>
            </div>
            <div className="flex items-start gap-2">
              <span className="mt-0.5 text-lg font-bold text-primary-blue">
                2.
              </span>
              <span className="text-sm">
                Complete Stripe&apos;s verification process (takes a few
                minutes)
              </span>
            </div>
            <div className="flex items-start gap-2">
              <span className="mt-0.5 text-lg font-bold text-primary-blue">
                3.
              </span>
              <span className="text-sm">
                Start accepting card payments on all your listings
              </span>
            </div>
          </div>
          {error && (
            <p className="mt-2 text-sm font-medium text-red-500">{error}</p>
          )}
        </ModalBody>
        <ModalFooter className="flex gap-2">
          <Button
            className={WHITEBUTTONCLASSNAMES}
            onClick={onClose}
            startContent={<XMarkIcon className="h-4 w-4" />}
          >
            Skip for Now
          </Button>
          <Button
            className={BLUEBUTTONCLASSNAMES}
            onClick={handleSetupStripe}
            isLoading={isLoading}
            startContent={
              !isLoading ? (
                <ArrowTopRightOnSquareIcon className="h-4 w-4" />
              ) : undefined
            }
          >
            Set Up Stripe
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
};

export default StripeConnectModal;
