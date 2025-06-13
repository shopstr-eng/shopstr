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
  CurrencyDollarIcon,
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
  publishProofEvent,
  generateKeys,
} from "@/utils/nostr/nostr-helper-functions";
import { addChatMessagesToCache } from "@/utils/nostr/cache-service";
import { LightningAddress } from "@getalby/lightning-tools";
import QRCode from "qrcode";
import { v4 as uuidv4 } from "uuid";
import { nip19 } from "nostr-tools";
import { ProductData } from "@/utils/parsers/product-parser-functions";
import {
  DisplayCostBreakdown,
  formatWithCommas,
} from "./utility-components/display-monetary-info";
import { SHOPSTRBUTTONCLASSNAMES } from "@/utils/STATIC-VARIABLES";
import SignInModal from "./sign-in/SignInModal";
import currencySelection from "../public/currencySelection.json";
import FailureModal from "@/components/utility-components/failure-modal";
import ShippingForm from "./shipping-form";
import ContactForm from "./contact-form";
import {
  NostrContext,
  SignerContext,
} from "@/components/utility-components/nostr-context-provider";
import { ShippingFormData, ContactFormData } from "@/utils/types/types";

export default function ProductInvoiceCard({
  productData,
  setInvoiceIsPaid,
  setInvoiceGenerationFailed,
  setCashuPaymentSent,
  setCashuPaymentFailed,
  selectedSize,
}: {
  productData: ProductData;
  setFiatOrderIsPlaced?: (fiatOrderIsPlaced: boolean) => void;
  setInvoiceIsPaid?: (invoiceIsPaid: boolean) => void;
  setInvoiceGenerationFailed?: (invoiceGenerationFailed: boolean) => void;
  setCashuPaymentSent?: (cashuPaymentSent: boolean) => void;
  setCashuPaymentFailed?: (cashuPaymentFailed: boolean) => void;
  selectedSize?: string;
}) {
  const router = useRouter();
  const { mints, tokens, history } = getLocalStorageData();
  const {
    pubkey: userPubkey,
    npub: userNPub,
    isLoggedIn,
    signer,
  } = useContext(SignerContext);
  const chatsContext = useContext(ChatsContext);
  const profileContext = useContext(ProfileMapContext);

  const { nostr } = useContext(NostrContext);

  const [showInvoiceCard, setShowInvoiceCard] = useState(false);

  const [paymentConfirmed, setPaymentConfirmed] = useState(false);
  const [qrCodeUrl, setQrCodeUrl] = useState<string | null>(null);
  const [invoice, setInvoice] = useState("");
  const [copiedToClipboard, setCopiedToClipboard] = useState(false);

  const [orderConfirmed, setOrderConfirmed] = useState(false);

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
  const [isFiatPayment, setIsFiatPayment] = useState(false);

  const [showPurchaseTypeOption, setShowPurchaseTypeOption] = useState(false);
  const [needsShippingInfo, setNeedsShippingInfo] = useState(false);

  const [fiatPaymentOptions, setFiatPaymentOptions] = useState([]);
  const [showFiatTypeOption, setShowFiatTypeOption] = useState(false);
  const [selectedFiatOption, setSelectedFiatOption] = useState("");

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

  useEffect(() => {
    const sellerProfile = profileContext.profileData.get(productData.pubkey);
    const fiatOptions = sellerProfile?.content?.fiat_options || [];
    setFiatPaymentOptions(fiatOptions);
  }, [productData.pubkey, profileContext.profileData]);

  const sendPaymentAndContactMessage = async (
    pubkeyToReceiveMessage: string,
    message: string,
    isPayment?: boolean,
    isReceipt?: boolean,
    isDonation?: boolean,
    orderId?: string,
    paymentType?: string,
    paymentReference?: string,
    paymentProof?: string,
    messageAmount?: number
  ) => {
    const decodedRandomPubkeyForSender = nip19.decode(randomNpubForSender);
    const decodedRandomPrivkeyForSender = nip19.decode(randomNsecForSender);
    const decodedRandomPubkeyForReceiver = nip19.decode(randomNpubForReceiver);
    const decodedRandomPrivkeyForReceiver = nip19.decode(randomNsecForReceiver);

    let messageSubject = "";
    let messageOptions = {};
    if (isPayment) {
      messageSubject = "order-payment";
      messageOptions = {
        isOrder: true,
        type: 3,
        orderAmount: messageAmount ? messageAmount : productData.totalCost,
        orderId,
        productData,
        paymentType,
        paymentReference,
        paymentProof,
      };
    } else if (isReceipt) {
      messageSubject = "order-info";
      messageOptions = {
        isOrder: true,
        type: 4,
        orderId,
        productData,
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

    const giftWrappedMessageEvent = await constructGiftWrappedEvent(
      decodedRandomPubkeyForSender.data as string,
      pubkeyToReceiveMessage,
      message,
      messageSubject,
      messageOptions
    );
    const sealedEvent = await constructMessageSeal(
      signer!,
      giftWrappedMessageEvent,
      decodedRandomPubkeyForSender.data as string,
      pubkeyToReceiveMessage,
      decodedRandomPrivkeyForSender.data as Uint8Array
    );
    const giftWrappedEvent = await constructMessageGiftWrap(
      sealedEvent,
      decodedRandomPubkeyForReceiver.data as string,
      decodedRandomPrivkeyForReceiver.data as Uint8Array,
      pubkeyToReceiveMessage
    );
    await sendGiftWrappedMessageEvent(giftWrappedEvent);

    if (isReceipt) {
      chatsContext.addNewlyCreatedMessageEvent(
        {
          ...giftWrappedMessageEvent,
          sig: "",
          read: false,
        },
        true
      );
      addChatMessagesToCache([
        { ...giftWrappedMessageEvent, sig: "", read: false },
      ]);
    }
  };

  const validatePaymentData = (
    price: number,
    data?: ShippingFormData | ContactFormData
  ) => {
    if (price < 1) {
      throw new Error("Payment amount must be greater than 0 sats");
    }

    if (data) {
      // Type guard to check which form data we received
      if ("Name" in data) {
        const shippingData = data as ShippingFormData;
        if (
          !shippingData.Name?.trim() ||
          !shippingData.Address?.trim() ||
          !shippingData.City?.trim() ||
          !shippingData["Postal Code"]?.trim() ||
          !shippingData["State/Province"]?.trim() ||
          !shippingData.Country?.trim()
        ) {
          throw new Error("Required shipping fields are missing");
        }
      } else if ("Contact" in data) {
        const contactData = data as ContactFormData;
        if (
          !contactData.Contact?.trim() ||
          !contactData["Contact Type"]?.trim() ||
          !contactData.Instructions?.trim()
        ) {
          throw new Error("Required contact fields are missing");
        }
      }
      if ("Required" in data && data["Required"] !== "") {
        if (!data["Required"]?.trim()) {
          throw new Error("Required fields are missing");
        }
      }
    }
  };

  const onShippingSubmit = async (data: { [x: string]: string }) => {
    try {
      let price = productData.totalCost;
      if (
        !currencySelection.hasOwnProperty(productData.currency.toUpperCase())
      ) {
        throw new Error(`${productData.currency} is not a supported currency.`);
      } else if (
        currencySelection.hasOwnProperty(productData.currency.toUpperCase()) &&
        productData.currency.toLowerCase() !== "sats" &&
        productData.currency.toLowerCase() !== "sat"
      ) {
        try {
          const currencyData = {
            amount: price,
            currency: productData.currency,
          };
          const numSats = await fiat.getSatoshiValue(currencyData);
          price = Math.round(numSats);
        } catch (err) {
          console.error("ERROR", err);
        }
      } else if (productData.currency.toLowerCase() === "btc") {
        price = price * 100000000;
      }

      if (price < 1) {
        throw new Error("Listing price is less than 1 sat.");
      }

      const shippingName = data["Name"];
      const shippingAddress = data["Address"];
      const shippingUnitNo = data["Unit"];
      const shippingCity = data["City"];
      const shippingPostalCode = data["Postal Code"];
      const shippingState = data["State/Province"];
      const shippingCountry = data["Country"];
      const additionalInfo = data["Required"];
      setShowShippingModal(false);
      if (isFiatPayment) {
        await handleFiatPayment(
          price,
          shippingName,
          shippingAddress,
          shippingUnitNo,
          shippingCity,
          shippingPostalCode,
          shippingState,
          shippingCountry,
          undefined,
          undefined,
          undefined,
          additionalInfo
        );
      } else if (isCashuPayment) {
        await handleCashuPayment(
          price,
          shippingName,
          shippingAddress,
          shippingUnitNo,
          shippingCity,
          shippingPostalCode,
          shippingState,
          shippingCountry,
          undefined,
          undefined,
          undefined,
          additionalInfo
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
          undefined,
          undefined,
          undefined,
          additionalInfo
        );
      }
    } catch (error) {
      console.error(error);
      if (setCashuPaymentFailed) {
        setCashuPaymentFailed(true);
      }
    }
  };

  const onContactSubmit = async (data: { [x: string]: string }) => {
    try {
      let price = productData.totalCost;
      if (
        !currencySelection.hasOwnProperty(productData.currency.toUpperCase())
      ) {
        throw new Error(`${productData.currency} is not a supported currency.`);
      } else if (
        currencySelection.hasOwnProperty(productData.currency.toUpperCase()) &&
        productData.currency.toLowerCase() !== "sats" &&
        productData.currency.toLowerCase() !== "sat"
      ) {
        try {
          const currencyData = {
            amount: price,
            currency: productData.currency,
          };
          const numSats = await fiat.getSatoshiValue(currencyData);
          price = Math.round(numSats);
        } catch (err) {
          console.error("ERROR", err);
        }
      } else if (productData.currency.toLowerCase() === "btc") {
        price = price * 100000000;
      }

      if (price < 1) {
        throw new Error("Listing price is less than 1 sat.");
      }

      const contact = data["Contact"];
      const contactType = data["Contact Type"];
      const contactInstructions = data["Instructions"];
      const additionalInfo = data["Required"];
      setShowContactModal(false);
      if (isFiatPayment) {
        await handleFiatPayment(
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
          additionalInfo
        );
      } else if (isCashuPayment) {
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
          additionalInfo
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
          additionalInfo
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

  const handleFiatPayment = async (
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
    additionalInfo?: string
  ) => {
    if (
      shippingName ||
      shippingAddress ||
      shippingCity ||
      shippingPostalCode ||
      shippingState ||
      shippingCountry
    ) {
      validatePaymentData(convertedPrice, {
        Name: shippingName || "",
        Address: shippingAddress || "",
        Unit: shippingUnitNo || "",
        City: shippingCity || "",
        "Postal Code": shippingPostalCode || "",
        "State/Province": shippingState || "",
        Country: shippingCountry || "",
        Required: additionalInfo || "",
      });
    } else if (contact || contactType || contactInstructions) {
      validatePaymentData(convertedPrice, {
        Contact: contact || "",
        "Contact Type": contactType || "",
        Instructions: contactInstructions || "",
        Required: additionalInfo || "",
      });
    } else {
      validatePaymentData(convertedPrice);
    }
    const userPubkey = await signer?.getPubKey?.();
    const userNPub = userPubkey ? nip19.npubEncode(userPubkey) : undefined;
    const title = productData.title;
    const pubkey = productData.pubkey;
    const required = productData.required;
    const orderId = uuidv4();

    let paymentMessage = "";
    if (userNPub) {
      paymentMessage =
        "You have received an order from " +
        userNPub +
        " for your " +
        title +
        " listing on Shopstr! Message them with your " +
        selectedFiatOption +
        "payment details to finalize.";
    } else {
      paymentMessage =
        "You have received an order for your " +
        title +
        " listing on Shopstr! Message them with your " +
        selectedFiatOption +
        "payment details to finalize.";
    }
    await sendPaymentAndContactMessage(
      pubkey,
      paymentMessage,
      true,
      false,
      false,
      orderId,
      "fiat",
      "",
      ""
    );

    if (required && required !== "") {
      if (additionalInfo) {
        const additionalMessage =
          "Additional customer information: " + additionalInfo;
        await sendPaymentAndContactMessage(
          pubkey,
          additionalMessage,
          false,
          false,
          false,
          orderId
        );
      }
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
        productData.shippingType === "Added Cost" ||
        productData.shippingType === "Free" ||
        (productData.shippingType === "Free/Pickup" &&
          needsShippingInfo === true)
      ) {
        let contactMessage = "";
        if (!shippingUnitNo && !productData.selectedSize) {
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
        } else if (!shippingUnitNo && productData.selectedSize) {
          contactMessage =
            "Please ship the product in a size " +
            productData.selectedSize +
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
        } else if (shippingUnitNo && !productData.selectedSize) {
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
        } else if (shippingUnitNo && productData.selectedSize) {
          contactMessage =
            "Please ship the product in a size " +
            productData.selectedSize +
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
          false,
          false,
          orderId
        );
        if (userPubkey) {
          const receiptMessage =
            "Your order for " +
            productData.title +
            " was processed successfully! You should be receiving payment information from " +
            nip19.npubEncode(productData.pubkey) +
            " as soon as they review your oder.";
          await sendPaymentAndContactMessage(
            userPubkey,
            receiptMessage,
            false,
            true,
            false,
            orderId
          );
        }
      } else if (
        productData.shippingType === "N/A" ||
        productData.shippingType === "Pickup" ||
        (productData.shippingType === "Free/Pickup" &&
          needsShippingInfo === false)
      ) {
        let contactMessage;
        let receiptMessage;
        if (productData.selectedSize) {
          contactMessage =
            "To finalize the sale of your " +
            title +
            " listing in a size " +
            productData.selectedSize +
            " on Shopstr, please contact " +
            contact +
            " over " +
            contactType +
            " using the following instructions: " +
            contactInstructions;
          receiptMessage =
            "Your order for " +
            productData.title +
            "in a size " +
            productData.selectedSize +
            " was processed successfully! You should be receiving payment information from " +
            nip19.npubEncode(productData.pubkey) +
            " as soon as they review your order.";
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
            " was processed successfully! You should be receiving payment information from " +
            nip19.npubEncode(productData.pubkey) +
            " as soon as they review your order.";
        }
        await sendPaymentAndContactMessage(
          pubkey,
          contactMessage,
          false,
          false,
          false,
          orderId
        );
        if (userPubkey) {
          await sendPaymentAndContactMessage(
            userPubkey,
            receiptMessage,
            false,
            true,
            false,
            orderId
          );
        }
      }
    } else if (productData.selectedSize) {
      const contactMessage =
        "This purchase was for a size " + productData.selectedSize + ".";
      await sendPaymentAndContactMessage(
        pubkey,
        contactMessage,
        false,
        false,
        false,
        orderId
      );
      if (userPubkey) {
        const receiptMessage =
          "Thank you for your purchase of " +
          title +
          " in a size " +
          productData.selectedSize +
          " from " +
          nip19.npubEncode(productData.pubkey) +
          ".";
        await sendPaymentAndContactMessage(
          userPubkey,
          receiptMessage,
          false,
          true,
          false,
          orderId
        );
      }
    } else if (userPubkey) {
      const receiptMessage =
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
        orderId
      );
    }
    setOrderConfirmed(true);
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
    additionalInfo?: string
  ) => {
    try {
      if (
        shippingName ||
        shippingAddress ||
        shippingCity ||
        shippingPostalCode ||
        shippingState ||
        shippingCountry
      ) {
        validatePaymentData(convertedPrice, {
          Name: shippingName || "",
          Address: shippingAddress || "",
          Unit: shippingUnitNo || "",
          City: shippingCity || "",
          "Postal Code": shippingPostalCode || "",
          "State/Province": shippingState || "",
          Country: shippingCountry || "",
          Required: additionalInfo || "",
        });
      } else if (contact || contactType || contactInstructions) {
        validatePaymentData(convertedPrice, {
          Contact: contact || "",
          "Contact Type": contactType || "",
          Instructions: contactInstructions || "",
          Required: additionalInfo || "",
        });
      } else {
        validatePaymentData(convertedPrice);
      }

      setShowInvoiceCard(true);
      const wallet = new CashuWallet(new CashuMint(mints[0]!));

      const { request: pr, quote: hash } =
        await wallet.createMintQuote(convertedPrice);

      setInvoice(pr);

      QRCode.toDataURL(pr)
        .then((url: string) => {
          setQrCodeUrl(url);
        })
        .catch((err: unknown) => {
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
        additionalInfo ? additionalInfo : undefined
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
    additionalInfo?: string
  ) {
    let retryCount = 0;
    const maxRetries = 30; // Maximum 30 retries (about 1 minute)

    while (retryCount < maxRetries) {
      try {
        // First check if the quote has been paid
        const quoteState = await wallet.checkMintQuote(hash);

        if (quoteState.state === "PAID") {
          // Quote is paid, try to mint proofs
          try {
            const proofs = await wallet.mintProofs(newPrice, hash);
            if (proofs && proofs.length > 0) {
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
                additionalInfo ? additionalInfo : undefined
              );
              setPaymentConfirmed(true);
              setQrCodeUrl(null);
              if (setInvoiceIsPaid) {
                setInvoiceIsPaid(true);
              }
              break;
            }
          } catch (mintError) {
            // If minting fails but quote is paid, it might be already issued
            if (
              mintError instanceof Error &&
              mintError.message.includes("issued")
            ) {
              // Quote was already processed, consider it successful
              setPaymentConfirmed(true);
              setQrCodeUrl(null);
              if (setInvoiceIsPaid) {
                setInvoiceIsPaid(true);
              }
              setFailureText(
                "Payment was received but your connection dropped! Please check your wallet balance."
              );
              setShowFailureModal(true);
              break;
            }
            throw mintError;
          }
        } else if (quoteState.state === "UNPAID") {
          // Quote not paid yet, continue waiting
          retryCount++;
          await new Promise((resolve) => setTimeout(resolve, 2100));
          continue;
        } else if (quoteState.state === "ISSUED") {
          // Quote was already processed successfully
          setPaymentConfirmed(true);
          setQrCodeUrl(null);
          if (setInvoiceIsPaid) {
            setInvoiceIsPaid(true);
          }
          setFailureText(
            "Payment was received but your connection dropped! Please check your wallet balance."
          );
          setShowFailureModal(true);
          break;
        }
      } catch (error) {
        console.error("Invoice check error:", error);
        retryCount++;

        if (error instanceof TypeError) {
          setShowInvoiceCard(false);
          setInvoice("");
          setQrCodeUrl(null);
          setFailureText(
            "Failed to validate invoice! Change your mint in settings and/or please try again."
          );
          setShowFailureModal(true);
          break;
        }

        // If we've exceeded max retries, show error
        if (retryCount >= maxRetries) {
          setShowInvoiceCard(false);
          setInvoice("");
          setQrCodeUrl(null);
          setFailureText(
            "Payment timed out! Please check your wallet balance or try again."
          );
          setShowFailureModal(true);
          break;
        }

        await new Promise((resolve) => setTimeout(resolve, 2100));
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
    additionalInfo?: string
  ) => {
    let remainingProofs = proofs;
    let sellerToken;
    let donationToken;
    const sellerProfile = profileContext.profileData.get(productData.pubkey);
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
        mint: mints[0]!,
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
        }
      );
      donationToken = getEncodedToken({
        mint: mints[0]!,
        proofs: send,
      });
      remainingProofs = keep;
    }

    const orderId = uuidv4();
    const paymentPreference =
      sellerProfile?.content?.payment_preference || "ecash";
    const lnurl = sellerProfile?.content?.lud16 || "";

    if (
      paymentPreference === "lightning" &&
      lnurl &&
      lnurl !== "" &&
      !lnurl.contains("@zeuspay.com") &&
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
                  0
                )
              : 0;
          let paymentMessage = "";
          if (userNPub) {
            paymentMessage =
              "You have received a payment from " +
              userNPub +
              " for your " +
              productData.title +
              " listing on Shopstr! Check your Lightning address (" +
              lnurl +
              ") for your sats.";
          } else {
            paymentMessage =
              "You have received a payment for your " +
              productData.title +
              " listing on Shopstr! Check your Lightning address (" +
              lnurl +
              ") for your sats.";
          }
          await sendPaymentAndContactMessage(
            productData.pubkey,
            paymentMessage,
            true,
            false,
            false,
            orderId,
            "lightning",
            invoicePaymentRequest,
            invoice.preimage ? invoice.preimage : invoice.paymentHash,
            meltAmount
          );
          if (changeAmount >= 1 && changeProofs && changeProofs.length > 0) {
            const encodedChange = getEncodedToken({
              mint: mints[0]!,
              proofs: changeProofs,
            });
            const changeMessage = "Overpaid fee change: " + encodedChange;
            await sendPaymentAndContactMessage(
              productData.pubkey,
              changeMessage,
              true,
              false,
              false,
              orderId,
              "ecash",
              mints[0],
              JSON.stringify(changeProofs),
              changeAmount
            );
          }
        } else {
          const unusedProofs = [...keep, ...send, ...meltResponse.change];
          const unusedAmount =
            Array.isArray(unusedProofs) && unusedProofs.length > 0
              ? unusedProofs.reduce(
                  (acc, current: Proof) => acc + current.amount,
                  0
                )
              : 0;
          const unusedToken = getEncodedToken({
            mint: mints[0]!,
            proofs: unusedProofs,
          });
          let paymentMessage = "";
          if (unusedToken && unusedProofs) {
            if (userNPub) {
              paymentMessage =
                "This is a Cashu token payment from " +
                userNPub +
                " for your " +
                productData.title +
                " listing on Shopstr: " +
                unusedToken;
            } else {
              paymentMessage =
                "This is a Cashu token payment for your " +
                productData.title +
                " listing on Shopstr: " +
                unusedToken;
            }
            await sendPaymentAndContactMessage(
              productData.pubkey,
              paymentMessage,
              true,
              false,
              false,
              orderId,
              "ecash",
              mints[0],
              JSON.stringify(unusedProofs),
              unusedAmount
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
            productData.title +
            " listing on Shopstr: " +
            sellerToken;
        } else {
          paymentMessage =
            "This is a Cashu token payment for your " +
            productData.title +
            " listing on Shopstr: " +
            sellerToken;
        }
        await sendPaymentAndContactMessage(
          productData.pubkey,
          paymentMessage,
          true,
          false,
          false,
          orderId,
          "ecash",
          mints[0],
          JSON.stringify(sellerProofs),
          sellerAmount
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
        true
      );
    }

    if (additionalInfo) {
      const additionalMessage =
        "Additional customer information: " + additionalInfo;
      await sendPaymentAndContactMessage(
        productData.pubkey,
        additionalMessage,
        false,
        false,
        false,
        orderId
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
        const receiptMessage =
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
          productData.pubkey,
          contactMessage,
          false,
          false,
          false,
          orderId
        );
        if (userPubkey) {
          await sendPaymentAndContactMessage(
            userPubkey,
            receiptMessage,
            false,
            true,
            false,
            orderId
          );
        }
      } else if (contact && contactType && contactInstructions) {
        let contactMessage;
        let receiptMessage;
        if (selectedSize) {
          contactMessage =
            "To finalize the sale of your " +
            productData.title +
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
            productData.title +
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
          productData.pubkey,
          contactMessage,
          false,
          false,
          false,
          orderId
        );
        if (userPubkey) {
          await sendPaymentAndContactMessage(
            userPubkey,
            receiptMessage,
            false,
            true,
            false,
            orderId
          );
        }
      }
    } else if (selectedSize) {
      const contactMessage =
        "This purchase was for a size " + selectedSize + ".";
      await sendPaymentAndContactMessage(
        productData.pubkey,
        contactMessage,
        false,
        false,
        false,
        orderId
      );
      if (userPubkey) {
        const receiptMessage =
          "Thank you for your purchase of " +
          productData.title +
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
          orderId
        );
      }
    } else if (userPubkey) {
      const receiptMessage =
        "Thank you for your purchase of " +
        productData.title +
        " from " +
        nip19.npubEncode(productData.pubkey) +
        ".";
      await sendPaymentAndContactMessage(
        userPubkey,
        receiptMessage,
        false,
        true,
        false,
        orderId
      );
    }
  };

  const handleCopyInvoice = () => {
    navigator.clipboard.writeText(invoice);
    setCopiedToClipboard(true);
    setTimeout(() => {
      setCopiedToClipboard(false);
    }, 2100);
  };

  const handleSendMessage = (pubkeyToOpenChatWith: string) => {
    if (!isLoggedIn) {
      onOpen();
      return;
    }
    router.push({
      pathname: "/orders",
      query: { pk: nip19.npubEncode(pubkeyToOpenChatWith), isInquiry: true },
    });
  };

  const formattedTotalCost = formatWithCommas(
    productData.totalCost,
    productData.currency
  );

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
    additionalInfo?: string
  ) => {
    try {
      if (!mints || mints.length === 0) {
        throw new Error("No Cashu mint available");
      }

      if (!walletContext) {
        throw new Error("Wallet context not available");
      }

      if (
        shippingName ||
        shippingAddress ||
        shippingCity ||
        shippingPostalCode ||
        shippingState ||
        shippingCountry
      ) {
        validatePaymentData(price, {
          Name: shippingName || "",
          Address: shippingAddress || "",
          Unit: shippingUnitNo || "",
          City: shippingCity || "",
          "Postal Code": shippingPostalCode || "",
          "State/Province": shippingState || "",
          Country: shippingCountry || "",
          Required: additionalInfo || "",
        });
      } else if (contact || contactType || contactInstructions) {
        validatePaymentData(price, {
          Contact: contact || "",
          "Contact Type": contactType || "",
          Instructions: contactInstructions || "",
          Required: additionalInfo || "",
        });
      } else {
        validatePaymentData(price);
      }

      const mint = new CashuMint(mints[0]!);
      const wallet = new CashuWallet(mint);
      const mintKeySetIds = await wallet.getKeySets();
      const filteredProofs = tokens.filter(
        (p: Proof) =>
          mintKeySetIds?.some((keysetId: MintKeyset) => keysetId.id === p.id)
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
                    JSON.stringify(proof) === JSON.stringify(filteredProof)
                )
              )
            )
            .map((event) => event.id),
          ...walletContext.proofEvents
            .filter((event) =>
              event.proofs.some((proof: Proof) =>
                keep.some(
                  (keepProof) =>
                    JSON.stringify(proof) === JSON.stringify(keepProof)
                )
              )
            )
            .map((event) => event.id),
          ...walletContext.proofEvents
            .filter((event) =>
              event.proofs.some((proof: Proof) =>
                send.some(
                  (sendProof) =>
                    JSON.stringify(proof) === JSON.stringify(sendProof)
                )
              )
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
        additionalInfo ? additionalInfo : undefined
      );
      const changeProofs = keep;
      const remainingProofs = tokens.filter(
        (p: Proof) =>
          mintKeySetIds?.some((keysetId: MintKeyset) => keysetId.id !== p.id)
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
        ])
      );
      await publishProofEvent(
        nostr!,
        signer!,
        mints[0]!,
        changeProofs && changeProofs.length >= 1 ? changeProofs : [],
        "out",
        price.toString(),
        deletedEventIds
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
              handleSendMessage(productData.pubkey);
            }}
            startContent={
              <EnvelopeIcon className="h-6 w-6 hover:text-yellow-500" />
            }
          >
            Message
          </Button>
          {fiatPaymentOptions.length > 0 && (
            <Button
              type="submit"
              className={SHOPSTRBUTTONCLASSNAMES + " mt-3"}
              onClick={() => {
                if (!isLoggedIn) {
                  onOpen();
                  return;
                }
                if (
                  randomNsecForReceiver !== "" &&
                  randomNpubForSender !== ""
                ) {
                  if (
                    productData.shippingType === "Free" ||
                    productData.shippingType === "Added Cost"
                  ) {
                    setIsFiatPayment(true);
                    setNeedsShippingInfo(true);
                    setShowFiatTypeOption(true);
                  } else if (
                    productData.shippingType === "N/A" ||
                    productData.shippingType === "Pickup"
                  ) {
                    setIsFiatPayment(true);
                    setNeedsShippingInfo(false);
                    setShowFiatTypeOption(true);
                  } else if (productData.shippingType === "Free/Pickup") {
                    setIsFiatPayment(true);
                    setShowFiatTypeOption(true);
                  } else {
                    setIsFiatPayment(true);
                    setNeedsShippingInfo(false);
                    setShowFiatTypeOption(true);
                  }
                }
              }}
              startContent={
                <CurrencyDollarIcon className="h-6 w-6 hover:text-yellow-500" />
              }
            >
              Pay with Fiat
            </Button>
          )}
          <Button
            type="submit"
            className={SHOPSTRBUTTONCLASSNAMES + " mt-3"}
            onClick={() => {
              if (!isLoggedIn) {
                onOpen();
                return;
              }
              if (randomNsecForReceiver !== "" && randomNpubForSender !== "") {
                if (
                  productData.shippingType === "Free" ||
                  productData.shippingType === "Added Cost"
                ) {
                  setIsCashuPayment(false);
                  setNeedsShippingInfo(true);
                  setShowPurchaseTypeOption(true);
                } else if (
                  productData.shippingType === "N/A" ||
                  productData.shippingType === "Pickup"
                ) {
                  setIsCashuPayment(false);
                  setNeedsShippingInfo(false);
                  setShowPurchaseTypeOption(true);
                } else if (productData.shippingType === "Free/Pickup") {
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
              if (!isLoggedIn) {
                onOpen();
                return;
              }
              if (randomNsecForReceiver !== "" && randomNpubForSender !== "") {
                if (
                  productData.shippingType === "Free" ||
                  productData.shippingType === "Added Cost"
                ) {
                  setIsCashuPayment(true);
                  setNeedsShippingInfo(true);
                  setShowPurchaseTypeOption(true);
                } else if (
                  productData.shippingType === "N/A" ||
                  productData.shippingType === "Pickup"
                ) {
                  setIsCashuPayment(true);
                  setNeedsShippingInfo(false);
                  setShowPurchaseTypeOption(true);
                } else if (productData.shippingType === "Free/Pickup") {
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
                    <h3 className="mt-3 text-center text-lg font-medium leading-6 text-gray-900 text-light-text dark:text-dark-text">
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
                              invoice.length
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

      {orderConfirmed && (
        <div className="flex flex-col items-center justify-center">
          <h3 className="mt-3 text-center text-lg font-medium leading-6 text-gray-900">
            Order confirmed!
          </h3>
          <Image
            alt="Payment Confirmed"
            className="object-cover"
            src="../payment-confirmed.gif"
            width={350}
          />
        </div>
      )}

      <Modal
        backdrop="blur"
        isOpen={showFiatTypeOption}
        onClose={() => {
          setShowFiatTypeOption(false);
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
            Select your fiat payment preference:
          </ModalHeader>
          <ModalBody className="flex flex-col overflow-hidden">
            <div className="flex items-center justify-center">
              <Select
                label="Fiat Payment Options"
                className="max-w-xs"
                onChange={(e) => {
                  setSelectedFiatOption(e.target.value);
                  if (productData.shippingType === "Free/Pickup") {
                    setShowShippingOption(true);
                  } else {
                    setShowPurchaseTypeOption(true);
                  }
                  setShowFiatTypeOption(false);
                }}
              >
                {fiatPaymentOptions &&
                  fiatPaymentOptions.map((option) => (
                    <SelectItem
                      key={option}
                      value={option}
                      className="text-light-text dark:text-dark-text"
                    >
                      {option}
                    </SelectItem>
                  ))}
              </Select>
            </div>
          </ModalBody>
        </ModalContent>
      </Modal>

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
                    let price = productData.totalCost;
                    if (
                      !currencySelection.hasOwnProperty(
                        productData.currency.toUpperCase()
                      )
                    ) {
                      throw new Error(
                        `${productData.currency} is not a supported currency.`
                      );
                    } else if (
                      currencySelection.hasOwnProperty(
                        productData.currency.toUpperCase()
                      ) &&
                      productData.currency.toLowerCase() !== "sats" &&
                      productData.currency.toLowerCase() !== "sat"
                    ) {
                      try {
                        const currencyData = {
                          amount: price,
                          currency: productData.currency,
                        };
                        const numSats =
                          await fiat.getSatoshiValue(currencyData);
                        price = Math.round(numSats);
                      } catch (err) {
                        console.error("ERROR", err);
                      }
                    } else if (productData.currency.toLowerCase() === "btc") {
                      price = price * 100000000;
                    }
                    if (isFiatPayment) {
                      await handleFiatPayment(price);
                    } else if (isCashuPayment) {
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
                    let price = productData.totalCost;
                    if (
                      !currencySelection.hasOwnProperty(
                        productData.currency.toUpperCase()
                      )
                    ) {
                      throw new Error(
                        `${productData.currency} is not a supported currency.`
                      );
                    } else if (
                      currencySelection.hasOwnProperty(
                        productData.currency.toUpperCase()
                      ) &&
                      productData.currency.toLowerCase() !== "sats" &&
                      productData.currency.toLowerCase() !== "sat"
                    ) {
                      try {
                        const currencyData = {
                          amount: price,
                          currency: productData.currency,
                        };
                        const numSats =
                          await fiat.getSatoshiValue(currencyData);
                        price = Math.round(numSats);
                      } catch (err) {
                        console.error("ERROR", err);
                      }
                    } else if (productData.currency.toLowerCase() === "btc") {
                      price = price * 100000000;
                    }
                    if (isFiatPayment) {
                      await handleFiatPayment(price);
                    } else if (isCashuPayment) {
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
        requiredInfo={
          productData.required !== "" ? productData.required : undefined
        }
      />

      <ContactForm
        showContactModal={showContactModal}
        handleToggleContactModal={handleToggleContactModal}
        handleContactSubmit={handleContactSubmit}
        onContactSubmit={onContactSubmit}
        contactControl={contactControl}
        requiredInfo={
          productData.required !== "" ? productData.required : undefined
        }
      />

      <SignInModal isOpen={isOpen} onClose={onClose} />

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
