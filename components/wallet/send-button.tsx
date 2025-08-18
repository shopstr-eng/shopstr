import React, { useContext, useState } from "react";
import { useForm, Controller } from "react-hook-form";
import {
  ArrowUpTrayIcon,
  ClipboardIcon,
  CheckIcon,
  CheckCircleIcon,
  InformationCircleIcon,
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
import { SHOPSTRBUTTONCLASSNAMES } from "@/utils/STATIC-VARIABLES";
import {
  getLocalStorageData,
  publishProofEvent,
} from "@/utils/nostr/nostr-helper-functions";
import {
  CashuMint,
  CashuWallet,
  getEncodedToken,
  MintKeyset,
  Proof,
} from "@cashu/cashu-ts";
import { CashuWalletContext } from "../../utils/context/context";
import {
  NostrContext,
  SignerContext,
} from "@/components/utility-components/nostr-context-provider";
import { NostrNIP46Signer } from "@/utils/nostr/signers/nostr-nip46-signer";

const SendButton = () => {
  const [showSendModal, setShowSendModal] = useState(false);
  const [showTokenCard, setShowTokenCard] = useState(false);
  const [newToken, setNewToken] = useState("");
  const [copiedToClipboard, setCopiedToClipboard] = useState(false);
  const [sendFailed, setSendFailed] = useState(false);

  const walletContext = useContext(CashuWalletContext);

  const { signer } = useContext(SignerContext);
  const { nostr } = useContext(NostrContext);

  const { mints, tokens, history } = getLocalStorageData();

  const {
    handleSubmit: handleSendSubmit,
    control: sendControl,
    reset: sendReset,
  } = useForm({
    defaultValues: {
      sats: ""
    }
  });

  const handleToggleSendModal = () => {
    sendReset();
    setShowSendModal(!showSendModal);
    setShowTokenCard(false);
    setSendFailed(false);
    setNewToken("");
  };

  const onSendSubmit = async (data: { sats: string }) => {
    const numSats = parseInt(data.sats, 10);
    // Add a check to ensure parsing was successful before proceeding
    if (isNaN(numSats) || numSats <= 0) return;
    await handleSend(numSats!);
  };

  const handleSend = async (numSats: number) => {
    setSendFailed(false);
    try {
      const mint = new CashuMint(mints[0]!);
      const wallet = new CashuWallet(mint);
      const mintKeySetIds = await wallet.getKeySets();
      const filteredProofs = tokens.filter(
        (p: Proof) =>
          mintKeySetIds?.some((keysetId: MintKeyset) => keysetId.id === p.id)
      );
      const sendTotal = (numSats / 10) * 10;
      const { keep, send } = await wallet.send(sendTotal, filteredProofs, {
        includeFees: true,
      });

      const deletedEventIds = [
        ...new Set([
          ...walletContext.proofEvents
            .filter((event) =>
              event.proofs.some((proof: Proof) =>
                filteredProofs.some(
                  (filteredProof) =>
                    JSON.stringify(proof) === JSON.stringify(filteredProof)
                )
              )
            )
            .map((event) => event.id),
          ...walletContext.proofEvents
            .filter((event) =>
              event.proofs.some((proof: Proof) =>
                keep.some(
                  (keepProof) =>
                    JSON.stringify(proof) === JSON.stringify(keepProof)
                )
              )
            )
            .map((event) => event.id),
          ...walletContext.proofEvents
            .filter((event) =>
              event.proofs.some((proof: Proof) =>
                send.some(
                  (sendProof) =>
                    JSON.stringify(proof) === JSON.stringify(sendProof)
                )
              )
            )
            .map((event) => event.id),
        ]),
      ];

      const encodedSendToken = getEncodedToken({
        mint: mints[0]!,
        proofs: send,
      });
      setShowTokenCard(true);
      setNewToken(encodedSendToken);
      const changeProofs = keep;
      const remainingProofs = tokens.filter(
        (p: Proof) =>
          mintKeySetIds?.some((keysetId: MintKeyset) => keysetId.id !== p.id)
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
        ])
      );
      await publishProofEvent(
        nostr!,
        signer!,
        mints[0]!,
        changeProofs && changeProofs.length >= 1 ? changeProofs : [],
        "out",
        sendTotal.toString(),
        deletedEventIds
      );
    } catch (_) {
      setSendFailed(true);
    }
  };

  const handleCopyTokenString = () => {
    navigator.clipboard.writeText(newToken);
    setCopiedToClipboard(true);
    setTimeout(() => {
      setCopiedToClipboard(false);
    }, 2100);
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
                    If the token is taking a while to be generated, make sure to
                    check your bunker application to approve the transaction
                    events.
                  </p>
                </div>
              )}
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
