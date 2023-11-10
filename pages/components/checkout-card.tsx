//TODO: perhaps see if we can abstract away some payment logic into reusable functions
import React, { useContext, useState, useEffect } from "react";
import { ProfileMapContext } from "../context";
import { useRouter } from "next/router";
import {
  Card,
  CardHeader,
  CardBody,
  CardFooter,
  Divider,
  Image,
} from "@nextui-org/react";
import { SimplePool } from "nostr-tools";
import axios from "axios";
import { CheckIcon, ClipboardIcon } from "@heroicons/react/24/outline";
import { CashuMint, CashuWallet, getEncodedToken } from "@cashu/cashu-ts";
import { getLocalStorageData } from "./utility/nostr-helper-functions";
import { nip19 } from "nostr-tools";
import { ProductData } from "./utility/product-parser-functions";
import { DisplayCostBreakdown } from "./utility-components/display-monetary-info";

export default function CheckoutCard({
  productData,
}: {
  productData: ProductData;
}) {
  const router = useRouter();
  const { pubkey, currency, totalCost } = productData;
  const pubkeyOfProductBeingSold = pubkey;
  const { decryptedNpub, relays } = getLocalStorageData();

  const [paymentConfirmed, setPaymentConfirmed] = useState(false);
  const [qrCodeUrl, setQrCodeUrl] = useState<string | null>(null);
  const [invoice, setInvoice] = useState("");
  const [copiedToClipboard, setCopiedToClipboard] = useState(false);

  const [name, setName] = useState("");
  const profileContext = useContext(ProfileMapContext);

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
    if (randomNsec !== "") {
      handlePayment(totalCost, currency);
    }
  }, [randomNsec]);

  useEffect(() => {
    const profileMap = profileContext.profileData;
    const profile = profileMap.has(decryptedNpub)
      ? profileMap.get(decryptedNpub)
      : undefined;
    setName(
      profile && profile.content.name
        ? profile.content.name
        : nip19.npubEncode(decryptedNpub),
    );
  }, [profileContext]);

  const handlePayment = async (newPrice: number, currency: string) => {
    const wallet = new CashuWallet(
      new CashuMint(
        "https://legend.lnbits.com/cashu/api/v1/4gr9Xcmz3XEkUNwiBiQGoC",
      ),
    );
    if (currency === "USD") {
      try {
        const res = await axios.get(
          "https://api.coinbase.com/v2/prices/BTC-USD/spot",
        );
        const btcSpotPrice = Number(res.data.data.amount);
        const numSats = (newPrice / btcSpotPrice) * 100000000;
        newPrice = Math.round(numSats);
      } catch (err) {
        console.error("ERROR", err);
      }
    }

    const { pr, hash } = await wallet.requestMint(newPrice);

    setInvoice(pr);

    const QRCode = require("qrcode");

    QRCode.toDataURL(pr)
      .then((url) => {
        setQrCodeUrl(url);
      })
      .catch((err) => {
        console.error("ERROR", err);
      });

    invoiceHasBeenPaid(wallet, newPrice, hash);
  };

  /** CHECKS WHETHER INVOICE HAS BEEN PAID */
  async function invoiceHasBeenPaid(
    wallet: object,
    newPrice: number,
    hash: string,
  ) {
    let encoded;

    while (true) {
      try {
        const { proofs } = await wallet.requestTokens(newPrice, hash);

        // Encoded proofs can be spent at the mint
        encoded = getEncodedToken({
          token: [
            {
              mint: "https://legend.lnbits.com/cashu/api/v1/4gr9Xcmz3XEkUNwiBiQGoC",
              proofs,
            },
          ],
        });

        if (encoded) {
          sendTokens(encoded);
          setPaymentConfirmed(true);
          setQrCodeUrl(null);
          setTimeout(() => {
            router.push("/"); // takes you back to the home page after payment has been confirmed by cashu mint api
          }, 1900); // 1.9 seconds is the amount of time for the checkmark animation to play
          break;
        }
      } catch (error) {
        console.error(error);

        await new Promise((resolve) => setTimeout(resolve, 2000));
      }
    }
  }

  const sendTokens = async (token: string) => {
    const { title } = productData;
    const decryptedRandomNpub = nip19.decode(randomNpub);
    const decryptedRandomNsec = nip19.decode(randomNsec);
    const paymentMessage =
      "This is a Cashu token payment from " +
      name +
      " for your " +
      title +
      " listing on Shopstr: " +
      token;
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
        tags: [["p", pubkeyOfProductBeingSold]],
        content: paymentMessage,
        relays: relays,
      },
    });
  };

  const handleCopyInvoice = () => {
    navigator.clipboard.writeText(invoice);
    setCopiedToClipboard(true);
    // after 2 seconds, set copiedToClipboard back to false
    setTimeout(() => {
      setCopiedToClipboard(false);
    }, 2000);
  };

  return (
    <>
      <Card className="max-w-[700px]">
        <CardHeader className="flex gap-3 justify-center">
          <span className="font-bold text-xl">Pay with Lightning</span>
        </CardHeader>
        <Divider />
        <CardBody className="flex flex-col items-center">
          <DisplayCostBreakdown monetaryInfo={productData} />
        </CardBody>
        <CardFooter className="flex flex-col items-center">
          {!paymentConfirmed ? (
            <div className="flex flex-col items-center justify-center">
              {qrCodeUrl ? (
                <>
                  <Image
                    alt="Lightning invoice"
                    className="object-cover"
                    src={qrCodeUrl}
                  />
                  <div className="flex items-center justify-center">
                    <p className="text-center">
                      {invoice.length > 30
                        ? `${invoice.substring(0, 10)}...${invoice.substring(
                            invoice.length - 10,
                            invoice.length,
                          )}`
                        : invoice}
                    </p>
                    <ClipboardIcon
                      onClick={handleCopyInvoice}
                      className={`w-4 h-4 cursor-pointer ml-2 ${
                        copiedToClipboard ? "hidden" : ""
                      }`}
                    />
                    <CheckIcon
                      className={`w-4 h-4 cursor-pointer ml-2 ${
                        copiedToClipboard ? "" : "hidden"
                      }`}
                    />
                  </div>
                </>
              ) : (
                <div>
                  <p>Waiting for lightning invoice...</p>
                </div>
              )}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center">
              <h3 className="text-center text-lg leading-6 font-medium text-gray-900 mt-3">
                Payment confirmed!
              </h3>
              <Image
                alt="Payment Confirmed"
                className="object-cover"
                src="../payment-confirmed.gif"
                width={350}
              />
            </div>
          )}
        </CardFooter>
      </Card>
    </>
  );
}
