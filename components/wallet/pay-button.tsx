import { useContext, useState } from "react";
import { useForm, Controller } from "react-hook-form";
import { useTheme } from "next-themes";
import {
  BoltIcon,
  CheckCircleIcon,
  InformationCircleIcon,
  XCircleIcon,
} from "@heroicons/react/24/outline";
import {
  Button,
  Textarea,
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  Spinner,
} from "@heroui/react";
import {
  publishProofEvent,
} from "@/utils/nostr/nostr-helper-functions";
import { storage, STORAGE_KEYS } from "@/utils/storage";
import { SHOPSTRBUTTONCLASSNAMES } from "@/utils/STATIC-VARIABLES";
import {
  Mint as CashuMint,
  Wallet as CashuWallet,
  Keyset as MintKeyset,
  Proof,
} from "@cashu/cashu-ts";
import { safeMeltProofs } from "@/utils/cashu/melt-retry-service";
import { safeSwap } from "@/utils/cashu/swap-retry-service";
import { formatWithCommas } from "../utility-components/display-monetary-info";
import { CashuWalletContext } from "../../utils/context/context";
import {
  NostrContext,
  SignerContext,
} from "@/components/utility-components/nostr-context-provider";
import { NostrNIP46Signer } from "@/utils/nostr/signers/nostr-nip46-signer";

