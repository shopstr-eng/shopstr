import { useCallback, useContext, useState, useEffect, useRef } from "react";
import {
  CashuWalletContext,
  ChatsContext,
  ProfileMapContext,
} from "../utils/context/context";
import { useForm } from "react-hook-form";
import {
  Button,
  Image,
  useDisclosure,
  Select,
  SelectItem,
  Input,
} from "@heroui/react";
import {
  BanknotesIcon,
  BoltIcon,
  CheckIcon,
  ClipboardIcon,
  WalletIcon,
} from "@heroicons/react/24/outline";
import { getSatoshiValue } from "@getalby/lightning-tools";
import {
  Mint as CashuMint,
  Wallet as CashuWallet,
  getEncodedToken,
  Keyset as MintKeyset,
  Proof,
} from "@cashu/cashu-ts";
import { safeMeltProofs } from "@/utils/cashu/melt-retry-service";
import { safeSwap } from "@/utils/cashu/swap-retry-service";
import { withMintRetry } from "@/utils/cashu/mint-retry-service";
import {
  recordPendingMintQuote,
  markMintQuoteClaimed,
  updatePendingMintQuote,
  getPendingMintQuotes,
  removePendingMintQuote,
} from "@/utils/cashu/pending-mint-operations";
import {
  recoverProofsToBuyerWallet,
  withDeadline,
  isTimeoutError,
} from "@/utils/cashu/wallet-recovery";
import {
  constructGiftWrappedEvent,
  constructMessageSeal,
  constructMessageGiftWrap,
  sendGiftWrappedMessageEvent,
  getLocalStorageData,
  publishProofEvent,
  generateKeys,
} from "@/utils/nostr/nostr-helper-functions";
import { LightningAddress } from "@getalby/lightning-tools";
import QRCode from "qrcode";
import { v4 as uuidv4 } from "uuid";
import { nip19 } from "nostr-tools";
import { NostrWebLNProvider } from "@getalby/sdk";
import { ProductData } from "@/utils/parsers/product-parser-functions";
import { formatWithCommas } from "./utility-components/display-monetary-info";
import { SHOPSTRBUTTONCLASSNAMES } from "@/utils/STATIC-VARIABLES";
import SignInModal from "./sign-in/SignInModal";
import currencySelection from "../public/currencySelection.json";
import FailureModal from "@/components/utility-components/failure-modal";
import CountryDropdown from "./utility-components/dropdowns/country-dropdown";
import {
  NostrContext,
  SignerContext,
} from "@/components/utility-components/nostr-context-provider";
import { ShippingFormData, ContactFormData } from "@/utils/types/types";
import { Controller } from "react-hook-form";

