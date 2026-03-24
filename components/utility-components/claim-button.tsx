import { useState, useEffect, useContext, useMemo } from "react";
import {
  Modal,
  ModalContent,
  ModalBody,
  ModalHeader,
  Button,
  Spinner,
} from "@nextui-org/react";
import {
  ArrowDownTrayIcon,
  BoltIcon,
  CheckCircleIcon,
  XCircleIcon,
} from "@heroicons/react/24/outline";
import { ProfileMapContext, ChatsContext } from "../../utils/context/context";
import {
  generateKeys,
  getLocalStorageData,
  publishProofEvent,
  constructGiftWrappedEvent,
  constructMessageSeal,
  constructMessageGiftWrap,
  sendGiftWrappedMessageEvent,
} from "@/utils/nostr/nostr-helper-functions";
import {
  BLACKBUTTONCLASSNAMES,
  WHITEBUTTONCLASSNAMES,
} from "@/utils/STATIC-VARIABLES";
import { LightningAddress } from "@getalby/lightning-tools";
import { nip19 } from "nostr-tools";
import {
  CashuMint,
  CashuWallet,
  Proof,
  getDecodedToken,
  getEncodedToken,
} from "@cashu/cashu-ts";
import { formatWithCommas } from "./display-monetary-info";
import {
  NostrContext,
  SignerContext,
} from "@/components/utility-components/nostr-context-provider";

