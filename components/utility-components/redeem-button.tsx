import { useState, useEffect, useContext } from "react";
import axios from "axios";
import { Button } from "@nextui-org/react";
import { ProfileMapContext } from "../../utils/context/context";
import { getLocalStorageData } from "../utility/nostr-helper-functions";
import { SHOPSTRBUTTONCLASSNAMES } from "../utility/STATIC-VARIABLES";
import { nip19 } from "nostr-tools";
import { LightningAddress } from "@getalby/lightning-tools";
import { CashuMint, CashuWallet, payLnInvoiceWithToken, getEncodedToken } from "@cashu/cashu-ts";
import RedemptionModal from "./redemption-modal";

export default function RedeemButton({ token }: { token: string }) {
  const [lnurl, setLnurl] = useState("");
  const profileContext = useContext(ProfileMapContext);
  const { npub, decryptedNpub, mints, relays } = getLocalStorageData();

  const [openRedemptionModal, setOpenRedemptionModal] = useState(false);
  const [isPaid, setIsPaid] = useState(false);
  const [isCashu, setIsCashu] = useState(false);

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

  const redeem = async () => {
    const decodedToken = decodeBase64ToJson(token);
    const proofs = decodedToken.token[0].proofs;
    const totalAmount = proofs.reduce(
      (acc, current) => acc + current.amount,
      0,
    );
    const wallet = new CashuWallet(new CashuMint(mints[0]));
    const newAmount = Math.floor(totalAmount * 0.98 - 2);
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
      if (changeProofs[0].amount >= 1) {
        const decryptedRandomNpub = nip19.decode(randomNpub);
        const decryptedRandomNsec = nip19.decode(randomNsec);
        let encodedChange = getEncodedToken({
          token: [
            {
              mint: mints[0],
              proofs: changeProofs,
            },
          ],
        });
        const paymentMessage =
          "This is the change from your token redemption on Shopstr: " + encodedChange;
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
    } catch (error) {
      console.log(error);
      setIsPaid(false);
      setIsCashu(false);
      setOpenRedemptionModal(true);
    }
  };

  // default to npub.cash lnurl if none exists, and alert user to go to the site to redeem

  return (
    <div>
      <Button className={SHOPSTRBUTTONCLASSNAMES + " w-[20%]"} onClick={redeem}>
        Redeem Token
      </Button>
      <RedemptionModal isPaid={isPaid} isCashu={isCashu} opened={openRedemptionModal} />
    </div>
  );
}