export default function ProductInvoiceCard({
  productData,
  setIsBeingPaid,
  setInvoiceIsPaid,
  setInvoiceGenerationFailed,
  setCashuPaymentSent,
  setCashuPaymentFailed,
  selectedSize,
  selectedVolume,
  selectedWeight,
  selectedBulkOption,
  discountCode,
  discountPercentage,
  originalPrice,
}: {
  productData: ProductData;
  setIsBeingPaid: (isBeingPaid: boolean) => void;
  setInvoiceIsPaid: (invoiceIsPaid: boolean) => void;
  setInvoiceGenerationFailed: (invoiceGenerationFailed: boolean) => void;
  setCashuPaymentSent: (cashuPaymentSent: boolean) => void;
  setCashuPaymentFailed: (cashuPaymentFailed: boolean) => void;
  selectedSize?: string;
  selectedVolume?: string;
  selectedWeight?: string;
  selectedBulkOption?: number;
  discountCode?: string;
  discountPercentage?: number;
  originalPrice?: number;
}) {
  const { mints, tokens, history } = getLocalStorageData();
  const {
    pubkey: userPubkey,
    npub: userNPub,
    isLoggedIn,
    signer,
  } = useContext(SignerContext);

  // Check if there are tokens available for Cashu payment
  const hasTokensAvailable = tokens && tokens.length > 0;
  const chatsContext = useContext(ChatsContext);
  const profileContext = useContext(ProfileMapContext);

  const { nostr } = useContext(NostrContext);

  const [showInvoiceCard, setShowInvoiceCard] = useState(false);

  const [paymentConfirmed, setPaymentConfirmed] = useState(false);
  const [qrCodeUrl, setQrCodeUrl] = useState<string | null>(null);
  const [invoice, setInvoice] = useState("");
  const [copiedToClipboard, setCopiedToClipboard] = useState(false);

  // Tracks the in-flight invoice polling so a "Back" click or unmount can
  // signal the polling loop to exit cleanly instead of letting it complete
  // a payment the user has already abandoned.
  const invoicePollRef = useRef<{
    cancelled: boolean;
    activeQuoteId: string | null;
  }>({ cancelled: false, activeQuoteId: null });

  // Cancels any in-flight invoice polling. If the quote is still awaiting
  // payment we drop the durable record (no money has moved). If the mint
  // has already moved to PAID, the durable record stays so MintRecoveryBoot
  // can claim the proofs back to the buyer's wallet on next boot.
  const cancelInvoicePolling = useCallback(() => {
    const state = invoicePollRef.current;
    state.cancelled = true;
    const quoteId = state.activeQuoteId;
    if (!quoteId) return;
    const existing = getPendingMintQuotes().find((q) => q.quoteId === quoteId);
    if (existing && existing.status === "awaiting_payment") {
      removePendingMintQuote(quoteId);
    }
  }, []);

  // Defensive: if the user navigates away mid-polling (route change, modal
  // close), still signal cancellation so the loop doesn't keep working in
  // the background.
  useEffect(() => {
    return () => {
      cancelInvoicePolling();
    };
  }, [cancelInvoicePolling]);

  const pendingOrderRef = useRef<{
    orderId: string;
    productTitle: string;
    amount: string;
    currency: string;
    paymentMethod: string;
    sellerPubkey: string;
    shippingAddress?: string;
    pickupLocation?: string;
    selectedSize?: string;
    selectedVolume?: string;
    selectedWeight?: string;
    selectedBulkOption?: number;
  } | null>(null);

  const walletContext = useContext(CashuWalletContext);

  const [randomNpubForSender, setRandomNpubForSender] = useState<string>("");
  const [randomNsecForSender, setRandomNsecForSender] = useState<string>("");
  const [randomNpubForReceiver, setRandomNpubForReceiver] =
    useState<string>("");
  const [randomNsecForReceiver, setRandomNsecForReceiver] =
    useState<string>("");

  const { isOpen, onOpen, onClose } = useDisclosure();

  const [formType, setFormType] = useState<"shipping" | "contact" | null>(null);
  const [showOrderTypeSelection, setShowOrderTypeSelection] = useState(true);

  const sendInquiryDM = async (sellerPubkey: string, productTitle: string) => {
    if (!signer || !nostr || !userPubkey) return;

    try {
      const inquiryMessage = `I just placed an order for your ${productTitle} listing on Shopstr! Please check your Shopstr order dashboard for any relevant information.`;

      const { nsec: nsecForSellerReceiver, npub: npubForSellerReceiver } =
        await generateKeys();
      const decodedRandomPubkeyForSellerReceiver = nip19.decode(
        npubForSellerReceiver
      );
      const decodedRandomPrivkeyForSellerReceiver = nip19.decode(
        nsecForSellerReceiver
      );
      const { nsec: nsecForBuyerReceiver, npub: npubForBuyerReceiver } =
        await generateKeys();
      const decodedRandomPubkeyForBuyerReceiver =
        nip19.decode(npubForBuyerReceiver);
      const decodedRandomPrivkeyForBuyerReceiver =
        nip19.decode(nsecForBuyerReceiver);

      // Send to seller
      const giftWrappedMessageEventForSeller = await constructGiftWrappedEvent(
        userPubkey,
        sellerPubkey,
        inquiryMessage,
        "listing-inquiry"
      );
      // Also send a copy to the buyer
      const giftWrappedMessageEventForBuyer = await constructGiftWrappedEvent(
        userPubkey,
        userPubkey,
        inquiryMessage,
        "listing-inquiry"
      );

      const sealedEventForSeller = await constructMessageSeal(
        signer,
        giftWrappedMessageEventForSeller,
        userPubkey,
        sellerPubkey
      );
      const sealedEventForBuyer = await constructMessageSeal(
        signer,
        giftWrappedMessageEventForBuyer,
        userPubkey,
        userPubkey
      );

      const giftWrappedEventForSeller = await constructMessageGiftWrap(
        sealedEventForSeller,
        decodedRandomPubkeyForSellerReceiver.data as string,
        decodedRandomPrivkeyForSellerReceiver.data as Uint8Array,
        sellerPubkey
      );
      const giftWrappedEventForBuyer = await constructMessageGiftWrap(
        sealedEventForBuyer,
        decodedRandomPubkeyForBuyerReceiver.data as string,
        decodedRandomPrivkeyForBuyerReceiver.data as Uint8Array,
        userPubkey
      );

      await sendGiftWrappedMessageEvent(
        nostr,
        giftWrappedEventForSeller,
        signer
      );
      await sendGiftWrappedMessageEvent(
        nostr,
        giftWrappedEventForBuyer,
        signer
      );

      // Add to local context for immediate UI feedback
      chatsContext.addNewlyCreatedMessageEvent(
        {
          ...giftWrappedMessageEventForBuyer,
          sig: "",
          read: false,
        },
        true
      );
    } catch (error) {
      console.error("Failed to send inquiry DM:", error);
    }
  };

  const [isNwcLoading, setIsNwcLoading] = useState(false);
  const [nwcInfo, setNwcInfo] = useState<any | null>(null);

  // State for failure modal
  const [showFailureModal, setShowFailureModal] = useState(false);
  const [failureText, setFailureText] = useState("");

  useEffect(() => {
    if (paymentConfirmed && pendingOrderRef.current) {
      try {
        sessionStorage.setItem(
          "orderSummary",
          JSON.stringify({
            productTitle: pendingOrderRef.current.productTitle,
            productImage: productData.images[0] || "",
            amount: pendingOrderRef.current.amount,
            currency: pendingOrderRef.current.currency,
            paymentMethod: pendingOrderRef.current.paymentMethod,
            orderId: pendingOrderRef.current.orderId,
            shippingCost: productData.shippingCost
              ? String(productData.shippingCost)
              : undefined,
            selectedSize,
            selectedVolume,
            selectedWeight,
            selectedBulkOption: selectedBulkOption
              ? String(selectedBulkOption)
              : undefined,
            shippingAddress: pendingOrderRef.current.shippingAddress,
            pickupLocation: selectedPickupLocation || undefined,
            sellerPubkey: pendingOrderRef.current.sellerPubkey,
          })
        );
      } catch {}
    }
  }, [paymentConfirmed]);

  const [isFormValid, setIsFormValid] = useState(false);

  const {
    handleSubmit: handleFormSubmit,
    control: formControl,
    watch,
  } = useForm();

  // Watch form values to validate completion
  const watchedValues = watch();
  const [selectedPickupLocation, setSelectedPickupLocation] = useState<
    string | null
  >(null);

  // Check if product requires pickup location selection (pickup-type shipping with pickup locations defined)
  const requiresPickupLocation =
    (productData.shippingType === "Pickup" ||
      productData.shippingType === "Free/Pickup") &&
    productData.pickupLocations &&
    productData.pickupLocations.length > 0;

  // Extract discount and current price from props
  const appliedDiscount = discountPercentage || 0;
  const currentPrice =
    originalPrice !== undefined ? originalPrice : productData.price;

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
    const loadNwcInfo = () => {
      const { nwcInfo: infoString } = getLocalStorageData();
      if (infoString) {
        try {
          const info = JSON.parse(infoString);
          setNwcInfo(info);
        } catch (e) {
          console.error("Failed to parse NWC info", e);
          setNwcInfo(null);
        }
      } else {
        setNwcInfo(null);
      }
    };
    loadNwcInfo();
    // Listen for storage changes (e.g., user disconnects wallet in settings)
    window.addEventListener("storage", loadNwcInfo);
    return () => window.removeEventListener("storage", loadNwcInfo);
  }, [productData.pubkey, profileContext.profileData]);

  // Validate form completion
  useEffect(() => {
    if (!formType || !watchedValues) {
      setIsFormValid(false);
      return;
    }

    let isValid = false;

    if (formType === "shipping") {
      isValid = !!(
        watchedValues.Name?.trim() &&
        watchedValues.Address?.trim() &&
        watchedValues.City?.trim() &&
        watchedValues["Postal Code"]?.trim() &&
        watchedValues["State/Province"]?.trim() &&
        watchedValues.Country?.trim() &&
        (!productData.required || watchedValues.Required?.trim())
      );
    } else if (formType === "contact") {
      // For contact orders, check if pickup location is required and selected
      if (requiresPickupLocation) {
        isValid = !!selectedPickupLocation;
      } else {
        isValid = true;
      }
    }

    setIsFormValid(isValid);
  }, [
    watchedValues,
    formType,
    productData.required,
    requiresPickupLocation,
    selectedPickupLocation,
  ]);

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
    messageAmount?: number,
    contact?: string,
    address?: string,
    pickup?: string,
    donationAmountValue?: number,
    donationPercentageValue?: number,
    retryCount: number = 3
  ) => {
    const decodedRandomPubkeyForSender = nip19.decode(randomNpubForSender);
    const decodedRandomPrivkeyForSender = nip19.decode(randomNsecForSender);
    const decodedRandomPubkeyForReceiver = nip19.decode(randomNpubForReceiver);
    const decodedRandomPrivkeyForReceiver = nip19.decode(randomNsecForReceiver);

    const buyerPubkey = signer
      ? await signer.getPubKey?.()
      : (decodedRandomPubkeyForSender.data as string);

    let messageSubject = "";
    let messageOptions: any = {};
    if (isPayment) {
      messageSubject = "order-payment";
      messageOptions = {
        isOrder: true,
        type: 2,
        orderAmount: messageAmount
          ? messageAmount
          : formType === "shipping"
            ? productData.totalCost
            : productData.price,
        orderId,
        productData: {
          ...productData,
          selectedSize,
          selectedVolume,
          selectedWeight,
          selectedBulkOption,
        },
        paymentType,
        paymentReference,
        contact,
        address,
        pickup,
        selectedSize,
        selectedVolume,
        selectedWeight,
        selectedBulkOption,
        buyerPubkey,
        donationAmount: donationAmountValue,
        donationPercentage: donationPercentageValue,
      };
    } else if (isReceipt) {
      messageSubject = "order-receipt";
      messageOptions = {
        isOrder: true,
        type: 4,
        orderAmount: messageAmount ? messageAmount : productData.totalCost,
        orderId,
        productData: {
          ...productData,
          selectedSize,
          selectedVolume,
          selectedWeight,
          selectedBulkOption,
        },
        status: "confirmed",
        paymentType,
        paymentReference,
        paymentProof,
        address,
        pickup,
        selectedSize,
        selectedVolume,
        selectedWeight,
        selectedBulkOption,
        buyerPubkey,
        donationAmount: donationAmountValue,
        donationPercentage: donationPercentageValue,
      };
    } else if (isDonation) {
      messageSubject = "donation";
    } else if (orderId) {
      messageSubject = "order-info";
      messageOptions = {
        isOrder: true,
        type: 1,
        orderAmount: messageAmount ? messageAmount : productData.totalCost,
        orderId,
        productData: {
          ...productData,
          selectedSize,
          selectedVolume,
          selectedWeight,
          selectedBulkOption,
        },
        quantity: 1,
        contact,
        address,
        pickup,
        selectedSize,
        selectedVolume,
        selectedWeight,
        selectedBulkOption,
        buyerPubkey,
        donationAmount: donationAmountValue,
        donationPercentage: donationPercentageValue,
      };
    }

    for (let attempt = 0; attempt < retryCount; attempt++) {
      try {
        const giftWrappedMessageEvent = await constructGiftWrappedEvent(
          decodedRandomPubkeyForSender.data as string,
          pubkeyToReceiveMessage,
          message,
          messageSubject,
          messageOptions
        );
        const sealedEvent = await constructMessageSeal(
          signer || ({} as any),
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

        await sendGiftWrappedMessageEvent(nostr!, giftWrappedEvent, signer);

        if (isReceipt) {
          chatsContext.addNewlyCreatedMessageEvent(
            {
              ...giftWrappedMessageEvent,
              sig: "",
              read: false,
            },
            true
          );
        }

        // If we get here, the message was sent successfully
        return;
      } catch (error) {
        console.warn(
          `Attempt ${attempt + 1} failed for message sending:`,
          error
        );

        if (attempt === retryCount - 1) {
          // This was the last attempt, log the error but don't throw
          console.error("Failed to send message after all retries:", error);
          return; // Continue with the flow instead of breaking it
        }

        // Wait before retrying (exponential backoff)
        await new Promise((resolve) =>
          setTimeout(resolve, Math.pow(2, attempt) * 1000)
        );
      }
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

  const onFormSubmit = async (
    data: { [x: string]: string },
    paymentType?: "lightning" | "cashu" | "nwc"
  ) => {
    try {
      // Use discounted total instead of original price
      let price = discountedTotal;

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
          const numSats = await getSatoshiValue(currencyData);
          price = Math.round(numSats);
        } catch (err) {
          // Use console.warn so the Next.js dev overlay doesn't escalate
          // this. Re-throw so the outer onFormSubmit catch surfaces a
          // real failure modal — silently proceeding with the original
          // fiat number would charge the buyer the wrong amount.
          console.warn("Failed to convert price to sats:", err);
          throw new Error(
            `Could not look up the current ${productData.currency} → sats exchange rate. Please try again in a moment.`
          );
        }
      } else if (productData.currency.toLowerCase() === "btc") {
        price = price * 100000000;
      }

      if (price < 1) {
        throw new Error("Listing price is less than 1 sat.");
      }

      const commonData = {
        additionalInfo: data["Required"],
      };

      let paymentData: any = commonData;

      if (formType === "shipping") {
        paymentData = {
          ...paymentData,
          shippingName: data["Name"],
          shippingAddress: data["Address"],
          shippingUnitNo: data["Unit"],
          shippingCity: data["City"],
          shippingPostalCode: data["Postal Code"],
          shippingState: data["State/Province"],
          shippingCountry: data["Country"],
        };
      }

      const emailAddressTag =
        paymentData.shippingName && paymentData.shippingAddress
          ? `${paymentData.shippingName}, ${paymentData.shippingAddress}, ${
              paymentData.shippingCity || ""
            }, ${paymentData.shippingState || ""}, ${
              paymentData.shippingPostalCode || ""
            }, ${paymentData.shippingCountry || ""}`
          : undefined;
      pendingOrderRef.current = {
        orderId: "",
        productTitle: productData.title,
        amount: String(price),
        currency: "sats",
        paymentMethod: paymentType || "lightning",
        sellerPubkey: productData.pubkey,
        shippingAddress: emailAddressTag,
        pickupLocation: selectedPickupLocation || undefined,
      };

      if (paymentType === "cashu") {
        await handleCashuPayment(price, paymentData);
      } else if (paymentType === "nwc") {
        await handleNWCPayment(price, paymentData);
      } else {
        await handleLightningPayment(price, paymentData);
      }
    } catch (err: any) {
      // Surface a real, accurate failure modal instead of always claiming
      // "cashu payment failed" regardless of payment type or root cause.
      const message =
        typeof err?.message === "string" && err.message
          ? err.message
          : "Something went wrong while preparing your order. Please try again.";
      setFailureText(message);
      setShowFailureModal(true);
    }
  };

  const handleOrderTypeSelection = (selectedOrderType: string) => {
    setShowOrderTypeSelection(false);
    setSelectedPickupLocation(null); // Reset pickup location when form type changes

    if (selectedOrderType === "shipping") {
      setFormType("shipping");
    } else if (selectedOrderType === "contact") {
      setFormType("contact");
      // For contact orders, only set valid if no pickup location is required
      setIsFormValid(!requiresPickupLocation);
    }
  };

  const handleNWCError = (error: any) => {
    console.error("NWC Payment failed:", error);
    let message = "Payment failed. Please try again.";
    if (error && typeof error === "object" && "code" in error) {
      switch (error.code) {
        case "INSUFFICIENT_BALANCE":
          message = "Payment failed: Insufficient balance in your wallet.";
          break;
        case "QUOTA_EXCEEDED":
          message =
            "Payment failed: Your wallet's spending quota has been exceeded.";
          break;
        case "PAYMENT_FAILED":
          message =
            "The payment failed. Please check your wallet and try again.";
          break;
        case "RATE_LIMITED":
          message =
            "You are sending payments too quickly. Please wait a moment.";
          break;
        default:
          message = error.message || "An unknown wallet error occurred.";
      }
    } else if (error instanceof Error) {
      message = error.message;
    }
    setFailureText(`NWC Error: ${message}`);
    setShowFailureModal(true);
  };

  const handleNWCPayment = async (convertedPrice: number, data: any) => {
    setIsNwcLoading(true);
    let nwc: NostrWebLNProvider | null = null;

    try {
      if (data.shippingName || data.shippingAddress) {
        validatePaymentData(convertedPrice, {
          Name: data.shippingName || "",
          Address: data.shippingAddress || "",
          Unit: data.shippingUnitNo || "",
          City: data.shippingCity || "",
          "Postal Code": data.shippingPostalCode || "",
          "State/Province": data.shippingState || "",
          Country: data.shippingCountry || "",
          Required: data.additionalInfo || "",
        });
      } else if (data.contact || data.contactType) {
        validatePaymentData(convertedPrice, {
          Contact: data.contact || "",
          "Contact Type": data.contactType || "",
          Instructions: data.contactInstructions || "",
          Required: data.additionalInfo || "",
        });
      } else {
        validatePaymentData(convertedPrice);
      }

      const wallet = new CashuWallet(new CashuMint(mints[0]!));
      await wallet.loadMint();
      const { request: pr, quote: hash } = await withMintRetry(
        () => wallet.createMintQuoteBolt11(convertedPrice),
        { maxAttempts: 4, perAttemptTimeoutMs: 15000, totalTimeoutMs: 60000 }
      );
      recordPendingMintQuote({
        quoteId: hash,
        mintUrl: mints[0]!,
        amount: convertedPrice,
        invoice: pr,
      });
      invoicePollRef.current = { cancelled: false, activeQuoteId: hash };

      const { nwcString } = getLocalStorageData();
      if (!nwcString) throw new Error("NWC connection not found.");

      nwc = new NostrWebLNProvider({ nostrWalletConnectUrl: nwcString });
      await nwc.enable();

      await nwc.sendPayment(pr);

      await invoiceHasBeenPaid(
        wallet,
        convertedPrice,
        hash,
        data.shippingName ? data.shippingName : undefined,
        data.shippingAddress ? data.shippingAddress : undefined,
        data.shippingUnitNo ? data.shippingUnitNo : undefined,
        data.shippingCity ? data.shippingCity : undefined,
        data.shippingPostalCode ? data.shippingPostalCode : undefined,
        data.shippingState ? data.shippingState : undefined,
        data.shippingCountry ? data.shippingCountry : undefined,
        data.additionalInfo ? data.additionalInfo : undefined
      );
    } catch (error: any) {
      handleNWCError(error);
    } finally {
      nwc?.close();
      setIsNwcLoading(false);
    }
  };

  const handleLightningPayment = async (convertedPrice: number, data: any) => {
    try {
      if (
        data.shippingName ||
        data.shippingAddress ||
        data.shippingCity ||
        data.shippingPostalCode ||
        data.shippingState ||
        data.shippingCountry
      ) {
        validatePaymentData(convertedPrice, {
          Name: data.shippingName || "",
          Address: data.shippingAddress || "",
          Unit: data.shippingUnitNo || "",
          City: data.shippingCity || "",
          "Postal Code": data.shippingPostalCode || "",
          "State/Province": data.shippingState || "",
          Country: data.shippingCountry || "",
          Required: data.additionalInfo || "",
        });
      } else if (data.contact || data.contactType || data.contactInstructions) {
        validatePaymentData(convertedPrice, {
          Contact: data.contact || "",
          "Contact Type": data.contactType || "",
          Instructions: data.contactInstructions || "",
          Required: data.additionalInfo || "",
        });
      } else {
        validatePaymentData(convertedPrice);
      }

      setShowInvoiceCard(true);
      const wallet = new CashuWallet(new CashuMint(mints[0]!));
      await wallet.loadMint();

      const { request: pr, quote: hash } = await withMintRetry(
        () => wallet.createMintQuoteBolt11(convertedPrice),
        { maxAttempts: 4, perAttemptTimeoutMs: 15000, totalTimeoutMs: 60000 }
      );
      recordPendingMintQuote({
        quoteId: hash,
        mintUrl: mints[0]!,
        amount: convertedPrice,
        invoice: pr,
      });
      invoicePollRef.current = { cancelled: false, activeQuoteId: hash };

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
        data.shippingName ? data.shippingName : undefined,
        data.shippingAddress ? data.shippingAddress : undefined,
        data.shippingUnitNo ? data.shippingUnitNo : undefined,
        data.shippingCity ? data.shippingCity : undefined,
        data.shippingPostalCode ? data.shippingPostalCode : undefined,
        data.shippingState ? data.shippingState : undefined,
        data.shippingCountry ? data.shippingCountry : undefined,
        data.additionalInfo ? data.additionalInfo : undefined
      );
    } catch {
      setInvoiceGenerationFailed(true);
      setShowInvoiceCard(false);
      setInvoice("");
      setQrCodeUrl(null);
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
    additionalInfo?: string
  ) {
    let retryCount = 0;
    const maxRetries = 42; // Maximum 30 retries (about 1 minute)

    while (retryCount < maxRetries) {
      // Honor any cancellation signal from the Back button or component
      // unmount. If we haven't seen PAID yet, leave the loop and let the
      // cancel handler drop the durable record.
      if (invoicePollRef.current.cancelled) {
        return;
      }
      try {
        // Bounded retry on transient failures so a single network blip
        // doesn't abandon the polling loop.
        const quoteState = await withMintRetry(
          () => wallet.checkMintQuoteBolt11(hash),
          { maxAttempts: 3, perAttemptTimeoutMs: 10000, totalTimeoutMs: 25000 }
        );

        if (quoteState.state === "PAID") {
          // Money is on the mint. Mark durable record before claiming so that
          // a tab close / network drop here triggers boot-time recovery.
          // Use the upsert form so that a Back-button cancellation racing
          // with this transition (which would have removed the
          // awaiting_payment record) cannot leave us without a durable
          // safety net for the proofs we're about to mint.
          const existing = getPendingMintQuotes().find(
            (q) => q.quoteId === hash
          );
          recordPendingMintQuote({
            quoteId: hash,
            mintUrl: mints[0]!,
            amount: newPrice,
            invoice: existing?.invoice ?? "",
            status: "paid_unclaimed",
          });
          try {
            const proofs = await withMintRetry(
              () => wallet.mintProofsBolt11(newPrice, hash),
              {
                maxAttempts: 5,
                perAttemptTimeoutMs: 15000,
                totalTimeoutMs: 60000,
              }
            );
            if (proofs && proofs.length > 0) {
              // If the user clicked Back between PAID and the claim
              // returning, do not forward the order to the seller. Instead
              // credit the freshly-minted proofs to the buyer's wallet so
              // their sats are recoverable.
              if (invoicePollRef.current.cancelled) {
                // Defensive: if nostr/signer were torn down between cancel
                // and now, leave the durable record so MintRecoveryBoot
                // claims to wallet on the next boot rather than dropping
                // the proofs on the floor.
                if (!nostr || !signer) {
                  setShowInvoiceCard(false);
                  setInvoice("");
                  setQrCodeUrl(null);
                  setFailureText(
                    "Order cancelled. Your sats will be credited to your wallet automatically the next time you open Shopstr."
                  );
                  setShowFailureModal(true);
                  return;
                }
                await recoverProofsToBuyerWallet(
                  nostr,
                  signer,
                  mints[0]!,
                  proofs,
                  newPrice
                );
                markMintQuoteClaimed(hash);
                setShowInvoiceCard(false);
                setInvoice("");
                setQrCodeUrl(null);
                setFailureText(
                  "Your invoice was paid right as you cancelled. The sats have been credited to your wallet — no order was sent to the seller."
                );
                setShowFailureModal(true);
                return;
              }
              // Bound the seller hand-off so a hung relay / signing step
              // can't strand the buyer indefinitely. On failure or timeout,
              // the freshly-minted proofs are credited to the buyer's local
              // wallet so they keep their sats and can retry.
              try {
                await withDeadline(
                  () =>
                    sendTokens(
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
                      additionalInfo ? additionalInfo : undefined
                    ),
                  45000,
                  "seller payment hand-off"
                );
                markMintQuoteClaimed(hash);
                setPaymentConfirmed(true);
                setQrCodeUrl(null);
                setInvoiceIsPaid(true);
                break;
              } catch (handoffError) {
                await recoverProofsToBuyerWallet(
                  nostr!,
                  signer!,
                  mints[0]!,
                  proofs,
                  newPrice
                );
                markMintQuoteClaimed(hash);
                setShowInvoiceCard(false);
                setInvoice("");
                setQrCodeUrl(null);
                setFailureText(
                  isTimeoutError(handoffError)
                    ? "Your payment was received but delivery to the seller timed out. Your sats have been credited to your wallet — please try the order again."
                    : "Your payment was received but couldn't be delivered to the seller. Your sats have been credited to your wallet — please try the order again."
                );
                setShowFailureModal(true);
                console.warn(
                  "[product-invoice-card] seller hand-off failed; proofs recovered to buyer wallet:",
                  handoffError
                );
                break;
              }
            }
          } catch (mintError) {
            const message =
              mintError instanceof Error
                ? mintError.message
                : String(mintError);
            // If minting fails because mint reports already-issued, the proofs
            // exist on the mint side but were lost client-side and cannot be
            // recovered. Mark terminal so boot recovery does not retry forever.
            if (message.toLowerCase().includes("issued")) {
              updatePendingMintQuote(hash, {
                status: "failed_terminal",
                lastErrorMessage:
                  "Mint reports quote ISSUED before local claim recorded proofs",
              });
              setPaymentConfirmed(true);
              setQrCodeUrl(null);
              setFailureText(
                "Payment was received but your connection dropped! Please check your wallet balance."
              );
              setShowFailureModal(true);
              break;
            }
            throw mintError;
          }
        } else if (quoteState.state === "ISSUED") {
          // Quote was already processed successfully but we never saw the
          // proofs locally. Mark terminal so boot recovery doesn't loop on it.
          updatePendingMintQuote(hash, {
            status: "failed_terminal",
            lastErrorMessage: "Quote ISSUED before local claim recorded proofs",
          });
          setPaymentConfirmed(true);
          setQrCodeUrl(null);
          setFailureText(
            "Payment was received but your connection dropped! Please check your wallet balance."
          );
          setShowFailureModal(true);
          break;
        } else {
          // Quote not paid yet, continue waiting
          retryCount++;
          await new Promise((resolve) => setTimeout(resolve, 2100));
          continue;
        }
      } catch (error) {
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
      const swapOutcome = await safeSwap(
        wallet,
        sellerAmount,
        remainingProofs,
        { sendConfig: { includeFees: true } }
      );
      if (swapOutcome.status !== "swapped") {
        throw new Error(
          swapOutcome.errorMessage ??
            `Seller-payout swap did not complete (${swapOutcome.status})`
        );
      }
      const { keep, send } = swapOutcome;
      sellerProofs = send;
      sellerToken = getEncodedToken({
        mint: mints[0]!,
        proofs: send,
      });
      remainingProofs = keep;
    }

    if (donationAmount > 0) {
      const swapOutcome = await safeSwap(
        wallet,
        donationAmount,
        remainingProofs,
        { sendConfig: { includeFees: true } }
      );
      if (swapOutcome.status !== "swapped") {
        throw new Error(
          swapOutcome.errorMessage ??
            `Donation swap did not complete (${swapOutcome.status})`
        );
      }
      const { keep, send } = swapOutcome;
      donationToken = getEncodedToken({
        mint: mints[0]!,
        proofs: send,
      });
      remainingProofs = keep;
    }

    const orderId = uuidv4();

    if (pendingOrderRef.current && !pendingOrderRef.current.orderId) {
      pendingOrderRef.current.orderId = orderId;
    }

    const paymentPreference =
      sellerProfile?.content?.payment_preference || "ecash";
    const lnurl = sellerProfile?.content?.lud16 || "";

    // Step 1: Send payment message
    if (
      paymentPreference === "lightning" &&
      lnurl &&
      lnurl !== "" &&
      !lnurl.includes("@zeuspay.com") &&
      sellerProofs
    ) {
      const newAmount = Math.floor(sellerAmount * 0.98 - 2);
      const ln = new LightningAddress(lnurl);
      await wallet.loadMint();
      await ln.fetch();
      const invoice = await ln.requestInvoice({ satoshi: newAmount });
      const invoicePaymentRequest = invoice.paymentRequest;
      const meltQuote = await wallet.createMeltQuoteBolt11(
        invoicePaymentRequest
      );
      if (meltQuote) {
        const meltQuoteTotal =
          meltQuote.amount.toNumber() + meltQuote.fee_reserve.toNumber();
        const swapOutcome = await safeSwap(
          wallet,
          meltQuoteTotal,
          sellerProofs,
          { sendConfig: { includeFees: true } }
        );
        if (swapOutcome.status !== "swapped") {
          throw new Error(
            swapOutcome.errorMessage ??
              `Pre-melt swap did not complete (${swapOutcome.status})`
          );
        }
        const { keep, send } = swapOutcome;
        const meltOutcome = await safeMeltProofs(wallet, meltQuote, send);
        if (meltOutcome.status !== "paid") {
          throw new Error(
            meltOutcome.errorMessage ??
              `Melt did not complete (${meltOutcome.status})`
          );
        }
        if (meltOutcome.meltQuote) {
          const meltAmount = meltOutcome.meltQuote.amount.toNumber();
          const changeProofs = [...keep, ...meltOutcome.changeProofs];
          const changeAmount =
            Array.isArray(changeProofs) && changeProofs.length > 0
              ? changeProofs.reduce(
                  (acc, current: Proof) => acc + current.amount.toNumber(),
                  0
                )
              : 0;
          let productDetails = "";
          if (selectedSize) {
            productDetails += " in size " + selectedSize;
          }
          if (selectedVolume) {
            if (productDetails) {
              productDetails += " and a " + selectedVolume;
            } else {
              productDetails += " in a " + selectedVolume;
            }
          }
          if (selectedWeight) {
            if (productDetails) {
              productDetails += " and " + selectedWeight;
            } else {
              productDetails += " in " + selectedWeight;
            }
          }
          if (selectedBulkOption) {
            if (productDetails) {
              productDetails += " (bulk: " + selectedBulkOption + " units)";
            } else {
              productDetails += " (bulk: " + selectedBulkOption + " units)";
            }
          }
          if (selectedPickupLocation) {
            if (productDetails) {
              productDetails += " (pickup at: " + selectedPickupLocation + ")";
            } else {
              productDetails += " (pickup at: " + selectedPickupLocation + ")";
            }
          }
          let paymentMessage = "";
          paymentMessage =
            "You have received a payment from " +
            (userNPub || "a guest buyer") +
            " for your " +
            productData.title +
            " listing" +
            productDetails +
            " on Shopstr! Check your Lightning address (" +
            lnurl +
            ") for your sats.";
          await sendPaymentAndContactMessage(
            productData.pubkey,
            paymentMessage,
            true,
            false,
            false,
            orderId,
            "lightning",
            lnurl,
            undefined,
            meltAmount,
            undefined,
            undefined,
            selectedPickupLocation || undefined
          );

          if (changeAmount >= 1 && changeProofs && changeProofs.length > 0) {
            // Add delay between messages to prevent browser throttling
            await new Promise((resolve) => setTimeout(resolve, 500));

            const encodedChange = getEncodedToken({
              mint: mints[0]!,
              proofs: changeProofs,
            });
            const changeMessage = "Overpaid fee change: " + encodedChange;
            try {
              await sendPaymentAndContactMessage(
                productData.pubkey,
                changeMessage,
                true,
                false,
                false,
                orderId,
                "ecash",
                encodedChange,
                undefined,
                changeAmount
              );
              await new Promise((resolve) => setTimeout(resolve, 500));
            } catch (error) {
              console.error("Failed to send change message:", error);
            }
          }
        } else {
          const unusedProofs = [...keep, ...send, ...meltOutcome.changeProofs];
          const unusedAmount =
            Array.isArray(unusedProofs) && unusedProofs.length > 0
              ? unusedProofs.reduce(
                  (acc, current: Proof) => acc + current.amount.toNumber(),
                  0
                )
              : 0;
          const unusedToken = getEncodedToken({
            mint: mints[0]!,
            proofs: unusedProofs,
          });
          let productDetails = "";
          if (selectedSize) {
            productDetails += " in size " + selectedSize;
          }
          if (selectedVolume) {
            if (productDetails) {
              productDetails += " and a " + selectedVolume;
            } else {
              productDetails += " in a " + selectedVolume;
            }
          }
          if (selectedWeight) {
            if (productDetails) {
              productDetails += " and " + selectedWeight;
            } else {
              productDetails += " in " + selectedWeight;
            }
          }
          if (selectedBulkOption) {
            if (productDetails) {
              productDetails += " (bulk: " + selectedBulkOption + " units)";
            } else {
              productDetails += " (bulk: " + selectedBulkOption + " units)";
            }
          }
          if (selectedPickupLocation) {
            if (productDetails) {
              productDetails += " (pickup at: " + selectedPickupLocation + ")";
            } else {
              productDetails += " (pickup at: " + selectedPickupLocation + ")";
            }
          }
          let paymentMessage = "";
          if (unusedToken && unusedProofs) {
            paymentMessage =
              "This is a Cashu token payment from " +
              (userNPub || "a guest buyer") +
              " for your " +
              productData.title +
              " listing" +
              productDetails +
              " on Shopstr: " +
              unusedToken;
            await sendPaymentAndContactMessage(
              productData.pubkey,
              paymentMessage,
              true,
              false,
              false,
              orderId,
              "ecash",
              unusedToken,
              undefined,
              unusedAmount,
              undefined,
              undefined,
              selectedPickupLocation || undefined,
              donationAmount,
              donationPercentage
            );
          }
        }
      }
    } else {
      let productDetails = "";
      if (selectedSize) {
        productDetails += " in size " + selectedSize;
      }
      if (selectedVolume) {
        if (productDetails) {
          productDetails += " and a " + selectedVolume;
        } else {
          productDetails += " in a " + selectedVolume;
        }
      }
      if (selectedWeight) {
        if (productDetails) {
          productDetails += " and " + selectedWeight;
        } else {
          productDetails += " in " + selectedWeight;
        }
      }
      if (selectedBulkOption) {
        if (productDetails) {
          productDetails += " (bulk: " + selectedBulkOption + " units)";
        } else {
          productDetails += " (bulk: " + selectedBulkOption + " units)";
        }
      }
      if (selectedPickupLocation) {
        if (productDetails) {
          productDetails += " (pickup at: " + selectedPickupLocation + ")";
        } else {
          productDetails += " (pickup at: " + selectedPickupLocation + ")";
        }
      }
      let paymentMessage = "";
      if (sellerToken && sellerProofs) {
        paymentMessage =
          "This is a Cashu token payment from " +
          (userNPub || "a guest buyer") +
          " for your " +
          productData.title +
          " listing" +
          productDetails +
          " on Shopstr: " +
          sellerToken;
        await sendPaymentAndContactMessage(
          productData.pubkey,
          paymentMessage,
          true,
          false,
          false,
          orderId,
          "ecash",
          sellerToken,
          undefined,
          sellerAmount,
          undefined,
          undefined,
          selectedPickupLocation || undefined,
          donationAmount,
          donationPercentage
        );
      }
    }

    // Step 2: Send donation message
    if (donationToken) {
      const donationMessage = "Sale donation: " + donationToken;
      try {
        await sendPaymentAndContactMessage(
          "a37118a4888e02d28e8767c08caaf73b49abdac391ad7ff18a304891e416dc33",
          donationMessage,
          false,
          false,
          true
        );
        await new Promise((resolve) => setTimeout(resolve, 500));
      } catch (error) {
        console.error("Failed to send donation message:", error);
      }
    }

    // Step 3: Send additional info message
    if (additionalInfo) {
      // Add delay between messages
      await new Promise((resolve) => setTimeout(resolve, 500));

      const additionalMessage =
        "Additional customer information: " + additionalInfo;
      try {
        await sendPaymentAndContactMessage(
          productData.pubkey,
          additionalMessage,
          false,
          false,
          false,
          orderId,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          donationAmount,
          donationPercentage
        );
        await new Promise((resolve) => setTimeout(resolve, 500));
      } catch (error) {
        console.error("Failed to send additional info message:", error);
      }
    }

    // Step 4: Handle shipping and contact information
    if (
      shippingName &&
      shippingAddress &&
      shippingCity &&
      shippingPostalCode &&
      shippingState &&
      shippingCountry
    ) {
      if (
        productData.shippingType === "Added Cost" ||
        productData.shippingType === "Free" ||
        productData.shippingType === "Free/Pickup"
      ) {
        let productDetails = "";
        if (selectedSize) {
          productDetails += " in size " + selectedSize;
        }
        if (selectedVolume) {
          if (productDetails) {
            productDetails += " and a " + selectedVolume;
          } else {
            productDetails += " in a " + selectedVolume;
          }
        }
        if (selectedWeight) {
          if (productDetails) {
            productDetails += " and " + selectedWeight;
          } else {
            productDetails += " in " + selectedWeight;
          }
        }
        if (selectedBulkOption) {
          if (productDetails) {
            productDetails += " (bulk: " + selectedBulkOption + " units)";
          } else {
            productDetails += " (bulk: " + selectedBulkOption + " units)";
          }
        }
        if (selectedPickupLocation) {
          if (productDetails) {
            productDetails += " (pickup at: " + selectedPickupLocation + ")";
          } else {
            productDetails += " (pickup at: " + selectedPickupLocation + ")";
          }
        }

        let contactMessage = "";
        if (!shippingUnitNo) {
          contactMessage =
            "Please ship the product" +
            productDetails +
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
        } else {
          contactMessage =
            "Please ship the product" +
            productDetails +
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
        const addressTagForShipping = shippingUnitNo
          ? `${shippingName}, ${shippingAddress}, ${shippingUnitNo}, ${shippingCity}, ${shippingState}, ${shippingPostalCode}, ${shippingCountry}`
          : `${shippingName}, ${shippingAddress}, ${shippingCity}, ${shippingState}, ${shippingPostalCode}, ${shippingCountry}`;
        await sendPaymentAndContactMessage(
          productData.pubkey,
          contactMessage,
          false,
          false,
          false,
          orderId,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          addressTagForShipping,
          undefined,
          donationAmount,
          donationPercentage
        );

        if (userPubkey) {
          const receiptMessage =
            "Your order for " +
            productData.title +
            productDetails +
            " was processed successfully! If applicable, you should be receiving delivery information from " +
            nip19.npubEncode(productData.pubkey) +
            " as soon as they review your order.";

          // Add delay between messages
          await new Promise((resolve) => setTimeout(resolve, 500));

          await sendPaymentAndContactMessage(
            userPubkey,
            receiptMessage,
            false,
            true, // isReceipt is true
            false,
            orderId,
            "ecash",
            mints[0]!,
            sellerToken,
            undefined,
            undefined,
            addressTagForShipping,
            selectedPickupLocation || undefined,
            donationAmount,
            donationPercentage
          );
        }
      }
    } else if (
      productData.shippingType === "N/A" ||
      productData.shippingType === "Pickup" ||
      productData.shippingType === "Free/Pickup"
    ) {
      await sendInquiryDM(productData.pubkey, productData.title);

      let productDetails = "";
      if (selectedSize) {
        productDetails += " in size " + selectedSize;
      }
      if (selectedVolume) {
        if (productDetails) {
          productDetails += " and a " + selectedVolume;
        } else {
          productDetails += " in a " + selectedVolume;
        }
      }
      if (selectedWeight) {
        if (productDetails) {
          productDetails += " and " + selectedWeight;
        } else {
          productDetails += " in " + selectedWeight;
        }
      }
      if (selectedBulkOption) {
        if (productDetails) {
          productDetails += " (bulk: " + selectedBulkOption + " units)";
        } else {
          productDetails += " (bulk: " + selectedBulkOption + " units)";
        }
      }
      if (selectedPickupLocation) {
        if (productDetails) {
          productDetails += " (pickup at: " + selectedPickupLocation + ")";
        } else {
          productDetails += " (pickup at: " + selectedPickupLocation + ")";
        }
      }

      if (userPubkey) {
        const receiptMessage =
          "Your order for " +
          productData.title +
          productDetails +
          " was processed successfully! If applicable, you should be receiving delivery information from " +
          nip19.npubEncode(productData.pubkey) +
          " as soon as they review your order.";

        // Add delay between messages
        await new Promise((resolve) => setTimeout(resolve, 500));

        await sendPaymentAndContactMessage(
          userPubkey,
          receiptMessage,
          false,
          true,
          false,
          orderId,
          "ecash",
          mints[0]!,
          sellerToken,
          undefined,
          undefined,
          undefined,
          selectedPickupLocation || undefined,
          donationAmount,
          donationPercentage
        );
      }
    } else {
      let productDetails = "";
      if (selectedSize) {
        productDetails += " in size " + selectedSize;
      }
      if (selectedVolume) {
        if (productDetails) {
          productDetails += " and a " + selectedVolume;
        } else {
          productDetails += " in a " + selectedVolume;
        }
      }
      if (selectedWeight) {
        if (productDetails) {
          productDetails += " and " + selectedWeight;
        } else {
          productDetails += " in " + selectedWeight;
        }
      }
      if (selectedBulkOption) {
        if (productDetails) {
          productDetails += " (bulk: " + selectedBulkOption + " units)";
        } else {
          productDetails += " (bulk: " + selectedBulkOption + " units)";
        }
      }
      if (selectedPickupLocation) {
        if (productDetails) {
          productDetails += " (pickup at: " + selectedPickupLocation + ")";
        } else {
          productDetails += " (pickup at: " + selectedPickupLocation + ")";
        }
      }

      const receiptMessage =
        "Thank you for your purchase of " +
        productData.title +
        productDetails +
        " from " +
        nip19.npubEncode(productData.pubkey) +
        ".";
      await sendPaymentAndContactMessage(
        userPubkey!,
        receiptMessage,
        false,
        true, // isReceipt is true
        false,
        orderId,
        "ecash",
        mints[0]!,
        sellerToken,
        undefined,
        undefined,
        undefined,
        selectedPickupLocation || undefined,
        donationAmount,
        donationPercentage
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

  const formattedTotalCost = formatWithCommas(
    formType === "shipping" ? productData.totalCost : productData.price,
    productData.currency
  );

  const handleCashuPayment = async (price: number, data: any) => {
    try {
      if (!mints || mints.length === 0) {
        throw new Error("No Cashu mint available");
      }

      if (!walletContext) {
        throw new Error("Wallet context not available");
      }

      if (
        data.shippingName ||
        data.shippingAddress ||
        data.shippingCity ||
        data.shippingPostalCode ||
        data.shippingState ||
        data.shippingCountry
      ) {
        validatePaymentData(price, {
          Name: data.shippingName || "",
          Address: data.shippingAddress || "",
          Unit: data.shippingUnitNo || "",
          City: data.shippingCity || "",
          "Postal Code": data.shippingPostalCode || "",
          "State/Province": data.shippingState || "",
          Country: data.shippingCountry || "",
          Required: data.additionalInfo || "",
        });
      } else if (data.contact || data.contactType || data.contactInstructions) {
        validatePaymentData(price, {
          Contact: data.contact || "",
          "Contact Type": data.contactType || "",
          Instructions: data.contactInstructions || "",
          Required: data.additionalInfo || "",
        });
      } else {
        validatePaymentData(price);
      }

      const mint = new CashuMint(mints[0]!);
      const wallet = new CashuWallet(mint);
      await wallet.loadMint();
      const mintKeySetIds = await wallet.keyChain.getKeysets();
      const filteredProofs = tokens.filter((p: Proof) =>
        mintKeySetIds?.some((keysetId: MintKeyset) => keysetId.id === p.id)
      ) as Proof[];
      const swapOutcome = await safeSwap(wallet, price, filteredProofs, {
        sendConfig: { includeFees: true },
      });
      if (swapOutcome.status !== "swapped") {
        throw new Error(
          swapOutcome.errorMessage ??
            `Product payment swap did not complete (${swapOutcome.status})`
        );
      }
      const { keep, send } = swapOutcome;
      const deletedEventIds = [
        ...new Set([
          ...walletContext.proofEvents
            .filter((event) =>
              event.proofs.some((proof: Proof) =>
                filteredProofs.some(
                  (filteredProof) => filteredProof.secret === proof.secret
                )
              )
            )
            .map((event) => event.id),
          ...walletContext.proofEvents
            .filter((event) =>
              event.proofs.some((proof: Proof) =>
                keep.some((keepProof) => keepProof.secret === proof.secret)
              )
            )
            .map((event) => event.id),
          ...walletContext.proofEvents
            .filter((event) =>
              event.proofs.some((proof: Proof) =>
                send.some((sendProof) => sendProof.secret === proof.secret)
              )
            )
            .map((event) => event.id),
        ]),
      ];

      await sendTokens(
        wallet,
        send,
        price,
        data.shippingName ? data.shippingName : undefined,
        data.shippingAddress ? data.shippingAddress : undefined,
        data.shippingUnitNo ? data.shippingUnitNo : undefined,
        data.shippingCity ? data.shippingCity : undefined,
        data.shippingPostalCode ? data.shippingPostalCode : undefined,
        data.shippingState ? data.shippingState : undefined,
        data.shippingCountry ? data.shippingCountry : undefined,
        data.additionalInfo ? data.additionalInfo : undefined
      );
      const changeProofs = keep;
      const remainingProofs = tokens.filter(
        (p: Proof) =>
          !mintKeySetIds?.some((keysetId: MintKeyset) => keysetId.id === p.id)
      ) as Proof[];
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
      setCashuPaymentSent(true);
      setPaymentConfirmed(true);
    } catch {
      setCashuPaymentFailed(true);
    }
  };

  // Calculate discounted price with proper rounding
  const discountAmount =
    appliedDiscount > 0
      ? Math.ceil(((currentPrice * appliedDiscount) / 100) * 100) / 100
      : 0;

  const discountedPrice =
    appliedDiscount > 0 ? currentPrice - discountAmount : currentPrice;

  // Calculate shipping cost based on form type
  const shippingCostToAdd =
    formType === "shipping" ? (productData.shippingCost ?? 0) : 0;

  const discountedTotal = discountedPrice + shippingCostToAdd;

  const renderContactForm = () => {
    if (!formType) return null;

    if (formType === "contact") {
      // For contact orders, show pickup location selection if required
      if (requiresPickupLocation) {
        return (
          <div className="space-y-4">
            <h3 className="text-lg font-semibold">Select Pickup Location</h3>
            <Select
              variant="bordered"
              label="Pickup Location"
              placeholder="Choose a pickup location"
              className="max-w-full"
              selectedKeys={
                selectedPickupLocation ? [selectedPickupLocation] : []
              }
              onChange={(e) => setSelectedPickupLocation(e.target.value)}
              isRequired
            >
              {(productData.pickupLocations || []).map((location) => (
                <SelectItem key={location}>{location}</SelectItem>
              ))}
            </Select>
          </div>
        );
      }
      return null;
    }

    return (
      <div className="space-y-4">
        {formType === "shipping" && (
          <>
            <Controller
              name="Name"
              control={formControl}
              rules={{
                required: "A name is required.",
                maxLength: {
                  value: 50,
                  message: "This input exceed maxLength of 50.",
                },
              }}
              render={({
                field: { onChange, onBlur, value },
                fieldState: { error },
              }) => (
                <Input
                  variant="bordered"
                  fullWidth={true}
                  label={
                    <span>
                      Name <span className="text-red-500">*</span>
                    </span>
                  }
                  labelPlacement="inside"
                  isInvalid={!!error}
                  errorMessage={error?.message}
                  onChange={onChange}
                  onBlur={onBlur}
                  value={value || ""}
                />
              )}
            />

            <Controller
              name="Address"
              control={formControl}
              rules={{
                required: "An address is required.",
                maxLength: {
                  value: 50,
                  message: "This input exceed maxLength of 50.",
                },
              }}
              render={({
                field: { onChange, onBlur, value },
                fieldState: { error },
              }) => (
                <Input
                  variant="bordered"
                  fullWidth={true}
                  label={
                    <span>
                      Address <span className="text-red-500">*</span>
                    </span>
                  }
                  labelPlacement="inside"
                  isInvalid={!!error}
                  errorMessage={error?.message}
                  onChange={onChange}
                  onBlur={onBlur}
                  value={value || ""}
                />
              )}
            />

            <Controller
              name="Unit"
              control={formControl}
              rules={{
                maxLength: {
                  value: 50,
                  message: "This input exceed maxLength of 50.",
                },
              }}
              render={({
                field: { onChange, onBlur, value },
                fieldState: { error },
              }) => (
                <Input
                  variant="bordered"
                  fullWidth={true}
                  label="Apt, suite, unit, etc."
                  labelPlacement="inside"
                  isInvalid={!!error}
                  errorMessage={error?.message}
                  onChange={onChange}
                  onBlur={onBlur}
                  value={value || ""}
                />
              )}
            />

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <Controller
                name="City"
                control={formControl}
                rules={{
                  required: "A city is required.",
                  maxLength: {
                    value: 50,
                    message: "This input exceed maxLength of 50.",
                  },
                }}
                render={({
                  field: { onChange, onBlur, value },
                  fieldState: { error },
                }) => (
                  <Input
                    variant="bordered"
                    fullWidth={true}
                    label={
                      <span>
                        City <span className="text-red-500">*</span>
                      </span>
                    }
                    labelPlacement="inside"
                    isInvalid={!!error}
                    errorMessage={error?.message}
                    onChange={onChange}
                    onBlur={onBlur}
                    value={value || ""}
                  />
                )}
              />

              <Controller
                name="State/Province"
                control={formControl}
                rules={{ required: "A state/province is required." }}
                render={({
                  field: { onChange, onBlur, value },
                  fieldState: { error },
                }) => (
                  <Input
                    variant="bordered"
                    fullWidth={true}
                    label={
                      <span>
                        State/Province <span className="text-red-500">*</span>
                      </span>
                    }
                    labelPlacement="inside"
                    isInvalid={!!error}
                    errorMessage={error?.message}
                    onChange={onChange}
                    onBlur={onBlur}
                    value={value || ""}
                  />
                )}
              />
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <Controller
                name="Postal Code"
                control={formControl}
                rules={{
                  required: "A postal code is required.",
                  maxLength: {
                    value: 50,
                    message: "This input exceed maxLength of 50.",
                  },
                }}
                render={({
                  field: { onChange, onBlur, value },
                  fieldState: { error },
                }) => (
                  <Input
                    variant="bordered"
                    fullWidth={true}
                    label={
                      <span>
                        Postal code <span className="text-red-500">*</span>
                      </span>
                    }
                    labelPlacement="inside"
                    isInvalid={!!error}
                    errorMessage={error?.message}
                    onChange={onChange}
                    onBlur={onBlur}
                    value={value || ""}
                  />
                )}
              />

              <Controller
                name="Country"
                control={formControl}
                rules={{ required: "A country is required." }}
                render={({
                  field: { onChange, onBlur, value },
                  fieldState: { error },
                }) => (
                  <CountryDropdown
                    variant="bordered"
                    aria-label="Select Country"
                    label={
                      <span>
                        Country <span className="text-red-500">*</span>
                      </span>
                    }
                    labelPlacement="inside"
                    isInvalid={!!error}
                    errorMessage={error?.message}
                    onChange={onChange}
                    onBlur={onBlur}
                    value={value || ""}
                  />
                )}
              />
            </div>
          </>
        )}

        {productData.required && productData.required !== "" && (
          <Controller
            name="Required"
            control={formControl}
            rules={{ required: "Additional information is required." }}
            render={({
              field: { onChange, onBlur, value },
              fieldState: { error },
            }) => (
              <Input
                variant="bordered"
                fullWidth={true}
                label={
                  <span>
                    Enter {productData.required}{" "}
                    <span className="text-red-500">*</span>
                  </span>
                }
                labelPlacement="inside"
                isInvalid={!!error}
                errorMessage={error?.message}
                onChange={onChange}
                onBlur={onBlur}
                value={value || ""}
              />
            )}
          />
        )}
      </div>
    );
  };

  if (showInvoiceCard) {
    return (
      <div className="bg-light-bg text-light-text dark:bg-dark-bg dark:text-dark-text flex min-h-screen w-full">
        <div className="mx-auto flex w-full max-w-7xl flex-col lg:flex-row">
          {/* Left Side - Product Summary - maintain same width */}
          <div className="w-full bg-gray-50 p-6 lg:w-1/2 dark:bg-gray-800">
            <div className="sticky top-6">
              <h2 className="mb-6 text-2xl font-bold">Order Summary</h2>

              <div className="mb-6">
                <Image
                  src={productData.images[0]}
                  alt={productData.title}
                  className="mb-4 h-32 w-32 rounded-lg object-cover"
                />

                <h3 className="mb-2 text-xl font-semibold">
                  {productData.title}
                </h3>

                {selectedSize && (
                  <p className="mb-1 text-gray-600 dark:text-gray-400">
                    Size: {selectedSize}
                  </p>
                )}

                {selectedVolume && (
                  <p className="mb-1 text-gray-600 dark:text-gray-400">
                    Volume: {selectedVolume}
                  </p>
                )}

                {selectedWeight && (
                  <p className="mb-1 text-gray-600 dark:text-gray-400">
                    Weight: {selectedWeight}
                  </p>
                )}

                {selectedBulkOption && (
                  <p className="mb-1 text-gray-600 dark:text-gray-400">
                    Bundle: {selectedBulkOption} units
                  </p>
                )}
                <p className="mb-1 text-gray-600 dark:text-gray-400">
                  Quantity: 1
                </p>
              </div>

              <div className="border-t pt-4">
                <div className="space-y-3">
                  <h4 className="font-semibold text-gray-700 dark:text-gray-300">
                    Cost Breakdown
                  </h4>
                  <div className="space-y-2 border-l-2 border-gray-200 pl-3 dark:border-gray-600">
                    <div className="text-sm font-medium">
                      {productData.title}
                    </div>
                    {appliedDiscount > 0 ? (
                      <>
                        <div className="flex justify-between text-sm">
                          <span className="ml-2">Product cost:</span>
                          <span className="text-gray-500 line-through">
                            {formatWithCommas(
                              currentPrice,
                              productData.currency
                            )}
                          </span>
                        </div>
                        {productData.shippingCost! > 0 &&
                          formType === "shipping" && (
                            <div className="flex justify-between text-sm">
                              <span className="ml-2">Shipping cost:</span>
                              <span>
                                {formatWithCommas(
                                  productData.shippingCost!,
                                  productData.currency
                                )}
                              </span>
                            </div>
                          )}
                        <div className="flex justify-between text-sm text-green-600 dark:text-green-400">
                          <span className="ml-2">
                            {discountCode || "Discount"} ({appliedDiscount}%):
                          </span>
                          <span>
                            -
                            {formatWithCommas(
                              discountAmount,
                              productData.currency
                            )}
                          </span>
                        </div>
                        <div className="flex justify-between text-sm font-medium">
                          <span className="ml-2">Discounted price:</span>
                          <span>
                            {formatWithCommas(
                              discountedPrice,
                              productData.currency
                            )}
                          </span>
                        </div>
                      </>
                    ) : (
                      <div className="flex justify-between text-sm">
                        <span className="ml-2">Product cost:</span>
                        <span>
                          {formatWithCommas(currentPrice, productData.currency)}
                        </span>
                      </div>
                    )}
                    {formType === "shipping" &&
                      productData.shippingCost! > 0 && (
                        <div className="flex justify-between text-sm">
                          <span className="ml-2">Shipping cost:</span>
                          <span>
                            {formatWithCommas(
                              productData.shippingCost!,
                              productData.currency
                            )}
                          </span>
                        </div>
                      )}
                  </div>
                  <div className="flex justify-between border-t pt-2 font-semibold">
                    <span>Total:</span>
                    <span>
                      {formatWithCommas(discountedTotal, productData.currency)}
                    </span>
                  </div>
                </div>
              </div>

              <button
                onClick={() => {
                  cancelInvoicePolling();
                  setIsBeingPaid(false);
                }}
                className="text-shopstr-purple hover:text-shopstr-purple-light dark:text-shopstr-yellow dark:hover:text-shopstr-yellow-light mt-4 underline"
              >
                ← Back to product
              </button>
            </div>
          </div>

          {/* Divider */}
          <div className="h-px w-full bg-gray-300 lg:h-full lg:w-px dark:bg-gray-600"></div>

          {/* Right Side - Lightning Invoice - maintain consistent width */}
          <div className="w-full p-6 lg:w-1/2">
            <div className="w-full">
              <div className="mb-6">
                <h2 className="text-2xl font-bold">Lightning Invoice</h2>
              </div>
              <div className="flex flex-col items-center">
                {!paymentConfirmed ? (
                  <div className="flex flex-col items-center justify-center">
                    {qrCodeUrl && (
                      <>
                        <h3 className="text-light-text dark:text-dark-text mt-3 text-center text-lg leading-6 font-medium text-gray-900">
                          Don&apos;t refresh or close the page until the payment
                          has been confirmed!
                        </h3>
                        <Image
                          alt="Lightning invoice"
                          className="object-cover"
                          src={qrCodeUrl}
                        />
                        <div className="flex items-center justify-center">
                          <p className="text-center">
                            {invoice.length > 30
                              ? `${invoice.substring(
                                  0,
                                  10
                                )}...${invoice.substring(
                                  invoice.length - 10,
                                  invoice.length
                                )}`
                              : invoice}
                          </p>
                          <ClipboardIcon
                            onClick={handleCopyInvoice}
                            className={`text-light-text dark:text-dark-text ml-2 h-4 w-4 cursor-pointer ${
                              copiedToClipboard ? "hidden" : ""
                            }`}
                          />
                          <CheckIcon
                            className={`text-light-text dark:text-dark-text ml-2 h-4 w-4 cursor-pointer ${
                              copiedToClipboard ? "" : "hidden"
                            }`}
                          />
                        </div>
                      </>
                    )}
                    {!qrCodeUrl && (
                      <div>
                        <p>Waiting for payment invoice...</p>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center">
                    <h3 className="mt-3 text-center text-lg leading-6 font-medium text-gray-900">
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
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-light-bg text-light-text dark:bg-dark-bg dark:text-dark-text flex min-h-screen w-full">
      <div className="mx-auto flex w-full max-w-7xl flex-col lg:flex-row">
        {/* Left Side - Product Summary */}
        <div className="w-full bg-gray-50 p-6 lg:w-1/2 dark:bg-gray-800">
          <div className="sticky top-6">
            <h2 className="mb-6 text-2xl font-bold">Order Summary</h2>

            <div className="mb-6">
              <Image
                src={productData.images[0]}
                alt={productData.title}
                className="mb-4 h-32 w-32 rounded-lg object-cover"
              />

              <h3 className="mb-2 text-xl font-semibold">
                {productData.title}
              </h3>

              {selectedSize && (
                <p className="mb-1 text-gray-600 dark:text-gray-400">
                  Size: {selectedSize}
                </p>
              )}

              {selectedVolume && (
                <p className="mb-1 text-gray-600 dark:text-gray-400">
                  Volume: {selectedVolume}
                </p>
              )}

              {selectedWeight && (
                <p className="mb-1 text-gray-600 dark:text-gray-400">
                  Weight: {selectedWeight}
                </p>
              )}

              {selectedBulkOption && (
                <p className="mb-1 text-gray-600 dark:text-gray-400">
                  Bundle: {selectedBulkOption} units
                </p>
              )}
              <p className="mb-1 text-gray-600 dark:text-gray-400">
                Quantity: 1
              </p>
            </div>

            <div className="border-t pt-4">
              <div className="space-y-3">
                <h4 className="font-semibold text-gray-700 dark:text-gray-300">
                  Cost Breakdown
                </h4>
                <div className="space-y-2 border-l-2 border-gray-200 pl-3 dark:border-gray-600">
                  <div className="text-sm font-medium">{productData.title}</div>
                  {appliedDiscount > 0 ? (
                    <>
                      <div className="flex justify-between text-sm">
                        <span className="ml-2">Product cost:</span>
                        <span className="text-gray-500 line-through">
                          {formatWithCommas(currentPrice, productData.currency)}
                        </span>
                      </div>
                      <div className="flex justify-between text-sm text-green-600 dark:text-green-400">
                        <span className="ml-2">
                          {discountCode || "Discount"} ({appliedDiscount}%):
                        </span>
                        <span>
                          -
                          {formatWithCommas(
                            discountAmount,
                            productData.currency
                          )}
                        </span>
                      </div>
                      <div className="flex justify-between text-sm font-medium">
                        <span className="ml-2">Discounted price:</span>
                        <span>
                          {formatWithCommas(
                            discountedPrice,
                            productData.currency
                          )}
                        </span>
                      </div>
                    </>
                  ) : (
                    <div className="flex justify-between text-sm">
                      <span className="ml-2">Product cost:</span>
                      <span>
                        {formatWithCommas(currentPrice, productData.currency)}
                      </span>
                    </div>
                  )}
                  {formType === "shipping" && productData.shippingCost! > 0 && (
                    <div className="flex justify-between text-sm">
                      <span className="ml-2">Shipping cost:</span>
                      <span>
                        {formatWithCommas(
                          productData.shippingCost!,
                          productData.currency
                        )}
                      </span>
                    </div>
                  )}
                </div>
                <div className="flex justify-between border-t pt-2 font-semibold">
                  <span>Total:</span>
                  <span>
                    {formatWithCommas(discountedTotal, productData.currency)}
                  </span>
                </div>
              </div>
            </div>

            <button
              onClick={() => {
                cancelInvoicePolling();
                setIsBeingPaid(false);
              }}
              className="text-shopstr-purple hover:text-shopstr-purple-light dark:text-shopstr-yellow dark:hover:text-shopstr-yellow-light mt-4 underline"
            >
              ← Back to product
            </button>
          </div>
        </div>

        {/* Divider */}
        <div className="h-px w-full bg-gray-300 lg:h-full lg:w-px dark:bg-gray-600"></div>

        {/* Right Side - Order Type Selection, Forms, and Payment */}
        <div className="w-full p-6 lg:w-1/2">
          {/* Order Type Selection */}
          {showOrderTypeSelection && (
            <>
              <h2 className="mb-6 text-2xl font-bold">Select Order Type</h2>
              <div className="space-y-4">
                {productData.shippingType === "Free/Pickup" ? (
                  <>
                    <button
                      onClick={() => handleOrderTypeSelection("shipping")}
                      className="w-full rounded-lg border border-gray-300 bg-white p-4 text-left hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-700 dark:hover:bg-gray-600"
                    >
                      <div className="font-medium">Free shipping</div>
                      <div className="text-sm text-gray-500 dark:text-gray-400">
                        Get it shipped to your address
                      </div>
                    </button>
                    <button
                      onClick={() => handleOrderTypeSelection("contact")}
                      className="w-full rounded-lg border border-gray-300 bg-white p-4 text-left hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-700 dark:hover:bg-gray-600"
                    >
                      <div className="font-medium">Pickup</div>
                      <div className="text-sm text-gray-500 dark:text-gray-400">
                        Arrange pickup with seller
                      </div>
                    </button>
                  </>
                ) : productData.shippingType === "Free" ||
                  productData.shippingType === "Added Cost" ? (
                  <button
                    onClick={() => handleOrderTypeSelection("shipping")}
                    className="w-full rounded-lg border border-gray-300 bg-white p-4 text-left hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-700 dark:hover:bg-gray-600"
                  >
                    <div className="font-medium">
                      Online order with shipping
                    </div>
                    <div className="text-sm text-gray-500 dark:text-gray-400">
                      Get it shipped to your address
                    </div>
                  </button>
                ) : (
                  <button
                    onClick={() => handleOrderTypeSelection("contact")}
                    className="w-full rounded-lg border border-gray-300 bg-white p-4 text-left hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-700 dark:hover:bg-gray-600"
                  >
                    <div className="font-medium">Online order</div>
                    <div className="text-sm text-gray-500 dark:text-gray-400">
                      Digital or pickup delivery
                    </div>
                  </button>
                )}
              </div>
            </>
          )}

          {/* Contact/Shipping Form */}
          {formType && (
            <>
              {formType === "shipping" && (
                <h2 className="mb-6 text-2xl font-bold">
                  Shipping Information
                </h2>
              )}
              {formType === "contact" && (
                <h2 className="mb-6 text-2xl font-bold">Payment Method</h2>
              )}

              <form
                onSubmit={handleFormSubmit((data) => onFormSubmit(data))}
                className="space-y-6"
              >
                {renderContactForm()}

                <div
                  className={`space-y-4 ${
                    formType === "shipping" ? "border-t pt-6" : ""
                  }`}
                >
                  {formType === "shipping" && (
                    <h3 className="mb-4 text-lg font-semibold">
                      Payment Method
                    </h3>
                  )}

                  <Button
                    className={`${SHOPSTRBUTTONCLASSNAMES} w-full ${
                      !isFormValid ? "cursor-not-allowed opacity-50" : ""
                    }`}
                    disabled={!isFormValid}
                    onClick={() => {
                      if (!isLoggedIn) {
                        onOpen();
                        return;
                      }
                      handleFormSubmit((data) =>
                        onFormSubmit(data, "lightning")
                      )();
                    }}
                    startContent={<BoltIcon className="h-6 w-6" />}
                  >
                    Pay with Lightning: {formattedTotalCost}
                  </Button>

                  {hasTokensAvailable && (
                    <Button
                      className={`${SHOPSTRBUTTONCLASSNAMES} w-full ${
                        !isFormValid ? "cursor-not-allowed opacity-50" : ""
                      }`}
                      disabled={!isFormValid}
                      onClick={() => {
                        if (!isLoggedIn) {
                          onOpen();
                          return;
                        }
                        handleFormSubmit((data) =>
                          onFormSubmit(data, "cashu")
                        )();
                      }}
                      startContent={<BanknotesIcon className="h-6 w-6" />}
                    >
                      Pay with Cashu: {formattedTotalCost}
                    </Button>
                  )}
                  {/* NWC Button */}
                  {nwcInfo && (
                    <Button
                      className={`${SHOPSTRBUTTONCLASSNAMES} w-full ${
                        !isFormValid ? "cursor-not-allowed opacity-50" : ""
                      }`}
                      disabled={!isFormValid || isNwcLoading}
                      isLoading={isNwcLoading}
                      onClick={() => {
                        if (!isLoggedIn) {
                          onOpen();
                          return;
                        }
                        // We must call handleFormSubmit to get the validated form data
                        handleFormSubmit((data) =>
                          // Then pass that data to our new NWC payment handler
                          onFormSubmit(data, "nwc")
                        )();
                      }}
                      startContent={<WalletIcon className="h-6 w-6" />}
                    >
                      Pay with {nwcInfo.alias || "NWC"}: {formattedTotalCost}
                    </Button>
                  )}
                </div>
              </form>
            </>
          )}
        </div>
      </div>

      <SignInModal isOpen={isOpen} onClose={onClose} />

      <FailureModal
        bodyText={failureText}
        isOpen={showFailureModal}
        onClose={() => {
          setShowFailureModal(false);
          setFailureText("");
        }}
      />
    </div>
  );
}
