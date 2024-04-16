import { useState, useEffect, useContext, useMemo } from "react";
import { useForm, Controller } from "react-hook-form";
import Link from "next/link";
import { BoltIcon } from "@heroicons/react/24/outline";
import {
  Button,
  Textarea,
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
} from "@nextui-org/react";
import { getLocalStorageData } from "../utility/nostr-helper-functions";
import { SHOPSTRBUTTONCLASSNAMES } from "../utility/STATIC-VARIABLES";
import { LightningAddress } from "@getalby/lightning-tools";
import { CashuMint, CashuWallet, Proof } from "@cashu/cashu-ts";
import { formatWithCommas } from "../utility-components/display-monetary-info";

const PayButton = () => {
  const [showPayModal, setShowPayModal] = useState(false);
  const [isPaid, setIsPaid] = useState(false);
  const [paymentFailed, setPaymentFailed] = useState(false);
  const [mint, setMint] = useState<CashuMint>();
  const [wallet, setWallet] = useState<CashuWallet>();
  const [proofs, setProofs] = useState([]);

  const [fee, setFee] = useState("");

  const { mints, tokens, history } = getLocalStorageData();

  const {
    handleSubmit: handlePaySubmit,
    formState: { errors },
    control: payControl,
    reset: payReset,
  } = useForm();

  useEffect(() => {
    const currentMint = new CashuMint(mints[0]);
    const newWallet = new CashuWallet(currentMint);
    setMint(currentMint);
    setWallet(newWallet);
  }, [mints]);

  const handleTogglePayModal = () => {
    payReset();
    setShowPayModal(!showPayModal);
  };

  const onPaySubmit = async (data: { [x: string]: any }) => {
    let invoiceString = data["invoice"];
    await handlePay(invoiceString);
  };

  const handlePay = async (invoiceString: string) => {
    setIsPaid(false);
    setPaymentFailed(false);
    try {
      const mintKeySetResponse = await mint?.getKeySets();
      const mintKeySetIds = mintKeySetResponse?.keysets;
      const filteredProofs = tokens.filter((p: Proof) => mintKeySetIds?.includes(p.id));
      const response = await wallet?.payLnInvoice(
        invoiceString,
        filteredProofs,
      );
      const changeProofs = response?.change;
      const changeAmount =
        Array.isArray(changeProofs) && changeProofs.length > 0
          ? changeProofs.reduce((acc, current: Proof) => acc + current.amount, 0)
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
          ...history,
          {
            type: 4,
            amount: transactionAmount,
            date: Math.floor(Date.now() / 1000),
          },
        ]),
      );
      setIsPaid(true);
    } catch (error) {
      console.log(error);
      setIsPaid(true);
      setPaymentFailed(true);
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
                  validate: async (value) => {
                    const fee = await wallet?.getFee(value);
                    setFee(formatWithCommas(fee, "sats")); // Update the fee state with the returned value
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
                        // controller props
                        onChange={onChange} // send value to hook form
                        onBlur={onBlur} // notify when input is touched/blur
                        value={value}
                      />
                      {fee && (
                        <div className="mt-2 text-right text-light-text dark:text-dark-text">
                          Estimated Fee: {fee}
                        </div>
                      )}
                      {isPaid && (
                        <>
                          {paymentFailed ? (
                            <div className="mt-2 items-center justify-center">
                              Invoice payment failed! No routes could be found,
                              or you don&apos;t have enough funds. Please try
                              again with a new invoice, or change your mint in
                              settings.
                            </div>
                          ) : (
                            <>
                              <div className="mt-2 items-center justify-center">
                                Invoice paid successfully!
                              </div>
                            </>
                          )}
                        </>
                      )}
                    </>
                  );
                }}
              />
            </ModalBody>

            <ModalFooter>
              <Button
                color="danger"
                variant="light"
                onClick={handleTogglePayModal}
              >
                Cancel
              </Button>

              <Button className={SHOPSTRBUTTONCLASSNAMES} type="submit">
                Pay
              </Button>
            </ModalFooter>
          </form>
        </ModalContent>
      </Modal>
    </div>
  );
};

export default PayButton;
