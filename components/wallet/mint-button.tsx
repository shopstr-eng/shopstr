import React, { useContext, useState } from "react";
import { useForm, Controller } from "react-hook-form";
import {
  BanknotesIcon,
  CheckIcon,
  ClipboardIcon,
  InformationCircleIcon,
} from "@heroicons/react/24/outline";
import {
  Card,
  CardBody,
  CardHeader,
  Divider,
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  Button,
  Image,
  Input,
} from "@nextui-org/react";
import { SHOPSTRBUTTONCLASSNAMES } from "@/utils/STATIC-VARIABLES";
import {
  getLocalStorageData,
  publishProofEvent,
} from "@/utils/nostr/nostr-helper-functions";
import { CashuMint, CashuWallet } from "@cashu/cashu-ts";
import QRCode from "qrcode";
import FailureModal from "@/components/utility-components/failure-modal";
import {
  NostrContext,
  SignerContext,
} from "@/components/utility-components/nostr-context-provider";
import { NostrNIP46Signer } from "@/utils/nostr/signers/nostr-nip46-signer";

const MintButton = () => {
  const [showMintModal, setShowMintModal] = useState(false);
  const [showInvoiceCard, setShowInvoiceCard] = useState(false);

  const [paymentConfirmed, setPaymentConfirmed] = useState(false);
  const [qrCodeUrl, setQrCodeUrl] = useState<string | null>(null);
  const [invoice, setInvoice] = useState("");
  const [copiedToClipboard, setCopiedToClipboard] = useState(false);

  const [showFailureModal, setShowFailureModal] = useState(false);
  const [failureText, setFailureText] = useState("");

  const { signer } = useContext(SignerContext);
  const { nostr } = useContext(NostrContext);

  const { mints, tokens, history } = getLocalStorageData();

  const {
    handleSubmit: handleMintSubmit,
    control: mintControl,
    reset: mintReset,
  } = useForm();

  const handleToggleMintModal = () => {
    mintReset();
    setPaymentConfirmed(false);
    setShowMintModal(!showMintModal);
    setShowInvoiceCard(false);
  };

  const onMintSubmit = async (data: { [x: string]: number }) => {
    const numSats = data["sats"];
    setShowInvoiceCard(true);
    await handleMint(numSats!);
  };

  const handleMint = async (numSats: number) => {
    const wallet = new CashuWallet(new CashuMint(mints[0]!));

    const { request: pr, quote: hash } = await wallet.createMintQuote(numSats);

    setInvoice(pr);

    QRCode.toDataURL(pr)
      .then((url: string) => {
        setQrCodeUrl(url);
      })
      .catch((err: unknown) => {
        console.error("ERROR", err);
      });

    if (typeof window.webln !== "undefined") {
      try {
        await window.webln.enable();
        const isEnabled = await window.webln.isEnabled();
        if (!isEnabled) {
          throw new Error("WebLN is not enabled");
        }
        try {
          const res = await window.webln.sendPayment(pr);
          if (!res) {
            throw new Error("Payment failed");
          }
        } catch (e) {
          console.error(e);
        }
      } catch (e) {
        console.error(e);
      }
    }
    await invoiceHasBeenPaid(wallet, numSats, hash);
  };

  /** CHECKS WHETHER INVOICE HAS BEEN PAID */
  async function invoiceHasBeenPaid(
    wallet: CashuWallet,
    numSats: number,
    hash: string
  ) {
    while (true) {
      try {
        const proofs = await wallet.mintProofs(numSats, hash);

        if (proofs) {
          const proofArray = [...tokens, ...proofs];
          localStorage.setItem("tokens", JSON.stringify(proofArray));
          localStorage.setItem(
            "history",
            JSON.stringify([
              { type: 3, amount: numSats, date: Math.floor(Date.now() / 1000) },
              ...history,
            ])
          );
          await publishProofEvent(
            nostr!,
            signer!,
            mints[0]!,
            proofs,
            "in",
            numSats.toString()
          );
          // potentially capture a metric for the mint invoice
          setPaymentConfirmed(true);
          setQrCodeUrl(null);
          setTimeout(() => {
            handleToggleMintModal(); // takes you back to the page after payment has been confirmed by cashu mint api
          }, 1900); // 1.9 seconds is the amount of time for the checkmark animation to play
          break;
        }
      } catch (error) {
        console.error(error);
        if (error instanceof TypeError) {
          setShowInvoiceCard(false);
          setInvoice("");
          setQrCodeUrl(null);
          setFailureText(
            "Failed to validate invoice! Change your mint in settings and/or please try again."
          );
          setShowFailureModal(true);
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 2100));
      }
    }
  }

  const handleCopyInvoice = () => {
    navigator.clipboard.writeText(invoice);
    setCopiedToClipboard(true);
    setTimeout(() => {
      setCopiedToClipboard(false);
    }, 2100);
  };

  return (
    <div>
      <Button
        className={SHOPSTRBUTTONCLASSNAMES + " m-2"}
        onClick={() => setShowMintModal(!showMintModal)}
        startContent={
          <BanknotesIcon className="h-6 w-6 hover:text-yellow-500 dark:hover:text-purple-500" />
        }
      >
        Mint
      </Button>
      <Modal
        backdrop="blur"
        isOpen={showMintModal}
        onClose={handleToggleMintModal}
        classNames={{
          body: "py-6",
          backdrop: "bg-[#292f46]/50 backdrop-opacity-60",
          // base: "border-[#292f46] bg-[#19172c] dark:bg-[#19172c] text-[#a8b0d3]",
          header: "border-b-[1px] border-[#292f46]",
          footer: "border-t-[1px] border-[#292f46]",
          closeButton: "hover:bg-black/5 active:bg-white/10",
        }}
        scrollBehavior={"outside"}
        size="2xl"
      >
        <ModalContent>
          <ModalHeader className="flex flex-col gap-1 text-light-text dark:text-dark-text">
            Mint Tokens
          </ModalHeader>
          <form onSubmit={handleMintSubmit(onMintSubmit)}>
            <ModalBody>
              <Controller
                name="sats"
                control={mintControl}
                rules={{
                  required: "A whole number is required.",
                  maxLength: {
                    value: 500,
                    message: "This input exceed maxLength of 500.",
                  },
                  validate: (value) =>
                    /^\d+$/.test(value) || "Please enter a whole number.",
                }}
                render={({
                  field: { onChange, onBlur, value },
                  fieldState: { error },
                }) => {
                  const isErrored = error !== undefined;
                  const errorMessage: string = error?.message
                    ? error.message
                    : "";
                  return (
                    <Input
                      className="text-light-text dark:text-dark-text"
                      autoFocus
                      variant="bordered"
                      fullWidth={true}
                      label="Token amount in sats"
                      labelPlacement="inside"
                      isInvalid={isErrored}
                      errorMessage={errorMessage}
                      // controller props
                      onChange={onChange} // send value to hook form
                      onBlur={onBlur} // notify when input is touched/blur
                      value={value}
                    />
                  );
                }}
              />
              {signer instanceof NostrNIP46Signer && (
                <div className="mx-4 my-2 flex items-center justify-center text-center">
                  <InformationCircleIcon className="h-6 w-6 text-light-text dark:text-dark-text" />
                  <p className="ml-2 text-xs text-light-text dark:text-dark-text">
                    If the token is taking a while to be minted, make sure to
                    check your bunker application to approve the transaction
                    events.
                  </p>
                </div>
              )}
              {showInvoiceCard && (
                <Card className="mt-3 max-w-[700px]">
                  <CardHeader className="flex justify-center gap-3">
                    <span className="text-xl font-bold">Lightning Invoice</span>
                  </CardHeader>
                  <Divider />
                  <CardBody className="flex flex-col items-center">
                    {!paymentConfirmed ? (
                      <div className="flex flex-col items-center justify-center">
                        {qrCodeUrl ? (
                          <>
                            <Image
                              alt="Lightning invoice"
                              className="object-cover"
                              src={qrCodeUrl}
                            />
                            <div className="flex items-center justify-center">
                              <p className="text-center">
                                {invoice.length > 30
                                  ? `${invoice.substring(
                                      0,
                                      10
                                    )}...${invoice.substring(
                                      invoice.length - 10,
                                      invoice.length
                                    )}`
                                  : invoice}
                              </p>
                              <ClipboardIcon
                                onClick={handleCopyInvoice}
                                className={`ml-2 h-4 w-4 cursor-pointer text-light-text dark:text-dark-text ${
                                  copiedToClipboard ? "hidden" : ""
                                }`}
                              />
                              <CheckIcon
                                className={`ml-2 h-4 w-4 cursor-pointer text-light-text dark:text-dark-text ${
                                  copiedToClipboard ? "" : "hidden"
                                }`}
                              />
                            </div>
                          </>
                        ) : (
                          <div>
                            <p>Waiting for lightning invoice...</p>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="flex flex-col items-center justify-center">
                        <h3 className="mt-3 text-center text-lg font-medium leading-6 text-gray-900">
                          Payment confirmed!
                        </h3>
                        <Image
                          alt="Payment Confirmed"
                          className="object-cover"
                          src="../../payment-confirmed.gif"
                          width={350}
                        />
                      </div>
                    )}
                  </CardBody>
                </Card>
              )}
            </ModalBody>

            <ModalFooter>
              <Button
                color="danger"
                variant="light"
                onClick={handleToggleMintModal}
              >
                Cancel
              </Button>

              <Button className={SHOPSTRBUTTONCLASSNAMES} type="submit">
                Mint
              </Button>
            </ModalFooter>
          </form>
        </ModalContent>
      </Modal>
      <FailureModal
        bodyText={failureText}
        isOpen={showFailureModal}
        onClose={() => {
          setShowFailureModal(false);
          setFailureText("");
        }}
      />
    </div>
  );
};

export default MintButton;
