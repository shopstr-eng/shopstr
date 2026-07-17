import { useState, useEffect, useContext, useMemo, useRef } from "react";
import {
  Modal,
  ModalContent,
  ModalBody,
  ModalHeader,
  Button,
  Spinner,
} from "@heroui/react";
import {
  ArrowDownTrayIcon,
  BoltIcon,
  CheckCircleIcon,
  XCircleIcon,
} from "@heroicons/react/24/outline";
import { useTheme } from "next-themes";
import {
  ProfileMapContext,
  ChatsContext,
  CashuWalletContext,
} from "../../utils/context/context";
import {
  generateKeys,
  getLocalStorageData,
  publishProofEvent,
  publishWalletEvent,
} from "@/utils/nostr/nostr-helper-functions";
import {
  constructGiftWrappedEvent,
  constructMessageSeal,
  constructMessageGiftWrap,
  sendGiftWrappedMessageEvent,
} from "@/utils/nostr/gift-wrap";
import { SHOPSTRBUTTONCLASSNAMES } from "@/utils/STATIC-VARIABLES";
import { LightningAddress } from "@getalby/lightning-tools";
import { nip19 } from "nostr-tools";
import {
  Mint as CashuMint,
  Wallet as CashuWallet,
  Proof,
  getTokenMetadata,
  getEncodedToken,
} from "@cashu/cashu-ts";
import { safeMeltProofs } from "@/utils/cashu/melt-retry-service";
import { safeSwap } from "@/utils/cashu/swap-retry-service";
import { formatWithCommas } from "./display-monetary-info";
import {
  NostrContext,
  SignerContext,
} from "@/components/utility-components/nostr-context-provider";
import {
  checkMintP2pkSupport,
  parseP2PKProofSet,
  pubkeysEqual,
} from "@/utils/cashu/p2pk-checkout";
import { sumProofAmounts } from "@/utils/cashu/proof-amount";
import { ParsedP2PK } from "@/utils/types/types";
import {
  createPartialRedemption,
  combineAndRedeem,
  findIncomingEscrowPayload,
  EscrowPaymentRequestPayload,
  EscrowBuyerSigPayload,
  EscrowArbiterSigPayload,
  EscrowDisputePayload,
  EscrowPayload,
} from "@/utils/cashu/dispute-redemption";
import {
  getStoredBuyerP2pkEscrowRecords,
  updateDisputeStatusWithSigner,
  P2pkEscrowDisputeStatus,
} from "@/utils/cashu/p2pk-escrow-records";
import {
  fetchDisputeEvent,
  parseDisputeEvent,
  publishDisputeEvent,
} from "@/utils/nostr/dispute-records";

