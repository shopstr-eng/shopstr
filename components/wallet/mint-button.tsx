import React, { useContext, useEffect, useState } from "react";
import { useForm, Controller } from "react-hook-form";
import axios from "axios";
import {
  BanknotesIcon,
  CheckIcon,
  ClipboardIcon,
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
import { SHOPSTRBUTTONCLASSNAMES } from "../utility/STATIC-VARIABLES";
import {
  getLocalStorageData,
  publishWalletEvent,
  publishProofEvent,
} from "../utility/nostr-helper-functions";
import { CashuMint, CashuWallet } from "@cashu/cashu-ts";
import { CashuWalletContext } from "../../utils/context/context";

const MintButton = ({ passphrase }: { passphrase?: string }) => {
  const [showMintModal, setShowMintModal] = useState(false);
  const [showInvoiceCard, setShowInvoiceCard] = useState(false);

  const [paymentConfirmed, setPaymentConfirmed] = useState(false);
  const [qrCodeUrl, setQrCodeUrl] = useState<string | null>(null);
  const [invoice, setInvoice] = useState("");
  const [copiedToClipboard, setCopiedToClipboard] = useState(false);

  const walletContext = useContext(CashuWalletContext);
  const [dTag, setDTag] = useState("");

  const { mints, tokens, history } = getLocalStorageData();

  const {
    handleSubmit: handleMintSubmit,
    formState: { errors },
    control: mintControl,
    reset: mintReset,
  } = useForm();

  useEffect(() => {
    const walletEvent = walletContext.mostRecentWalletEvent;
    if (walletEvent?.tags) {
      const walletTag = walletEvent.tags.find(
        (tag: string[]) => tag[0] === "d",
      )?.[1];
      setDTag(walletTag);
    }
  }, [walletContext]);

  const handleToggleMintModal = () => {
    mintReset();
    setPaymentConfirmed(false);
    setShowMintModal(!showMintModal);
    setShowInvoiceCard(false);
  };

  const onMintSubmit = async (data: { [x: string]: any }) => {
    let numSats = data["sats"];
    setShowInvoiceCard(true);
    await handleMint(numSats);
  };

  const handleMint = async (numSats: number) => {
    const wallet = new CashuWallet(new CashuMint(mints[0]));

    const mintInvoice = await axios.post("/api/cashu/request-mint", {
      mintUrl: mints[0],
      total: numSats,
      currency: "SATS",
    });

    const { id, pr, hash } = mintInvoice.data;

    setInvoice(pr);

    const QRCode = require("qrcode");

    QRCode.toDataURL(pr)
      .then((url: string) => {
        setQrCodeUrl(url);
      })
      .catch((err: any) => {
        console.error("ERROR", err);
      });

    invoiceHasBeenPaid(wallet, numSats, hash, id);
  };

  /** CHECKS WHETHER INVOICE HAS BEEN PAID */
  async function invoiceHasBeenPaid(
    wallet: CashuWallet,
    numSats: number,
    hash: string,
    metricsInvoiceId: string,
  ) {
    let encoded;

    while (true) {
      try {
        const { proofs } = await wallet.requestTokens(numSats, hash);

        if (proofs) {
          const proofArray = [...tokens, ...proofs];
          localStorage.setItem("tokens", JSON.stringify(proofArray));
          localStorage.setItem(
            "history",
            JSON.stringify([
              { type: 3, amount: numSats, date: Math.floor(Date.now() / 1000) },
              ...history,
            ]),
          );
          await publishWalletEvent(passphrase, dTag);
          await publishProofEvent(mints[0], proofs, "in", passphrase, dTag);
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

        await new Promise((resolve) => setTimeout(resolve, 2000));
      }
    }
  }

  const handleCopyInvoice = () => {
    navigator.clipboard.writeText(invoice);
    setCopiedToClipboard(true);
    // after 2 seconds, set copiedToClipboard back to false
    setTimeout(() => {
      setCopiedToClipboard(false);
    }, 2000);
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
                  let isErrored = error !== undefined;
                  let errorMessage: string = error?.message
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
                                      10,
                                    )}...${invoice.substring(
                                      invoice.length - 10,
                                      invoice.length,
                                    )}`
                                  : invoice}
                              </p>
                              <ClipboardIcon
                                onClick={handleCopyInvoice}
                                className={`ml-2 h-4 w-4 cursor-pointer ${
                                  copiedToClipboard ? "hidden" : ""
                                }`}
                              />
                              <CheckIcon
                                className={`ml-2 h-4 w-4 cursor-pointer ${
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
    </div>
  );
};

export default MintButton;
