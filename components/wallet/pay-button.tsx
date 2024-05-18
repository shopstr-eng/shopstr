import { useState, useEffect, useContext, useMemo } from "react";
import { useForm, Controller } from "react-hook-form";
import Link from "next/link";
import { useTheme } from "next-themes";
import {
  BoltIcon,
  CheckCircleIcon,
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
import { getLocalStorageData } from "../utility/nostr-helper-functions";
import { SHOPSTRBUTTONCLASSNAMES } from "../utility/STATIC-VARIABLES";
import { LightningAddress } from "@getalby/lightning-tools";
import { CashuMint, CashuWallet, Proof } from "@cashu/cashu-ts";
// import { Invoice } from "@getalby/lightning-tools";
import { formatWithCommas } from "../utility-components/display-monetary-info";

const PayButton = () => {
  const [showPayModal, setShowPayModal] = useState(false);
  const [isPaid, setIsPaid] = useState(false);
  const [paymentFailed, setPaymentFailed] = useState(false);
  const [isRedeeming, setIsRedeeming] = useState(false);

  // const [totalAmount, setTotalAmount] = useState(0);
  const [feeAmount, setFeeAmount] = useState("");

  const { mints, tokens, history } = getLocalStorageData();

  const { theme, setTheme } = useTheme();

  const {
    handleSubmit: handlePaySubmit,
    formState: { errors },
    control: payControl,
    reset: payReset,
  } = useForm();

  const getMint = () => new CashuMint(mints[0]);
  const getWallet = () => new CashuWallet(getMint());

  const handleTogglePayModal = () => {
    payReset();
    setShowPayModal(!showPayModal);
  };

  const onPaySubmit = async (data: { [x: string]: any }) => {
    let invoiceString = data["invoice"];
    await handlePay(invoiceString);
  };

  const calculateFee = async (invoice: string) => {
    setFeeAmount("");
    if (invoice && /^lnbc/.test(invoice)) {
      const fee = await getWallet().getFee(invoice);
      if (fee) {
        setFeeAmount(formatWithCommas(fee, "sats"));
        // const invoiceValue = new Invoice({ invoice });
        // const { satoshi } = invoiceValue;
        // const total = satoshi + fee;
        // setTotalAmount(total);
      } else {
        setFeeAmount("");
      }
    } else {
      setFeeAmount("");
    }
  };

  const handlePay = async (invoiceString: string) => {
    setIsPaid(false);
    setPaymentFailed(false);
    setIsRedeeming(true);
    try {
      const mintKeySetResponse = await getMint().getKeySets();
      const mintKeySetIds = mintKeySetResponse?.keysets;
      const filteredProofs = tokens.filter(
        (p: Proof) => mintKeySetIds?.includes(p.id),
      );
      const response = await getWallet().payLnInvoice(
        invoiceString,
        filteredProofs,
      );
      const changeProofs = response?.change;
      const changeAmount =
        Array.isArray(changeProofs) && changeProofs.length > 0
          ? changeProofs.reduce(
              (acc, current: Proof) => acc + current.amount,
              0,
            )
          : 0;
      const remainingProofs = tokens.filter(
        (p: Proof) => !mintKeySetIds?.includes(p.id),
      );
      let proofArray;
      if (changeAmount >= 1 && changeProofs) {
        proofArray = [...remainingProofs, ...changeProofs];
      } else {
        proofArray = [...remainingProofs];
      }
      localStorage.setItem("tokens", JSON.stringify(proofArray));
      const filteredTokenAmount = filteredProofs.reduce(
        (acc, token: Proof) => acc + token.amount,
        0,
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
        ]),
      );
      setIsPaid(true);
      setIsRedeeming(false);
      handleTogglePayModal();
    } catch (error) {
      console.log(error);
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
          <ModalHeader className="flex flex-col gap-1 text-light-text dark:text-dark-text">
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
                  let isErrored = error !== undefined;
                  let errorMessage: string = error?.message
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
                          } catch (error) {
                            console.log(error);
                          }
                        }}
                        onBlur={onBlur} // notify when input is touched/blur
                        value={value}
                      />
                      {feeAmount && (
                        <div className="mt-2 text-left text-light-text dark:text-dark-text">
                          Estimated Fee: {feeAmount}
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
                    <ModalHeader className="flex items-center justify-center text-light-text dark:text-dark-text">
                      <XCircleIcon className="h-6 w-6 text-red-500" />
                      <div className="ml-2">Payment failed!</div>
                    </ModalHeader>
                    <ModalBody className="flex flex-col overflow-hidden text-light-text dark:text-dark-text">
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
                    <ModalHeader className="flex items-center justify-center text-light-text dark:text-dark-text">
                      <CheckCircleIcon className="h-6 w-6 text-green-500" />
                      <div className="ml-2">Invoice successfully paid!</div>
                    </ModalHeader>
                    <ModalBody className="flex flex-col overflow-hidden text-light-text dark:text-dark-text">
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
