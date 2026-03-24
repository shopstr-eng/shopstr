import { useContext, useState } from "react";
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
import {
  WHITEBUTTONCLASSNAMES,
  BLUEBUTTONCLASSNAMES,
} from "@/utils/STATIC-VARIABLES";
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
      sats: "",
    },
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
        className={WHITEBUTTONCLASSNAMES + " m-2"}
        onClick={() => setShowSendModal(!showSendModal)}
        startContent={<ArrowUpTrayIcon className="h-6 w-6" />}
      >
        Send
      </Button>
      <Modal
        backdrop="blur"
        isOpen={showSendModal}
        onClose={handleToggleSendModal}
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
                    If the token is taking a while to be generated, make sure to
                    check your bunker application to approve the transaction
                    events.
                  </p>
                </div>
              )}
              {sendFailed && (
                <Card className="mt-3 rounded-md border-3 border-black shadow-neo">
                  <CardHeader className="flex justify-center gap-3 border-b-2 border-black bg-white">
                    <div className="flex items-center justify-center">
                      <XCircleIcon className="h-6 w-6 text-red-500" />
                      <div className="ml-2 font-bold text-black">
                        Send failed!
                      </div>
                    </div>
                  </CardHeader>
                  <Divider className="bg-black" />
                  <CardBody className="flex flex-col items-center bg-white">
                    <div className="flex flex-col items-center justify-center">
                      <p className="text-center text-black">
                        You don&apos;t have enough funds to send. Please try
                        again with a new amount, or change your mint in
                        settings.
                      </p>
                    </div>
                  </CardBody>
                </Card>
              )}
              {showTokenCard && (
                <Card className="mt-3 rounded-md border-3 border-black shadow-neo">
                  <CardHeader className="flex justify-center gap-3 border-b-2 border-black bg-white">
                    <div className="flex items-center justify-center">
                      <CheckCircleIcon className="h-6 w-6 text-green-500" />
                      <div className="ml-2 font-bold text-black">
                        New token string is ready to be copied and sent!
                      </div>
                    </div>
                  </CardHeader>
                  <Divider className="bg-black" />
                  <CardBody className="flex flex-col items-center bg-white">
                    {newToken ? (
                      <div className="flex w-full flex-col items-center justify-center">
                        <p className="mb-3 whitespace-break-spaces break-all font-mono text-sm text-black">
                          {newToken}
                        </p>
                        <ClipboardIcon
                          onClick={handleCopyTokenString}
                          className={`h-6 w-6 cursor-pointer text-black hover:text-gray-600 ${
                            copiedToClipboard ? "hidden" : ""
                          }`}
                        />
                        <CheckIcon
                          className={`h-6 w-6 cursor-pointer text-green-600 ${
                            copiedToClipboard ? "" : "hidden"
                          }`}
                        />
                      </div>
                    ) : (
                      <div className="flex flex-col items-center justify-center">
                        <p className="text-center text-black">
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
                    className="px-4 py-2 font-bold hover:underline"
                    variant="light"
                    onClick={handleToggleSendModal}
                  >
                    Cancel
                  </Button>

                  <Button className={BLUEBUTTONCLASSNAMES} type="submit">
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
