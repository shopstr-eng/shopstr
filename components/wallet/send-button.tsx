import React, { useContext, useEffect, useState } from "react";
import { useForm, Controller } from "react-hook-form";
import {
  ArrowUpTrayIcon,
  ClipboardIcon,
  CheckIcon,
  CheckCircleIcon,
  XCircleIcon,
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
  Input,
} from "@nextui-org/react";
import { SHOPSTRBUTTONCLASSNAMES } from "../utility/STATIC-VARIABLES";
import {
  getLocalStorageData,
  publishWalletEvent,
  publishProofEvent,
  publishSpendingHistoryEvent,
} from "../utility/nostr-helper-functions";
import {
  CashuMint,
  CashuWallet,
  getEncodedToken,
  Proof,
} from "@cashu/cashu-ts";
import { CashuWalletContext } from "../../utils/context/context";

const SendButton = ({ passphrase }: { passphrase?: string }) => {
  const [showSendModal, setShowSendModal] = useState(false);
  const [showTokenCard, setShowTokenCard] = useState(false);
  const [newToken, setNewToken] = useState("");
  const [copiedToClipboard, setCopiedToClipboard] = useState(false);
  const [sendFailed, setSendFailed] = useState(false);

  const walletContext = useContext(CashuWalletContext);
  const [dTag, setDTag] = useState("");

  const { mints, tokens, history } = getLocalStorageData();

  const {
    handleSubmit: handleSendSubmit,
    control: sendControl,
    reset: sendReset,
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

  const handleToggleSendModal = () => {
    sendReset();
    setShowSendModal(!showSendModal);
    setShowTokenCard(false);
    setSendFailed(false);
    setNewToken("");
  };

  const onSendSubmit = async (data: { [x: string]: any }) => {
    let numSats = data["sats"];
    await handleSend(numSats);
  };

  const handleSend = async (numSats: number) => {
    setSendFailed(false);
    try {
      const mint = new CashuMint(mints[0]);
      const wallet = new CashuWallet(mint);
      const mintKeySetResponse = await mint.getKeySets();
      const mintKeySetIds = mintKeySetResponse?.keysets;
      const filteredProofs = tokens.filter(
        (p: Proof) => mintKeySetIds?.includes(p.id),
      );
      const tokenToSend = await wallet.send(numSats, filteredProofs);
      const encodedSendToken = getEncodedToken({
        token: [
          {
            mint: mints[0],
            proofs: tokenToSend.send,
          },
        ],
      });
      setShowTokenCard(true);
      setNewToken(encodedSendToken);
      const changeProofs = tokenToSend?.returnChange;
      const remainingProofs = tokens.filter(
        (p: Proof) => !mintKeySetIds?.includes(p.id),
      );
      let proofArray;
      if (changeProofs.length >= 1 && changeProofs) {
        proofArray = [...remainingProofs, ...changeProofs];
      } else {
        proofArray = [...remainingProofs];
      }
      localStorage.setItem("tokens", JSON.stringify(proofArray));
      localStorage.setItem(
        "history",
        JSON.stringify([
          { type: 2, amount: numSats, date: Math.floor(Date.now() / 1000) },
          ...history,
        ]),
      );
      const eventIds = walletContext.proofEvents.map((event) => event.id);
      await publishSpendingHistoryEvent(
        "out",
        String(numSats),
        eventIds,
        passphrase,
        dTag,
      );
      if (changeProofs && changeProofs.length > 0) {
        await publishProofEvent(mints[0], changeProofs, "in", passphrase, dTag);
      }
      await publishWalletEvent(passphrase, dTag);
    } catch (error) {
      console.log(error);
      setSendFailed(true);
    }
  };

  const handleCopyTokenString = () => {
    navigator.clipboard.writeText(newToken);
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
        onClick={() => setShowSendModal(!showSendModal)}
        startContent={
          <ArrowUpTrayIcon className="h-6 w-6 hover:text-yellow-500 dark:hover:text-purple-500" />
        }
      >
        Send
      </Button>
      <Modal
        backdrop="blur"
        isOpen={showSendModal}
        onClose={handleToggleSendModal}
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
            Send Tokens
          </ModalHeader>
          <form onSubmit={handleSendSubmit(onSendSubmit)}>
            <ModalBody>
              <Controller
                name="sats"
                control={sendControl}
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
              {sendFailed && (
                <Card className="mt-3 max-w-[700px]">
                  <CardHeader className="flex justify-center gap-3">
                    <div className="flex items-center justify-center">
                      <XCircleIcon className="h-6 w-6 text-red-500" />
                      <div className="ml-2">Send failed!</div>
                    </div>
                  </CardHeader>
                  <Divider />
                  <CardBody className="flex flex-col items-center">
                    <div className="flex flex-col items-center justify-center">
                      <p className="text-center">
                        You don&apos;t have enough funds to send. Please try
                        again with a new amount, or change your mint in
                        settings.
                      </p>
                    </div>
                  </CardBody>
                </Card>
              )}
              {showTokenCard && (
                <Card className="mt-3 max-w-[700px]">
                  <CardHeader className="flex justify-center gap-3">
                    <div className="flex items-center justify-center">
                      <CheckCircleIcon className="h-6 w-6 text-green-500" />
                      <div className="ml-2">
                        New token string is ready to be copied and sent!
                      </div>
                    </div>
                  </CardHeader>
                  <Divider />
                  <CardBody className="flex flex-col items-center">
                    {newToken ? (
                      <div className="flex flex-col items-center justify-center">
                        <p className="whitespace-break-spaces break-all">
                          {newToken}
                        </p>
                        <ClipboardIcon
                          onClick={handleCopyTokenString}
                          className={`ml-2 h-6 w-6 cursor-pointer text-light-text dark:text-dark-text ${
                            copiedToClipboard ? "hidden" : ""
                          }`}
                        />
                        <CheckIcon
                          className={`ml-2 h-6 w-6 cursor-pointer text-light-text dark:text-dark-text ${
                            copiedToClipboard ? "" : "hidden"
                          }`}
                        />
                      </div>
                    ) : (
                      <div className="flex flex-col items-center justify-center">
                        <p className="text-center">
                          Waiting for token string...
                        </p>
                      </div>
                    )}
                  </CardBody>
                </Card>
              )}
            </ModalBody>

            {!newToken && (
              <>
                <ModalFooter>
                  <Button
                    color="danger"
                    variant="light"
                    onClick={handleToggleSendModal}
                  >
                    Cancel
                  </Button>

                  <Button className={SHOPSTRBUTTONCLASSNAMES} type="submit">
                    Send
                  </Button>
                </ModalFooter>
              </>
            )}
          </form>
        </ModalContent>
      </Modal>
    </div>
  );
};

export default SendButton;