const PayButton = () => {
  const [showPayModal, setShowPayModal] = useState(false);
  const [isPaid, setIsPaid] = useState(false);
  const [paymentFailed, setPaymentFailed] = useState(false);
  const [isRedeeming, setIsRedeeming] = useState(false);

  // const [totalAmount, setTotalAmount] = useState(0);
  const [feeReserveAmount, setFeeReserveAmount] = useState("");

  const { signer } = useContext(SignerContext);
  const { nostr } = useContext(NostrContext);

  const mints = storage.getJson<string[]>(STORAGE_KEYS.MINTS, []);
  const tokens = storage.getJson<any[]>(STORAGE_KEYS.TOKENS, []);
  const history = storage.getJson<any[]>(STORAGE_KEYS.HISTORY, []);

  const { theme } = useTheme();

  const walletContext = useContext(CashuWalletContext);

  const {
    handleSubmit: handlePaySubmit,
    control: payControl,
    reset: payReset,
  } = useForm({
    defaultValues: { invoice: "" },
  });

  const handleTogglePayModal = () => {
    payReset();
    setShowPayModal(!showPayModal);
  };

  const onPaySubmit = async (data: { [x: string]: string }) => {
    const invoiceString = data["invoice"];
    await handlePay(invoiceString!);
  };

  const calculateFee = async (invoice: string) => {
    setFeeReserveAmount("");
    if (invoice && /^lnbc/.test(invoice)) {
      const mint = new CashuMint(mints[0]!);
      const wallet = new CashuWallet(mint);
      await wallet.loadMint();
      const meltQuote = await wallet?.createMeltQuoteBolt11(invoice);
      if (meltQuote) {
        setFeeReserveAmount(
          formatWithCommas(meltQuote.fee_reserve.toNumber(), "sats")
        );
      } else {
        setFeeReserveAmount("");
      }
    } else {
      setFeeReserveAmount("");
    }
  };

  const handlePay = async (invoiceString: string) => {
    setIsPaid(false);
    setPaymentFailed(false);
    setIsRedeeming(true);
    try {
      const mint = new CashuMint(mints[0]!);
      const wallet = new CashuWallet(mint);
      await wallet.loadMint();
      const mintKeySetIds = await wallet.keyChain.getKeysets();
      const filteredProofs = tokens.filter((p: Proof) =>
        mintKeySetIds.some((keyset: MintKeyset) => keyset.id === p.id)
      ) as Proof[];
      const meltQuote = await wallet.createMeltQuoteBolt11(invoiceString);
      const meltQuoteTotal =
        meltQuote.amount.toNumber() + meltQuote.fee_reserve.toNumber();
      const swapOutcome = await safeSwap(
        wallet,
        meltQuoteTotal,
        filteredProofs,
        { sendConfig: { includeFees: true } }
      );
      if (swapOutcome.status !== "swapped") {
        throw new Error(
          swapOutcome.errorMessage ??
            `Pre-melt swap did not complete (${swapOutcome.status})`
        );
      }
      const { keep, send } = swapOutcome;
      const deletedEventIds = [
        ...new Set([
          ...walletContext.proofEvents
            .filter((event) =>
              event.proofs.some((proof: Proof) =>
                filteredProofs.some(
                  (filteredProof) => filteredProof.secret === proof.secret
                )
              )
            )
            .map((event) => event.id),
          ...walletContext.proofEvents
            .filter((event) =>
              event.proofs.some((proof: Proof) =>
                keep.some((keepProof) => keepProof.secret === proof.secret)
              )
            )
            .map((event) => event.id),
          ...walletContext.proofEvents
            .filter((event) =>
              event.proofs.some((proof: Proof) =>
                send.some((sendProof) => sendProof.secret === proof.secret)
              )
            )
            .map((event) => event.id),
        ]),
      ];
      const meltOutcome = await safeMeltProofs(wallet, meltQuote, send);
      if (meltOutcome.status === "unpaid") {
        // Mint never accepted the melt; original `send` proofs are unspent.
        // Restore them to local storage and bail out.
        throw new Error(
          meltOutcome.errorMessage ?? "Melt failed; payment not sent"
        );
      }
      if (
        meltOutcome.status === "pending" ||
        meltOutcome.status === "unknown"
      ) {
        // Mint may or may not pay. Quarantine the spent proofs locally
        // (remove from balance) and surface an actionable error.
        const remainingProofsAfterMelt = tokens.filter(
          (p: Proof) =>
            !mintKeySetIds?.some(
              (keysetId: MintKeyset) => keysetId.id === p.id
            ) || !send.some((s) => s.secret === p.secret)
        ) as Proof[];
        const quarantineProofArray = [...remainingProofsAfterMelt, ...keep];
        localStorage.setItem("tokens", JSON.stringify(quarantineProofArray));
        throw new Error(meltOutcome.errorMessage ?? "Melt outcome ambiguous");
      }
      const changeProofs = [...keep, ...meltOutcome.changeProofs];
      const changeAmount =
        Array.isArray(changeProofs) && changeProofs.length > 0
          ? changeProofs.reduce(
              (acc, current: Proof) => acc + current.amount.toNumber(),
              0
            )
          : 0;
      const remainingProofs = tokens.filter(
        (p: Proof) =>
          !mintKeySetIds?.some((keysetId: MintKeyset) => keysetId.id === p.id)
      ) as Proof[];
      let proofArray;
      if (changeAmount >= 1 && changeProofs) {
        proofArray = [...remainingProofs, ...changeProofs];
      } else {
        proofArray = [...remainingProofs];
      }
      storage.setJson(STORAGE_KEYS.TOKENS, proofArray);
      const filteredTokenAmount = filteredProofs.reduce(
        (acc, token: Proof) => acc + token.amount.toNumber(),
        0
      );
      const transactionAmount = filteredTokenAmount - changeAmount;
      storage.setJson(STORAGE_KEYS.HISTORY, [
        {
          type: 4,
          amount: transactionAmount,
          date: Math.floor(Date.now() / 1000),
        },
        ...history,
      ]);
      await publishProofEvent(
        nostr!,
        signer!,
        mints[0]!,
        changeProofs && changeProofs.length >= 1 ? changeProofs : [],
        "out",
        transactionAmount.toString(),
        deletedEventIds
      );
      setIsPaid(true);
      setIsRedeeming(false);
      handleTogglePayModal();
    } catch {
      setPaymentFailed(true);
      setIsRedeeming(false);
    }
  };

  return (
    <div>
      <Button
        className={SHOPSTRBUTTONCLASSNAMES + " m-2"}
        onClick={() => setShowPayModal(!showPayModal)}
        startContent={
          <BoltIcon className="h-6 w-6 hover:text-yellow-500 dark:hover:text-purple-500" />
        }
      >
        Pay
      </Button>
      <Modal
        backdrop="blur"
        isOpen={showPayModal}
        onClose={handleTogglePayModal}
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
          <ModalHeader className="text-light-text dark:text-dark-text flex flex-col gap-1">
            Pay Lightning Invoice
          </ModalHeader>
          <form onSubmit={handlePaySubmit(onPaySubmit)}>
            <ModalBody>
              <Controller
                name="invoice"
                control={payControl}
                rules={{
                  required: "A Lightning invoice is required.",
                  validate: (value) => {
                    return (
                      /^lnbc/.test(value) ||
                      "The lightning invoice must start with 'lnbc'."
                    );
                  },
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
                    <>
                      <Textarea
                        className="text-light-text dark:text-dark-text"
                        autoFocus
                        variant="bordered"
                        fullWidth={true}
                        label="Lightning invoice"
                        labelPlacement="inside"
                        isInvalid={isErrored}
                        errorMessage={errorMessage}
                        onChange={async (e) => {
                          const newValue = e.target.value;
                          onChange(newValue);
                          try {
                            await calculateFee(newValue);
                          } catch {
                            setFeeReserveAmount("");
                          }
                        }}
                        onBlur={onBlur} // notify when input is touched/blur
                        value={value}
                      />
                      {feeReserveAmount && (
                        <div className="text-light-text dark:text-dark-text mt-2 text-left">
                          Fee Reserve: {feeReserveAmount}
                        </div>
                      )}
                      {/* {totalAmount && totalAmount >= 1 && (
                        <div className="mt-2 text-right text-light-text dark:text-dark-text">
                          Total Amount: {totalAmount} sats
                        </div>
                      )} */}
                    </>
                  );
                }}
              />
              {signer instanceof NostrNIP46Signer && (
                <div className="mx-4 my-2 flex items-center justify-center text-center">
                  <InformationCircleIcon className="text-light-text dark:text-dark-text h-6 w-6" />
                  <p className="text-light-text dark:text-dark-text ml-2 text-xs">
                    If the invoice payment is taking a while to be confirmed,
                    make sure to check your bunker application to approve the
                    transaction events.
                  </p>
                </div>
              )}
            </ModalBody>

            {paymentFailed ? (
              <>
                <Modal
                  backdrop="blur"
                  isOpen={paymentFailed}
                  onClose={() => setPaymentFailed(false)}
                  // className="bg-light-fg dark:bg-dark-fg text-black dark:text-white"
                  classNames={{
                    body: "py-6 ",
                    backdrop: "bg-[#292f46]/50 backdrop-opacity-60",
                    header: "border-b-[1px] border-[#292f46]",
                    footer: "border-t-[1px] border-[#292f46]",
                    closeButton: "hover:bg-black/5 active:bg-white/10",
                  }}
                  isDismissable={true}
                  scrollBehavior={"normal"}
                  placement={"center"}
                  size="2xl"
                >
                  <ModalContent>
                    <ModalHeader className="text-light-text dark:text-dark-text flex items-center justify-center">
                      <XCircleIcon className="h-6 w-6 text-red-500" />
                      <div className="ml-2">Payment failed!</div>
                    </ModalHeader>
                    <ModalBody className="text-light-text dark:text-dark-text flex flex-col overflow-hidden">
                      <div className="flex items-center justify-center">
                        No routes could be found, or you don&apos;t have enough
                        funds. Please try again with a new invoice, or change
                        your mint in settings.
                      </div>
                    </ModalBody>
                  </ModalContent>
                </Modal>
              </>
            ) : null}

            {isPaid ? (
              <>
                <Modal
                  backdrop="blur"
                  isOpen={isPaid}
                  onClose={() => setIsPaid(false)}
                  // className="bg-light-fg dark:bg-dark-fg text-black dark:text-white"
                  classNames={{
                    body: "py-6 ",
                    backdrop: "bg-[#292f46]/50 backdrop-opacity-60",
                    header: "border-b-[1px] border-[#292f46]",
                    footer: "border-t-[1px] border-[#292f46]",
                    closeButton: "hover:bg-black/5 active:bg-white/10",
                  }}
                  isDismissable={true}
                  scrollBehavior={"normal"}
                  placement={"center"}
                  size="2xl"
                >
                  <ModalContent>
                    <ModalHeader className="text-light-text dark:text-dark-text flex items-center justify-center">
                      <CheckCircleIcon className="h-6 w-6 text-green-500" />
                      <div className="ml-2">Invoice successfully paid!</div>
                    </ModalHeader>
                    <ModalBody className="text-light-text dark:text-dark-text flex flex-col overflow-hidden">
                      <div className="flex items-center justify-center">
                        Check your external Lightning wallet for your sats.
                      </div>
                    </ModalBody>
                  </ModalContent>
                </Modal>
              </>
            ) : null}

            <ModalFooter>
              <Button
                color="danger"
                variant="light"
                onClick={handleTogglePayModal}
              >
                Cancel
              </Button>

              <Button className={SHOPSTRBUTTONCLASSNAMES} type="submit">
                {isRedeeming ? (
                  <>
                    {theme === "dark" ? (
                      <Spinner size={"sm"} color="warning" />
                    ) : (
                      <Spinner size={"sm"} color="secondary" />
                    )}
                  </>
                ) : (
                  <>Pay</>
                )}
              </Button>
            </ModalFooter>
          </form>
        </ModalContent>
      </Modal>
    </div>
  );
};

export default PayButton;
