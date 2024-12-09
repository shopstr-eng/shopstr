import React, { useContext, useState, useEffect } from "react";
import { CashuWalletContext } from "../utils/context/context";
import { useRouter } from "next/router";
import { useForm } from "react-hook-form";
import {
  Button,
  Card,
  CardHeader,
  CardBody,
  CardFooter,
  Divider,
  Image,
  useDisclosure,
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  Select,
  SelectItem,
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
  constructGiftWrappedMessageEvent,
  constructMessageSeal,
  constructMessageGiftWrap,
  sendGiftWrappedMessageEvent,
  getLocalStorageData,
  validPassphrase,
  isUserLoggedIn,
  publishWalletEvent,
  publishProofEvent,
  publishSpendingHistoryEvent,
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
import currencySelection from "../public/currencySelection.json";
import RequestPassphraseModal from "@/components/utility-components/request-passphrase-modal";
import ShippingForm from "./shipping-form";
import ContactForm from "./contact-form";

export default function ProductInvoiceCard({
  productData,
  setInvoiceIsPaid,
  setInvoiceGenerationFailed,
  setCashuPaymentSent,
  setCashuPaymentFailed,
  selectedSize,
}: {
  productData: ProductData;
  setInvoiceIsPaid?: (invoiceIsPaid: boolean) => void;
  setInvoiceGenerationFailed?: (invoiceGenerationFailed: boolean) => void;
  setCashuPaymentSent?: (cashuPaymentSent: boolean) => void;
  setCashuPaymentFailed?: (cashuPaymentFailed: boolean) => void;
  selectedSize?: string;
}) {
  const router = useRouter();
  const { id, pubkey, currency, totalCost, shippingType } = productData;
  const pubkeyOfProductBeingSold = pubkey;
  const { userNPub, userPubkey, signInMethod, mints, tokens, history } =
    getLocalStorageData();

  const [enterPassphrase, setEnterPassphrase] = useState(false);
  const [passphrase, setPassphrase] = useState("");

  const [showInvoiceCard, setShowInvoiceCard] = useState(false);

  const [paymentConfirmed, setPaymentConfirmed] = useState(false);
  const [qrCodeUrl, setQrCodeUrl] = useState<string | null>(null);
  const [invoice, setInvoice] = useState("");
  const [copiedToClipboard, setCopiedToClipboard] = useState(false);

  const walletContext = useContext(CashuWalletContext);
  const [dTag, setDTag] = useState("");

  const [randomNpubForSender, setRandomNpubForSender] = useState<string>("");
  const [randomNsecForSender, setRandomNsecForSender] = useState<string>("");
  const [randomNpubForReceiver, setRandomNpubForReceiver] =
    useState<string>("");
  const [randomNsecForReceiver, setRandomNsecForReceiver] =
    useState<string>("");

  const { isOpen, onOpen, onClose } = useDisclosure();

  const [showShippingModal, setShowShippingModal] = useState(false);
  const [showContactModal, setShowContactModal] = useState(false);
  const [showShippingOption, setShowShippingOption] = useState(false);
  const [isCashuPayment, setIsCashuPayment] = useState(false);

  const [showPurchaseTypeOption, setShowPurchaseTypeOption] = useState(false);
  const [needsShippingInfo, setNeedsShippingInfo] = useState(false);

  const {
    handleSubmit: handleShippingSubmit,
    control: shippingControl,
    reset: shippingReset,
  } = useForm();

  const {
    handleSubmit: handleContactSubmit,
    control: contactControl,
    reset: contactReset,
  } = useForm();

  useEffect(() => {
    if (signInMethod === "nsec" && !validPassphrase(passphrase)) {
      setEnterPassphrase(true);
    }
  }, [signInMethod, passphrase]);

  useEffect(() => {
    axios({
      method: "GET",
      url: "/api/nostr/generate-keys",
    })
      .then((response) => {
        setRandomNpubForSender(response.data.npub);
        setRandomNsecForSender(response.data.nsec);
      })
      .catch((error) => {
        console.error(error);
      });
    axios({
      method: "GET",
      url: "/api/nostr/generate-keys",
    })
      .then((response) => {
        setRandomNpubForReceiver(response.data.npub);
        setRandomNsecForReceiver(response.data.nsec);
      })
      .catch((error) => {
        console.error(error);
      });
  }, []);

  useEffect(() => {
    const walletEvent = walletContext.mostRecentWalletEvent;
    if (walletEvent?.tags) {
      const walletTag = walletEvent.tags.find(
        (tag: string[]) => tag[0] === "d",
      )?.[1];
      setDTag(walletTag);
    }
  }, [walletContext]);

  const sendPaymentAndContactMessage = async (
    pubkeyToReceiveMessage: string,
    message: string,
    isPayment?: boolean,
    isReceipt?: boolean,
  ) => {
    let decodedRandomPubkeyForSender = nip19.decode(randomNpubForSender);
    let decodedRandomPrivkeyForSender = nip19.decode(randomNsecForSender);
    let decodedRandomPubkeyForReceiver = nip19.decode(randomNpubForReceiver);
    let decodedRandomPrivkeyForReceiver = nip19.decode(randomNsecForReceiver);

    if (isReceipt) {
      let giftWrappedMessageEvent = await constructGiftWrappedMessageEvent(
        decodedRandomPubkeyForSender.data as string,
        userPubkey,
        message,
        "order-receipt",
        productData,
      );
      let sealedEvent = await constructMessageSeal(
        giftWrappedMessageEvent,
        decodedRandomPubkeyForSender.data as string,
        userPubkey,
        undefined,
        decodedRandomPrivkeyForSender.data as Uint8Array,
      );
      let giftWrappedEvent = await constructMessageGiftWrap(
        sealedEvent,
        decodedRandomPubkeyForReceiver.data as string,
        decodedRandomPrivkeyForReceiver.data as Uint8Array,
        userPubkey,
      );
      await sendGiftWrappedMessageEvent(giftWrappedEvent);
    } else {
      let giftWrappedMessageEvent;
      if (isPayment) {
        giftWrappedMessageEvent = await constructGiftWrappedMessageEvent(
          decodedRandomPubkeyForSender.data as string,
          pubkeyToReceiveMessage,
          message,
          "order-payment",
          productData,
        );
      } else {
        giftWrappedMessageEvent = await constructGiftWrappedMessageEvent(
          decodedRandomPubkeyForSender.data as string,
          pubkeyToReceiveMessage,
          message,
          "order-info",
          productData,
        );
      }
      let sealedEvent = await constructMessageSeal(
        giftWrappedMessageEvent,
        decodedRandomPubkeyForSender.data as string,
        pubkeyToReceiveMessage,
        undefined,
        decodedRandomPrivkeyForSender.data as Uint8Array,
      );
      let giftWrappedEvent = await constructMessageGiftWrap(
        sealedEvent,
        decodedRandomPubkeyForReceiver.data as string,
        decodedRandomPrivkeyForReceiver.data as Uint8Array,
        pubkeyToReceiveMessage,
      );
      await sendGiftWrappedMessageEvent(giftWrappedEvent);
    }
  };

  const onShippingSubmit = async (data: { [x: string]: any }) => {
    try {
      let price = totalCost;
      if (!currencySelection.hasOwnProperty(currency)) {
        throw new Error(`${currency} is not a supported currency.`);
      } else if (
        currencySelection.hasOwnProperty(currency) &&
        currency.toLowerCase() !== "sats" &&
        currency.toLowerCase() !== "sat"
      ) {
        try {
          const currencyData = { amount: price, currency: currency };
          const numSats = await fiat.getSatoshiValue(currencyData);
          price = Math.round(numSats);
        } catch (err) {
          console.error("ERROR", err);
        }
      } else if (currency.toLowerCase() === "btc") {
        price = price * 100000000;
      }

      if (price < 1) {
        throw new Error("Listing price is less than 1 sat.");
      }

      let shippingName = data["Name"];
      let shippingAddress = data["Address"];
      let shippingUnitNo = data["Unit"];
      let shippingCity = data["City"];
      let shippingPostalCode = data["Postal Code"];
      let shippingState = data["State/Province"];
      let shippingCountry = data["Country"];
      setShowShippingModal(false);
      if (isCashuPayment) {
        await handleCashuPayment(
          price,
          shippingName,
          shippingAddress,
          shippingUnitNo,
          shippingCity,
          shippingPostalCode,
          shippingState,
          shippingCountry,
        );
      } else {
        await handleLightningPayment(
          price,
          shippingName,
          shippingAddress,
          shippingUnitNo,
          shippingCity,
          shippingPostalCode,
          shippingState,
          shippingCountry,
        );
      }
    } catch (error) {
      console.error(error);
      if (setCashuPaymentFailed) {
        setCashuPaymentFailed(true);
      }
    }
  };

  const onContactSubmit = async (data: { [x: string]: any }) => {
    try {
      let price = totalCost;
      if (!currencySelection.hasOwnProperty(currency)) {
        throw new Error(`${currency} is not a supported currency.`);
      } else if (
        currencySelection.hasOwnProperty(currency) &&
        currency.toLowerCase() !== "sats" &&
        currency.toLowerCase() !== "sat"
      ) {
        try {
          const currencyData = { amount: price, currency: currency };
          const numSats = await fiat.getSatoshiValue(currencyData);
          price = Math.round(numSats);
        } catch (err) {
          console.error("ERROR", err);
        }
      } else if (currency.toLowerCase() === "btc") {
        price = price * 100000000;
      }

      if (price < 1) {
        throw new Error("Listing price is less than 1 sat.");
      }

      let contact = data["Contact"];
      let contactType = data["Contact Type"];
      let contactInstructions = data["Instructions"];
      setShowContactModal(false);
      if (isCashuPayment) {
        await handleCashuPayment(
          price,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          contact,
          contactType,
          contactInstructions,
        );
      } else {
        await handleLightningPayment(
          price,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          contact,
          contactType,
          contactInstructions,
        );
      }
    } catch (error) {
      console.error(error);
      if (setCashuPaymentFailed) {
        setCashuPaymentFailed(true);
      }
    }
  };

  const handleToggleShippingModal = () => {
    shippingReset();
    setShowShippingModal(!showShippingModal);
  };

  const handleToggleContactModal = () => {
    contactReset();
    setShowContactModal(!showContactModal);
  };

  const handleLightningPayment = async (
    newPrice: number,
    shippingName?: string,
    shippingAddress?: string,
    shippingUnitNo?: string,
    shippingCity?: string,
    shippingPostalCode?: string,
    shippingState?: string,
    shippingCountry?: string,
    contact?: string,
    contactType?: string,
    contactInstructions?: string,
  ) => {
    try {
      setShowInvoiceCard(true);
      const wallet = new CashuWallet(new CashuMint(mints[0]));

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

      invoiceHasBeenPaid(
        wallet,
        newPrice,
        hash,
        id,
        shippingName ? shippingName : undefined,
        shippingAddress ? shippingAddress : undefined,
        shippingUnitNo ? shippingUnitNo : undefined,
        shippingCity ? shippingCity : undefined,
        shippingPostalCode ? shippingPostalCode : undefined,
        shippingState ? shippingState : undefined,
        shippingCountry ? shippingCountry : undefined,
        contact ? contact : undefined,
        contactType ? contactType : undefined,
        contactInstructions ? contactInstructions : undefined,
      );
    } catch (error) {
      console.error(error);
      if (setInvoiceGenerationFailed) {
        setInvoiceGenerationFailed(true);
        setShowInvoiceCard(false);
        setInvoice("");
        setQrCodeUrl(null);
      }
    }
  };

  /** CHECKS WHETHER INVOICE HAS BEEN PAID */
  async function invoiceHasBeenPaid(
    wallet: CashuWallet,
    newPrice: number,
    hash: string,
    metricsInvoiceId: string,
    shippingName?: string,
    shippingAddress?: string,
    shippingUnitNo?: string,
    shippingCity?: string,
    shippingPostalCode?: string,
    shippingState?: string,
    shippingCountry?: string,
    contact?: string,
    contactType?: string,
    contactInstructions?: string,
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
          sendTokens(
            encoded,
            shippingName ? shippingName : undefined,
            shippingAddress ? shippingAddress : undefined,
            shippingUnitNo ? shippingUnitNo : undefined,
            shippingCity ? shippingCity : undefined,
            shippingPostalCode ? shippingPostalCode : undefined,
            shippingState ? shippingState : undefined,
            shippingCountry ? shippingCountry : undefined,
            contact ? contact : undefined,
            contactType ? contactType : undefined,
            contactInstructions ? contactInstructions : undefined,
          );
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

  const sendTokens = async (
    token: string,
    shippingName?: string,
    shippingAddress?: string,
    shippingUnitNo?: string,
    shippingCity?: string,
    shippingPostalCode?: string,
    shippingState?: string,
    shippingCountry?: string,
    contact?: string,
    contactType?: string,
    contactInstructions?: string,
  ) => {
    const { title } = productData;
    let paymentMessage;
    if (userNPub) {
      paymentMessage =
        "This is a Cashu token payment from " +
        userNPub +
        " for your " +
        title +
        " listing on Shopstr: " +
        token;
    } else {
      paymentMessage =
        "This is a Cashu token payment for your " +
        title +
        " listing on Shopstr: " +
        token;
    }
    await sendPaymentAndContactMessage(
      pubkeyOfProductBeingSold,
      paymentMessage,
      true,
    );
    if (
      !(
        shippingName === undefined &&
        shippingAddress === undefined &&
        shippingUnitNo === undefined &&
        shippingCity === undefined &&
        shippingPostalCode === undefined &&
        shippingState === undefined &&
        shippingCountry === undefined &&
        contact === undefined &&
        contactType === undefined &&
        contactInstructions === undefined
      )
    ) {
      if (
        shippingName &&
        shippingAddress &&
        shippingCity &&
        shippingPostalCode &&
        shippingState &&
        shippingCountry
      ) {
        let receiptMessage =
          "Your order for " +
          productData.title +
          " was processed successfully. You should be receiving tracking information from " +
          nip19.npubEncode(productData.pubkey) +
          " as soon as they claim their payment.";
        let contactMessage = "";
        if (!shippingUnitNo && !selectedSize) {
          contactMessage =
            "Please ship the product to " +
            shippingName +
            " at " +
            shippingAddress +
            ", " +
            shippingCity +
            ", " +
            shippingPostalCode +
            ", " +
            shippingState +
            ", " +
            shippingCountry +
            ".";
        } else if (!shippingUnitNo && selectedSize) {
          contactMessage =
            "Please ship the product in a size " +
            selectedSize +
            " to " +
            shippingName +
            " at " +
            shippingAddress +
            ", " +
            shippingCity +
            ", " +
            shippingPostalCode +
            ", " +
            shippingState +
            ", " +
            shippingCountry +
            ".";
        } else if (shippingUnitNo && !selectedSize) {
          contactMessage =
            "Please ship the product to " +
            shippingName +
            " at " +
            shippingAddress +
            " " +
            shippingUnitNo +
            ", " +
            shippingCity +
            ", " +
            shippingPostalCode +
            ", " +
            shippingState +
            ", " +
            shippingCountry +
            ".";
        } else if (shippingUnitNo && selectedSize) {
          contactMessage =
            "Please ship the product in a size " +
            selectedSize +
            " to " +
            shippingName +
            " at " +
            shippingAddress +
            " " +
            shippingUnitNo +
            ", " +
            shippingCity +
            ", " +
            shippingPostalCode +
            ", " +
            shippingState +
            ", " +
            shippingCountry +
            ".";
        }
        await sendPaymentAndContactMessage(
          pubkeyOfProductBeingSold,
          contactMessage,
          false,
        );
        if (userPubkey) {
          await sendPaymentAndContactMessage(
            userPubkey,
            receiptMessage,
            false,
            true,
          );
        }
      } else if (contact && contactType && contactInstructions) {
        let contactMessage;
        let receiptMessage;
        if (selectedSize) {
          contactMessage =
            "To finalize the sale of your " +
            title +
            " listing in a size " +
            selectedSize +
            " on Shopstr, please contact " +
            contact +
            " over " +
            contactType +
            " using the following instructions: " +
            contactInstructions;
          receiptMessage =
            "Your order for " +
            productData.title +
            " in a size " +
            selectedSize +
            " was processed successfully. You should be receiving delivery information from " +
            nip19.npubEncode(productData.pubkey) +
            " as soon as they claim their payment.";
        } else {
          contactMessage =
            "To finalize the sale of your " +
            title +
            " listing on Shopstr, please contact " +
            contact +
            " over " +
            contactType +
            " using the following instructions: " +
            contactInstructions;
          receiptMessage =
            "Your order for " +
            productData.title +
            " was processed successfully. You should be receiving delivery information from " +
            nip19.npubEncode(productData.pubkey) +
            " as soon as they claim their payment.";
        }
        await sendPaymentAndContactMessage(
          pubkeyOfProductBeingSold,
          contactMessage,
          false,
        );
        if (userPubkey) {
          await sendPaymentAndContactMessage(
            userPubkey,
            receiptMessage,
            false,
            true,
          );
        }
      }
    } else if (selectedSize) {
      let contactMessage = "This purchase was for a size " + selectedSize + ".";
      await sendPaymentAndContactMessage(
        pubkeyOfProductBeingSold,
        contactMessage,
        false,
      );
      if (userPubkey) {
        let receiptMessage =
          "Thank you for your purchase of " +
          title +
          " in a size " +
          selectedSize +
          " from " +
          nip19.npubEncode(productData.pubkey) +
          ".";
        await sendPaymentAndContactMessage(
          userPubkey,
          receiptMessage,
          false,
          true,
        );
      }
    } else if (userPubkey) {
      let receiptMessage =
        "Thank you for your purchase of " +
        title +
        " from " +
        nip19.npubEncode(productData.pubkey) +
        ".";
      await sendPaymentAndContactMessage(
        userPubkey,
        receiptMessage,
        false,
        true,
      );
    }
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
      pathname: "/orders",
      query: { pk: nip19.npubEncode(pubkeyToOpenChatWith), isInquiry: true },
    });
  };

  const formattedTotalCost = formatWithCommas(totalCost, currency);

  const handleCashuPayment = async (
    price: number,
    shippingName?: string,
    shippingAddress?: string,
    shippingUnitNo?: string,
    shippingCity?: string,
    shippingPostalCode?: string,
    shippingState?: string,
    shippingCountry?: string,
    contact?: string,
    contactType?: string,
    contactInstructions?: string,
  ) => {
    try {
      const mint = new CashuMint(mints[0]);
      const wallet = new CashuWallet(mint);
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
      sendTokens(
        encodedSendToken,
        shippingName ? shippingName : undefined,
        shippingAddress ? shippingAddress : undefined,
        shippingUnitNo ? shippingUnitNo : undefined,
        shippingCity ? shippingCity : undefined,
        shippingPostalCode ? shippingPostalCode : undefined,
        shippingState ? shippingState : undefined,
        shippingCountry ? shippingCountry : undefined,
        contact ? contact : undefined,
        contactType ? contactType : undefined,
        contactInstructions ? contactInstructions : undefined,
      )
        .then(() => {
          captureCashuPaidMetric(productData);
        })
        .catch((error) => {
          console.error(error);
        });
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
      const eventIds = walletContext.proofEvents.map((event) => event.id);
      await publishSpendingHistoryEvent(
        "out",
        String(price),
        eventIds,
        passphrase,
        dTag,
      );
      if (changeProofs && changeProofs.length > 0) {
        await publishProofEvent(mints[0], changeProofs, "in", passphrase, dTag);
      }
      await publishWalletEvent(passphrase, dTag);
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
              if (randomNsecForReceiver !== "" && randomNpubForSender !== "") {
                if (shippingType === "Free" || shippingType === "Added Cost") {
                  setIsCashuPayment(false);
                  setNeedsShippingInfo(true);
                  setShowPurchaseTypeOption(true);
                } else if (
                  shippingType === "N/A" ||
                  shippingType === "Pickup"
                ) {
                  setIsCashuPayment(false);
                  setNeedsShippingInfo(false);
                  setShowPurchaseTypeOption(true);
                } else if (shippingType === "Free/Pickup") {
                  setIsCashuPayment(false);
                  setShowShippingOption(true);
                } else {
                  setIsCashuPayment(false);
                  setNeedsShippingInfo(false);
                  setShowPurchaseTypeOption(true);
                }
              }
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
              if (randomNsecForReceiver !== "" && randomNpubForSender !== "") {
                if (shippingType === "Free" || shippingType === "Added Cost") {
                  setIsCashuPayment(true);
                  setNeedsShippingInfo(true);
                  setShowPurchaseTypeOption(true);
                } else if (
                  shippingType === "N/A" ||
                  shippingType === "Pickup"
                ) {
                  setIsCashuPayment(true);
                  setNeedsShippingInfo(false);
                  setShowPurchaseTypeOption(true);
                } else if (shippingType === "Free/Pickup") {
                  setIsCashuPayment(true);
                  setShowShippingOption(true);
                } else {
                  setIsCashuPayment(true);
                  setNeedsShippingInfo(false);
                  setShowPurchaseTypeOption(true);
                }
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
        <Card className="mt-3 w-3/4">
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
                        className={`ml-2 h-4 w-4 cursor-pointer text-light-text dark:text-dark-text ${
                          copiedToClipboard ? "hidden" : ""
                        }`}
                      />
                      <CheckIcon
                        className={`ml-2 h-4 w-4 cursor-pointer text-light-text dark:text-dark-text ${
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
      <Modal
        backdrop="blur"
        isOpen={showShippingOption}
        onClose={() => {
          setShowShippingOption(false);
        }}
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
          <ModalHeader className="flex items-center justify-center text-light-text dark:text-dark-text">
            Select your delivery option:
          </ModalHeader>
          <ModalBody className="flex flex-col overflow-hidden">
            <div className="flex items-center justify-center">
              <Select label="Delivery Method" className="max-w-xs">
                <SelectItem
                  key="in-person"
                  className="text-light-text dark:text-dark-text"
                  onClick={async () => {
                    setShowShippingOption(false);
                    if (isCashuPayment) {
                      await handleCashuPayment(totalCost);
                    } else {
                      await handleLightningPayment(totalCost);
                    }
                  }}
                >
                  In-person
                </SelectItem>
                <SelectItem
                  key="free"
                  className="text-light-text dark:text-dark-text"
                  onClick={() => {
                    handleToggleShippingModal();
                    setShowShippingOption(false);
                  }}
                >
                  Free shipping
                </SelectItem>
                <SelectItem
                  key="pickup"
                  className="text-light-text dark:text-dark-text"
                  onClick={() => {
                    handleToggleContactModal();
                    setShowShippingOption(false);
                  }}
                >
                  Pickup
                </SelectItem>
              </Select>
            </div>
          </ModalBody>
        </ModalContent>
      </Modal>

      <Modal
        backdrop="blur"
        isOpen={showPurchaseTypeOption}
        onClose={() => {
          setShowPurchaseTypeOption(false);
        }}
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
          <ModalHeader className="flex items-center justify-center text-light-text dark:text-dark-text">
            Select your purchase type:
          </ModalHeader>
          <ModalBody className="flex flex-col overflow-hidden">
            <div className="flex items-center justify-center">
              <Select label="Purchase Type" className="max-w-xs">
                <SelectItem
                  key="in-person"
                  className="text-light-text dark:text-dark-text"
                  onClick={async () => {
                    setShowPurchaseTypeOption(false);
                    if (isCashuPayment) {
                      await handleCashuPayment(totalCost);
                    } else {
                      await handleLightningPayment(totalCost);
                    }
                  }}
                >
                  In-person
                </SelectItem>
                <SelectItem
                  key="online-order"
                  className="text-light-text dark:text-dark-text"
                  onClick={() => {
                    if (needsShippingInfo) {
                      handleToggleShippingModal();
                    } else {
                      handleToggleContactModal();
                    }
                    setShowPurchaseTypeOption(false);
                  }}
                >
                  Online order
                </SelectItem>
              </Select>
            </div>
          </ModalBody>
        </ModalContent>
      </Modal>

      <ShippingForm
        showShippingModal={showShippingModal}
        handleToggleShippingModal={handleToggleShippingModal}
        handleShippingSubmit={handleShippingSubmit}
        onShippingSubmit={onShippingSubmit}
        shippingControl={shippingControl}
      />

      <ContactForm
        showContactModal={showContactModal}
        handleToggleContactModal={handleToggleContactModal}
        handleContactSubmit={handleContactSubmit}
        onContactSubmit={onContactSubmit}
        contactControl={contactControl}
      />

      <SignInModal isOpen={isOpen} onClose={onClose} />
      <RequestPassphraseModal
        passphrase={passphrase}
        setCorrectPassphrase={setPassphrase}
        isOpen={enterPassphrase}
        setIsOpen={setEnterPassphrase}
        onCancelRouteTo={`/${id}`}
      />
    </>
  );
}
