import React, { useContext, useState, useEffect, useMemo } from "react";
import { useRouter } from "next/router";
import { CashuWalletContext } from "../utils/context/context";
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
  CheckCircleIcon,
  XCircleIcon,
} from "@heroicons/react/24/outline";
import {
  CashuMint,
  CashuWallet,
  getEncodedToken,
  Proof,
  MintKeyset,
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
import RequestPassphraseModal from "@/components/utility-components/request-passphrase-modal";
import FailureModal from "@/components/utility-components/failure-modal";
import ShippingForm from "./shipping-form";
import ContactForm from "./contact-form";
import CombinedContactForm from "./combined-contact-form";

export default function CartInvoiceCard({
  products,
  quantities,
  shippingTypes,
  totalCostsInSats,
  subtotal,
  totalShippingCost,
  totalCost,
}: {
  products: ProductData[];
  quantities: { [key: string]: number };
  shippingTypes: { [key: string]: string };
  totalCostsInSats: { [key: string]: number };
  subtotal: number;
  totalShippingCost: number;
  totalCost: number;
}) {
  const { userPubkey, userNPub, signInMethod, mints, tokens, history } =
    getLocalStorageData();
  const router = useRouter();

  const [enterPassphrase, setEnterPassphrase] = useState(false);
  const [passphrase, setPassphrase] = useState("");

  const [showInvoiceCard, setShowInvoiceCard] = useState(false);

  const [paymentConfirmed, setPaymentConfirmed] = useState(false);
  const [qrCodeUrl, setQrCodeUrl] = useState<string | null>(null);
  const [invoice, setInvoice] = useState("");
  const [copiedToClipboard, setCopiedToClipboard] = useState(false);

  const walletContext = useContext(CashuWalletContext);
  const [dTag, setDTag] = useState("");

  const { isOpen, onOpen, onClose } = useDisclosure();

  const [showShippingModal, setShowShippingModal] = useState(false);
  const [showContactModal, setShowContactModal] = useState(false);
  const [showCombinedModal, setShowCombinedModal] = useState(false);
  const [showShippingOption, setShowShippingOption] = useState(false);
  const [isCashuPayment, setIsCashuPayment] = useState(false);

  const [invoiceIsPaid, setInvoiceIsPaid] = useState(false);
  const [invoiceGenerationFailed, setInvoiceGenerationFailed] = useState(false);
  const [cashuPaymentSent, setCashuPaymentSent] = useState(false);
  const [cashuPaymentFailed, setCashuPaymentFailed] = useState(false);

  const [showPurchaseTypeOption, setShowPurchaseTypeOption] = useState(false);
  const [needsShippingInfo, setNeedsShippingInfo] = useState(false);
  const [needsCombinedInfo, setNeedsCombinedInfo] = useState(false);

  const [showFailureModal, setShowFailureModal] = useState(false);
  const [failureText, setFailureText] = useState("");

  const uniqueShippingTypes = useMemo(() => {
    return Array.from(new Set(Object.values(shippingTypes)));
  }, [shippingTypes]);

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

  const {
    handleSubmit: handleCombinedSubmit,
    control: combinedControl,
    reset: combinedReset,
  } = useForm();

  useEffect(() => {
    if (signInMethod === "nsec" && !validPassphrase(passphrase)) {
      setEnterPassphrase(true);
    }
  }, [signInMethod, passphrase]);

  useEffect(() => {
    const walletEvent = walletContext.mostRecentWalletEvent;
    if (walletEvent?.tags) {
      const walletTag = walletEvent.tags.find(
        (tag: string[]) => tag[0] === "d",
      )?.[1];
      setDTag(walletTag);
    }
  }, [walletContext]);

  const generateNewKeys = async () => {
    try {
      const senderResponse = await axios({
        method: "GET",
        url: "/api/nostr/generate-keys",
      });
      const receiverResponse = await axios({
        method: "GET",
        url: "/api/nostr/generate-keys",
      });

      return {
        senderNpub: senderResponse.data.npub,
        senderNsec: senderResponse.data.nsec,
        receiverNpub: receiverResponse.data.npub,
        receiverNsec: receiverResponse.data.nsec,
      };
    } catch (error) {
      console.error(error);
      return null;
    }
  };

  const sendPaymentAndContactMessage = async (
    pubkeyOfProduct: string,
    message: string,
    isPayment: boolean,
    product: ProductData,
    isReceipt?: boolean,
  ) => {
    const newKeys = await generateNewKeys();
    if (!newKeys) {
      setFailureText("Failed to generate new keys for messages!");
      setShowFailureModal(true);
      return;
    }

    let decodedRandomPubkeyForSender = nip19.decode(newKeys.senderNpub);
    let decodedRandomPrivkeyForSender = nip19.decode(newKeys.senderNsec);
    let decodedRandomPubkeyForReceiver = nip19.decode(newKeys.receiverNpub);
    let decodedRandomPrivkeyForReceiver = nip19.decode(newKeys.receiverNsec);

    if (isReceipt) {
      let giftWrappedMessageEvent = await constructGiftWrappedMessageEvent(
        decodedRandomPubkeyForSender.data as string,
        userPubkey,
        message,
        "order-receipt",
        product,
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
          pubkeyOfProduct,
          message,
          "order-payment",
          product,
        );
      } else {
        giftWrappedMessageEvent = await constructGiftWrappedMessageEvent(
          decodedRandomPubkeyForSender.data as string,
          pubkeyOfProduct,
          message,
          "order-info",
          product,
        );
      }
      let sealedEvent = await constructMessageSeal(
        giftWrappedMessageEvent,
        decodedRandomPubkeyForSender.data as string,
        pubkeyOfProduct,
        undefined,
        decodedRandomPrivkeyForSender.data as Uint8Array,
      );
      let giftWrappedEvent = await constructMessageGiftWrap(
        sealedEvent,
        decodedRandomPubkeyForReceiver.data as string,
        decodedRandomPrivkeyForReceiver.data as Uint8Array,
        pubkeyOfProduct,
      );
      await sendGiftWrappedMessageEvent(giftWrappedEvent);
    }
  };

  const onShippingSubmit = async (data: { [x: string]: any }) => {
    try {
      if (totalCost < 1) {
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
          totalCost,
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
          totalCost,
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
      if (totalCost < 1) {
        throw new Error("Listing price is less than 1 sat.");
      }

      let contact = data["Contact"];
      let contactType = data["Contact Type"];
      let contactInstructions = data["Instructions"];
      setShowContactModal(false);
      if (isCashuPayment) {
        await handleCashuPayment(
          totalCost,
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
          totalCost,
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

  const onCombinedSubmit = async (data: { [x: string]: any }) => {
    try {
      if (totalCost < 1) {
        throw new Error("Listing price is less than 1 sat.");
      }

      let contact = data["Contact"];
      let contactType = data["Contact Type"];
      let contactInstructions = data["Instructions"];
      let shippingName = data["Name"];
      let shippingAddress = data["Address"];
      let shippingUnitNo = data["Unit"];
      let shippingCity = data["City"];
      let shippingPostalCode = data["Postal Code"];
      let shippingState = data["State/Province"];
      let shippingCountry = data["Country"];
      setShowCombinedModal(false);
      if (isCashuPayment) {
        await handleCashuPayment(
          totalCost,
          shippingName,
          shippingAddress,
          shippingUnitNo,
          shippingCity,
          shippingPostalCode,
          shippingState,
          shippingCountry,
          contact,
          contactType,
          contactInstructions,
        );
      } else {
        await handleLightningPayment(
          totalCost,
          shippingName,
          shippingAddress,
          shippingUnitNo,
          shippingCity,
          shippingPostalCode,
          shippingState,
          shippingCountry,
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

  const handleToggleCombinedModal = () => {
    combinedReset();
    setShowCombinedModal(!showCombinedModal);
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
        currency: "SATS",
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

      if (typeof window.webln !== "undefined") {
        try {
          await window.webln.enable();
          const isEnabled = await window.webln.isEnabled();
          if (!isEnabled) {
            throw new Error("WebLN is not enabled");
          }
          try {
            const res = await window.webln.sendPayment(pr);
            if (!res) {
              throw new Error("Payment failed");
            }
          } catch (e) {
            console.error(e);
          }
        } catch (e) {
          console.error(e);
        }
      }
      await invoiceHasBeenPaid(
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
        const proofs = await wallet.mintProofs(newPrice, hash);

        // Encoded proofs can be spent at the mint
        encoded = getEncodedToken({
          mint: mints[0],
          proofs,
        });

        if (encoded) {
          await sendTokens(
            wallet,
            proofs,
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
            metricsInvoiceId,
          );
          localStorage.setItem("cart", JSON.stringify([]));
          setPaymentConfirmed(true);
          setQrCodeUrl(null);
          if (setInvoiceIsPaid) {
            setInvoiceIsPaid(true);
          }
          break;
        }
      } catch (error) {
        console.error(error);
        if (error instanceof TypeError) {
          setShowInvoiceCard(false);
          setInvoice("");
          setQrCodeUrl(null);
          setFailureText(
            "Failed to validate invoice! Change your mint in settings and/or please try again.",
          );
          setShowFailureModal(true);
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }
    }
  }

  const sendTokens = async (
    wallet: CashuWallet,
    proofs: Proof[],
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
    metricsInvoiceId?: string,
  ) => {
    let remainingProofs = proofs;
    for (const product of products) {
      const title = product.title;
      const pubkey = product.pubkey;
      let tokenAmount = totalCostsInSats[pubkey];
      const { keep, send } = await wallet.send(tokenAmount, remainingProofs, {
        includeFees: true,
      });
      let encodedTokenToSend = getEncodedToken({
        mint: mints[0],
        proofs: send,
      });
      remainingProofs = keep;
      let paymentMessage = "";
      if (quantities[product.id] && quantities[product.id] > 1) {
        if (userNPub) {
          paymentMessage =
            "This is a Cashu token payment from " +
            userNPub +
            " for " +
            quantities[product.id] +
            " of your " +
            title +
            " listing on Shopstr: " +
            encodedTokenToSend;
        } else {
          paymentMessage =
            "This is a Cashu token payment for " +
            quantities[product.id] +
            " of your " +
            title +
            " listing on Shopstr: " +
            encodedTokenToSend;
        }
      } else {
        if (userNPub) {
          paymentMessage =
            "This is a Cashu token payment from " +
            userNPub +
            " for your " +
            title +
            " listing on Shopstr: " +
            encodedTokenToSend;
        } else {
          paymentMessage =
            "This is a Cashu token payment for your " +
            title +
            " listing on Shopstr: " +
            encodedTokenToSend;
        }
      }
      await sendPaymentAndContactMessage(pubkey, paymentMessage, true, product);
      if (metricsInvoiceId) {
        await captureInvoicePaidmetric(metricsInvoiceId, product);
      } else {
        await captureCashuPaidMetric(product);
      }

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
          product.shippingType === "Added Cost" ||
          product.shippingType === "Free" ||
          (product.shippingType === "Free/Pickup" && needsShippingInfo === true)
        ) {
          let contactMessage = "";
          if (!shippingUnitNo && !product.selectedSize) {
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
          } else if (!shippingUnitNo && product.selectedSize) {
            contactMessage =
              "Please ship the product in a size " +
              product.selectedSize +
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
          } else if (shippingUnitNo && !product.selectedSize) {
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
          } else if (shippingUnitNo && product.selectedSize) {
            contactMessage =
              "Please ship the product in a size " +
              product.selectedSize +
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
            pubkey,
            contactMessage,
            false,
            product,
          );
          if (userPubkey) {
            let receiptMessage =
              "Your order for " +
              product.title +
              " was processed successfully. You should be receiving tracking information from " +
              nip19.npubEncode(product.pubkey) +
              " as soon as they claim their payment.";
            await sendPaymentAndContactMessage(
              userPubkey,
              receiptMessage,
              false,
              product,
              true,
            );
          }
        } else if (
          product.shippingType === "N/A" ||
          product.shippingType === "Pickup" ||
          (product.shippingType === "Free/Pickup" &&
            needsShippingInfo === false)
        ) {
          let contactMessage;
          let receiptMessage;
          if (product.selectedSize) {
            contactMessage =
              "To finalize the sale of your " +
              title +
              " listing in a size " +
              product.selectedSize +
              " on Shopstr, please contact " +
              contact +
              " over " +
              contactType +
              " using the following instructions: " +
              contactInstructions;
            receiptMessage =
              "Your order for " +
              product.title +
              "in a size " +
              product.selectedSize +
              " was processed successfully. You should be receiving delivery information from " +
              nip19.npubEncode(product.pubkey) +
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
              product.title +
              " was processed successfully. You should be receiving delivery information from " +
              nip19.npubEncode(product.pubkey) +
              " as soon as they claim their payment.";
          }
          await sendPaymentAndContactMessage(
            pubkey,
            contactMessage,
            false,
            product,
          );
          if (userPubkey) {
            await sendPaymentAndContactMessage(
              userPubkey,
              receiptMessage,
              false,
              product,
              true,
            );
          }
        }
      } else if (product.selectedSize) {
        let contactMessage =
          "This purchase was for a size " + product.selectedSize + ".";
        await sendPaymentAndContactMessage(
          pubkey,
          contactMessage,
          false,
          product,
        );
        if (userPubkey) {
          let receiptMessage =
            "Thank you for your purchase of " +
            title +
            " in a size " +
            product.selectedSize +
            " from " +
            nip19.npubEncode(product.pubkey) +
            ".";
          await sendPaymentAndContactMessage(
            userPubkey,
            receiptMessage,
            false,
            product,
            true,
          );
        }
      } else if (userPubkey) {
        let receiptMessage =
          "Thank you for your purchase of " +
          title +
          " from " +
          nip19.npubEncode(product.pubkey) +
          ".";
        await sendPaymentAndContactMessage(
          userPubkey,
          receiptMessage,
          false,
          product,
          true,
        );
      }
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

  const formattedTotalCost = formatWithCommas(totalCost, "sats");

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
      const mintKeySetIds = await wallet.getKeySets();
      const filteredProofs = tokens.filter(
        (p: Proof) =>
          mintKeySetIds?.some((keysetId: MintKeyset) => keysetId.id === p.id),
      );
      const { keep, send } = await wallet.send(price, filteredProofs, {
        includeFees: true,
      });
      await sendTokens(
        wallet,
        send,
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
      const changeProofs = keep;
      const remainingProofs = tokens.filter(
        (p: Proof) =>
          mintKeySetIds?.some((keysetId: MintKeyset) => keysetId.id !== p.id),
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
        localStorage.setItem("cart", JSON.stringify([]));
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
              if (
                uniqueShippingTypes.length === 1 &&
                uniqueShippingTypes.includes("Free/Pickup")
              ) {
                setIsCashuPayment(false);
                setShowShippingOption(true);
              } else if (
                !uniqueShippingTypes.includes("N/A") &&
                !uniqueShippingTypes.includes("Pickup")
              ) {
                setIsCashuPayment(false);
                setNeedsShippingInfo(true);
                setNeedsCombinedInfo(false);
                setShowPurchaseTypeOption(true);
              } else if (
                !uniqueShippingTypes.includes("Free") &&
                !uniqueShippingTypes.includes("Added Cost")
              ) {
                setIsCashuPayment(false);
                setNeedsShippingInfo(false);
                setNeedsCombinedInfo(false);
                setShowPurchaseTypeOption(true);
              } else if (
                !uniqueShippingTypes.includes("Free") &&
                !uniqueShippingTypes.includes("Added Cost") &&
                !uniqueShippingTypes.includes("N/A") &&
                !uniqueShippingTypes.includes("Pickup") &&
                !uniqueShippingTypes.includes("Free/Pickup")
              ) {
                setIsCashuPayment(false);
                setNeedsShippingInfo(false);
                setNeedsCombinedInfo(false);
                setShowPurchaseTypeOption(true);
              } else {
                setIsCashuPayment(false);
                setNeedsShippingInfo(false);
                setNeedsCombinedInfo(true);
                setShowPurchaseTypeOption(true);
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
              if (
                uniqueShippingTypes.length === 1 &&
                uniqueShippingTypes.includes("Free/Pickup")
              ) {
                setIsCashuPayment(true);
                setShowShippingOption(true);
              } else if (
                !uniqueShippingTypes.includes("N/A") &&
                !uniqueShippingTypes.includes("Pickup")
              ) {
                setIsCashuPayment(true);
                setNeedsShippingInfo(true);
                setShowPurchaseTypeOption(true);
              } else if (
                !uniqueShippingTypes.includes("Free") &&
                !uniqueShippingTypes.includes("Added Cost")
              ) {
                setIsCashuPayment(true);
                setNeedsShippingInfo(false);
                setShowPurchaseTypeOption(true);
              } else if (
                !uniqueShippingTypes.includes("Free") &&
                !uniqueShippingTypes.includes("Added Cost") &&
                !uniqueShippingTypes.includes("N/A") &&
                !uniqueShippingTypes.includes("Pickup") &&
                !uniqueShippingTypes.includes("Free/Pickup")
              ) {
                setIsCashuPayment(true);
                setNeedsShippingInfo(false);
                setShowPurchaseTypeOption(true);
              } else {
                setIsCashuPayment(true);
                setNeedsShippingInfo(false);
                setShowPurchaseTypeOption(true);
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
            <DisplayCostBreakdown
              subtotal={subtotal}
              shippingCost={totalShippingCost}
            />
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
                    if (needsCombinedInfo) {
                      handleToggleCombinedModal();
                    } else if (needsShippingInfo) {
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

      <CombinedContactForm
        showCombinedModal={showCombinedModal}
        handleToggleCombinedModal={handleToggleCombinedModal}
        handleCombinedSubmit={handleCombinedSubmit}
        onCombinedSubmit={onCombinedSubmit}
        combinedControl={combinedControl}
      />

      {invoiceIsPaid || cashuPaymentSent ? (
        <>
          <Modal
            backdrop="blur"
            isOpen={invoiceIsPaid || cashuPaymentSent}
            onClose={() => {
              setInvoiceIsPaid(false);
              setCashuPaymentSent(false);
              router.push("/");
            }}
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
              <ModalHeader className="flex items-center justify-center text-light-text dark:text-dark-text">
                <CheckCircleIcon className="h-6 w-6 text-green-500" />
                <div className="ml-2">Purchase successful!</div>
              </ModalHeader>
              <ModalBody className="flex flex-col overflow-hidden text-light-text dark:text-dark-text">
                <div className="flex items-center justify-center">
                  The seller will receive a DM containing your payment as a
                  Cashu token.
                </div>
              </ModalBody>
            </ModalContent>
          </Modal>
        </>
      ) : null}
      {invoiceGenerationFailed ? (
        <>
          <Modal
            backdrop="blur"
            isOpen={invoiceGenerationFailed}
            onClose={() => setInvoiceGenerationFailed(false)}
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
              <ModalHeader className="flex items-center justify-center text-light-text dark:text-dark-text">
                <XCircleIcon className="h-6 w-6 text-red-500" />
                <div className="ml-2">Invoice generation failed!</div>
              </ModalHeader>
              <ModalBody className="flex flex-col overflow-hidden text-light-text dark:text-dark-text">
                <div className="flex items-center justify-center">
                  The price and/or currency set for this listing was invalid.
                </div>
              </ModalBody>
            </ModalContent>
          </Modal>
        </>
      ) : null}
      {cashuPaymentFailed ? (
        <>
          <Modal
            backdrop="blur"
            isOpen={cashuPaymentFailed}
            onClose={() => setCashuPaymentFailed(false)}
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
              <ModalHeader className="flex items-center justify-center text-light-text dark:text-dark-text">
                <XCircleIcon className="h-6 w-6 text-red-500" />
                <div className="ml-2">Purchase failed!</div>
              </ModalHeader>
              <ModalBody className="flex flex-col overflow-hidden text-light-text dark:text-dark-text">
                <div className="flex items-center justify-center">
                  You didn&apos;t have enough balance in your wallet to pay.
                </div>
              </ModalBody>
            </ModalContent>
          </Modal>
        </>
      ) : null}
      <SignInModal isOpen={isOpen} onClose={onClose} />
      <RequestPassphraseModal
        passphrase={passphrase}
        setCorrectPassphrase={setPassphrase}
        isOpen={enterPassphrase}
        setIsOpen={setEnterPassphrase}
        onCancelRouteTo={"/cart"}
      />
      <FailureModal
        bodyText={failureText}
        isOpen={showFailureModal}
        onClose={() => {
          setShowFailureModal(false);
          setFailureText("");
        }}
      />
    </>
  );
}
