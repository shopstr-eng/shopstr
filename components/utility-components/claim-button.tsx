import { useState, useEffect, useContext, useMemo } from "react";
import Link from "next/link";
import {
  Modal,
  ModalContent,
  ModalBody,
  Button,
  Spinner,
} from "@nextui-org/react";
import { ArrowDownTrayIcon, BoltIcon } from "@heroicons/react/24/outline";
import { useTheme } from "next-themes";
import { ProfileMapContext } from "../../utils/context/context";
import { getLocalStorageData } from "../utility/nostr-helper-functions";
import { SHOPSTRBUTTONCLASSNAMES } from "../utility/STATIC-VARIABLES";
import { LightningAddress } from "@getalby/lightning-tools";
import { CashuMint, CashuWallet, Proof } from "@cashu/cashu-ts";
import RedemptionModal from "./redemption-modal";
import { formatWithCommas } from "./display-monetary-info";

function decodeBase64ToJson(base64: string): any {
  // Step 1: Decode the base64 string to a regular string
  const decodedString = atob(base64);
  // Step 2: Parse the decoded string as JSON
  try {
    const json = JSON.parse(decodedString);
    return json;
  } catch (error) {
    console.error("Error parsing JSON from base64", error);
    throw new Error("Invalid JSON format in base64 string.");
  }
}

