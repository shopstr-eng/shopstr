import { useContext, useState } from "react";
import { useForm, Controller } from "react-hook-form";
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
} from "@nextui-org/react";
import {
  getLocalStorageData,
  publishProofEvent,
} from "@/utils/nostr/nostr-helper-functions";
import {
  WHITEBUTTONCLASSNAMES,
  BLUEBUTTONCLASSNAMES,
} from "@/utils/STATIC-VARIABLES";
import { CashuMint, CashuWallet, MintKeyset, Proof } from "@cashu/cashu-ts";
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

  const { mints, tokens, history } = getLocalStorageData();

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
      const meltQuote = await wallet?.createMeltQuote(invoice);
      if (meltQuote) {
        setFeeReserveAmount(formatWithCommas(meltQuote.fee_reserve, "sats"));
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
      const mintKeySetIds = await wallet.getKeySets();
      const filteredProofs = tokens.filter((p: Proof) =>
        mintKeySetIds.some((keyset: MintKeyset) => keyset.id === p.id)
      ) as Proof[];
      const meltQuote = await wallet.createMeltQuote(invoiceString);
      const meltQuoteTotal = meltQuote.amount + meltQuote.fee_reserve;
      const { keep, send } = await wallet.send(meltQuoteTotal, filteredProofs, {
        includeFees: true,
      });
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
      const meltResponse = await wallet.meltProofs(meltQuote, send);
      const changeProofs = [...keep, ...meltResponse.change];
      const changeAmount =
        Array.isArray(changeProofs) && changeProofs.length > 0
          ? changeProofs.reduce(
              (acc, current: Proof) => acc + current.amount,
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
      localStorage.setItem("tokens", JSON.stringify(proofArray));
      const filteredTokenAmount = filteredProofs.reduce(
        (acc, token: Proof) => acc + token.amount,
        0
      );
      const transactionAmount = filteredTokenAmount - changeAmount;
      localStorage.setItem(
        "history",
        JSON.stringify([
          {
            type: 4,
            amount: transactionAmount,
            date: Math.floor(Date.now() / 1000),
          },
          ...history,
        ])
      );
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
        className={WHITEBUTTONCLASSNAMES + " m-2"}
        onClick={() => setShowPayModal(!showPayModal)}
        startContent={<BoltIcon className="h-6 w-6" />}
      >
        Pay
      </Button>
      <Modal
        backdrop="blur"
        isOpen={showPayModal}
        onClose={handleTogglePayModal}
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
                        className="text-black"
                        classNames={{
                          input: "text-black font-medium",
                          inputWrapper:
                            "border-2 border-black shadow-none bg-white rounded-md",
                        }}
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
                        <div className="mt-2 text-right font-semibold text-black">
                          Fee Reserve: {feeReserveAmount}
                        </div>
                      )}
                    </>
                  );
                }}
              />
              {signer instanceof NostrNIP46Signer && (
                <div className="mx-4 my-2 flex items-center justify-center rounded-md border-2 border-black bg-blue-50 p-3 text-center">
                  <InformationCircleIcon className="h-6 w-6 flex-shrink-0 text-black" />
                  <p className="ml-2 text-xs text-black">
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
                  classNames={{
                    body: "py-6 bg-white",
                    backdrop: "bg-[#292f46]/50 backdrop-opacity-60",
                    header: "border-b-4 border-black bg-white rounded-t-md",
                    footer: "border-t-4 border-black bg-white rounded-b-md",
                    closeButton: "hover:bg-black/5 active:bg-white/10",
                    wrapper: "items-center justify-center",
                    base: "border-4 border-black shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] rounded-md",
                  }}
                  isDismissable={true}
                  scrollBehavior={"normal"}
                  placement={"center"}
                  size="2xl"
                >
                  <ModalContent>
                    <ModalHeader className="flex items-center justify-center font-bold text-black">
                      <XCircleIcon className="h-6 w-6 text-red-500" />
                      <div className="ml-2">Payment failed!</div>
                    </ModalHeader>
                    <ModalBody className="flex flex-col overflow-hidden text-black">
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
                  classNames={{
                    body: "py-6 bg-white",
                    backdrop: "bg-[#292f46]/50 backdrop-opacity-60",
                    header: "border-b-4 border-black bg-white rounded-t-md",
                    footer: "border-t-4 border-black bg-white rounded-b-md",
                    closeButton: "hover:bg-black/5 active:bg-white/10",
                    wrapper: "items-center justify-center",
                    base: "border-4 border-black shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] rounded-md",
                  }}
                  isDismissable={true}
                  scrollBehavior={"normal"}
                  placement={"center"}
                  size="2xl"
                >
                  <ModalContent>
                    <ModalHeader className="flex items-center justify-center font-bold text-black">
                      <CheckCircleIcon className="h-6 w-6 text-green-500" />
                      <div className="ml-2">Invoice successfully paid!</div>
                    </ModalHeader>
                    <ModalBody className="flex flex-col overflow-hidden text-black">
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
                className="px-4 py-2 font-bold hover:underline"
                variant="light"
                onClick={handleTogglePayModal}
              >
                Cancel
              </Button>

              <Button className={BLUEBUTTONCLASSNAMES} type="submit">
                {isRedeeming ? (
                  <>
                    <Spinner size={"sm"} color="default" />
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
