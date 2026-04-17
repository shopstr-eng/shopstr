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
} from "@heroui/react";
import {
  WHITEBUTTONCLASSNAMES,
  BLUEBUTTONCLASSNAMES,
} from "@/utils/STATIC-VARIABLES";
import {
  getLocalStorageData,
  publishProofEvent,
} from "@/utils/nostr/nostr-helper-functions";
import { Mint as CashuMint, Wallet as CashuWallet } from "@cashu/cashu-ts";
import QRCode from "qrcode";
import FailureModal from "@/components/utility-components/failure-modal";
import {
  NostrContext,
  SignerContext,
} from "@/components/utility-components/nostr-context-provider";
import { NostrNIP46Signer } from "@/utils/nostr/signers/nostr-nip46-signer";
import {
  MintOperationError,
  withMintRetry,
} from "@/utils/cashu/mint-retry-service";
import {
  markMintQuoteClaimed,
  markMintQuotePaid,
  recordPendingMintQuote,
  updatePendingMintQuote,
} from "@/utils/cashu/pending-mint-operations";

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
    await wallet.loadMint();

    const { request: pr, quote: hash } = await withMintRetry(
      () => wallet.createMintQuoteBolt11(numSats),
      { maxAttempts: 4, perAttemptTimeoutMs: 15000, totalTimeoutMs: 60000 }
    );

    // Record the pending quote durably so a tab close / network failure
    // between "invoice paid" and "proofs minted" can be recovered on next boot.
    recordPendingMintQuote({
      quoteId: hash,
      mintUrl: mints[0]!,
      amount: numSats,
      invoice: pr,
    });

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

  /**
   * Poll the mint until the invoice is paid, then claim proofs with bounded
   * retries. Network/timeout failures during the claim step leave a durable
   * pending record so the boot-time recovery hook can finish the claim later.
   */
  async function invoiceHasBeenPaid(
    wallet: CashuWallet,
    numSats: number,
    hash: string
  ) {
    const pollMaxRounds = 30; // ~1 minute of UNPAID polling
    let roundsConsumed = 0;
    let claimDone = false;

    while (roundsConsumed < pollMaxRounds && !claimDone) {
      let quoteState:
        | Awaited<ReturnType<typeof wallet.checkMintQuoteBolt11>>
        | undefined;
      try {
        quoteState = await withMintRetry(
          () => wallet.checkMintQuoteBolt11(hash),
          { maxAttempts: 3, perAttemptTimeoutMs: 10000, totalTimeoutMs: 25000 }
        );
      } catch (error) {
        console.warn("Invoice check warning:", error);
        const checkCause =
          error instanceof MintOperationError ? error.cause : error;
        if (error instanceof TypeError || checkCause instanceof TypeError) {
          setShowInvoiceCard(false);
          setInvoice("");
          setQrCodeUrl(null);
          setFailureText(
            "Failed to validate invoice! Change your mint in settings and/or please try again."
          );
          setShowFailureModal(true);
          return;
        }
        roundsConsumed++;
        await new Promise((resolve) => setTimeout(resolve, 2100));
        continue;
      }

      if (quoteState.state === "UNPAID") {
        roundsConsumed++;
        await new Promise((resolve) => setTimeout(resolve, 2100));
        continue;
      }

      if (quoteState.state === "ISSUED") {
        // Mint says these proofs were already minted (likely from a prior
        // session where the local persist step lost the proofs). Mark the
        // pending record terminal and surface the dropped-connection notice.
        updatePendingMintQuote(hash, {
          status: "failed_terminal",
          lastErrorMessage: "Quote ISSUED before local claim recorded proofs",
        });
        setPaymentConfirmed(true);
        setQrCodeUrl(null);
        setFailureText(
          "Payment was received but your connection dropped! Please check your wallet balance."
        );
        setShowFailureModal(true);
        setTimeout(() => {
          handleToggleMintModal();
        }, 1900);
        return;
      }

      // Money is on the mint (PAID). Mark the durable record before claiming.
      markMintQuotePaid(hash);

      try {
        const proofs = await withMintRetry(
          () => wallet.mintProofsBolt11(numSats, hash),
          { maxAttempts: 5, perAttemptTimeoutMs: 15000, totalTimeoutMs: 60000 }
        );
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
          markMintQuoteClaimed(hash);
          setPaymentConfirmed(true);
          setQrCodeUrl(null);
          setTimeout(() => {
            handleToggleMintModal();
          }, 1900);
          claimDone = true;
          break;
        }
      } catch (mintError) {
        const cause =
          mintError instanceof MintOperationError ? mintError.cause : mintError;
        const message =
          cause instanceof Error
            ? cause.message
            : mintError instanceof Error
              ? mintError.message
              : String(mintError);

        if (
          message.toLowerCase().includes("issued") ||
          message.toLowerCase().includes("already")
        ) {
          // Mint already issued these proofs and we have no record of receiving
          // them — funds are unrecoverable client-side.
          updatePendingMintQuote(hash, {
            status: "failed_terminal",
            lastErrorMessage: message,
          });
          setPaymentConfirmed(true);
          setQrCodeUrl(null);
          setFailureText(
            "Payment was received but your connection dropped! Please check your wallet balance."
          );
          setShowFailureModal(true);
          setTimeout(() => {
            handleToggleMintModal();
          }, 1900);
          return;
        }

        // Transient claim failure. Pending record is preserved so the
        // boot-time recovery hook can finish the claim on next visit.
        console.warn("Mint claim failed; will retry on next session:", message);
        setShowInvoiceCard(false);
        setInvoice("");
        setQrCodeUrl(null);
        setFailureText(
          "Payment received but the mint is unreachable. We'll automatically retry the claim the next time you open the app."
        );
        setShowFailureModal(true);
        return;
      }
    }

    if (!claimDone) {
      setShowInvoiceCard(false);
      setInvoice("");
      setQrCodeUrl(null);
      setFailureText(
        "Payment timed out! Please check your wallet balance or try again."
      );
      setShowFailureModal(true);
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
                <Card className="shadow-neo mt-3 rounded-md border-3 border-black">
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
                              <p className="text-center font-mono text-sm break-all text-black">
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
