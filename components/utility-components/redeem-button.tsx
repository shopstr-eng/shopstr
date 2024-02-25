import { useState, useEffect, useContext } from "react";
import axios from "axios";
import { Button, Spinner } from "@nextui-org/react";
import { useTheme } from "next-themes";
import { ProfileMapContext } from "../../utils/context/context";
import { getLocalStorageData } from "../utility/nostr-helper-functions";
import { SHOPSTRBUTTONCLASSNAMES } from "../utility/STATIC-VARIABLES";
import { nip19 } from "nostr-tools";
import { LightningAddress } from "@getalby/lightning-tools";
import {
  CashuMint,
  CashuWallet,
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
  const [isRedeeming, setIsRedeeming] = useState(false);
  const [proofs, setProofs] = useState([]);
  const [tokenAmount, setTokenAmount] = useState();
  const [formattedTokenAmount, setFormattedTokenAmount] = useState();

  const { theme, setTheme } = useTheme();

  const [randomNpub, setRandomNpub] = useState<string>("");
  const [randomNsec, setRandomNsec] = useState<string>("");

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
    const sellerProfileMap = profileContext.profileData;
    const sellerProfile = sellerProfileMap.has(decryptedNpub)
      ? sellerProfileMap.get(decryptedNpub)
      : undefined;
    setLnurl(
      sellerProfile && sellerProfile.content.lud16
        ? sellerProfile.content.lud16
        : npub + "@npub.cash",
    );
  }, [profileContext]);

  const redeem = async () => {
    setOpenRedemptionModal(false);
    setIsRedeeming(true);
    const wallet = new CashuWallet(new CashuMint(mints[0]));
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
        Array.isArray(changeProofs) && cangeProofs.length > 0
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
          "This is the change from your token redemption on Shopstr: " +
          encodedChange;
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
            tags: [["p", decryptedNpub]],
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

  return (
    <div>
      <Button className={SHOPSTRBUTTONCLASSNAMES + " w-[20%]"} onClick={redeem}>
        {isRedeeming ? (
          <>
            {theme === "dark" ? (
              <Spinner size={"sm"} color="warning" />
            ) : (
              <Spinner size={"sm"} color="secondary" />
            )}
          </>
        ) : (
          <>Redeem: {tokenAmount} sats</>
        )}
      </Button>
      <RedemptionModal
        isPaid={isPaid}
        isCashu={isCashu}
        opened={openRedemptionModal}
      />
    </div>
  );
}
