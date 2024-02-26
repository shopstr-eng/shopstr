import { useState, useEffect, useContext, useMemo } from "react";
import Link from "next/link";
import axios from "axios";
import { Button, Spinner, Tooltip } from "@nextui-org/react";
import { useTheme } from "next-themes";
import { ProfileMapContext } from "../../utils/context/context";
import { getLocalStorageData } from "../utility/nostr-helper-functions";
import { SHOPSTRBUTTONCLASSNAMES } from "../utility/STATIC-VARIABLES";
import { nip19 } from "nostr-tools";
import { LightningAddress } from "@getalby/lightning-tools";
import {
  CashuMint,
  CashuWallet,
  checkProofsSpent,
  payLnInvoiceWithToken,
  getEncodedToken,
} from "@cashu/cashu-ts";
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

export default function RedeemButton({ token }: { token: string }) {
  const [lnurl, setLnurl] = useState("");
  const profileContext = useContext(ProfileMapContext);
  const { npub, decryptedNpub, mints, relays } = getLocalStorageData();

  const [openRedemptionModal, setOpenRedemptionModal] = useState(false);
  const [isPaid, setIsPaid] = useState(false);
  const [isCashu, setIsCashu] = useState(false);
  const [isSpent, setIsSpent] = useState(false);
  const [isRedeeming, setIsRedeeming] = useState(false);
  const [proofs, setProofs] = useState([]);
  const [tokenAmount, setTokenAmount] = useState();
  const [formattedTokenAmount, setFormattedTokenAmount] = useState();

  const [name, setName] = useState("");

  const { theme, setTheme } = useTheme();

  const [randomNpub, setRandomNpub] = useState<string>("");
  const [randomNsec, setRandomNsec] = useState<string>("");

  const wallet = new CashuWallet(new CashuMint(mints[0]));

  useEffect(() => {
    axios({
      method: "GET",
      url: "/api/nostr/generate-keys",
    })
      .then((response) => {
        setRandomNpub(response.data.npub);
        setRandomNsec(response.data.nsec);
      })
      .catch((error) => {
        console.error(error);
      });
  }, []);

  useEffect(() => {
    const decodedToken = decodeBase64ToJson(token);
    const proofs = decodedToken.token[0].proofs;
    setProofs(proofs);
    const totalAmount =
      Array.isArray(proofs) && proofs.length > 0
        ? proofs.reduce((acc, current) => acc + current.amount, 0)
        : 0;

    setTokenAmount(totalAmount);
    setFormattedTokenAmount(formatWithCommas(totalAmount, "sats"));
  }, [token]);

  useEffect(() => {
    setIsSpent(false);
    const checkProofsSpent = async () => {
      if (proofs.length > 0) {
        const spentProofs = await wallet.checkProofsSpent(proofs);
        if (spentProofs.length > 0) setIsSpent(true);
      }
    };
    checkProofsSpent();
  }, [proofs]);

  useEffect(() => {
    const sellerProfileMap = profileContext.profileData;
    const sellerProfile = sellerProfileMap.has(decryptedNpub)
      ? sellerProfileMap.get(decryptedNpub)
      : undefined;
    setLnurl(
      sellerProfile && sellerProfile.content.lud16
        ? sellerProfile.content.lud16
        : npub + "@npub.cash",
    );
    setName(
      sellerProfile && sellerProfile.content.name
        ? sellerProfile.content.name
        : npub,
    );
  }, [profileContext]);

  const redeem = async () => {
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
      const response = await wallet.payLnInvoice(invoicePaymentRequest, proofs);
      const changeProofs = response.change;
      const changeAmount =
        Array.isArray(changeProofs) && changeProofs.length > 0
          ? changeProofs.reduce((acc, current) => acc + current.amount, 0)
          : 0;
      if (changeAmount >= 1) {
        const decryptedRandomNpub = nip19.decode(randomNpub);
        const decryptedRandomNsec = nip19.decode(randomNsec);
        let encodedChange = getEncodedToken({
          token: [
            {
              mint: mints[0],
              proofs: changeAmount,
            },
          ],
        });
        const paymentMessage =
          "Overpaid change from " + name + ": " + encodedChange;
        axios({
          method: "POST",
          url: "/api/nostr/post-event",
          headers: {
            "Content-Type": "application/json",
          },
          data: {
            pubkey: decryptedRandomNpub.data,
            privkey: decryptedRandomNsec.data,
            created_at: Math.floor(Date.now() / 1000),
            kind: 4,
            tags: [
              [
                "p",
                "a37118a4888e02d28e8767c08caaf73b49abdac391ad7ff18a304891e416dc33",
              ],
            ],
            content: paymentMessage,
            relays: relays,
          },
        });
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
      <Tooltip
        showArrow={true}
        content={
          <div className="flex items-center justify-center px-1 py-2">
            <div className="max-w-sm text-tiny text-light-text dark:text-dark-text">
              You can either redeem your tokens here, or by pasting the token
              string (cashuA...) and mint URL (found in settings) into a Cashu
              wallet of your choice (like{" "}
              <Link href="https://wallet.nutstash.app/" passHref legacyBehavior>
                <a
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline"
                >
                  Nutstash
                </a>
              </Link>
              ). Overpaid Lightning fees (~1%) will be donated to Shopstr to support
              development.
            </div>
          </div>
        }
      >
        <Button
          className={buttonClassName + " mt-2 w-[20%]"}
          onClick={redeem}
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
            <>Redeemed: {tokenAmount} sats</>
          ) : (
            <>Redeem: {tokenAmount} sats</>
          )}
        </Button>
      </Tooltip>
      <RedemptionModal
        isPaid={isPaid}
        isCashu={isCashu}
        opened={openRedemptionModal}
      />
    </div>
  );
}
