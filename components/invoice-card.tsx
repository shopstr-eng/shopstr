//TODO: perhaps see if we can abstract away some payment logic into reusable functions
import React, { useContext, useState, useEffect } from "react";
import { ProfileMapContext } from "../utils/context/context";
import { useRouter } from "next/router";
import {
  Button,
  Card,
  CardHeader,
  CardBody,
  CardFooter,
  Divider,
  Image,
  useDisclosure,
} from "@nextui-org/react";
import axios from "axios";
import {
  BanknotesIcon,
  BoltIcon,
  CheckIcon,
  ClipboardIcon,
  EnvelopeIcon,
} from "@heroicons/react/24/outline";
import { fiat } from "@getalby/lightning-tools";
import {
  CashuMint,
  CashuWallet,
  getEncodedToken,
  Proof,
} from "@cashu/cashu-ts";
import {
  getLocalStorageData,
  isUserLoggedIn,
} from "./utility/nostr-helper-functions";
import { nip19 } from "nostr-tools";
import { ProductData } from "./utility/product-parser-functions";
import {
  DisplayCostBreakdown,
  formatWithCommas,
} from "./utility-components/display-monetary-info";
import { SHOPSTRBUTTONCLASSNAMES } from "./utility/STATIC-VARIABLES";
import {
  captureCashuPaidMetric,
  captureInvoicePaidmetric,
} from "./utility/metrics-helper-functions";
import SignInModal from "./sign-in/SignInModal";