export default function ClaimButton({ token }: { token: string }) {
  const [lnurl, setLnurl] = useState("");
  const profileContext = useContext(ProfileMapContext);
  const chatsContext = useContext(ChatsContext);
  const { signer, pubkey: userPubkey } = useContext(SignerContext);
  const { nostr } = useContext(NostrContext);

  const [openClaimTypeModal, setOpenClaimTypeModal] = useState(false);
  const [openRedemptionModal, setOpenRedemptionModal] = useState(false);
  const [isPaid, setIsPaid] = useState(false);
  const [isRedeemed, setIsRedeemed] = useState(false);
  const [isRedeeming, setIsRedeeming] = useState(false);
  const [wallet, setWallet] = useState<CashuWallet>();
  const [proofs, setProofs] = useState<Proof[]>([]);
  const [tokenMint, setTokenMint] = useState("");
  const [tokenAmount, setTokenAmount] = useState(0);
  const [formattedTokenAmount, setFormattedTokenAmount] = useState("");

  const [isInvalidSuccess, setIsInvalidSuccess] = useState(false);
  const [isReceived, setIsReceived] = useState(false);
  const [isSpent, setIsSpent] = useState(false);
  const [isInvalidToken, setIsInvalidToken] = useState(false);
  const [isDuplicateToken, setIsDuplicateToken] = useState(false);

  const { mints, tokens, history } = getLocalStorageData();

  const [randomNpubForSender, setRandomNpubForSender] = useState<string>("");
  const [randomNsecForSender, setRandomNsecForSender] = useState<string>("");
  const [randomNpubForReceiver, setRandomNpubForReceiver] =
    useState<string>("");
  const [randomNsecForReceiver, setRandomNsecForReceiver] =
    useState<string>("");

  useEffect(() => {
    const fetchKeys = async () => {
      const { nsec: nsecForSender, npub: npubForSender } = await generateKeys();
      setRandomNpubForSender(npubForSender);
      setRandomNsecForSender(nsecForSender);
      const { nsec: nsecForReceiver, npub: npubForReceiver } =
        await generateKeys();
      setRandomNpubForReceiver(npubForReceiver);
      setRandomNsecForReceiver(nsecForReceiver);
    };

    fetchKeys();
  }, []);

  useEffect(() => {
    try {
      const decodedToken = getDecodedToken(token);
      const mint = decodedToken.mint;
      setTokenMint(mint);
      const proofs = decodedToken.proofs;
      setProofs(proofs);
      const newWallet = new CashuWallet(new CashuMint(mint));
      setWallet(newWallet);
      const totalAmount =
        Array.isArray(proofs) && proofs.length > 0
          ? proofs.reduce((acc, current: Proof) => acc + current.amount, 0)
          : 0;

      setTokenAmount(totalAmount);
      setFormattedTokenAmount(formatWithCommas(totalAmount, "sats"));
    } catch (error) {
      console.error("Error decoding token:", error);
      setIsInvalidToken(true);
    }
  }, [token]);

  const checkProofsSpent = async () => {
    try {
      if (proofs.length > 0 && wallet) {
        const proofsStates = await wallet.checkProofsStates(proofs);
        if (proofsStates) {
          const spentYs = new Set(
            proofsStates
              .filter((state) => state.state === "SPENT")
              .map((state) => state.Y)
          );
          if (spentYs.size > 0) {
            setIsRedeemed(true);
            return true;
          }
        }
      }
    } catch (error) {
      console.error("Error checking proof states:", error);
    }
    return false;
  };

  const handleClaimButtonClick = async () => {
    const alreadySpent = await checkProofsSpent();
    if (!alreadySpent) {
      setOpenClaimTypeModal(true);
    }
  };

  useEffect(() => {
    const sellerProfileMap = profileContext.profileData;
    const sellerProfile = sellerProfileMap.has(userPubkey!)
      ? sellerProfileMap.get(userPubkey!)
      : undefined;
    setLnurl(
      sellerProfile && sellerProfile.content.lud16
        ? sellerProfile.content.lud16
        : "invalid"
    );
  }, [profileContext, tokenMint, userPubkey]);

  const handleClaimType = async (type: string) => {
    if (type === "receive") {
      await receive(false);
    } else if (type === "redeem") {
      if (lnurl === "invalid") {
        await receive(true);
      } else {
        await redeem();
      }
    }
  };

  const receive = async (isInvalid: boolean) => {
    setOpenClaimTypeModal(false);
    setIsDuplicateToken(false);
    setIsInvalidSuccess(false);
    setIsReceived(false);
    setIsSpent(false);
    setIsInvalidToken(false);
    setIsRedeeming(true);
    try {
      const proofsStates = await wallet?.checkProofsStates(proofs);
      const spentYs = proofsStates
        ? new Set(
            proofsStates
              .filter((state) => state.state === "SPENT")
              .map((state) => state.Y)
          )
        : new Set();
      if (spentYs.size === 0) {
        const uniqueProofs = proofs.filter(
          (proof: Proof) => !tokens.some((token: Proof) => token.C === proof.C)
        );
        if (JSON.stringify(uniqueProofs) != JSON.stringify(proofs)) {
          setIsDuplicateToken(true);
          setIsRedeeming(false);
          return;
        }
        await publishProofEvent(
          nostr!,
          signer!,
          tokenMint,
          uniqueProofs,
          "in",
          tokenAmount.toString()
        );
        const tokenArray = [...tokens, ...uniqueProofs];
        localStorage.setItem("tokens", JSON.stringify(tokenArray));
        if (!mints.includes(tokenMint)) {
          const updatedMints = [...mints, tokenMint];
          localStorage.setItem("mints", JSON.stringify(updatedMints));
        }
        if (isInvalid) {
          setIsInvalidSuccess(true);
        } else {
          setIsReceived(true);
        }
        setIsRedeeming(false);
        localStorage.setItem(
          "history",
          JSON.stringify([
            {
              type: 1,
              amount: tokenAmount,
              date: Math.floor(Date.now() / 1000),
            },
            ...history,
          ])
        );
      } else {
        setIsSpent(true);
        setIsRedeeming(false);
      }
    } catch (_) {
      setIsInvalidToken(true);
      setIsRedeeming(false);
    }
  };

  const redeem = async () => {
    setOpenClaimTypeModal(false);
    setOpenRedemptionModal(false);
    setIsRedeeming(true);
    const newAmount = Math.floor(tokenAmount * 0.98 - 2);
    const ln = new LightningAddress(lnurl);
    try {
      if (wallet) {
        await wallet.loadMint();
        await ln.fetch();
        const invoice = await ln.requestInvoice({ satoshi: newAmount });
        const invoicePaymentRequest = invoice.paymentRequest;
        const meltQuote = await wallet.createMeltQuote(invoicePaymentRequest);
        if (meltQuote) {
          const meltQuoteTotal = meltQuote.amount + meltQuote.fee_reserve;
          const { keep, send } = await wallet.send(meltQuoteTotal, proofs, {
            includeFees: true,
          });
          const meltResponse = await wallet.meltProofs(meltQuote, send);
          const changeProofs = [...keep, ...meltResponse.change];
          const changeAmount =
            Array.isArray(changeProofs) && changeProofs.length > 0
              ? changeProofs.reduce(
                  (acc, current: Proof) => acc + current.amount,
                  0
                )
              : 0;
          if (changeAmount >= 1 && changeProofs && changeProofs.length > 0) {
            const decodedRandomPubkeyForSender =
              nip19.decode(randomNpubForSender);
            const decodedRandomPrivkeyForSender =
              nip19.decode(randomNsecForSender);
            const decodedRandomPubkeyForReceiver = nip19.decode(
              randomNpubForReceiver
            );
            const decodedRandomPrivkeyForReceiver = nip19.decode(
              randomNsecForReceiver
            );
            const encodedChange = getEncodedToken({
              mint: tokenMint,
              proofs: changeProofs,
            });
            const paymentMessage = "Overpaid fee change: " + encodedChange;
            const giftWrappedMessageEvent = await constructGiftWrappedEvent(
              decodedRandomPubkeyForSender.data as string,
              userPubkey!,
              paymentMessage,
              "payment-change"
            );
            const sealedEvent = await constructMessageSeal(
              signer!,
              giftWrappedMessageEvent,
              decodedRandomPubkeyForSender.data as string,
              userPubkey!,
              decodedRandomPrivkeyForSender.data as Uint8Array
            );
            const giftWrappedEvent = await constructMessageGiftWrap(
              sealedEvent,
              decodedRandomPubkeyForReceiver.data as string,
              decodedRandomPrivkeyForReceiver.data as Uint8Array,
              userPubkey!
            );
            await sendGiftWrappedMessageEvent(nostr!, giftWrappedEvent);
            chatsContext.addNewlyCreatedMessageEvent(
              {
                ...giftWrappedMessageEvent,
                sig: "",
                read: false,
              },
              true
            );
          }
          setIsPaid(true);
          setOpenRedemptionModal(true);
          setIsRedeeming(false);
        }
      } else {
        throw new Error("Wallet not initialized");
      }
    } catch (_) {
      setIsPaid(false);
      setOpenRedemptionModal(true);
      setIsRedeeming(false);
    }
  };

  const buttonClassName = useMemo(() => {
    // Updated disabled style to use gray with neo-brutalist structure
    const disabledStyle =
      "min-w-fit bg-gray-300 text-gray-500 border-2 border-black rounded-md shadow-neo cursor-not-allowed";
    const enabledStyle = BLACKBUTTONCLASSNAMES;
    const className = isRedeemed ? disabledStyle : enabledStyle;
    return className;
  }, [isRedeemed]);

  return (
    <div>
      <Button
        className={
          isRedeemed || isInvalidToken
            ? "mt-2 min-w-fit cursor-not-allowed bg-gray-400 text-gray-600 opacity-60"
            : buttonClassName + " mt-2 min-w-fit"
        }
        onClick={handleClaimButtonClick}
        isDisabled={isRedeemed || isInvalidToken}
      >
        {isRedeeming ? (
          <>
            {/* Updated spinner color */}
            <Spinner
              size={"sm"}
              classNames={{
                circle1: "border-b-primary-yellow",
                circle2: "border-b-primary-yellow",
              }}
            />
          </>
        ) : isInvalidToken ? (
          <>Invalid Token</>
        ) : isRedeemed ? (
          <>Claimed: {formattedTokenAmount}</>
        ) : (
          <>Claim: {formattedTokenAmount}</>
        )}
      </Button>
      <Modal
        backdrop="blur"
        isOpen={openClaimTypeModal}
        // Updated modal styles
        onClose={() => setOpenClaimTypeModal(false)}
        classNames={{
          wrapper: "shadow-neo",
          base: "border-2 border-black rounded-md",
          backdrop: "bg-black/20 backdrop-blur-sm",
          // Only body, apply full radius
          body: "py-6 bg-white rounded-md",
          closeButton:
            "hover:bg-gray-200 active:bg-gray-300 rounded-md text-black",
        }}
        isDismissable={true}
        scrollBehavior={"normal"}
        placement={"center"}
        size="2xl"
      >
        <ModalContent>
          {/* Updated text color */}
          <ModalBody className="flex flex-col overflow-hidden text-black">
            <div className="flex items-center justify-center">
              Would you like to receive the token directly to your Milk Market
              wallet, or redeem it to your Lightning address?
            </div>
            <div className="flex w-full flex-wrap justify-evenly gap-2">
              <Button
                className={WHITEBUTTONCLASSNAMES + " mt-2 w-[20%]"}
                onClick={() => handleClaimType("receive")}
                startContent={
                  <ArrowDownTrayIcon className="h-6 w-6 hover:text-yellow-600" />
                }
              >
                Receive
              </Button>
              <Button
                className={WHITEBUTTONCLASSNAMES + " mt-2 w-[20%]"}
                onClick={() => handleClaimType("redeem")}
                startContent={
                  <BoltIcon className="h-6 w-6 hover:text-yellow-600" />
                }
              >
                Redeem
              </Button>
            </div>
          </ModalBody>
        </ModalContent>
      </Modal>
      {isInvalidSuccess ? (
        <>
          <Modal
            backdrop="blur"
            isOpen={isInvalidSuccess}
            // Updated modal styles
            onClose={() => setIsInvalidSuccess(false)}
            classNames={{
              wrapper: "shadow-neo",
              base: "border-2 border-black rounded-md",
              backdrop: "bg-black/20 backdrop-blur-sm",
              header:
                "border-b-2 border-black bg-white rounded-t-md text-black",
              body: "py-6 bg-white rounded-b-md",
              closeButton:
                "hover:bg-gray-200 active:bg-gray-300 rounded-md text-black",
            }}
            isDismissable={true}
            scrollBehavior={"normal"}
            placement={"center"}
            size="2xl"
          >
            <ModalContent>
              {/* Updated text color */}
              <ModalHeader className="flex items-center justify-center text-black">
                <XCircleIcon className="h-6 w-6 text-red-500" />
                <div className="ml-2">No valid Lightning address found!</div>
              </ModalHeader>
              {/* Updated text color */}
              <ModalBody className="flex flex-col overflow-hidden text-black">
                <div className="flex items-center justify-center">
                  Check your Milk Market wallet for your sats.
                </div>
              </ModalBody>
            </ModalContent>
          </Modal>
        </>
      ) : null}
      {isReceived ? (
        <>
          <Modal
            backdrop="blur"
            isOpen={isReceived}
            // Updated modal styles
            onClose={() => setIsReceived(false)}
            classNames={{
              wrapper: "shadow-neo",
              base: "border-2 border-black rounded-md",
              backdrop: "bg-black/20 backdrop-blur-sm",
              header:
                "border-b-2 border-black bg-white rounded-t-md text-black",
              body: "py-6 bg-white rounded-b-md",
              closeButton:
                "hover:bg-gray-200 active:bg-gray-300 rounded-md text-black",
            }}
            isDismissable={true}
            scrollBehavior={"normal"}
            placement={"center"}
            size="2xl"
          >
            <ModalContent>
              {/* Updated text color */}
              <ModalHeader className="flex items-center justify-center text-black">
                <CheckCircleIcon className="h-6 w-6 text-green-500" />
                <div className="ml-2">Token successfully claimed!</div>
              </ModalHeader>
              {/* Updated text color */}
              <ModalBody className="flex flex-col overflow-hidden text-black">
                <div className="flex items-center justify-center">
                  Check your Milk Market wallet for your sats.
                </div>
              </ModalBody>
            </ModalContent>
          </Modal>
        </>
      ) : null}
      {isDuplicateToken ? (
        <>
          <Modal
            backdrop="blur"
            isOpen={isDuplicateToken}
            // Updated modal styles
            onClose={() => setIsDuplicateToken(false)}
            classNames={{
              wrapper: "shadow-neo",
              base: "border-2 border-black rounded-md",
              backdrop: "bg-black/20 backdrop-blur-sm",
              header:
                "border-b-2 border-black bg-white rounded-t-md text-black",
              body: "py-6 bg-white rounded-b-md",
              closeButton:
                "hover:bg-gray-200 active:bg-gray-300 rounded-md text-black",
            }}
            isDismissable={true}
            scrollBehavior={"normal"}
            placement={"center"}
            size="2xl"
          >
            <ModalContent>
              {/* Updated text color */}
              <ModalHeader className="flex items-center justify-center text-black">
                <XCircleIcon className="h-6 w-6 text-red-500" />
                <div className="ml-2">Duplicate token!</div>
              </ModalHeader>
              {/* Updated text color */}
              <ModalBody className="flex flex-col overflow-hidden text-black">
                <div className="flex items-center justify-center">
                  The token you are trying to claim is already in your Milk
                  Market wallet.
                </div>
              </ModalBody>
            </ModalContent>
          </Modal>
        </>
      ) : null}
      {isInvalidToken ? (
        <>
          <Modal
            backdrop="blur"
            isOpen={isInvalidToken}
            // Updated modal styles
            onClose={() => setIsInvalidToken(false)}
            classNames={{
              wrapper: "shadow-neo",
              base: "border-2 border-black rounded-md",
              backdrop: "bg-black/20 backdrop-blur-sm",
              header:
                "border-b-2 border-black bg-white rounded-t-md text-black",
              body: "py-6 bg-white rounded-b-md",
              closeButton:
                "hover:bg-gray-200 active:bg-gray-300 rounded-md text-black",
            }}
            isDismissable={true}
            scrollBehavior={"normal"}
            placement={"center"}
            size="2xl"
          >
            <ModalContent>
              {/* Updated text color */}
              <ModalHeader className="flex items-center justify-center text-black">
                <XCircleIcon className="h-6 w-6 text-red-500" />
                <div className="ml-2">Invalid token!</div>
              </ModalHeader>
              {/* Updated text color */}
              <ModalBody className="flex flex-col overflow-hidden text-black">
                <div className="flex items-center justify-center">
                  The token you are trying to claim is not a valid Cashu string.
                </div>
              </ModalBody>
            </ModalContent>
          </Modal>
        </>
      ) : null}
      {isSpent ? (
        <>
          <Modal
            backdrop="blur"
            isOpen={isSpent}
            // Updated modal styles
            onClose={() => setIsSpent(false)}
            classNames={{
              wrapper: "shadow-neo",
              base: "border-2 border-black rounded-md",
              backdrop: "bg-black/20 backdrop-blur-sm",
              header:
                "border-b-2 border-black bg-white rounded-t-md text-black",
              body: "py-6 bg-white rounded-b-md",
              closeButton:
                "hover:bg-gray-200 active:bg-gray-300 rounded-md text-black",
            }}
            isDismissable={true}
            scrollBehavior={"normal"}
            placement={"center"}
            size="2xl"
          >
            <ModalContent>
              {/* Updated text color */}
              <ModalHeader className="flex items-center justify-center text-black">
                <XCircleIcon className="h-6 w-6 text-red-500" />
                <div className="ml-2">Spent token!</div>
              </ModalHeader>
              {/* Updated text color */}
              <ModalBody className="flex flex-col overflow-hidden text-black">
                <div className="flex items-center justify-center">
                  The token you are trying to claim has already been redeemed.
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
            isOpen={openRedemptionModal}
            // Updated modal styles
            onClose={() => setOpenRedemptionModal(false)}
            classNames={{
              wrapper: "shadow-neo",
              base: "border-2 border-black rounded-md",
              backdrop: "bg-black/20 backdrop-blur-sm",
              header:
                "border-b-2 border-black bg-white rounded-t-md text-black",
              body: "py-6 bg-white rounded-b-md",
              closeButton:
                "hover:bg-gray-200 active:bg-gray-300 rounded-md text-black",
            }}
            isDismissable={true}
            scrollBehavior={"normal"}
            placement={"center"}
            size="2xl"
          >
            <ModalContent>
              {/* Updated text color */}
              <ModalHeader className="flex items-center justify-center text-black">
                <CheckCircleIcon className="h-6 w-6 text-green-500" />
                <div className="ml-2">Token successfully redeemed!</div>
              </ModalHeader>
              {/* Updated text color */}
              <ModalBody className="flex flex-col overflow-hidden text-black">
                <div className="flex items-center justify-center">
                  Check your Lightning address ({lnurl}) for your sats.
                </div>
              </ModalBody>
            </ModalContent>
          </Modal>
        </>
      ) : (
        <>
          <Modal
            backdrop="blur"
            isOpen={openRedemptionModal}
            // Updated modal styles
            onClose={() => setOpenRedemptionModal(false)}
            classNames={{
              wrapper: "shadow-neo",
              base: "border-2 border-black rounded-md",
              backdrop: "bg-black/20 backdrop-blur-sm",
              header:
                "border-b-2 border-black bg-white rounded-t-md text-black",
              body: "py-6 bg-white rounded-b-md",
              closeButton:
                "hover:bg-gray-200 active:bg-gray-300 rounded-md text-black",
            }}
            isDismissable={true}
            scrollBehavior={"normal"}
            placement={"center"}
            size="2xl"
          >
            <ModalContent>
              {/* Updated text color */}
              <ModalHeader className="flex items-center justify-center text-black">
                <XCircleIcon className="h-6 w-6 text-red-500" />
                <div className="ml-2">Token redemption failed!</div>
              </ModalHeader>
              {/* Updated text color */}
              <ModalBody className="flex flex-col overflow-hidden text-black">
                <div className="flex items-center justify-center">
                  You are attempting to redeem a token that has already been
                  redeemed, is too small/large, or for which there were no
                  payment routes found.
                </div>
              </ModalBody>
            </ModalContent>
          </Modal>
        </>
      )}
    </div>
  );
}