export default function ClaimButton({ token }: { token: string }) {
  const [lnurl, setLnurl] = useState("");
  const profileContext = useContext(ProfileMapContext);
  const { userNPub, userPubkey, relays } = getLocalStorageData();

  const [openClaimTypeModal, setOpenCLaimTypeModal] = useState(false);
  const [openRedemptionModal, setOpenRedemptionModal] = useState(false);
  const [isPaid, setIsPaid] = useState(false);
  const [isCashu, setIsCashu] = useState(false);
  const [isSpent, setIsSpent] = useState(false);
  const [isRedeeming, setIsRedeeming] = useState(false);
  const [wallet, setWallet] = useState<CashuWallet>();
  const [proofs, setProofs] = useState([]);
  const [tokenMint, setTokenMint] = useState("");
  const [tokenAmount, setTokenAmount] = useState(0);
  const [formattedTokenAmount, setFormattedTokenAmount] = useState("");
  const [claimChangeAmount, setClaimChangeAmount] = useState(0);
  const [claimChangeProofs, setClaimChangeProofs] = useState<Proof[]>([]);

  const [showReceiveModal, setShowReceiveModal] = useState(false);
  const [isReceived, setIsReceived] = useState(false);
  const [isSpent, setIsSpent] = useState(false);
  const [isInvalidToken, setIsInvalidToken] = useState(false);

  const { mints, tokens, history } = getLocalStorageData();

  const [name, setName] = useState("");

  const { theme, setTheme } = useTheme();

  useEffect(() => {
    const decodedToken = decodeBase64ToJson(token);
    const mint = decodedToken.token[0].mint;
    setTokenMint(mint);
    const proofs = decodedToken.token[0].proofs;
    setProofs(proofs);
    const newWallet = new CashuWallet(new CashuMint(mint));
    setWallet(newWallet);
    const totalAmount =
      Array.isArray(proofs) && proofs.length > 0
        ? proofs.reduce((acc, current: Proof) => acc + current.amount, 0)
        : 0;

    setTokenAmount(totalAmount);
    setFormattedTokenAmount(formatWithCommas(totalAmount, "sats"));
  }, [token]);

  useEffect(() => {
    setIsSpent(false);
    const checkProofsSpent = async () => {
      if (proofs.length > 0) {
        const spentProofs = await wallet?.checkProofsSpent(proofs);
        if (spentProofs && spentProofs.length > 0) setIsSpent(true);
      }
    };
    checkProofsSpent();
  }, [proofs, wallet]);

  useEffect(() => {
    const sellerProfileMap = profileContext.profileData;
    const sellerProfile = sellerProfileMap.has(userPubkey)
      ? sellerProfileMap.get(userPubkey)
      : undefined;
    setLnurl(
      sellerProfile &&
        sellerProfile.content.lud16 &&
        tokenMint !==
          "https://legend.lnbits.com/cashu/api/v1/AptDNABNBXv8gpuywhx6NV"
        ? sellerProfile.content.lud16
        : userNPub + "@npub.cash",
    );
    setName(
      sellerProfile && sellerProfile.content.name
        ? sellerProfile.content.name
        : userNPub,
    );
  }, [profileContext, tokenMint]);

  const handleClaimType = (type: string) => {
    if (type === "receive") {
      receive();
    } else if (type === "redeem") {
      redeem();
    }
  };

  const receive = async () => {
    setOpenClaimTypeModal(false);
    setIsReceived(false);
    setIsSpent(false);
    setIsInvalidToken(false);
    setIsRedeeming(true);
    try {
      const wallet = new CashuWallet(new CashuMint(tokenMint));
      const spentProofs = await wallet?.checkProofsSpent(proofs);
      if (spentProofs.length === 0) {
        const tokenArray = [...tokens, ...proofs];
        localStorage.setItem("tokens", JSON.stringify(tokenArray));
        if (!mints.includes(tokenMint)) {
          const updatedMints = [...mints, tokenMint];
          localStorage.setItem("mints", JSON.stringify(updatedMints));
        }
        setIsReceived(true);
        setIsRedeeming(false);
        setShowReceiveModal(!showReceiveModal);
        localStorage.setItem(
          "history",
          JSON.stringify([
            {
              type: 1,
              amount: tokenAmount,
              date: Math.floor(Date.now() / 1000),
            },
            ...history,
          ]),
        );
      } else {
        setIsSpent(true);
      }
    } catch (error) {
      console.log(error);
      setIsInvalidToken(true);
    }
  };

  const redeem = async () => {
    setOpenClaimTypeModal(false);
    setOpenRedemptionModal(false);
    setIsRedeeming(true);
    const newAmount = Math.floor(tokenAmount * 0.98 - 2);
    const ln = new LightningAddress(lnurl);
    if (lnurl.includes("@npub.cash")) {
      setIsCashu(true);
    }
    try {
      await ln.fetch();
      const invoice = await ln.requestInvoice({ satoshi: newAmount });
      const invoicePaymentRequest = invoice.paymentRequest;
      const response = await wallet?.payLnInvoice(
        invoicePaymentRequest,
        proofs,
      );
      const changeProofs = response?.change;
      const changeAmount =
        Array.isArray(changeProofs) && changeProofs.length > 0
          ? changeProofs.reduce(
              (acc, current: Proof) => acc + current.amount,
              0,
            )
          : 0;
      if (changeAmount >= 1 && changeProofs) {
        setClaimChangeAmount(changeAmount);
        setClaimChangeProofs(changeProofs);
      }
      setIsPaid(true);
      setOpenRedemptionModal(true);
      setIsRedeeming(false);
    } catch (error) {
      console.log(error);
      setIsPaid(false);
      setIsCashu(false);
      setOpenRedemptionModal(true);
      setIsRedeeming(false);
    }
  };

  const buttonClassName = useMemo(() => {
    const disabledStyle =
      "min-w-fit from-gray-300 to-gray-400 cursor-not-allowed";
    const enabledStyle = SHOPSTRBUTTONCLASSNAMES;
    const className = isSpent ? disabledStyle : enabledStyle;
    return className;
  }, [isSpent]);

  return (
    <div>
      <Button
        className={buttonClassName + " mt-2 w-[20%]"}
        onClick={() => setOpenClaimTypeModal(true)}
        isDisabled={isSpent}
      >
        {isRedeeming ? (
          <>
            {theme === "dark" ? (
              <Spinner size={"sm"} color="warning" />
            ) : (
              <Spinner size={"sm"} color="secondary" />
            )}
          </>
        ) : isSpent ? (
          <>Claimed: {tokenAmount} sats</>
        ) : (
          <>Claim: {tokenAmount} sats</>
        )}
      </Button>
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
          <ModalBody className="flex flex-col overflow-hidden text-light-text dark:text-dark-text">
            <div className="flex items-center justify-center">
              Would you like to claim the token directly to your Shopstr wallet
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
              <ModalBody className="flex flex-col overflow-hidden text-light-text dark:text-dark-text">
                <div className="flex items-center justify-center">
                  <CheckCircleIcon className="h-6 w-6 text-green-500" />
                  <div className="ml-2">
                    Token successfully received! Check your Shopstr wallet for
                    your sats.
                  </div>
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
            onClose={() => setIsInvalidToken(false)}
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
              <ModalBody className="flex flex-col overflow-hidden text-light-text dark:text-dark-text">
                <div className="flex items-center justify-center">
                  <XCircleIcon className="h-6 w-6 text-red-500" />
                  <div className="ml-2">Invalid token!</div>
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
              <ModalBody className="flex flex-col overflow-hidden text-light-text dark:text-dark-text">
                <div className="flex items-center justify-center">
                  <XCircleIcon className="h-6 w-6 text-red-500" />
                  <div className="ml-2">Token already spent!</div>
                </div>
              </ModalBody>
            </ModalContent>
          </Modal>
        </>
      ) : null}
      <RedemptionModal
        isPaid={isPaid}
        isCashu={isCashu}
        opened={openRedemptionModal}
        changeAmount={claimChangeAmount}
        changeProofs={claimChangeProofs}
        lnurl={lnurl}
        changeMint={tokenMint}
      />
    </div>
  );
}