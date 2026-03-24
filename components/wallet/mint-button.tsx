import { useContext, useState } from "react";
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
import {
  WHITEBUTTONCLASSNAMES,
  BLUEBUTTONCLASSNAMES,
} from "@/utils/STATIC-VARIABLES";
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
    let retryCount = 0;
    const maxRetries = 30; // Maximum 30 retries (about 1 minute)

    while (retryCount < maxRetries) {
      try {
        // First check if the quote has been paid
        const quoteState = await wallet.checkMintQuote(hash);

        if (quoteState.state === "PAID") {
          // Quote is paid, try to mint proofs
          try {
            const proofs = await wallet.mintProofs(numSats, hash);
            if (proofs && proofs.length > 0) {
              const proofArray = [...tokens, ...proofs];
              localStorage.setItem("tokens", JSON.stringify(proofArray));
              localStorage.setItem(
                "history",
                JSON.stringify([
                  {
                    type: 3,
                    amount: numSats,
                    date: Math.floor(Date.now() / 1000),
                  },
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
          } catch (mintError) {
            // If minting fails but quote is paid, it might be already issued
            if (
              mintError instanceof Error &&
              mintError.message.includes("issued")
            ) {
              // Quote was already processed, consider it successful
              setPaymentConfirmed(true);
              setQrCodeUrl(null);
              setFailureText(
                "Payment was received but your connection dropped! Please check your wallet balance."
              );
              setShowFailureModal(true);
              setTimeout(() => {
                handleToggleMintModal();
              }, 1900);
              break;
            }
            throw mintError;
          }
        } else if (quoteState.state === "UNPAID") {
          // Quote not paid yet, continue waiting
          retryCount++;
          await new Promise((resolve) => setTimeout(resolve, 2100));
          continue;
        } else if (quoteState.state === "ISSUED") {
          // Quote was already processed successfully
          setPaymentConfirmed(true);
          setQrCodeUrl(null);
          setFailureText(
            "Payment was received but your connection dropped! Please check your wallet balance."
          );
          setShowFailureModal(true);
          setTimeout(() => {
            handleToggleMintModal();
          }, 1900);
          break;
        }
      } catch (error) {
        console.warn("Invoice check warning:", error);
        retryCount++;

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

        // If we've exceeded max retries, show error
        if (retryCount >= maxRetries) {
          setShowInvoiceCard(false);
          setInvoice("");
          setQrCodeUrl(null);
          setFailureText(
            "Payment timed out! Please check your wallet balance or try again."
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
        className={WHITEBUTTONCLASSNAMES + " m-2"}
        onClick={() => setShowMintModal(!showMintModal)}
        startContent={<BanknotesIcon className="h-6 w-6" />}
      >
        Mint
      </Button>
      <Modal
        backdrop="blur"
        isOpen={showMintModal}
        onClose={handleToggleMintModal}
        classNames={{
          body: "py-6 bg-white",
          backdrop: "bg-[#292f46]/50 backdrop-opacity-60",
          header: "border-b-4 border-black bg-white rounded-t-md",
          footer: "border-t-4 border-black bg-white rounded-b-md",
          closeButton: "hover:bg-black/5 active:bg-white/10",
          wrapper: "items-center justify-center",
          base: "border-4 border-black shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] rounded-md",
        }}
        scrollBehavior={"outside"}
        size="2xl"
      >
        <ModalContent>
          <ModalHeader className="flex flex-col gap-1 text-xl font-bold text-black">
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
                      className="text-black"
                      classNames={{
                        input: "text-black font-medium",
                        inputWrapper:
                          "border-2 border-black shadow-none bg-white rounded-md",
                      }}
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
                <div className="mx-4 my-2 flex items-center justify-center rounded-md border-2 border-black bg-blue-50 p-3 text-center">
                  <InformationCircleIcon className="h-6 w-6 flex-shrink-0 text-black" />
                  <p className="ml-2 text-xs text-black">
                    If the token is taking a while to be minted, make sure to
                    check your bunker application to approve the transaction
                    events.
                  </p>
                </div>
              )}
              {showInvoiceCard && (
                <Card className="mt-3 rounded-md border-3 border-black shadow-neo">
                  <CardHeader className="flex justify-center gap-3 border-b-2 border-black bg-white">
                    <span className="text-xl font-bold text-black">
                      Lightning Invoice
                    </span>
                  </CardHeader>
                  <Divider className="bg-black" />
                  <CardBody className="flex flex-col items-center bg-white">
                    {!paymentConfirmed ? (
                      <div className="flex flex-col items-center justify-center">
                        {qrCodeUrl ? (
                          <>
                            <Image
                              alt="Lightning invoice"
                              className="rounded-md border-2 border-black object-cover"
                              src={qrCodeUrl}
                            />
                            <div className="mt-4 flex items-center justify-center">
                              <p className="break-all text-center font-mono text-sm text-black">
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
                                className={`ml-2 h-5 w-5 cursor-pointer text-black hover:text-gray-600 ${
                                  copiedToClipboard ? "hidden" : ""
                                }`}
                              />
                              <CheckIcon
                                className={`ml-2 h-5 w-5 cursor-pointer text-green-600 ${
                                  copiedToClipboard ? "" : "hidden"
                                }`}
                              />
                            </div>
                          </>
                        ) : (
                          <div>
                            <p className="text-black">
                              Waiting for lightning invoice...
                            </p>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="flex flex-col items-center justify-center">
                        <h3 className="mt-3 text-center text-lg font-bold text-black">
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
                className="px-4 py-2 font-bold hover:underline"
                variant="light"
                onClick={handleToggleMintModal}
              >
                Cancel
              </Button>

              <Button className={BLUEBUTTONCLASSNAMES} type="submit">
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
