import React, { useContext, useState, useEffect } from "react";
import {
  CashuWalletContext,
  ChatsContext,
  ProfileMapContext,
} from "../utils/context/context";
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
  MintKeyset,
  Proof,
} from "@cashu/cashu-ts";
import {
  constructGiftWrappedEvent,
  constructMessageSeal,
  constructMessageGiftWrap,
  sendGiftWrappedMessageEvent,
  getLocalStorageData,
  validPassphrase,
  isUserLoggedIn,
  publishProofEvent,
  generateKeys,
} from "./utility/nostr-helper-functions";
import { addChatMessagesToCache } from "../pages/api/nostr/cache-service";
import { LightningAddress } from "@getalby/lightning-tools";
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
import FailureModal from "@/components/utility-components/failure-modal";
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
  const { id, pubkey, currency, totalCost, shippingType, required } =
    productData;
  const pubkeyOfProductBeingSold = pubkey;
  const { userNPub, userPubkey, signInMethod, mints, tokens, history } =
    getLocalStorageData();

  const chatsContext = useContext(ChatsContext);
  const profileContext = useContext(ProfileMapContext);

  const [enterPassphrase, setEnterPassphrase] = useState(false);
  const [passphrase, setPassphrase] = useState("");

  const [showInvoiceCard, setShowInvoiceCard] = useState(false);

  const [paymentConfirmed, setPaymentConfirmed] = useState(false);
  const [qrCodeUrl, setQrCodeUrl] = useState<string | null>(null);
  const [invoice, setInvoice] = useState("");
  const [copiedToClipboard, setCopiedToClipboard] = useState(false);

  const walletContext = useContext(CashuWalletContext);

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

  const [showFailureModal, setShowFailureModal] = useState(false);
  const [failureText, setFailureText] = useState("");

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
    const fetchKeys = async () => {
      const { nsec: nsecForSender, npub: npubForSender } = await generateKeys();
      setRandomNpubForSender(npubForSender);
      setRandomNsecForSender(nsecForSender);
      const { nsec: nsecForReceiver, npub: npubForReceiver } =
        await generateKeys();
      setRandomNpubForReceiver(npubForReceiver);
      setRandomNsecForReceiver(nsecForReceiver);
    };

    fetchKeys();
  }, []);

  const sendPaymentAndContactMessage = async (
    pubkeyToReceiveMessage: string,
    message: string,
    isPayment?: boolean,
    isReceipt?: boolean,
    isDonation?: boolean,
    orderId?: string,
    paymentType?: string,
    paymentProof?: string,
    paymentMint?: string,
    messageAmount?: number,
  ) => {
    let decodedRandomPubkeyForSender = nip19.decode(randomNpubForSender);
    let decodedRandomPrivkeyForSender = nip19.decode(randomNsecForSender);
    let decodedRandomPubkeyForReceiver = nip19.decode(randomNpubForReceiver);
    let decodedRandomPrivkeyForReceiver = nip19.decode(randomNsecForReceiver);

    let messageSubject = "";
    let messageOptions = {};
    if (isPayment) {
      messageSubject = "order-payment";
      messageOptions = {
        isOrder: true,
        type: 3,
        orderAmount: messageAmount ? messageAmount : totalCost,
        orderId,
        paymentType,
        paymentProof,
        paymentMint,
      };
    } else if (isReceipt) {
      messageSubject = "order-info";
      messageOptions = {
        isOrder: true,
        type: 4,
        orderId,
        status: "confirmed",
      };
    } else if (isDonation) {
      messageSubject = "donation";
    } else if (orderId) {
      messageSubject = "order-info";
      messageOptions = {
        isOrder: true,
        type: 1,
        orderAmount: messageAmount ? messageAmount : undefined,
        orderId,
        productData,
        quantity: 1,
      };
    }

    let giftWrappedMessageEvent = await constructGiftWrappedEvent(
      decodedRandomPubkeyForSender.data as string,
      pubkeyToReceiveMessage,
      message,
      messageSubject,
      messageOptions,
    );
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

    if (isReceipt) {
      chatsContext.addNewlyCreatedMessageEvent(
        {
          ...giftWrappedMessageEvent,
          sig: "",
          read: false,
        },
        true,
      );
      addChatMessagesToCache([
        { ...giftWrappedMessageEvent, sig: "", read: false },
      ]);
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
      let additionalInfo = data["Required"];
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
          additionalInfo,
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
          additionalInfo,
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
      let additionalInfo = data["Required"];
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
          additionalInfo,
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
          additionalInfo,
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
    convertedPrice: number,
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
    additionalInfo?: string,
  ) => {
    try {
      setShowInvoiceCard(true);
      const wallet = new CashuWallet(new CashuMint(mints[0]));

      const { request: pr, quote: hash } =
        await wallet.createMintQuote(convertedPrice);

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
        convertedPrice,
        hash,
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
        additionalInfo ? additionalInfo : undefined,
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
    additionalInfo?: string,
  ) {
    while (true) {
      try {
        const proofs = await wallet.mintProofs(newPrice, hash);
        if (proofs) {
          await sendTokens(
            wallet,
            proofs,
            newPrice,
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
            additionalInfo ? additionalInfo : undefined,
          );
          await captureInvoicePaidmetric(hash, productData);
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
    totalPrice: number,
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
    additionalInfo?: string,
  ) => {
    let remainingProofs = proofs;
    let sellerToken;
    let donationToken;
    const sellerProfile = profileContext.profileData.get(
      pubkeyOfProductBeingSold,
    );
    const donationPercentage = sellerProfile?.content?.shopstr_donation || 2.1;
    const donationAmount = Math.ceil((totalPrice * donationPercentage) / 100);
    const sellerAmount = totalPrice - donationAmount;
    let sellerProofs: Proof[] = [];

    if (sellerAmount > 0) {
      const { keep, send } = await wallet.send(sellerAmount, remainingProofs, {
        includeFees: true,
      });
      sellerProofs = send;
      sellerToken = getEncodedToken({
        mint: mints[0],
        proofs: send,
      });
      remainingProofs = keep;
    }

    if (donationAmount > 0) {
      const { keep, send } = await wallet.send(
        donationAmount,
        remainingProofs,
        {
          includeFees: true,
        },
      );
      donationToken = getEncodedToken({
        mint: mints[0],
        proofs: send,
      });
      remainingProofs = keep;
    }

    const { title } = productData;
    let orderId = crypto.randomUUID();
    const paymentPreference =
      sellerProfile?.content?.payment_preference || "ecash";
    const lnurl = sellerProfile?.content?.lud16 || "";

    if (
      paymentPreference === "lightning" &&
      lnurl &&
      lnurl !== "" &&
      sellerProofs
    ) {
      const newAmount = Math.floor(sellerAmount * 0.98 - 2);
      const ln = new LightningAddress(lnurl);
      await wallet.loadMint();
      await ln.fetch();
      const invoice = await ln.requestInvoice({ satoshi: newAmount });
      const invoicePaymentRequest = invoice.paymentRequest;
      const meltQuote = await wallet.createMeltQuote(invoicePaymentRequest);
      if (meltQuote) {
        const meltQuoteTotal = meltQuote.amount + meltQuote.fee_reserve;
        const { keep, send } = await wallet.send(meltQuoteTotal, sellerProofs, {
          includeFees: true,
        });
        const meltResponse = await wallet.meltProofs(meltQuote, send);
        if (meltResponse.quote) {
          const meltAmount = meltResponse.quote.amount;
          const changeProofs = [...keep, ...meltResponse.change];
          const changeAmount =
            Array.isArray(changeProofs) && changeProofs.length > 0
              ? changeProofs.reduce(
                  (acc, current: Proof) => acc + current.amount,
                  0,
                )
              : 0;
          let paymentMessage = "";
          if (userNPub) {
            paymentMessage =
              "You have received a payment from " +
              userNPub +
              " for your " +
              title +
              " listing on Shopstr! Check your Lightning address (" +
              lnurl +
              ") for your sats.";
          } else {
            paymentMessage =
              "You have received a payment for your " +
              title +
              " listing on Shopstr! Check your Lightning address (" +
              lnurl +
              ") for your sats.";
          }
          await sendPaymentAndContactMessage(
            pubkeyOfProductBeingSold,
            paymentMessage,
            true,
            false,
            false,
            orderId,
            "lightning",
            invoicePaymentRequest,
            invoice.preimage ? invoice.preimage : invoice.paymentHash,
            meltAmount,
          );
          if (changeAmount >= 1 && changeProofs && changeProofs.length > 0) {
            let encodedChange = getEncodedToken({
              mint: mints[0],
              proofs: changeProofs,
            });
            const changeMessage = "Overpaid fee change: " + encodedChange;
            await sendPaymentAndContactMessage(
              pubkeyOfProductBeingSold,
              changeMessage,
              true,
              false,
              false,
              orderId,
              "ecash",
              JSON.stringify(changeProofs),
              mints[0],
              changeAmount,
            );
          }
        } else {
          const unusedProofs = [...keep, ...send, ...meltResponse.change];
          const unusedAmount =
            Array.isArray(unusedProofs) && unusedProofs.length > 0
              ? unusedProofs.reduce(
                  (acc, current: Proof) => acc + current.amount,
                  0,
                )
              : 0;
          const unusedToken = getEncodedToken({
            mint: mints[0],
            proofs: unusedProofs,
          });
          let paymentMessage = "";
          if (unusedToken && unusedProofs) {
            if (userNPub) {
              paymentMessage =
                "This is a Cashu token payment from " +
                userNPub +
                " for your " +
                title +
                " listing on Shopstr: " +
                unusedToken;
            } else {
              paymentMessage =
                "This is a Cashu token payment for your " +
                title +
                " listing on Shopstr: " +
                unusedToken;
            }
            await sendPaymentAndContactMessage(
              pubkeyOfProductBeingSold,
              paymentMessage,
              true,
              false,
              false,
              orderId,
              "ecash",
              JSON.stringify(unusedProofs),
              mints[0],
              unusedAmount,
            );
          }
        }
      }
    } else {
      let paymentMessage = "";
      if (sellerToken && sellerProofs) {
        if (userNPub) {
          paymentMessage =
            "This is a Cashu token payment from " +
            userNPub +
            " for your " +
            title +
            " listing on Shopstr: " +
            sellerToken;
        } else {
          paymentMessage =
            "This is a Cashu token payment for your " +
            title +
            " listing on Shopstr: " +
            sellerToken;
        }
        await sendPaymentAndContactMessage(
          pubkeyOfProductBeingSold,
          paymentMessage,
          true,
          false,
          false,
          orderId,
          "ecash",
          JSON.stringify(sellerProofs),
          mints[0],
          sellerAmount,
        );
      }
    }
    let donationMessage = "";
    if (donationToken) {
      donationMessage = "Sale donation: " + donationToken;
      await sendPaymentAndContactMessage(
        "a37118a4888e02d28e8767c08caaf73b49abdac391ad7ff18a304891e416dc33",
        donationMessage,
        false,
        false,
        true,
      );
    }

    if (additionalInfo) {
      let additionalMessage =
        "Additional customer information: " + additionalInfo;
      await sendPaymentAndContactMessage(
        pubkeyOfProductBeingSold,
        additionalMessage,
        false,
        false,
        false,
        orderId,
      );
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
          false,
          false,
          orderId,
        );
        if (userPubkey) {
          await sendPaymentAndContactMessage(
            userPubkey,
            receiptMessage,
            false,
            true,
            false,
            orderId,
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
          false,
          false,
          orderId,
        );
        if (userPubkey) {
          await sendPaymentAndContactMessage(
            userPubkey,
            receiptMessage,
            false,
            true,
            false,
            orderId,
          );
        }
      }
    } else if (selectedSize) {
      let contactMessage = "This purchase was for a size " + selectedSize + ".";
      await sendPaymentAndContactMessage(
        pubkeyOfProductBeingSold,
        contactMessage,
        false,
        false,
        false,
        orderId,
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
          false,
          orderId,
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
        false,
        orderId,
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
    additionalInfo?: string,
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
      const deletedEventIds = [
        ...new Set([
          ...walletContext.proofEvents
            .filter((event) =>
              event.proofs.some((proof: Proof) =>
                filteredProofs.some(
                  (filteredProof) =>
                    JSON.stringify(proof) === JSON.stringify(filteredProof),
                ),
              ),
            )
            .map((event) => event.id),
          ...walletContext.proofEvents
            .filter((event) =>
              event.proofs.some((proof: Proof) =>
                keep.some(
                  (keepProof) =>
                    JSON.stringify(proof) === JSON.stringify(keepProof),
                ),
              ),
            )
            .map((event) => event.id),
          ...walletContext.proofEvents
            .filter((event) =>
              event.proofs.some((proof: Proof) =>
                send.some(
                  (sendProof) =>
                    JSON.stringify(proof) === JSON.stringify(sendProof),
                ),
              ),
            )
            .map((event) => event.id),
        ]),
      ];
      await sendTokens(
        wallet,
        send,
        price,
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
        additionalInfo ? additionalInfo : undefined,
      )
        .then(() => {
          captureCashuPaidMetric(productData);
        })
        .catch((error) => {
          console.error(error);
        });
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
      await publishProofEvent(
        mints[0],
        changeProofs && changeProofs.length >= 1 ? changeProofs : [],
        "out",
        price.toString(),
        passphrase,
        deletedEventIds,
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
                    <h3 className="mt-3 text-center text-lg font-medium leading-6 text-gray-900">
                      Don&apos;t refresh or close the page until the payment has
                      been confirmed!
                    </h3>
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
                    let price = totalCost;
                    if (!currencySelection.hasOwnProperty(currency)) {
                      throw new Error(
                        `${currency} is not a supported currency.`,
                      );
                    } else if (
                      currencySelection.hasOwnProperty(currency) &&
                      currency.toLowerCase() !== "sats" &&
                      currency.toLowerCase() !== "sat"
                    ) {
                      try {
                        const currencyData = {
                          amount: price,
                          currency: currency,
                        };
                        const numSats =
                          await fiat.getSatoshiValue(currencyData);
                        price = Math.round(numSats);
                      } catch (err) {
                        console.error("ERROR", err);
                      }
                    } else if (currency.toLowerCase() === "btc") {
                      price = price * 100000000;
                    }
                    if (isCashuPayment) {
                      await handleCashuPayment(price);
                    } else {
                      await handleLightningPayment(price);
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
                    let price = totalCost;
                    if (!currencySelection.hasOwnProperty(currency)) {
                      throw new Error(
                        `${currency} is not a supported currency.`,
                      );
                    } else if (
                      currencySelection.hasOwnProperty(currency) &&
                      currency.toLowerCase() !== "sats" &&
                      currency.toLowerCase() !== "sat"
                    ) {
                      try {
                        const currencyData = {
                          amount: price,
                          currency: currency,
                        };
                        const numSats =
                          await fiat.getSatoshiValue(currencyData);
                        price = Math.round(numSats);
                      } catch (err) {
                        console.error("ERROR", err);
                      }
                    } else if (currency.toLowerCase() === "btc") {
                      price = price * 100000000;
                    }
                    if (isCashuPayment) {
                      await handleCashuPayment(price);
                    } else {
                      await handleLightningPayment(price);
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
        requiredInfo={required !== "" ? required : undefined}
      />

      <ContactForm
        showContactModal={showContactModal}
        handleToggleContactModal={handleToggleContactModal}
        handleContactSubmit={handleContactSubmit}
        onContactSubmit={onContactSubmit}
        contactControl={contactControl}
        requiredInfo={required !== "" ? required : undefined}
      />

      <SignInModal isOpen={isOpen} onClose={onClose} />
      <RequestPassphraseModal
        passphrase={passphrase}
        setCorrectPassphrase={setPassphrase}
        isOpen={enterPassphrase}
        setIsOpen={setEnterPassphrase}
        onCancelRouteTo={`/${id}`}
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
