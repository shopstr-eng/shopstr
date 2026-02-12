import { useState, useEffect, useContext } from "react";
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
import { NEO_BTN } from "@/utils/STATIC-VARIABLES";

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
  }, [profileContext, userPubkey]);

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

  return (
    <div>
      <Button
        className={
          isRedeemed || isInvalidToken
            ? "mt-2 min-w-fit cursor-not-allowed rounded-xl border border-zinc-700 bg-zinc-800 text-xs font-bold uppercase tracking-wider text-zinc-500 opacity-60"
            : `${NEO_BTN} mt-2 min-w-fit text-xs`
        }
        onClick={handleClaimButtonClick}
        isDisabled={isRedeemed || isInvalidToken}
      >
        {isRedeeming ? (
          <Spinner size="sm" color="warning" />
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
        onClose={() => setOpenClaimTypeModal(false)}
        classNames={{
          base: "bg-[#161616] border border-zinc-800 rounded-2xl",
          body: "py-8",
          backdrop: "bg-black/80 backdrop-blur-sm",
          header: "border-b border-zinc-800 text-white",
          closeButton: "hover:bg-white/10 text-white",
        }}
        isDismissable={true}
        scrollBehavior={"normal"}
        placement={"center"}
        size="md"
      >
        <ModalContent>
          <ModalBody className="flex flex-col gap-6 overflow-hidden text-zinc-300">
            <div className="flex items-center justify-center text-center font-bold uppercase tracking-tight text-white">
              Would you like to claim the token directly to your Shopstr wallet,
              or to your Lightning address?
            </div>
            <div className="flex w-full flex-col sm:flex-row justify-center items-center gap-4">
              <Button
                className="h-14 w-full sm:w-[48%] rounded-xl border border-zinc-700 bg-[#111] text-xs font-bold uppercase tracking-wider text-white hover:border-yellow-400 transition-colors"
                onClick={() => handleClaimType("receive")}
                startContent={
                  <ArrowDownTrayIcon className="h-6 w-6 text-yellow-400" />
                }
              >
                Receive
              </Button>
              <Button
                className="h-14 w-full sm:w-[48%] rounded-xl border border-zinc-700 bg-[#111] text-xs font-bold uppercase tracking-wider text-white hover:border-yellow-400 transition-colors"
                onClick={() => handleClaimType("redeem")}
                startContent={
                  <BoltIcon className="h-6 w-6 text-yellow-400" />
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
            onClose={() => setIsInvalidSuccess(false)}
            classNames={{
              base: "bg-[#161616] border border-zinc-800 rounded-2xl",
              body: "py-8",
              backdrop: "bg-black/80 backdrop-blur-sm",
              header: "border-b border-zinc-800 text-white",
              closeButton: "hover:bg-white/10 text-white",
            }}
            isDismissable={true}
            scrollBehavior={"normal"}
            placement={"center"}
            size="md"
          >
            <ModalContent>
              <ModalHeader className="flex items-center justify-center font-black uppercase tracking-tighter">
                <XCircleIcon className="h-6 w-6 text-red-500" />
                <div className="ml-2">No valid Lightning address found!</div>
              </ModalHeader>
              <ModalBody className="flex flex-col overflow-hidden text-zinc-300 font-medium">
                <div className="flex items-center justify-center">
                  Check your Shopstr wallet for your sats.
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
            onClose={() => setIsReceived(false)}
            classNames={{
              base: "bg-[#161616] border border-zinc-800 rounded-2xl",
              body: "py-8",
              backdrop: "bg-black/80 backdrop-blur-sm",
              header: "border-b border-zinc-800 text-white",
              closeButton: "hover:bg-white/10 text-white",
            }}
            isDismissable={true}
            scrollBehavior={"normal"}
            placement={"center"}
            size="md"
          >
            <ModalContent>
              <ModalHeader className="flex items-center justify-center font-black uppercase tracking-tighter">
                <CheckCircleIcon className="h-6 w-6 text-green-500" />
                <div className="ml-2">Token successfully claimed!</div>
              </ModalHeader>
              <ModalBody className="flex flex-col overflow-hidden text-zinc-300 font-medium">
                <div className="flex items-center justify-center">
                  Check your Shopstr wallet for your sats.
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
            onClose={() => setIsDuplicateToken(false)}
            classNames={{
              base: "bg-[#161616] border border-zinc-800 rounded-2xl",
              body: "py-8",
              backdrop: "bg-black/80 backdrop-blur-sm",
              header: "border-b border-zinc-800 text-white",
              closeButton: "hover:bg-white/10 text-white",
            }}
            isDismissable={true}
            scrollBehavior={"normal"}
            placement={"center"}
            size="md"
          >
            <ModalContent>
              <ModalHeader className="flex items-center justify-center font-black uppercase tracking-tighter">
                <XCircleIcon className="h-6 w-6 text-red-500" />
                <div className="ml-2">Duplicate token!</div>
              </ModalHeader>
              <ModalBody className="flex flex-col overflow-hidden text-zinc-300 font-medium">
                <div className="flex items-center justify-center">
                  The token you are trying to claim is already in your Shopstr
                  wallet.
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
            onClose={() => setIsSpent(false)}
            classNames={{
              base: "bg-[#161616] border border-zinc-800 rounded-2xl",
              body: "py-8",
              backdrop: "bg-black/80 backdrop-blur-sm",
              header: "border-b border-zinc-800 text-white",
              closeButton: "hover:bg-white/10 text-white",
            }}
            isDismissable={true}
            scrollBehavior={"normal"}
            placement={"center"}
            size="md"
          >
            <ModalContent>
              <ModalHeader className="flex items-center justify-center font-black uppercase tracking-tighter">
                <XCircleIcon className="h-6 w-6 text-red-500" />
                <div className="ml-2">Spent token!</div>
              </ModalHeader>
              <ModalBody className="flex flex-col overflow-hidden text-zinc-300 font-medium">
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
            onClose={() => setOpenRedemptionModal(false)}
            classNames={{
              base: "bg-[#161616] border border-zinc-800 rounded-2xl",
              body: "py-8",
              backdrop: "bg-black/80 backdrop-blur-sm",
              header: "border-b border-zinc-800 text-white",
              closeButton: "hover:bg-white/10 text-white",
            }}
            isDismissable={true}
            scrollBehavior={"normal"}
            placement={"center"}
            size="md"
          >
            <ModalContent>
              <ModalHeader className="flex items-center justify-center font-black uppercase tracking-tighter">
                <CheckCircleIcon className="h-6 w-6 text-green-500" />
                <div className="ml-2">Token successfully redeemed!</div>
              </ModalHeader>
              <ModalBody className="flex flex-col overflow-hidden text-zinc-300 font-medium">
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
            onClose={() => setOpenRedemptionModal(false)}
            classNames={{
              base: "bg-[#161616] border border-zinc-800 rounded-2xl",
              body: "py-8",
              backdrop: "bg-black/80 backdrop-blur-sm",
              header: "border-b border-zinc-800 text-white",
              closeButton: "hover:bg-white/10 text-white",
            }}
            isDismissable={true}
            scrollBehavior={"normal"}
            placement={"center"}
            size="md"
          >
            <ModalContent>
              <ModalHeader className="flex items-center justify-center font-black uppercase tracking-tighter">
                <XCircleIcon className="h-6 w-6 text-red-500" />
                <div className="ml-2">Token redemption failed!</div>
              </ModalHeader>
              <ModalBody className="flex flex-col overflow-hidden text-zinc-300 font-medium">
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