export default function InvoiceCard({
  productData,
  setInvoiceIsPaid,
  setCashuPaymentSent,
  setCashuPaymentFailed,
}: {
  productData: ProductData;
  setInvoiceIsPaid?: (invoiceIsPaid: boolean) => void;
  setCashuPaymentSent?: (cashuPaymentSent: boolean) => void;
  setCashuPaymentFailed?: (cashuPaymentFailef: boolean) => void;
}) {
  const router = useRouter();
  const { pubkey, currency, totalCost } = productData;
  const pubkeyOfProductBeingSold = pubkey;
  const { userNPub, userPubkey, relays, mints, tokens, history } =
    getLocalStorageData();

  const [showInvoiceCard, setShowInvoiceCard] = useState(false);

  const [paymentConfirmed, setPaymentConfirmed] = useState(false);
  const [qrCodeUrl, setQrCodeUrl] = useState<string | null>(null);
  const [invoice, setInvoice] = useState("");
  const [copiedToClipboard, setCopiedToClipboard] = useState(false);

  const [name, setName] = useState("");
  const profileContext = useContext(ProfileMapContext);

  const [randomNpub, setRandomNpub] = useState<string>("");
  const [randomNsec, setRandomNsec] = useState<string>("");

  const { isOpen, onOpen, onClose } = useDisclosure();

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
    const profileMap = profileContext.profileData;
    const profile = profileMap.has(userPubkey)
      ? profileMap.get(userPubkey)
      : undefined;
    setName(profile && profile.content.name ? profile.content.name : userNPub);
  }, [profileContext]);

  const handleLightningPayment = async () => {
    let newPrice = totalCost;
    const wallet = new CashuWallet(new CashuMint(mints[0]));
    if (currency.toLowerCase() !== "sats" || currency.toLowerCase() !== "sat") {
      try {
        const currencyData = { amount: newPrice, currency: currency }
        const numSats = await fiat.getSatoshiValue(currencyData);
        newPrice = Math.round(numSats);
      } catch (err) {
        console.error("ERROR", err);
      }
    }

    if (newPrice < 1) {
      newPrice = 1;
    }

    const invoiceMinted = await axios.post("/api/cashu/request-mint", {
      mintUrl: mints[0],
      total: newPrice,
      currency,
    });

    const { id, pr, hash } = invoiceMinted.data;

    setInvoice(pr);

    const QRCode = require("qrcode");

    QRCode.toDataURL(pr)
      .then((url: string) => {
        setQrCodeUrl(url);
      })
      .catch((err: any) => {
        console.error("ERROR", err);
      });

    invoiceHasBeenPaid(wallet, newPrice, hash, id);
  };

  /** CHECKS WHETHER INVOICE HAS BEEN PAID */
  async function invoiceHasBeenPaid(
    wallet: CashuWallet,
    newPrice: number,
    hash: string,
    metricsInvoiceId: string,
  ) {
    let encoded;

    while (true) {
      try {
        const { proofs } = await wallet.requestTokens(newPrice, hash);

        // Encoded proofs can be spent at the mint
        encoded = getEncodedToken({
          token: [
            {
              mint: mints[0],
              proofs,
            },
          ],
        });

        if (encoded) {
          sendTokens(encoded);
          captureInvoicePaidmetric(metricsInvoiceId, productData);
          setPaymentConfirmed(true);
          setQrCodeUrl(null);
          if (setInvoiceIsPaid) {
            setInvoiceIsPaid(true);
          }
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

  const handleSendMessage = (pubkeyToOpenChatWith: string) => {
    let { signInMethod } = getLocalStorageData();
    if (!signInMethod) {
      onOpen();
      return;
    }
    router.push({
      pathname: "/messages",
      query: { pk: nip19.npubEncode(pubkeyToOpenChatWith) },
    });
  };

  const formattedTotalCost = formatWithCommas(totalCost, currency);

  const handleCashuPayment = async () => {
    try {
      let price = totalCost;
      const mint = new CashuMint(mints[0]);
      const wallet = new CashuWallet(mint);
      if (currency.toLowerCase() !== "sats" || currency.toLowerCase() !== "sat") {
        try {
          const currencyData = { amount: price, currency: currency }
          const numSats = await fiat.getSatoshiValue(currencyData);
          price = Math.round(numSats);
        } catch (err) {
          console.error("ERROR", err);
        }
      }
      if (price < 1) {
        price = 1;
      }
      const mintKeySetResponse = await mint.getKeySets();
      const mintKeySetIds = mintKeySetResponse?.keysets;
      const filteredProofs = tokens.filter(
        (p: Proof) => mintKeySetIds?.includes(p.id),
      );
      const tokenToSend = await wallet.send(price, filteredProofs);
      const encodedSendToken = getEncodedToken({
        token: [
          {
            mint: mints[0],
            proofs: tokenToSend.send,
          },
        ],
      });
      sendTokens(encodedSendToken)
        .then(() => {
          captureCashuPaidMetric(productData);
        })
        .catch(console.log);
      const changeProofs = tokenToSend?.returnChange;
      const remainingProofs = tokens.filter(
        (p: Proof) => !mintKeySetIds?.includes(p.id),
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
          { type: 5, amount: price, date: Math.floor(Date.now() / 1000) },
          ...history,
        ]),
      );
      if (setCashuPaymentSent) {
        setCashuPaymentSent(true);
      }
    } catch (error) {
      console.error(error);
      if (setCashuPaymentFailed) {
        setCashuPaymentFailed(true);
      }
    }
  };

  return (
    <>
      {!showInvoiceCard && (
        <>
          <Button
            type="submit"
            className={SHOPSTRBUTTONCLASSNAMES + " mt-3"}
            onClick={() => {
              handleSendMessage(pubkeyOfProductBeingSold);
            }}
            startContent={
              <EnvelopeIcon className="h-6 w-6 hover:text-yellow-500" />
            }
          >
            Message
          </Button>
          <Button
            type="submit"
            className={SHOPSTRBUTTONCLASSNAMES + " mt-3"}
            onClick={() => {
              let userLoggedIn = isUserLoggedIn();
              if (!userLoggedIn) {
                onOpen();
                return;
              }
              if (randomNsec !== "") {
                handleLightningPayment();
              }
              setShowInvoiceCard(true);
            }}
            startContent={
              <BoltIcon className="h-6 w-6 hover:text-yellow-500" />
            }
          >
            Pay with Lightning: {formattedTotalCost}
          </Button>
          <Button
            type="submit"
            className={SHOPSTRBUTTONCLASSNAMES + " mt-3"}
            onClick={() => {
              let userLoggedIn = isUserLoggedIn();
              if (!userLoggedIn) {
                onOpen();
                return;
              }
              if (randomNsec !== "") {
                handleCashuPayment();
              }
            }}
            startContent={
              <BanknotesIcon className="h-6 w-6 hover:text-yellow-500" />
            }
          >
            Pay with Cashu: {formattedTotalCost}
          </Button>
        </>
      )}
      {showInvoiceCard && (
        <Card className="mt-3 max-w-[700px]">
          <CardHeader className="flex justify-center gap-3">
            <span className="text-xl font-bold">Lightning Invoice</span>
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
                        className={`ml-2 h-4 w-4 cursor-pointer ${
                          copiedToClipboard ? "hidden" : ""
                        }`}
                      />
                      <CheckIcon
                        className={`ml-2 h-4 w-4 cursor-pointer ${
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
                <h3 className="mt-3 text-center text-lg font-medium leading-6 text-gray-900">
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
      )}
      <SignInModal isOpen={isOpen} onClose={onClose} />
    </>
  );
}
