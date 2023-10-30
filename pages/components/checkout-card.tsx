import React, {
  useMemo,
  useState,
  useRef,
  useEffect,
  useCallback,
} from "react";
import { withRouter, NextRouter, useRouter } from "next/router";
import {
  Card,
  CardHeader,
  CardBody,
  CardFooter,
  Divider,
  Link,
  Image,
  Button,
} from "@nextui-org/react";
import { SimplePool } from "nostr-tools";
import axios from "axios";
import RequestPassphraseModal from "./request-passphrase-modal";
import { set } from "react-hook-form";
import { ClipboardIcon } from "@heroicons/react/24/outline";

import requestMint from "../api/cashu/request-mint";
import { CashuMint, CashuWallet, getEncodedToken } from "@cashu/cashu-ts";
import * as CryptoJS from "crypto-js";
import {
  getLocalStorageData,
  getPrivKeyWithPassphrase,
  getPubKey,
} from "../nostr-helpers";
import { ProductData } from "./utility/product-parser-functions";
import { SHOPSTRBUTTONCLASSNAMES } from "./STATIC-VARIABLES";
import { DisplayCostBreakdown } from "./display-monetary-info";

export default function CheckoutCard({
  productData,
}: {
  productData: ProductData;
}) {
  const {
    pubkey,
    createdAt,
    title,
    summary,
    publishedAt,
    images,
    categories,
    location,
    price,
    currency,
    shippingType,
    shippingCost,
    totalCost,
  } = productData;
  const pubkeyOfProductBeingSold = pubkey;
  const router = useRouter();
  const { signIn, encryptedPrivateKey, decryptedNpub, relays } =
    getLocalStorageData();

  const [requestPassphrase, setRequestPassphrase] = useState(
    signIn === "extension" ? false : true
  ); // state that controls the request passphrase modal
  const [passphrase, setPassphrase] = useState("");

  const [paymentConfirmed, setPaymentConfirmed] = useState(false);
  const [qrCodeUrl, setQrCodeUrl] = useState<string | null>(null);
  const [invoice, setInvoice] = useState("");

  useEffect(() => {
    if (signIn === "extension") {
      handlePayment(totalCost, currency);
    }
  }, []);

  const startCheckoutProcess = () => {
    handlePayment(totalCost, currency); // Generates the QR code and starts the checkout process
  };

  const handlePayment = async (newPrice: number, currency: string) => {
    const wallet = new CashuWallet(
      new CashuMint(
        "https://legend.lnbits.com/cashu/api/v1/4gr9Xcmz3XEkUNwiBiQGoC"
      )
    );
    if (currency === "USD") {
      try {
        const res = await axios.get(
          "https://api.coinbase.com/v2/prices/BTC-USD/spot"
        );
        const btcSpotPrice = Number(res.data.data.amount);
        const numSats = (newPrice / btcSpotPrice) * 100000000;
        newPrice = Math.round(numSats);
      } catch (err) {
        console.log(err);
      }
    }

    const { pr, hash } = await wallet.requestMint(newPrice);

    setInvoice(pr);

    const QRCode = require("qrcode");

    console.log(pr);
    QRCode.toDataURL(pr)
      .then((url) => {
        console.log(url);
        setQrCodeUrl(url);
      })
      .catch((err) => {
        console.error("ERROR", err);
      });

    invoiceHasBeenPaid(wallet, newPrice, hash);
  };
  console.log("QR CODE URL: ", qrCodeUrl);
  /** CHECKS WHETHER INVOICE HAS BEEN PAID */
  async function invoiceHasBeenPaid(
    wallet: object,
    newPrice: number,
    hash: string
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
    if (signIn === "extension") {
      const event = {
        created_at: Math.floor(Date.now() / 1000),
        kind: 4,
        tags: [["p", pubkeyOfProductBeingSold]],
        content: await window.nostr.nip04.encrypt(
          pubkeyOfProductBeingSold,
          token
        ),
      };

      const signedEvent = await window.nostr.signEvent(event);

      const pool = new SimplePool();

      await pool.publish(relays, signedEvent);

      let events = await pool.list(relays, [{ kinds: [0, signedEvent.kind] }]); // TODO kind 0 contains profile information
      let postedEvent = await pool.get(relays, {
        ids: [signedEvent.id],
      });
    } else {
      axios({
        method: "POST",
        url: "/api/nostr/post-event",
        headers: {
          "Content-Type": "application/json",
        },
        data: {
          pubkey: decryptedNpub,
          privkey: getPrivKeyWithPassphrase(passphrase),
          created_at: Math.floor(Date.now() / 1000),
          kind: 4,
          tags: [["p", pubkeyOfProductBeingSold]],
          content: token,
          relays: relays,
        },
      });
    }
  };

  const handleCopyInvoice = () => {
    navigator.clipboard.writeText(invoice);
    // navigator.clipboard.writeText(invoiceString);
    alert("Invoice copied to clipboard!");
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
                            invoice.length
                          )}`
                        : invoice}
                    </p>
                    <ClipboardIcon
                      onClick={handleCopyInvoice}
                      className="w-4 h-4 cursor-pointer ml-2"
                    />
                  </div>
                </>
              ) : (
                // <div>
                //   <p>Password is required...</p>
                //   <Button
                //     onClick={() => setRequestPassphrase(true)}
                //     className={"w-full " + SHOPSTRBUTTONCLASSNAMES}
                //   >
                //     Enter Passphrase
                //   </Button>
                // </div>
                <div>
                  <p>Waiting for Cashu mint to create a lightning invoice...</p>
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
      <RequestPassphraseModal
        passphrase={passphrase}
        onPassphraseChange={setPassphrase}
        startCheckoutProcess={startCheckoutProcess}
        isOpen={requestPassphrase}
        setRequestPassphrase={setRequestPassphrase}
      />
    </>
  );
}
