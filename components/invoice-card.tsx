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
} from "@nextui-org/react";
import axios from "axios";
import {
  BoltIcon,
  CheckIcon,
  ClipboardIcon,
  EnvelopeIcon,
} from "@heroicons/react/24/outline";
import { CashuMint, CashuWallet, getEncodedToken } from "@cashu/cashu-ts";
import { getLocalStorageData } from "./utility/nostr-helper-functions";
import { nip19 } from "nostr-tools";
import { ProductData } from "./utility/product-parser-functions";
import {
  DisplayCostBreakdown,
  formatWithCommas,
} from "./utility-components/display-monetary-info";
import { SHOPSTRBUTTONCLASSNAMES } from "./utility/STATIC-VARIABLES";
import { captureInvoicePaidmetric } from "./utility/metrics-helper-functions";
import SignInModal from "./sign-in/SignInModal";

export default function InvoiceCard({
  productData,
}: {
  productData: ProductData;
}) {
  const router = useRouter();
  const { pubkey, currency, totalCost } = productData;
  const pubkeyOfProductBeingSold = pubkey;
  const { npub, decryptedNpub, relays, mints } = getLocalStorageData();

  const [showInvoiceCard, setShowInvoiceCard] = useState(false);

  const [paymentConfirmed, setPaymentConfirmed] = useState(false);
  const [qrCodeUrl, setQrCodeUrl] = useState<string | null>(null);
  const [invoice, setInvoice] = useState("");
  const [copiedToClipboard, setCopiedToClipboard] = useState(false);

  const [name, setName] = useState("");
  const profileContext = useContext(ProfileMapContext);

  const [randomNpub, setRandomNpub] = useState<string>("");
  const [randomNsec, setRandomNsec] = useState<string>("");

  const [openSignInModal, setOpenSignInModal] = useState(false);
  let [count, setCount] = useState(0);

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
    const profile = profileMap.has(decryptedNpub)
      ? profileMap.get(decryptedNpub)
      : undefined;
    setName(profile && profile.content.name ? profile.content.name : npub);
  }, [profileContext]);

  const handlePayment = async (newPrice: number, currency: string) => {
    const wallet = new CashuWallet(new CashuMint(mints[0]));
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
          captureInvoicePaidmetric(metricsInvoiceId, productData.id);
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

  const handleSendMessage = (pubkeyToOpenChatWith: string) => {
    let { signIn } = getLocalStorageData();
    if (!signIn) {
      setOpenSignInModal(true);
      setCount(++count);
      return;
    }
    router.push({
      pathname: "/messages",
      query: { pk: nip19.npubEncode(pubkeyToOpenChatWith) },
    });
  };

  const formattedTotalCost = formatWithCommas(totalCost, currency);

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
              let { signIn } = getLocalStorageData();
              if (!signIn) {
                alert("You must be signed in to purchase!");
                return;
              }
              if (randomNsec !== "") {
                handlePayment(totalCost, currency);
              }
              setShowInvoiceCard(true);
            }}
            startContent={
              <BoltIcon className="h-6 w-6 hover:text-yellow-500" />
            }
          >
            Purchase: {formattedTotalCost}
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
      <SignInModal some={count} opened={openSignInModal}></SignInModal>
    </>
  );
}