export default function ClaimButton({
  token,
  orderId,
  buyerPubkey,
  sellerPubkey,
}: {
  token: string;
  orderId?: string;
  buyerPubkey?: string;
  sellerPubkey?: string;
}) {
  const [lnurl, setLnurl] = useState("");
  const profileContext = useContext(ProfileMapContext);
  const chatsContext = useContext(ChatsContext);
  const { signer, pubkey: userPubkey } = useContext(SignerContext);
  const { nostr } = useContext(NostrContext);
  const { cashuPubkey, cashuPrivkey } = useContext(CashuWalletContext);

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
  const [isRefunded, setIsRefunded] = useState(false);
  const [isSpent, setIsSpent] = useState(false);
  const [isInvalidToken, setIsInvalidToken] = useState(false);
  const [isDuplicateToken, setIsDuplicateToken] = useState(false);
  const [isP2pkKeyMissing, setIsP2pkKeyMissing] = useState(false);
  const [p2pk, setP2PK] = useState<ParsedP2PK | null>(null);
  const { mints, tokens, history } = getLocalStorageData();

  const [disputeStatus, setDisputeStatus] =
    useState<P2pkEscrowDisputeStatus>("none");
  const [isAwaitingBuyerConfirm, setIsAwaitingBuyerConfirm] = useState(false);
  const [requestSentAt, setRequestSentAt] = useState<number | null>(null);
  const [isDisputeInProgress, setIsDisputeInProgress] = useState(false);
  const [arbiterResolutionAvailable, setArbiterResolutionAvailable] =
    useState(false);
  const [escrowActionError, setEscrowActionError] = useState<string | null>(
    null
  );

  // Grace period a buyer gets to respond to a seller's payment request
  // before the seller may escalate to the arbiter. Kept generous so
  // escalation can't be used to rush a buyer who just hasn't checked in yet.
  const SELLER_ESCALATION_GRACE_PERIOD_MS = 48 * 60 * 60 * 1000;

  const paymentRequestSentAtKey = (id: string) =>
    `shopstr.escrow.paymentRequestSentAt.${id}`;

  // Restores "awaiting buyer confirmation" state across reloads. The DM
  // timestamp isn't a reliable client-independent clock, so this trusts the
  // seller's own local record of when they sent the request — it only
  // gates a client-side UI affordance (the escalate button), not payout.
  useEffect(() => {
    if (!orderId) return;
    const stored = localStorage.getItem(paymentRequestSentAtKey(orderId));
    if (stored) {
      setRequestSentAt(Number(stored));
      setIsAwaitingBuyerConfirm(true);
    }
  }, [orderId]);

  const canEscalate = useMemo(() => {
    if (!isAwaitingBuyerConfirm || requestSentAt === null) return false;
    return Date.now() - requestSentAt >= SELLER_ESCALATION_GRACE_PERIOD_MS;
  }, [isAwaitingBuyerConfirm, requestSentAt]);

  // True when locktime has expired and the current wallet key is an
  // authorized refund signer. refundKeys are stored as "02"+x-only (66 chars)
  // by cashu-ts; cashuPubkey from context is x-only (64 chars).
  const isRefundEligible = useMemo(() => {
    if (!p2pk || !p2pk.expired || !cashuPubkey) return false;
    return p2pk.refundKeys.some((k) => pubkeysEqual(k, cashuPubkey));
  }, [p2pk, cashuPubkey]);

  // True for a 2-of-3 dispute-escrow lock (seller + buyer + arbiter).
  const isMultisigEscrow = useMemo(
    () => p2pk !== null && p2pk.nSigs === 2 && (p2pk.pubkeys?.length ?? 0) > 0,
    [p2pk]
  );

  // Compared against the token's own parsed Cashu pubkeys (p2pk.pubkey is
  // the seller/primary signer, p2pk.pubkeys[0] is the buyer per
  // buildP2pkSwapOptions) — NOT the buyerPubkey/sellerPubkey props, which
  // are Nostr identity pubkeys used only for DM routing below.
  const isSellerView = useMemo(
    () => pubkeysEqual(p2pk?.pubkey, cashuPubkey),
    [p2pk, cashuPubkey]
  );
  const isBuyerView = useMemo(
    () => pubkeysEqual(p2pk?.pubkeys?.[0], cashuPubkey),
    [p2pk, cashuPubkey]
  );

  const assertP2pkMintSupported = async () => {
    if (!p2pk) return;

    const mintSupport = await checkMintP2pkSupport(tokenMint);
    if (!mintSupport.supported) {
      throw new Error(
        mintSupport.reason ?? "This mint does not support P2PK proofs."
      );
    }
  };

  const { theme } = useTheme();

  useEffect(() => {
    if (proofs.length === 0) {
      setP2PK(null);
      return;
    }

    const parsedP2pk = parseP2PKProofSet(proofs);
    if (parsedP2pk.invalidReason) {
      setP2PK(null);
      setIsInvalidToken(true);
      return;
    }
    setP2PK(parsedP2pk.p2pk);
  }, [proofs]);

  // Buyer's view: the escrow record is self-encrypted to whoever created it
  // (the buyer, at checkout), so this is the only view where reading it
  // directly is valid.
  useEffect(() => {
    if (!orderId || !isMultisigEscrow || !isBuyerView || !signer) return;
    let isActive = true;

    getStoredBuyerP2pkEscrowRecords(signer).then((records) => {
      if (!isActive) return;
      const record = records.find((r) => r.orderId === orderId);
      if (record?.disputeStatus) {
        setDisputeStatus(record.disputeStatus);
        setIsDisputeInProgress(record.disputeStatus === "open");
      }
    });

    return () => {
      isActive = false;
    };
  }, [orderId, isMultisigEscrow, isBuyerView, signer]);

  useEffect(() => {
    setArbiterResolutionAvailable(false);
  }, [orderId, token]);

  // An arbiter signature DM means the current user won the dispute. This
  // must override the generic open-dispute disabled state so the winner can
  // reach handleArbiterRedeem.
  useEffect(() => {
    if (
      !orderId ||
      !isMultisigEscrow ||
      (!isBuyerView && !isSellerView) ||
      !nostr ||
      !signer ||
      !userPubkey
    )
      return;
    let isActive = true;

    findIncomingEscrowPayload<EscrowArbiterSigPayload>(
      nostr,
      signer,
      userPubkey,
      orderId,
      "escrow-arbiter-sig"
    ).then((arbiterSigPayload) => {
      if (!isActive || !arbiterSigPayload) return;
      setDisputeStatus(isBuyerView ? "resolved:buyer" : "resolved:seller");
      setIsDisputeInProgress(false);
      setArbiterResolutionAvailable(true);
    });

    return () => {
      isActive = false;
    };
  }, [
    orderId,
    isMultisigEscrow,
    isBuyerView,
    isSellerView,
    nostr,
    signer,
    userPubkey,
  ]);

  // Participants without a readable buyer escrow record (especially the
  // seller) learn about disputes from the direct escrow-dispute DM, with a
  // public kind 30009 fallback so a missed DM cannot leave stale claim UI.
  useEffect(() => {
    if (
      !orderId ||
      !isMultisigEscrow ||
      !nostr ||
      !signer ||
      !userPubkey ||
      arbiterResolutionAvailable
    )
      return;
    let isActive = true;

    const markDisputeOpen = () => {
      setDisputeStatus("open");
      setIsDisputeInProgress(true);
    };

    const loadDisputeStatus = async () => {
      const disputePayload =
        await findIncomingEscrowPayload<EscrowDisputePayload>(
          nostr,
          signer,
          userPubkey,
          orderId,
          "escrow-dispute"
        );
      if (!isActive) return;
      if (disputePayload) {
        markDisputeOpen();
        return;
      }

      const disputeEvent = await fetchDisputeEvent({ nostr, orderId });
      if (!isActive || !disputeEvent) return;
      const parsedDispute = parseDisputeEvent(disputeEvent);
      const isParticipant =
        parsedDispute?.buyerPubkey === userPubkey ||
        parsedDispute?.sellerPubkey === userPubkey ||
        parsedDispute?.arbiterPubkey === userPubkey;
      if (isParticipant && parsedDispute?.status === "open") {
        markDisputeOpen();
      }
    };

    loadDisputeStatus();

    return () => {
      isActive = false;
    };
  }, [
    orderId,
    isMultisigEscrow,
    nostr,
    signer,
    userPubkey,
    arbiterResolutionAvailable,
  ]);

  const randomNpubForSenderRef = useRef<string>("");
  const randomNsecForSenderRef = useRef<string>("");
  const randomNpubForReceiverRef = useRef<string>("");
  const randomNsecForReceiverRef = useRef<string>("");

  useEffect(() => {
    const fetchKeys = async () => {
      const { nsec: nsecForSender, npub: npubForSender } = await generateKeys();
      randomNpubForSenderRef.current = npubForSender;
      randomNsecForSenderRef.current = nsecForSender;
      const { nsec: nsecForReceiver, npub: npubForReceiver } =
        await generateKeys();
      randomNpubForReceiverRef.current = npubForReceiver;
      randomNsecForReceiverRef.current = nsecForReceiver;
    };

    fetchKeys();
  }, []);

  useEffect(() => {
    let isActive = true;

    const decodeToken = async () => {
      try {
        setIsInvalidToken(false);
        setProofs([]);
        setWallet(undefined);
        const tokenMetadata = getTokenMetadata(token);
        const newWallet = new CashuWallet(new CashuMint(tokenMetadata.mint), {
          unit: tokenMetadata.unit,
        });
        await newWallet.loadMint();
        const decodedToken = newWallet.decodeToken(token);
        if (!isActive) return;

        const mint = decodedToken.mint;
        setTokenMint(mint);
        const proofs = decodedToken.proofs;
        setProofs(proofs);
        setWallet(newWallet);
        const totalAmount =
          Array.isArray(proofs) && proofs.length > 0
            ? sumProofAmounts(proofs)
            : 0;

        setTokenAmount(totalAmount);
        setFormattedTokenAmount(formatWithCommas(totalAmount, "sats"));
      } catch (error) {
        if (!isActive) return;
        console.error("Error decoding token:", error);
        setIsInvalidToken(true);
      }
    };

    decodeToken();

    return () => {
      isActive = false;
    };
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
    if (p2pk && !cashuPrivkey) {
      setIsP2pkKeyMissing(true);
      return;
    }
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

  const receive = async (isInvalid: boolean, isRefund = false) => {
    setOpenClaimTypeModal(false);
    setIsDuplicateToken(false);
    setIsInvalidSuccess(false);
    setIsReceived(false);
    setIsSpent(false);
    setIsInvalidToken(false);
    setIsRedeeming(true);
    try {
      // P2PK locked proofs must be unlocked at the mint before storage.
      // wallet.receive() calls completeSwap() internally, which signs the inputs
      // with privkey and swaps them for fresh unlocked proofs in one mint round-trip.
      // Both the seller claim path and the buyer refund path use this branch;
      // the mint is the authority on which signing path is valid.
      if (p2pk) {
        if (!cashuPrivkey) {
          setIsP2pkKeyMissing(true);
          setIsRedeeming(false);
          return;
        }
        await assertP2pkMintSupported();
        await wallet!.loadMint();
        const freshProofs = await wallet!.receive(proofs, {
          privkey: cashuPrivkey,
        });
        await publishProofEvent(
          nostr!,
          signer!,
          tokenMint,
          freshProofs,
          "in",
          tokenAmount.toString()
        );
        localStorage.setItem(
          "tokens",
          JSON.stringify([...tokens, ...freshProofs])
        );
        if (!mints.includes(tokenMint)) {
          const updatedMints = [...mints, tokenMint];
          localStorage.setItem("mints", JSON.stringify(updatedMints));
          if (cashuPrivkey) {
            await publishWalletEvent(
              nostr!,
              signer!,
              { cashuPubkey, cashuPrivkey },
              { mints: updatedMints }
            );
          }
        }
        if (isRefund) {
          setIsRefunded(true);
        } else if (isInvalid) {
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
        return;
      }

      // Non-P2PK path: plain proofs are immediately spendable; store directly.
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
          if (cashuPrivkey) {
            await publishWalletEvent(
              nostr!,
              signer!,
              { cashuPubkey, cashuPrivkey },
              { mints: updatedMints }
            );
          }
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
    } catch {
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
        await assertP2pkMintSupported();
        await wallet.loadMint();
        await ln.fetch();
        const invoice = await ln.requestInvoice({ satoshi: newAmount });
        const invoicePaymentRequest = invoice.paymentRequest;
        const meltQuote = await wallet.createMeltQuoteBolt11(
          invoicePaymentRequest
        );
        if (meltQuote) {
          const meltQuoteTotal =
            meltQuote.amount.toNumber() + meltQuote.fee_reserve.toNumber();
          const swapOutcome = await safeSwap(wallet, meltQuoteTotal, proofs, {
            sendConfig: {
              includeFees: true,
              ...(p2pk && cashuPrivkey ? { privkey: cashuPrivkey } : {}),
            },
          });
          if (swapOutcome.status !== "swapped") {
            throw new Error(
              swapOutcome.errorMessage ??
                `Pre-melt swap did not complete (${swapOutcome.status})`
            );
          }
          const { keep, send } = swapOutcome;
          const meltOutcome = await safeMeltProofs(wallet, meltQuote, send);
          if (meltOutcome.status !== "paid") {
            throw new Error(
              meltOutcome.errorMessage ??
                `Melt did not complete (${meltOutcome.status})`
            );
          }
          const changeProofs = [...keep, ...meltOutcome.changeProofs];
          const changeAmount =
            Array.isArray(changeProofs) && changeProofs.length > 0
              ? sumProofAmounts(changeProofs)
              : 0;
          if (changeAmount >= 1 && changeProofs && changeProofs.length > 0) {
            const decodedRandomPubkeyForSender = nip19.decode(
              randomNpubForSenderRef.current
            );
            const decodedRandomPrivkeyForSender = nip19.decode(
              randomNsecForSenderRef.current
            );
            const decodedRandomPubkeyForReceiver = nip19.decode(
              randomNpubForReceiverRef.current
            );
            const decodedRandomPrivkeyForReceiver = nip19.decode(
              randomNsecForReceiverRef.current
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
            await sendGiftWrappedMessageEvent(nostr!, giftWrappedEvent, signer);
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
    } catch {
      setIsPaid(false);
      setOpenRedemptionModal(true);
      setIsRedeeming(false);
    }
  };

  const handleRefundClick = async () => {
    if (p2pk && !cashuPrivkey) {
      setIsP2pkKeyMissing(true);
      return;
    }
    await receive(false, true);
  };

  // Shared DM helper for the dispute-escrow control-plane messages below.
  // Reuses the exact ephemeral seal-and-wrap shape already used in
  // redeem() (see the overpaid-fee-change notification above), just
  // parameterized on an arbitrary recipient and a JSON payload instead of a
  // plain-text message addressed to self.
  const sendEscrowDm = async (
    recipientPubkey: string,
    payload: EscrowPayload
  ) => {
    const decodedRandomPubkeyForSender = nip19.decode(
      randomNpubForSenderRef.current
    );
    const decodedRandomPrivkeyForSender = nip19.decode(
      randomNsecForSenderRef.current
    );
    const decodedRandomPubkeyForReceiver = nip19.decode(
      randomNpubForReceiverRef.current
    );
    const decodedRandomPrivkeyForReceiver = nip19.decode(
      randomNsecForReceiverRef.current
    );
    const giftWrappedMessageEvent = await constructGiftWrappedEvent(
      decodedRandomPubkeyForSender.data as string,
      recipientPubkey,
      JSON.stringify(payload),
      payload.type
    );
    const sealedEvent = await constructMessageSeal(
      signer!,
      giftWrappedMessageEvent,
      decodedRandomPubkeyForSender.data as string,
      recipientPubkey,
      decodedRandomPrivkeyForSender.data as Uint8Array
    );
    const giftWrappedEvent = await constructMessageGiftWrap(
      sealedEvent,
      decodedRandomPubkeyForReceiver.data as string,
      decodedRandomPrivkeyForReceiver.data as Uint8Array,
      recipientPubkey
    );
    await sendGiftWrappedMessageEvent(nostr!, giftWrappedEvent, signer, {
      waitForRelayPublish: false,
    });
  };

  const handleSellerRequestPayment = async () => {
    if (!orderId || !buyerPubkey) return;
    setEscrowActionError(null);
    try {
      const payload: EscrowPaymentRequestPayload = {
        type: "escrow-payment-request",
        orderId,
      };
      await sendEscrowDm(buyerPubkey, payload);
      const sentAt = Date.now();
      localStorage.setItem(paymentRequestSentAtKey(orderId), String(sentAt));
      setRequestSentAt(sentAt);
      setIsAwaitingBuyerConfirm(true);
    } catch (error) {
      setEscrowActionError(
        error instanceof Error ? error.message : String(error)
      );
    }
  };

  const handleBuyerConfirmReceipt = async () => {
    if (!orderId || !sellerPubkey) return;
    if (!cashuPrivkey) {
      setIsP2pkKeyMissing(true);
      return;
    }
    setEscrowActionError(null);
    try {
      // Security rules 1/2: this produces ONLY the buyer's own signature
      // and sends it ONLY to the seller — the buyer never learns the
      // seller's or arbiter's signature from this call.
      const { proofs: partialProofs, partialSigs: buyerSigs } =
        await createPartialRedemption(token, cashuPrivkey);
      const payload: EscrowBuyerSigPayload = {
        type: "escrow-buyer-sig",
        orderId,
        proofs: partialProofs,
        buyerSigs,
      };
      await sendEscrowDm(sellerPubkey, payload);
      setIsAwaitingBuyerConfirm(false);
    } catch (error) {
      setEscrowActionError(
        error instanceof Error ? error.message : String(error)
      );
    }
  };

  const handleSellerRedeemWithBuyerSig = async () => {
    if (!orderId || !nostr || !signer || !userPubkey) return;
    if (!cashuPrivkey) {
      setIsP2pkKeyMissing(true);
      return;
    }
    setEscrowActionError(null);
    setIsRedeeming(true);
    try {
      const buyerSigPayload =
        await findIncomingEscrowPayload<EscrowBuyerSigPayload>(
          nostr,
          signer,
          userPubkey,
          orderId,
          "escrow-buyer-sig"
        );
      if (!buyerSigPayload) {
        setEscrowActionError("No confirmation from buyer yet.");
        setIsRedeeming(false);
        return;
      }
      const { proofs: sellerProofs, partialSigs: sellerOwnSigs } =
        await createPartialRedemption(token, cashuPrivkey);
      const result = await combineAndRedeem({
        proofs: sellerProofs,
        sig1: buyerSigPayload.buyerSigs,
        sig2: sellerOwnSigs,
        tokenMint,
        tokenAmount,
        nostr: nostr!,
        signer: signer!,
        mints,
        tokens,
        history,
      });
      if (result.success) {
        setIsReceived(true);
        localStorage.removeItem(paymentRequestSentAtKey(orderId));
        setIsAwaitingBuyerConfirm(false);
      } else {
        setEscrowActionError(result.error ?? "Redemption failed.");
      }
    } catch (error) {
      setEscrowActionError(
        error instanceof Error ? error.message : String(error)
      );
    } finally {
      setIsRedeeming(false);
    }
  };

  const handleOpenDispute = async (reason: string) => {
    if (!isBuyerView || !orderId || !sellerPubkey || !signer || !userPubkey)
      return;
    setEscrowActionError(null);
    try {
      // Persists via the real app signer, not cashuPrivkey — the escrow
      // record is self-encrypted to the buyer's real Nostr identity, which
      // cashuPrivkey (a wallet-only key) has no relationship to.
      await updateDisputeStatusWithSigner(orderId, "open", signer, nostr);
      setDisputeStatus("open");
      setIsDisputeInProgress(true);

      const sellerPayload: EscrowDisputePayload = {
        type: "escrow-dispute",
        orderId,
        reason,
      };

      const arbiterPubkey = process.env.NEXT_PUBLIC_ARBITER_NOSTR_PUBKEY;
      const publishTasks: Promise<unknown>[] = [
        sendEscrowDm(sellerPubkey, sellerPayload),
      ];
      if (arbiterPubkey) {
        // The arbiter has no way to decrypt either party's self-encrypted
        // kind 30406 escrow record, so its copy of the DM also carries the
        // Cashu token/amount it needs to rule on the dispute.
        const arbiterPayload: EscrowDisputePayload = {
          type: "escrow-dispute",
          orderId,
          reason,
          token,
          amount: tokenAmount,
        };
        publishTasks.push(
          sendEscrowDm(arbiterPubkey, arbiterPayload),
          publishDisputeEvent({
            orderId,
            reason,
            nostr: nostr!,
            signer,
            buyerPubkey: userPubkey,
            sellerPubkey,
            arbiterPubkey,
          })
        );
      }

      const results = await Promise.allSettled(publishTasks);
      const firstFailure = results.find(
        (result): result is PromiseRejectedResult =>
          result.status === "rejected"
      );
      if (firstFailure) {
        console.warn(
          "Failed to publish dispute notification",
          firstFailure.reason
        );
      }
    } catch (error) {
      setDisputeStatus("none");
      setIsDisputeInProgress(false);
      setEscrowActionError(
        error instanceof Error ? error.message : String(error)
      );
    }
  };

  // Lets a seller who shipped but got no buyer response (no "Confirm
  // Receipt", no dispute) after the grace period pull the arbiter in
  // themselves, so a silent buyer can't just wait out the locktime and
  // reclaim via refundKeys while also keeping the item. Reuses the same
  // kind 30009 dispute-event + escrow-dispute DM path buyer-opened disputes
  // use, so it lands on the arbiter's existing /disputes queue and goes
  // through the same authorship cross-checks in /api/arbiter/rule.
  const handleSellerEscalate = async () => {
    if (
      !isSellerView ||
      !canEscalate ||
      !orderId ||
      !buyerPubkey ||
      !signer ||
      !userPubkey
    )
      return;
    setEscrowActionError(null);
    try {
      setDisputeStatus("open");
      setIsDisputeInProgress(true);

      const reason =
        "Seller escalation: buyer unresponsive after payment request.";
      const buyerPayload: EscrowDisputePayload = {
        type: "escrow-dispute",
        orderId,
        reason,
      };

      const arbiterPubkey = process.env.NEXT_PUBLIC_ARBITER_NOSTR_PUBKEY;
      const publishTasks: Promise<unknown>[] = [
        sendEscrowDm(buyerPubkey, buyerPayload),
      ];
      if (arbiterPubkey) {
        const arbiterPayload: EscrowDisputePayload = {
          type: "escrow-dispute",
          orderId,
          reason,
          token,
          amount: tokenAmount,
        };
        publishTasks.push(
          sendEscrowDm(arbiterPubkey, arbiterPayload),
          publishDisputeEvent({
            orderId,
            reason,
            nostr: nostr!,
            signer,
            buyerPubkey,
            sellerPubkey: userPubkey,
            arbiterPubkey,
          })
        );
      }

      const results = await Promise.allSettled(publishTasks);
      const firstFailure = results.find(
        (result): result is PromiseRejectedResult =>
          result.status === "rejected"
      );
      if (firstFailure) {
        console.warn(
          "Failed to publish seller escalation",
          firstFailure.reason
        );
      }

      localStorage.removeItem(paymentRequestSentAtKey(orderId));
    } catch (error) {
      setDisputeStatus("none");
      setIsDisputeInProgress(false);
      setEscrowActionError(
        error instanceof Error ? error.message : String(error)
      );
    }
  };

  const handleArbiterRedeem = async () => {
    if (!orderId || !nostr || !signer || !userPubkey) return;
    if (!cashuPrivkey) {
      setIsP2pkKeyMissing(true);
      return;
    }
    setEscrowActionError(null);
    setIsRedeeming(true);
    try {
      // Security rule 3: an EscrowArbiterSigPayload addressed to me is
      // itself the proof the arbiter resolved the dispute in my favor —
      // arbiter sigs are only ever sent to the winner.
      const arbiterSigPayload =
        await findIncomingEscrowPayload<EscrowArbiterSigPayload>(
          nostr,
          signer,
          userPubkey,
          orderId,
          "escrow-arbiter-sig"
        );
      if (!arbiterSigPayload) {
        setEscrowActionError("No arbiter resolution found yet.");
        setIsRedeeming(false);
        return;
      }
      const { proofs: ownProofs, partialSigs: ownSigs } =
        await createPartialRedemption(token, cashuPrivkey);
      const result = await combineAndRedeem({
        proofs: ownProofs,
        sig1: arbiterSigPayload.arbiterSigs,
        sig2: ownSigs,
        tokenMint,
        tokenAmount,
        nostr: nostr!,
        signer: signer!,
        mints,
        tokens,
        history,
      });
      if (result.success) {
        setDisputeStatus(isBuyerView ? "resolved:buyer" : "resolved:seller");
        setIsDisputeInProgress(false);
        setIsReceived(true);
      } else {
        setEscrowActionError(result.error ?? "Redemption failed.");
      }
    } catch (error) {
      setEscrowActionError(
        error instanceof Error ? error.message : String(error)
      );
    } finally {
      setIsRedeeming(false);
    }
  };

  const buttonClassName = useMemo(() => {
    const disabledStyle =
      "min-w-fit from-gray-300 to-gray-400 cursor-not-allowed";
    const enabledStyle = SHOPSTRBUTTONCLASSNAMES;
    const className = isRedeemed ? disabledStyle : enabledStyle;
    return className;
  }, [isRedeemed]);

  return (
    <div>
      {p2pk && (
        <span
          data-testid="p2pk-detected"
          aria-hidden="true"
          style={{ display: "none" }}
        />
      )}
      {!isMultisigEscrow && (
        <>
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
                {theme === "dark" ? (
                  <Spinner size={"sm"} color="warning" />
                ) : (
                  <Spinner size={"sm"} color="secondary" />
                )}
              </>
            ) : isInvalidToken ? (
              <>Invalid Token</>
            ) : isRedeemed ? (
              <>Claimed: {formattedTokenAmount}</>
            ) : (
              <>Claim: {formattedTokenAmount}</>
            )}
          </Button>
          {isRefundEligible && (
            <Button
              className={
                isRefunded
                  ? "mt-2 min-w-fit cursor-not-allowed bg-gray-400 text-gray-600 opacity-60"
                  : SHOPSTRBUTTONCLASSNAMES + " mt-2 min-w-fit"
              }
              onClick={handleRefundClick}
              isDisabled={isRefunded || isRedeeming}
            >
              {isRedeeming ? (
                <>
                  {theme === "dark" ? (
                    <Spinner size={"sm"} color="warning" />
                  ) : (
                    <Spinner size={"sm"} color="secondary" />
                  )}
                </>
              ) : isRefunded ? (
                <>Refunded: {formattedTokenAmount}</>
              ) : (
                <>Refund: {formattedTokenAmount}</>
              )}
            </Button>
          )}
        </>
      )}
      {isMultisigEscrow && (
        <div className="mt-2 flex flex-col gap-2">
          {arbiterResolutionAvailable &&
          disputeStatus === "resolved:buyer" &&
          isBuyerView ? (
            <Button
              className={SHOPSTRBUTTONCLASSNAMES + " min-w-fit"}
              onClick={handleArbiterRedeem}
              isDisabled={isRedeeming}
            >
              {isRedeeming ? <Spinner size="sm" /> : <>Claim Refund</>}
            </Button>
          ) : arbiterResolutionAvailable &&
            disputeStatus === "resolved:seller" &&
            isSellerView ? (
            <Button
              className={SHOPSTRBUTTONCLASSNAMES + " min-w-fit"}
              onClick={handleArbiterRedeem}
              isDisabled={isRedeeming}
            >
              {isRedeeming ? <Spinner size="sm" /> : <>Claim Payment</>}
            </Button>
          ) : isDisputeInProgress ? (
            <Button
              className="min-w-fit cursor-not-allowed bg-gray-400 text-gray-600 opacity-60"
              isDisabled
            >
              Dispute in Progress
            </Button>
          ) : isSellerView && disputeStatus === "none" ? (
            isAwaitingBuyerConfirm ? (
              <div className="flex flex-wrap gap-2">
                <Button
                  className="min-w-fit cursor-not-allowed bg-gray-400 text-gray-600 opacity-60"
                  isDisabled
                >
                  Waiting for Buyer...
                </Button>
                <Button
                  className={SHOPSTRBUTTONCLASSNAMES + " min-w-fit"}
                  onClick={handleSellerRedeemWithBuyerSig}
                  isDisabled={isRedeeming}
                >
                  {isRedeeming ? (
                    <Spinner size="sm" />
                  ) : (
                    <>Check for Confirmation</>
                  )}
                </Button>
                {canEscalate ? (
                  <Button
                    className={SHOPSTRBUTTONCLASSNAMES + " min-w-fit"}
                    onClick={handleSellerEscalate}
                  >
                    Escalate to Arbiter
                  </Button>
                ) : null}
              </div>
            ) : (
              <div className="flex flex-wrap gap-2">
                <Button
                  className={SHOPSTRBUTTONCLASSNAMES + " min-w-fit"}
                  onClick={handleSellerRequestPayment}
                >
                  Request Payment
                </Button>
                <Button
                  className={SHOPSTRBUTTONCLASSNAMES + " min-w-fit"}
                  onClick={handleSellerRedeemWithBuyerSig}
                  isDisabled={isRedeeming}
                >
                  {isRedeeming ? (
                    <Spinner size="sm" />
                  ) : (
                    <>Check for Confirmation</>
                  )}
                </Button>
              </div>
            )
          ) : isBuyerView && disputeStatus === "none" ? (
            <div className="flex flex-wrap gap-2">
              <Button
                className={SHOPSTRBUTTONCLASSNAMES + " min-w-fit"}
                onClick={handleBuyerConfirmReceipt}
              >
                Confirm Receipt
              </Button>
              <Button
                className={SHOPSTRBUTTONCLASSNAMES + " min-w-fit"}
                onClick={() => handleOpenDispute("Buyer-initiated dispute")}
              >
                Open Dispute
              </Button>
            </div>
          ) : null}
        </div>
      )}
      {escrowActionError ? (
        <Modal
          backdrop="blur"
          isOpen={!!escrowActionError}
          onClose={() => setEscrowActionError(null)}
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
              <div className="ml-2">Escrow action failed</div>
            </ModalHeader>
            <ModalBody className="text-light-text dark:text-dark-text flex flex-col overflow-hidden">
              <div className="flex items-center justify-center">
                {escrowActionError}
              </div>
            </ModalBody>
          </ModalContent>
        </Modal>
      ) : null}
      <Modal
        backdrop="blur"
        isOpen={openClaimTypeModal}
        onClose={() => setOpenClaimTypeModal(false)}
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
          <ModalBody className="text-light-text dark:text-dark-text flex flex-col overflow-hidden">
            <div className="flex items-center justify-center">
              Would you like to claim the token directly to your Shopstr wallet,
              or to your Lightning address?
            </div>
            <div className="flex w-full flex-wrap justify-evenly gap-2">
              <Button
                className={SHOPSTRBUTTONCLASSNAMES + " mt-2 w-[20%]"}
                onClick={() => handleClaimType("receive")}
                startContent={
                  <ArrowDownTrayIcon className="h-6 w-6 hover:text-yellow-500" />
                }
              >
                Receive
              </Button>
              <Button
                className={SHOPSTRBUTTONCLASSNAMES + " mt-2 w-[20%]"}
                onClick={() => handleClaimType("redeem")}
                startContent={
                  <BoltIcon className="h-6 w-6 hover:text-yellow-500" />
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
                <div className="ml-2">No valid Lightning address found!</div>
              </ModalHeader>
              <ModalBody className="text-light-text dark:text-dark-text flex flex-col overflow-hidden">
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
                <div className="ml-2">Token successfully claimed!</div>
              </ModalHeader>
              <ModalBody className="text-light-text dark:text-dark-text flex flex-col overflow-hidden">
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
                <div className="ml-2">Duplicate token!</div>
              </ModalHeader>
              <ModalBody className="text-light-text dark:text-dark-text flex flex-col overflow-hidden">
                <div className="flex items-center justify-center">
                  The token you are trying to claim is already in your Shopstr
                  wallet.
                </div>
              </ModalBody>
            </ModalContent>
          </Modal>
        </>
      ) : null}
      {isP2pkKeyMissing ? (
        <Modal
          backdrop="blur"
          isOpen={isP2pkKeyMissing}
          onClose={() => setIsP2pkKeyMissing(false)}
          classNames={{
            body: "py-6",
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
              <div className="ml-2">Wallet not ready</div>
            </ModalHeader>
            <ModalBody className="text-light-text dark:text-dark-text flex flex-col overflow-hidden">
              <div className="flex items-center justify-center">
                Unable to claim escrow token: Cashu wallet identity not yet
                available. Please wait for your wallet to finish loading and try
                again.
              </div>
            </ModalBody>
          </ModalContent>
        </Modal>
      ) : null}
      {isSpent ? (
        <>
          <Modal
            backdrop="blur"
            isOpen={isSpent}
            onClose={() => setIsSpent(false)}
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
                <div className="ml-2">Spent token!</div>
              </ModalHeader>
              <ModalBody className="text-light-text dark:text-dark-text flex flex-col overflow-hidden">
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
                <div className="ml-2">Token successfully redeemed!</div>
              </ModalHeader>
              <ModalBody className="text-light-text dark:text-dark-text flex flex-col overflow-hidden">
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
                <div className="ml-2">Token redemption failed!</div>
              </ModalHeader>
              <ModalBody className="text-light-text dark:text-dark-text flex flex-col overflow-hidden">
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
      {isRefunded ? (
        <Modal
          backdrop="blur"
          isOpen={isRefunded}
          onClose={() => setIsRefunded(false)}
          classNames={{
            body: "py-6",
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
              <div className="ml-2">Refund successful!</div>
            </ModalHeader>
            <ModalBody className="text-light-text dark:text-dark-text flex flex-col overflow-hidden">
              <div className="flex items-center justify-center">
                Your funds have been returned to your Shopstr wallet.
              </div>
            </ModalBody>
          </ModalContent>
        </Modal>
      ) : null}
    </div>
  );
}
