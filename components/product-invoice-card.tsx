import { useContext, useState, useEffect, useRef } from "react";
import {
  CashuWalletContext,
  ChatsContext,
  ProfileMapContext,
  ShopMapContext,
} from "../utils/context/context";
import { useForm } from "react-hook-form";
import {
  Button,
  Image,
  useDisclosure,
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  Select,
  SelectItem,
  Input,
} from "@nextui-org/react";
import {
  BanknotesIcon,
  BoltIcon,
  CheckIcon,
  ClipboardIcon,
  CurrencyDollarIcon,
  WalletIcon,
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
import { LightningAddress } from "@getalby/lightning-tools";
import QRCode from "qrcode";
import { v4 as uuidv4 } from "uuid";
import { nip19 } from "nostr-tools";
import { webln } from "@getalby/sdk";
import { ProductData } from "@/utils/parsers/product-parser-functions";
import { formatWithCommas } from "./utility-components/display-monetary-info";
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
import StripeCardForm from "./utility-components/stripe-card-form";

export default function ProductInvoiceCard({
  productData,
  setIsBeingPaid,
  setFiatOrderIsPlaced,
  setFiatOrderFailed,
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
  isSubscription,
  subscriptionFrequency,
  subscriptionDiscount,
  originalPrice,
}: {
  productData: ProductData;
  setIsBeingPaid: (isBeingPaid: boolean) => void;
  setFiatOrderIsPlaced: (fiatOrderIsPlaced: boolean) => void;
  setFiatOrderFailed: (fiatOrderFailed: boolean) => void;
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
  isSubscription?: boolean;
  subscriptionFrequency?: string;
  subscriptionDiscount?: number;
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
  const shopContext = useContext(ShopMapContext);

  const [showInvoiceCard, setShowInvoiceCard] = useState(false);

  const [paymentConfirmed, setPaymentConfirmed] = useState(false);
  const [qrCodeUrl, setQrCodeUrl] = useState<string | null>(null);
  const [invoice, setInvoice] = useState("");
  const [copiedToClipboard, setCopiedToClipboard] = useState(false);

  const [orderConfirmed, setOrderConfirmed] = useState(false);

  const pendingOrderEmailRef = useRef<{
    orderId: string;
    productTitle: string;
    amount: string;
    currency: string;
    paymentMethod: string;
    sellerPubkey: string;
    buyerName?: string;
    shippingAddress?: string;
    buyerContact?: string;
    pickupLocation?: string;
    selectedSize?: string;
    selectedVolume?: string;
    selectedWeight?: string;
    selectedBulkOption?: string;
  } | null>(null);

  const [buyerEmail, setBuyerEmail] = useState("");
  const [buyerEmailAutoFilled, setBuyerEmailAutoFilled] = useState(false);
  const [emailError, setEmailError] = useState("");

  useEffect(() => {
    if (isLoggedIn && userPubkey && !buyerEmailAutoFilled) {
      fetch(`/api/email/notification-email?pubkey=${userPubkey}&role=buyer`)
        .then((res) => res.json())
        .then((data) => {
          if (data.email) {
            setBuyerEmail(data.email);
            setBuyerEmailAutoFilled(true);
          }
        })
        .catch(() => {});
    }
  }, [isLoggedIn, userPubkey, buyerEmailAutoFilled]);

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

  const triggerOrderEmail = async (params: {
    orderId: string;
    productTitle: string;
    amount: string;
    currency: string;
    paymentMethod: string;
    sellerPubkey: string;
    buyerName?: string;
    shippingAddress?: string;
    buyerContact?: string;
    pickupLocation?: string;
    selectedSize?: string;
    selectedVolume?: string;
    selectedWeight?: string;
    selectedBulkOption?: string;
  }) => {
    try {
      await fetch("/api/email/send-order-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          buyerEmail: buyerEmail || undefined,
          buyerPubkey: userPubkey || undefined,
          sellerPubkey: params.sellerPubkey,
          orderId: params.orderId,
          productTitle: params.productTitle,
          amount: params.amount,
          currency: params.currency,
          paymentMethod: params.paymentMethod,
          buyerName: params.buyerName,
          shippingAddress: params.shippingAddress,
          buyerContact: params.buyerContact,
          pickupLocation: params.pickupLocation,
          selectedSize: params.selectedSize,
          selectedVolume: params.selectedVolume,
          selectedWeight: params.selectedWeight,
          selectedBulkOption: params.selectedBulkOption,
        }),
      });
    } catch (e) {}
  };

  const sendInquiryDM = async (sellerPubkey: string, productTitle: string) => {
    if (!signer || !nostr || !userPubkey) return;

    try {
      const inquiryMessage = `I just placed an order for your ${productTitle} listing on Milk Market! Please check your Milk Market order dashboard for any relevant information.`;

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

      await sendGiftWrappedMessageEvent(nostr, giftWrappedEventForSeller);
      await sendGiftWrappedMessageEvent(nostr, giftWrappedEventForBuyer);

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

  const [fiatPaymentOptions, setFiatPaymentOptions] = useState({});
  const [showFiatTypeOption, setShowFiatTypeOption] = useState(false);
  const [selectedFiatOption, setSelectedFiatOption] = useState("");
  const [isNwcLoading, setIsNwcLoading] = useState(false);
  const [nwcInfo, setNwcInfo] = useState<any | null>(null);
  const [showFiatPaymentInstructions, setShowFiatPaymentInstructions] =
    useState(false);
  const [fiatPaymentConfirmed, setFiatPaymentConfirmed] = useState(false);

  // State for failure modal
  const [showFailureModal, setShowFailureModal] = useState(false);
  const [failureText, setFailureText] = useState("");

  // Stripe payment states
  const [stripeClientSecret, setStripeClientSecret] = useState<string | null>(
    null
  );
  const [_stripePaymentIntentId, setStripePaymentIntentId] = useState<
    string | null
  >(null);
  const [stripePaymentConfirmed, setStripePaymentConfirmed] = useState(false);
  const [_stripeTimeoutSeconds, setStripeTimeoutSeconds] =
    useState<number>(600); // 10 minutes
  const [hasTimedOut, setHasTimedOut] = useState(false);
  const [stripeConnectedAccountForForm, setStripeConnectedAccountForForm] =
    useState<string | null>(null);
  const [pendingStripeData, setPendingStripeData] = useState<any>(null);

  useEffect(() => {
    if (
      (paymentConfirmed || stripePaymentConfirmed) &&
      pendingOrderEmailRef.current
    ) {
      triggerOrderEmail(pendingOrderEmailRef.current);

      try {
        sessionStorage.setItem(
          "orderSummary",
          JSON.stringify({
            productTitle: pendingOrderEmailRef.current.productTitle,
            productImage: productData.images[0] || "",
            amount: pendingOrderEmailRef.current.amount,
            currency: pendingOrderEmailRef.current.currency,
            paymentMethod: pendingOrderEmailRef.current.paymentMethod,
            orderId: pendingOrderEmailRef.current.orderId,
            shippingCost: productData.shippingCost
              ? String(productData.shippingCost)
              : undefined,
            selectedSize,
            selectedVolume,
            selectedWeight,
            selectedBulkOption: selectedBulkOption
              ? String(selectedBulkOption)
              : undefined,
            buyerEmail: buyerEmail || undefined,
            shippingAddress: pendingOrderEmailRef.current.shippingAddress,
            pickupLocation: selectedPickupLocation || undefined,
            sellerPubkey: pendingOrderEmailRef.current.sellerPubkey,
            isSubscription: isSubscription && !!subscriptionFrequency,
          })
        );
      } catch {}

      pendingOrderEmailRef.current = null;
    }
  }, [paymentConfirmed, stripePaymentConfirmed]);

  // Timeout constants
  const STRIPE_TIMEOUT_SECONDS = 600; // 10 minutes total timeout

  const [isFormValid, setIsFormValid] = useState(false);
  const [pendingPaymentData, setPendingPaymentData] = useState<any>(null);

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

  const [isStripeMerchant, setIsStripeMerchant] = useState(
    productData.pubkey === process.env.NEXT_PUBLIC_MILK_MARKET_PK
  );
  const [sellerConnectedAccountId, setSellerConnectedAccountId] = useState<
    string | null
  >(null);

  useEffect(() => {
    const checkSellerStripe = async () => {
      if (productData.pubkey === process.env.NEXT_PUBLIC_MILK_MARKET_PK) {
        setIsStripeMerchant(true);
        return;
      }
      try {
        const res = await fetch("/api/stripe/connect/seller-status", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ pubkey: productData.pubkey }),
        });
        if (res.ok) {
          const data = await res.json();
          if (data.hasStripeAccount && data.chargesEnabled) {
            setIsStripeMerchant(true);
          }
        }
      } catch {
        // keep default
      }
    };
    checkSellerStripe();
  }, [productData.pubkey]);

  useEffect(() => {
    const fetchConnectedAccountId = async () => {
      if (productData.pubkey === process.env.NEXT_PUBLIC_MILK_MARKET_PK) return;
      try {
        const res = await fetch("/api/stripe/connect/seller-status", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ pubkey: productData.pubkey }),
        });
        if (res.ok) {
          const data = await res.json();
          if (
            data.hasStripeAccount &&
            data.chargesEnabled &&
            data.connectedAccountId
          ) {
            setSellerConnectedAccountId(data.connectedAccountId);
          }
        }
      } catch {
        // keep null
      }
    };
    fetchConnectedAccountId();
  }, [productData.pubkey]);

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
    const sellerProfile = profileContext.profileData.get(productData.pubkey);
    const fiatOptions = sellerProfile?.content?.fiat_options || {};
    setFiatPaymentOptions(fiatOptions);
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

  // Stripe payment timeout countdown
  useEffect(() => {
    if (!stripeClientSecret || stripePaymentConfirmed || hasTimedOut) {
      return;
    }

    const interval = setInterval(() => {
      setStripeTimeoutSeconds((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          setHasTimedOut(true);
          setShowInvoiceCard(false);
          setStripeClientSecret(null);
          setStripePaymentIntentId(null);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [stripeClientSecret, stripePaymentConfirmed, hasTimedOut]);

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

  const [stripeSubscriptionId, setStripeSubscriptionId] = useState<
    string | null
  >(null);

  const sendPaymentAndContactMessage = async (
    pubkeyToReceiveMessage: string,
    message: string,
    isPayment?: boolean,
    isReceipt?: boolean,
    isDonation?: boolean,
    isHerdshare?: boolean,
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
    retryCount: number = 3,
    subscriptionInfoParam?: {
      enabled: boolean;
      frequency: string;
      stripeSubscriptionId?: string;
    }
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
        orderCurrency: productData.currency || undefined,
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
        subscriptionInfo: subscriptionInfoParam,
      };
    } else if (isReceipt) {
      messageSubject = "order-receipt";
      messageOptions = {
        isOrder: true,
        type: 4,
        orderAmount: messageAmount ? messageAmount : productData.totalCost,
        orderCurrency: productData.currency || undefined,
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
        subscriptionInfo: subscriptionInfoParam,
      };
    } else if (isDonation) {
      messageSubject = "donation";
    } else if (orderId || isHerdshare) {
      messageSubject = "order-info";
      messageOptions = {
        isOrder: true,
        type: 1,
        orderAmount: messageAmount ? messageAmount : productData.totalCost,
        orderCurrency: productData.currency || undefined,
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
        subscriptionInfo: subscriptionInfoParam,
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

        await sendGiftWrappedMessageEvent(nostr!, giftWrappedEvent);

        if (isReceipt || isHerdshare) {
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
    paymentType?: "fiat" | "lightning" | "cashu" | "nwc" | "stripe"
  ) => {
    try {
      let price =
        paymentType === "lightning" ||
        paymentType === "cashu" ||
        paymentType === "nwc"
          ? bitcoinTotal
          : paymentType === "stripe"
            ? stripeTotal
            : paymentType === "fiat"
              ? discountedTotal
              : discountedTotal;

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

      if (paymentType === "fiat") {
        setPendingPaymentData(paymentData); // Store the payment data
        const fiatOptionKeys = Object.keys(fiatPaymentOptions);
        if (fiatOptionKeys.length === 1) {
          setSelectedFiatOption(fiatOptionKeys[0]!);
          // Show payment instructions
          setShowFiatPaymentInstructions(true);
        } else if (fiatOptionKeys.length > 1) {
          setShowFiatTypeOption(true);
        }
        return; // Important: exit early for fiat payments
      }

      const emailAddressTag =
        paymentData.shippingName && paymentData.shippingAddress
          ? `${paymentData.shippingName}, ${paymentData.shippingAddress}, ${
              paymentData.shippingCity || ""
            }, ${paymentData.shippingState || ""}, ${
              paymentData.shippingPostalCode || ""
            }, ${paymentData.shippingCountry || ""}`
          : undefined;
      const isSatsProduct =
        !productData.currency ||
        productData.currency.toLowerCase() === "sats" ||
        productData.currency.toLowerCase() === "sat";
      pendingOrderEmailRef.current = {
        orderId: "",
        productTitle: productData.title,
        amount: !isSatsProduct ? String(productData.totalCost) : String(price),
        currency: productData.currency || "sats",
        paymentMethod: paymentType || "lightning",
        sellerPubkey: productData.pubkey,
        buyerName: paymentData.shippingName || undefined,
        shippingAddress: emailAddressTag,
        buyerContact:
          paymentData.contactEmail || paymentData.contactPhone || undefined,
        pickupLocation: selectedPickupLocation || undefined,
        selectedSize: selectedSize || undefined,
        selectedVolume: selectedVolume || undefined,
        selectedWeight: selectedWeight || undefined,
        selectedBulkOption: selectedBulkOption
          ? String(selectedBulkOption)
          : undefined,
      };

      if (paymentType === "cashu") {
        await handleCashuPayment(price, paymentData);
      } else if (paymentType === "nwc") {
        await handleNWCPayment(price, paymentData);
      } else if (paymentType === "stripe") {
        await handleStripePayment(price, paymentData);
      } else {
        await handleLightningPayment(price, paymentData);
      }
    } catch (error) {
      setCashuPaymentFailed(true);
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
    let nwc: webln.NostrWebLNProvider | null = null;

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
      const { request: pr, quote: hash } =
        await wallet.createMintQuote(convertedPrice);

      const { nwcString } = getLocalStorageData();
      if (!nwcString) throw new Error("NWC connection not found.");

      nwc = new webln.NostrWebLNProvider({ nostrWalletConnectUrl: nwcString });
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

  const handleFiatPayment = async (convertedPrice: number, data: any) => {
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
      const title = productData.title;
      const pubkey = productData.pubkey;
      const required = productData.required;
      const orderId = uuidv4();

      if (
        pendingOrderEmailRef.current &&
        !pendingOrderEmailRef.current.orderId
      ) {
        pendingOrderEmailRef.current.orderId = orderId;
      }

      // Construct address tag early so it can be passed to all messages
      const addressTag =
        data.shippingName && data.shippingAddress
          ? data.shippingUnitNo
            ? `${data.shippingName}, ${data.shippingAddress}, ${data.shippingUnitNo}, ${data.shippingCity}, ${data.shippingState}, ${data.shippingPostalCode}, ${data.shippingCountry}`
            : `${data.shippingName}, ${data.shippingAddress}, ${data.shippingCity}, ${data.shippingState}, ${data.shippingPostalCode}, ${data.shippingCountry}`
          : undefined;

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
          productDetails += " and weighing " + selectedWeight;
        } else {
          productDetails += " weighing " + selectedWeight;
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

      const paymentMessage =
        "You have received an order from " +
        (userNPub || "a guest buyer") +
        " for your " +
        title +
        " listing on Milk Market" +
        productDetails +
        "! Check your " +
        selectedFiatOption +
        " account for the payment.";

      await sendPaymentAndContactMessage(
        pubkey,
        paymentMessage,
        true,
        false,
        false,
        false,
        orderId,
        selectedFiatOption.toLowerCase(),
        selectedFiatOption.toLowerCase() === "cash"
          ? "in-person"
          : (fiatPaymentOptions as any)[selectedFiatOption] ||
              selectedFiatOption,
        undefined,
        undefined,
        undefined,
        addressTag,
        selectedPickupLocation || undefined
      );

      if (required && required !== "") {
        if (data.additionalInfo) {
          const additionalMessage =
            "Additional customer information: " + data.additionalInfo;
          await sendPaymentAndContactMessage(
            pubkey,
            additionalMessage,
            false,
            false,
            false,
            false,
            orderId
          );
        }
      }

      // Send herdshare agreement if product has one
      if (productData.herdshareAgreement) {
        const herdshareMessage =
          "To finalize your purchase, sign and send the following herdshare agreement for the dairy: " +
          productData.herdshareAgreement;
        await sendPaymentAndContactMessage(
          userPubkey!,
          herdshareMessage,
          false,
          false,
          false,
          true,
          orderId
        );
      }

      if (
        !(
          data.shippingName === undefined &&
          data.shippingAddress === undefined &&
          data.shippingUnitNo === undefined &&
          data.shippingCity === undefined &&
          data.shippingPostalCode === undefined &&
          data.shippingState === undefined &&
          data.shippingCountry === undefined &&
          data.contact === undefined &&
          data.contactType === undefined &&
          data.contactInstructions === undefined
        )
      ) {
        if (
          productData.shippingType === "Added Cost" ||
          productData.shippingType === "Free" ||
          ((productData.shippingType === "Free/Pickup" ||
            productData.shippingType === "Added Cost/Pickup") &&
            formType === "shipping")
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
              productDetails += " and weighing " + selectedWeight;
            } else {
              productDetails += " weighing " + selectedWeight;
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
          if (!data.shippingUnitNo) {
            contactMessage =
              "Please ship the product" +
              productDetails +
              " to " +
              data.shippingName +
              " at " +
              data.shippingAddress +
              ", " +
              data.shippingCity +
              ", " +
              data.shippingPostalCode +
              ", " +
              data.shippingState +
              ", " +
              data.shippingCountry +
              ".";
          } else {
            contactMessage =
              "Please ship the product" +
              productDetails +
              " to " +
              data.shippingName +
              " at " +
              data.shippingAddress +
              " " +
              data.shippingUnitNo +
              ", " +
              data.shippingCity +
              ", " +
              data.shippingPostalCode +
              ", " +
              data.shippingState +
              ", " +
              data.shippingCountry +
              ".";
          }
          const addressTag = data.shippingUnitNo
            ? `${data.shippingName}, ${data.shippingAddress}, ${data.shippingUnitNo}, ${data.shippingCity}, ${data.shippingState}, ${data.shippingPostalCode}, ${data.shippingCountry}`
            : `${data.shippingName}, ${data.shippingAddress}, ${data.shippingCity}, ${data.shippingState}, ${data.shippingPostalCode}, ${data.shippingCountry}`;
          await sendPaymentAndContactMessage(
            pubkey,
            contactMessage,
            false,
            false,
            false,
            false,
            orderId,
            undefined,
            undefined,
            undefined,
            undefined,
            undefined,
            addressTag
          );

          if (userPubkey) {
            const fiatReference =
              selectedFiatOption.toLowerCase() === "cash"
                ? "in-person"
                : (fiatPaymentOptions as any)[selectedFiatOption] ||
                  selectedFiatOption;
            const fiatProof =
              selectedFiatOption.toLowerCase() === "cash"
                ? "in-person"
                : (fiatPaymentOptions as any)[selectedFiatOption] || "";
            const receiptMessage =
              "Your order for " +
              productData.title +
              productDetails +
              " was processed successfully! If applicable, you should be receiving delivery information from " +
              nip19.npubEncode(productData.pubkey) +
              " as soon as they review your order.";
            await sendPaymentAndContactMessage(
              userPubkey,
              receiptMessage,
              false,
              true, // isReceipt is true
              false,
              false,
              orderId,
              selectedFiatOption.toLowerCase(),
              fiatReference,
              fiatProof,
              undefined,
              undefined,
              addressTag,
              selectedPickupLocation || undefined
            );
          }
        } else if (
          productData.shippingType === "N/A" ||
          productData.shippingType === "Pickup" ||
          ((productData.shippingType === "Free/Pickup" ||
            productData.shippingType === "Added Cost/Pickup") &&
            formType === "contact")
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
              productDetails += " and weighing " + selectedWeight;
            } else {
              productDetails += " weighing " + selectedWeight;
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
            const fiatReference =
              selectedFiatOption.toLowerCase() === "cash"
                ? "in-person"
                : (fiatPaymentOptions as any)[selectedFiatOption] ||
                  selectedFiatOption;
            const fiatProof =
              selectedFiatOption.toLowerCase() === "cash"
                ? "in-person"
                : (fiatPaymentOptions as any)[selectedFiatOption] || "";
            await sendPaymentAndContactMessage(
              userPubkey,
              receiptMessage,
              false,
              true,
              false,
              false,
              orderId,
              selectedFiatOption.toLowerCase(),
              fiatReference,
              fiatProof,
              undefined,
              undefined,
              undefined,
              selectedPickupLocation || undefined
            );
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
            productDetails += " and weighing " + selectedWeight;
          } else {
            productDetails += " weighing " + selectedWeight;
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

        const fiatReference =
          selectedFiatOption.toLowerCase() === "cash"
            ? "in-person"
            : (fiatPaymentOptions as any)[selectedFiatOption] ||
              selectedFiatOption;
        const fiatProof =
          selectedFiatOption.toLowerCase() === "cash"
            ? "in-person"
            : (fiatPaymentOptions as any)[selectedFiatOption] || "";
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
          false,
          orderId,
          selectedFiatOption.toLowerCase(),
          fiatReference,
          fiatProof,
          undefined,
          undefined,
          addressTag,
          selectedPickupLocation || undefined
        );
      }
      setFiatOrderIsPlaced(true);
      setFormType(null);
      setOrderConfirmed(true);

      try {
        sessionStorage.setItem(
          "orderSummary",
          JSON.stringify({
            productTitle: title,
            productImage: productData.images[0] || "",
            amount: String(productData.totalCost),
            currency: productData.currency || "sats",
            paymentMethod: selectedFiatOption || "fiat",
            orderId: orderId || "",
            shippingCost: productData.shippingCost
              ? String(productData.shippingCost)
              : undefined,
            selectedSize,
            selectedVolume,
            selectedWeight,
            selectedBulkOption: selectedBulkOption
              ? String(selectedBulkOption)
              : undefined,
            buyerEmail: buyerEmail || undefined,
            shippingAddress: addressTag,
            pickupLocation: selectedPickupLocation || undefined,
            sellerPubkey: pubkey,
            isSubscription: isSubscription && !!subscriptionFrequency,
          })
        );
      } catch {}

      triggerOrderEmail({
        orderId: orderId || "",
        productTitle: title,
        amount: String(productData.totalCost),
        currency: productData.currency || "sats",
        paymentMethod: selectedFiatOption || "fiat",
        sellerPubkey: pubkey,
        buyerName: data.shippingName || data.contactName || undefined,
        shippingAddress: addressTag,
        buyerContact: data.contactEmail || data.contactPhone || undefined,
        pickupLocation: selectedPickupLocation || undefined,
        selectedSize: selectedSize || undefined,
        selectedVolume: selectedVolume || undefined,
        selectedWeight: selectedWeight || undefined,
        selectedBulkOption: selectedBulkOption
          ? String(selectedBulkOption)
          : undefined,
      });
    } catch (error) {
      setFiatOrderFailed(true);
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
        data.shippingName ? data.shippingName : undefined,
        data.shippingAddress ? data.shippingAddress : undefined,
        data.shippingUnitNo ? data.shippingUnitNo : undefined,
        data.shippingCity ? data.shippingCity : undefined,
        data.shippingPostalCode ? data.shippingPostalCode : undefined,
        data.shippingState ? data.shippingState : undefined,
        data.shippingCountry ? data.shippingCountry : undefined,
        data.additionalInfo ? data.additionalInfo : undefined
      );
    } catch (error) {
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
                additionalInfo ? additionalInfo : undefined
              );
              setPaymentConfirmed(true);
              setQrCodeUrl(null);
              if (discountCode && productData.pubkey) {
                fetch("/api/db/discount-code-used", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    code: discountCode,
                    pubkey: productData.pubkey,
                  }),
                }).catch(() => {});
              }
              setInvoiceIsPaid(true);
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
              setFailureText(
                "Payment was received but your connection dropped! Please check your wallet balance."
              );
              setShowFailureModal(true);
              break;
            }
            throw mintError;
          }
        } else if (quoteState.state === "ISSUED") {
          // Quote was already processed successfully
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

    if (pendingOrderEmailRef.current && !pendingOrderEmailRef.current.orderId) {
      pendingOrderEmailRef.current.orderId = orderId;
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
              productDetails += " and weighing " + selectedWeight;
            } else {
              productDetails += " weighing " + selectedWeight;
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
            " on Milk Market! Check your Lightning address (" +
            lnurl +
            ") for your sats.";
          await sendPaymentAndContactMessage(
            productData.pubkey,
            paymentMessage,
            true,
            false,
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
              productDetails += " and weighing " + selectedWeight;
            } else {
              productDetails += " weighing " + selectedWeight;
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
              " on Milk Market: " +
              unusedToken;
            await sendPaymentAndContactMessage(
              productData.pubkey,
              paymentMessage,
              true,
              false,
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
          productDetails += " and weighing " + selectedWeight;
        } else {
          productDetails += " weighing " + selectedWeight;
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
          " on Milk Market: " +
          sellerToken;
        await sendPaymentAndContactMessage(
          productData.pubkey,
          paymentMessage,
          true,
          false,
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

    // Send herdshare agreement if product has one
    if (productData.herdshareAgreement) {
      const herdshareMessage =
        "To finalize your purchase, sign and send the following herdshare agreement for the dairy: " +
        productData.herdshareAgreement;
      await sendPaymentAndContactMessage(
        userPubkey!,
        herdshareMessage,
        false,
        false,
        false,
        true,
        orderId
      );
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
        productData.shippingType === "Free/Pickup" ||
        productData.shippingType === "Added Cost/Pickup"
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
            productDetails += " and weighing " + selectedWeight;
          } else {
            productDetails += " weighing " + selectedWeight;
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
          productDetails += " and weighing " + selectedWeight;
        } else {
          productDetails += " weighing " + selectedWeight;
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
          productDetails += " and weighing " + selectedWeight;
        } else {
          productDetails += " weighing " + selectedWeight;
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
      setCashuPaymentSent(true);
      setPaymentConfirmed(true);
    } catch (error) {
      setCashuPaymentFailed(true);
    }
  };

  const handleStripePayment = async (convertedPrice: number, data: any) => {
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

      const orderId = uuidv4();

      if (
        pendingOrderEmailRef.current &&
        !pendingOrderEmailRef.current.orderId
      ) {
        pendingOrderEmailRef.current.orderId = orderId;
      }

      let stripeAmount: number;
      let stripeCurrency: string;

      const currencyLower = productData.currency.toLowerCase();
      const isCrypto =
        currencyLower === "sat" ||
        currencyLower === "sats" ||
        currencyLower === "btc";

      if (isCrypto) {
        stripeAmount = stripeTotal;
        stripeCurrency = productData.currency;
      } else {
        stripeAmount = stripeTotal;
        stripeCurrency = productData.currency;
      }

      if (isSubscription && subscriptionFrequency) {
        const shippingAddressObj =
          data.shippingName && data.shippingAddress
            ? {
                name: data.shippingName,
                address: data.shippingAddress,
                unit: data.shippingUnitNo || "",
                city: data.shippingCity || "",
                state: data.shippingState || "",
                postalCode: data.shippingPostalCode || "",
                country: data.shippingCountry || "",
              }
            : undefined;

        const response = await fetch("/api/stripe/create-subscription", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            customerEmail: buyerEmail,
            productTitle: productData.title,
            productDescription:
              selectedSize || selectedVolume || selectedWeight
                ? `${selectedSize ? `Size: ${selectedSize}` : ""}${
                    selectedVolume ? ` Volume: ${selectedVolume}` : ""
                  }${selectedWeight ? ` Weight: ${selectedWeight}` : ""}`
                : undefined,
            amount: stripeAmount,
            currency: stripeCurrency,
            frequency: subscriptionFrequency,
            discountPercent: subscriptionDiscount || 0,
            sellerPubkey: productData.pubkey,
            buyerPubkey: userPubkey || null,
            productEventId: `30402:${productData.pubkey}:${productData.d}`,
            quantity: 1,
            variantInfo:
              selectedSize ||
              selectedVolume ||
              selectedWeight ||
              selectedBulkOption
                ? {
                    size: selectedSize || undefined,
                    volume: selectedVolume || undefined,
                    weight: selectedWeight || undefined,
                    bulk: selectedBulkOption || undefined,
                  }
                : undefined,
            shippingAddress: shippingAddressObj,
          }),
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.details || "Failed to create subscription");
        }

        const {
          clientSecret,
          subscriptionId: subId,
          connectedAccountId: respConnectedId,
        } = await response.json();

        setStripeSubscriptionId(subId);
        setStripeClientSecret(clientSecret);
        setStripePaymentIntentId(null);
        setStripeConnectedAccountForForm(
          respConnectedId || sellerConnectedAccountId || null
        );
        setPendingStripeData(data);
        setShowInvoiceCard(true);
        setStripeTimeoutSeconds(STRIPE_TIMEOUT_SECONDS);
        setHasTimedOut(false);
      } else {
        const response = await fetch("/api/stripe/create-payment-intent", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            amount: stripeAmount,
            currency: stripeCurrency,
            customerEmail:
              buyerEmail ||
              (userPubkey
                ? `${userPubkey.substring(0, 8)}@nostr.com`
                : `guest-${orderId.substring(0, 8)}@nostr.com`),
            productTitle: productData.title,
            productDescription:
              selectedSize || selectedVolume || selectedWeight
                ? `${selectedSize ? `Size: ${selectedSize}` : ""}${
                    selectedVolume ? ` Volume: ${selectedVolume}` : ""
                  }${selectedWeight ? ` Weight: ${selectedWeight}` : ""}`
                : undefined,
            metadata: {
              orderId,
              productId: productData.id,
              sellerPubkey: productData.pubkey,
              buyerPubkey: userPubkey || "",
              productTitle: productData.title,
              selectedSize: selectedSize || "",
              selectedVolume: selectedVolume || "",
              selectedWeight: selectedWeight || "",
            },
          }),
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.details || "Failed to create payment");
        }

        const {
          clientSecret,
          paymentIntentId,
          connectedAccountId: respConnectedId,
        } = await response.json();

        setStripeClientSecret(clientSecret);
        setStripePaymentIntentId(paymentIntentId);
        setStripeConnectedAccountForForm(
          respConnectedId || sellerConnectedAccountId || null
        );
        setPendingStripeData(data);
        setShowInvoiceCard(true);
        setStripeTimeoutSeconds(STRIPE_TIMEOUT_SECONDS);
        setHasTimedOut(false);
      }
    } catch (error) {
      console.error("Stripe payment error:", error);
      setInvoiceGenerationFailed(true);
      setShowInvoiceCard(false);
    }
  };

  const handleStripePaymentSuccess = async (paymentIntentId: string) => {
    const data = pendingStripeData;
    if (!data) return;

    const orderId = uuidv4();

    if (pendingOrderEmailRef.current && !pendingOrderEmailRef.current.orderId) {
      pendingOrderEmailRef.current.orderId = orderId;
    }

    setStripePaymentConfirmed(true);

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
        productDetails += " and weighing " + selectedWeight;
      } else {
        productDetails += " weighing " + selectedWeight;
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

    const addressTag =
      data.shippingName && data.shippingAddress
        ? data.shippingUnitNo
          ? `${data.shippingName}, ${data.shippingAddress}, ${data.shippingUnitNo}, ${data.shippingCity}, ${data.shippingState}, ${data.shippingPostalCode}, ${data.shippingCountry}`
          : `${data.shippingName}, ${data.shippingAddress}, ${data.shippingCity}, ${data.shippingState}, ${data.shippingPostalCode}, ${data.shippingCountry}`
        : undefined;

    const subInfo =
      isSubscription && subscriptionFrequency && stripeSubscriptionId
        ? {
            enabled: true,
            frequency: subscriptionFrequency,
            stripeSubscriptionId: stripeSubscriptionId,
          }
        : undefined;

    const subscriptionLabel =
      isSubscription && subscriptionFrequency
        ? " (subscription: " + subscriptionFrequency + ")"
        : "";

    const paymentMessage =
      "You have received a stripe payment from " +
      (userNPub || "a guest buyer") +
      " for your " +
      productData.title +
      " listing" +
      productDetails +
      subscriptionLabel +
      " on Milk Market! Check your Stripe account for the payment.";

    await sendPaymentAndContactMessage(
      productData.pubkey,
      paymentMessage,
      true,
      false,
      false,
      false,
      orderId,
      "stripe",
      paymentIntentId,
      paymentIntentId,
      discountedTotal,
      undefined,
      addressTag,
      selectedPickupLocation || undefined,
      undefined,
      undefined,
      3,
      subInfo
    );

    if (data.additionalInfo) {
      await new Promise((resolve) => setTimeout(resolve, 500));
      const additionalMessage =
        "Additional customer information: " + data.additionalInfo;
      await sendPaymentAndContactMessage(
        productData.pubkey,
        additionalMessage,
        false,
        false,
        false,
        false,
        orderId
      );
    }

    if (productData.herdshareAgreement) {
      await new Promise((resolve) => setTimeout(resolve, 500));
      const herdshareMessage =
        "To finalize your purchase, sign and send the following herdshare agreement for the dairy: " +
        productData.herdshareAgreement;
      await sendPaymentAndContactMessage(
        userPubkey!,
        herdshareMessage,
        false,
        false,
        false,
        true,
        orderId
      );
    }

    if (data.shippingName && data.shippingAddress) {
      await new Promise((resolve) => setTimeout(resolve, 500));
      let contactMessage = "";
      if (!data.shippingUnitNo) {
        contactMessage =
          "Please ship the product" +
          productDetails +
          " to " +
          data.shippingName +
          " at " +
          data.shippingAddress +
          ", " +
          data.shippingCity +
          ", " +
          data.shippingPostalCode +
          ", " +
          data.shippingState +
          ", " +
          data.shippingCountry +
          ".";
      } else {
        contactMessage =
          "Please ship the product" +
          productDetails +
          " to " +
          data.shippingName +
          " at " +
          data.shippingAddress +
          " " +
          data.shippingUnitNo +
          ", " +
          data.shippingCity +
          ", " +
          data.shippingPostalCode +
          ", " +
          data.shippingState +
          ", " +
          data.shippingCountry +
          ".";
      }
      await sendPaymentAndContactMessage(
        productData.pubkey,
        contactMessage,
        false,
        false,
        false,
        false,
        orderId,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        addressTag
      );

      await new Promise((resolve) => setTimeout(resolve, 500));
      const receiptMessage =
        "Your order for " +
        productData.title +
        productDetails +
        " was processed successfully. You should be receiving delivery information from " +
        nip19.npubEncode(productData.pubkey) +
        " as soon as they review your order.";
      await sendPaymentAndContactMessage(
        userPubkey!,
        receiptMessage,
        false,
        true,
        false,
        false,
        orderId,
        "stripe",
        paymentIntentId,
        paymentIntentId,
        undefined,
        undefined,
        addressTag,
        selectedPickupLocation || undefined,
        undefined,
        undefined,
        3,
        subInfo
      );
    } else if (formType === "contact") {
      await sendInquiryDM(productData.pubkey, productData.title);

      await new Promise((resolve) => setTimeout(resolve, 500));
      const receiptMessage =
        "Your order for " +
        productData.title +
        productDetails +
        subscriptionLabel +
        " was processed successfully! You should be receiving delivery information from " +
        nip19.npubEncode(productData.pubkey) +
        " as soon as they review your order.";
      await sendPaymentAndContactMessage(
        userPubkey!,
        receiptMessage,
        false,
        true,
        false,
        false,
        orderId,
        "stripe",
        paymentIntentId,
        paymentIntentId,
        undefined,
        undefined,
        undefined,
        selectedPickupLocation || undefined,
        undefined,
        undefined,
        3,
        subInfo
      );
    } else {
      await new Promise((resolve) => setTimeout(resolve, 500));
      const receiptMessage =
        "Thank you for your purchase of " +
        productData.title +
        productDetails +
        subscriptionLabel +
        " from " +
        nip19.npubEncode(productData.pubkey) +
        ".";
      await sendPaymentAndContactMessage(
        userPubkey!,
        receiptMessage,
        false,
        true,
        false,
        false,
        orderId,
        "stripe",
        paymentIntentId,
        paymentIntentId,
        undefined,
        undefined,
        undefined,
        selectedPickupLocation || undefined,
        undefined,
        undefined,
        3,
        subInfo
      );
    }

    if (discountCode && productData.pubkey) {
      fetch("/api/db/discount-code-used", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: discountCode,
          pubkey: productData.pubkey,
        }),
      }).catch(() => {});
    }

    setInvoiceIsPaid(true);
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
    formType === "shipping" ? productData.shippingCost ?? 0 : 0;

  const discountedTotal = discountedPrice + shippingCostToAdd;

  const sellerShopProfile = shopContext.shopData.get(productData.pubkey);
  const pmDiscounts = sellerShopProfile?.content?.paymentMethodDiscounts || {};

  const getMethodDiscountedTotal = (methodKey: string) => {
    const pct = pmDiscounts[methodKey] || 0;
    if (pct <= 0) return discountedTotal;
    const methodDiscountAmount =
      Math.ceil(((discountedPrice * pct) / 100) * 100) / 100;
    return discountedPrice - methodDiscountAmount + shippingCostToAdd;
  };

  const bitcoinTotal = getMethodDiscountedTotal("bitcoin");
  const stripeTotal = getMethodDiscountedTotal("stripe");
  const getFiatMethodTotal = (fiatKey: string) => {
    return getMethodDiscountedTotal(fiatKey);
  };

  const isSatsCurrency =
    productData.currency.toLowerCase() === "sats" ||
    productData.currency.toLowerCase() === "sat";

  const [satsEstimate, setSatsEstimate] = useState<number | null>(null);
  const [usdEstimate, setUsdEstimate] = useState<number | null>(null);
  const [bitcoinSatsEstimate, setBitcoinSatsEstimate] = useState<number | null>(
    null
  );
  const [bitcoinUsdEstimate, setBitcoinUsdEstimate] = useState<number | null>(
    null
  );
  const [stripeSatsEstimate, setStripeSatsEstimate] = useState<number | null>(
    null
  );
  const [stripeUsdEstimate, setStripeUsdEstimate] = useState<number | null>(
    null
  );
  const [fiatMethodEstimates, setFiatMethodEstimates] = useState<{
    [key: string]: { sats: number | null; usd: number | null };
  }>({});

  useEffect(() => {
    const fetchEstimates = async () => {
      try {
        const { fiat } = await import("@getalby/lightning-tools");
        if (!isSatsCurrency) {
          const numSats = await fiat.getSatoshiValue({
            amount: discountedTotal,
            currency: productData.currency,
          });
          setSatsEstimate(Math.round(numSats));
          setUsdEstimate(null);

          const btcSats = await fiat.getSatoshiValue({
            amount: bitcoinTotal,
            currency: productData.currency,
          });
          setBitcoinSatsEstimate(Math.round(btcSats));
          setBitcoinUsdEstimate(null);

          const stSats = await fiat.getSatoshiValue({
            amount: stripeTotal,
            currency: productData.currency,
          });
          setStripeSatsEstimate(Math.round(stSats));
          setStripeUsdEstimate(null);

          const fiatEst: {
            [key: string]: { sats: number | null; usd: number | null };
          } = {};
          const fiatKeys = Object.keys(fiatPaymentOptions);
          for (const fk of fiatKeys) {
            const ft = getFiatMethodTotal(fk);
            const fSats = await fiat.getSatoshiValue({
              amount: ft,
              currency: productData.currency,
            });
            fiatEst[fk] = { sats: Math.round(fSats), usd: null };
          }
          setFiatMethodEstimates(fiatEst);
        } else {
          const satsPerUsd = await fiat.getSatoshiValue({
            amount: 1,
            currency: "USD",
          });
          if (satsPerUsd > 0) {
            setUsdEstimate(
              Math.round((discountedTotal / satsPerUsd) * 100) / 100
            );
            setBitcoinUsdEstimate(
              Math.round((bitcoinTotal / satsPerUsd) * 100) / 100
            );
            setStripeUsdEstimate(
              Math.round((stripeTotal / satsPerUsd) * 100) / 100
            );
            const fiatEst: {
              [key: string]: { sats: number | null; usd: number | null };
            } = {};
            const fiatKeys = Object.keys(fiatPaymentOptions);
            for (const fk of fiatKeys) {
              const ft = getFiatMethodTotal(fk);
              fiatEst[fk] = {
                sats: null,
                usd: Math.round((ft / satsPerUsd) * 100) / 100,
              };
            }
            setFiatMethodEstimates(fiatEst);
          }
          setSatsEstimate(null);
          setBitcoinSatsEstimate(null);
          setStripeSatsEstimate(null);
        }
      } catch {
        setSatsEstimate(null);
        setUsdEstimate(null);
        setBitcoinSatsEstimate(null);
        setBitcoinUsdEstimate(null);
        setStripeSatsEstimate(null);
        setStripeUsdEstimate(null);
        setFiatMethodEstimates({});
      }
    };
    fetchEstimates();
  }, [
    discountedTotal,
    bitcoinTotal,
    stripeTotal,
    productData.currency,
    isSatsCurrency,
    fiatPaymentOptions,
  ]);

  const formatMethodCost = (
    total: number,
    sEst: number | null,
    uEst: number | null,
    mode: "lightning" | "card"
  ) => {
    if (mode === "lightning") {
      return !isSatsCurrency && sEst != null
        ? `${formatWithCommas(
            total,
            productData.currency
          )} (≈ ${formatWithCommas(sEst, "sats")})`
        : formatWithCommas(total, productData.currency);
    }
    return isSatsCurrency && uEst != null
      ? `${formatWithCommas(total, productData.currency)} (≈ ${formatWithCommas(
          uEst,
          "USD"
        )})`
      : formatWithCommas(total, productData.currency);
  };

  const formattedLightningCost = formatMethodCost(
    bitcoinTotal,
    bitcoinSatsEstimate,
    bitcoinUsdEstimate,
    "lightning"
  );

  const formattedCardCost = formatMethodCost(
    stripeTotal,
    stripeSatsEstimate,
    stripeUsdEstimate,
    "card"
  );

  const getFormattedFiatCost = (fiatKey: string) => {
    const ft = getFiatMethodTotal(fiatKey);
    const est = fiatMethodEstimates[fiatKey];
    return formatMethodCost(ft, est?.sats ?? null, est?.usd ?? null, "card");
  };

  const bitcoinDiscountPct = pmDiscounts["bitcoin"] || 0;
  const stripeDiscountPct = pmDiscounts["stripe"] || 0;

  const getDiscountLabel = (pct: number) => {
    if (pct <= 0) return "";
    return ` (${pct}% off)`;
  };

  const renderContactForm = () => {
    if (!formType) return null;

    if (formType === "contact") {
      // For contact orders, show pickup location selection if required
      if (requiresPickupLocation) {
        return (
          <div className="space-y-4">
            <h3 className="text-lg font-semibold">Select Pickup Location</h3>
            <Select
              label="Pickup Location"
              placeholder="Choose a pickup location"
              className="max-w-full"
              classNames={{
                trigger:
                  "border-2 border-black rounded-md shadow-neo !bg-white hover:!bg-white data-[hover=true]:!bg-white data-[focus=true]:!bg-white",
                value: "!text-black",
                label: "text-gray-600",
                popoverContent: "border-2 border-black rounded-md bg-white",
                listbox: "!text-black",
              }}
              selectedKeys={
                selectedPickupLocation ? [selectedPickupLocation] : []
              }
              onChange={(e) => setSelectedPickupLocation(e.target.value)}
              isRequired
            >
              {(productData.pickupLocations || []).map((location) => (
                <SelectItem key={location} value={location}>
                  {location}
                </SelectItem>
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
                  label={<span className="text-light-text">Name</span>}
                  labelPlacement="inside"
                  isInvalid={!!error}
                  errorMessage={error?.message}
                  classNames={{
                    inputWrapper: "border-2 border-black rounded-md shadow-neo",
                  }}
                  onChange={onChange}
                  isRequired={true}
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
                  label={<span className="text-light-text">Address</span>}
                  labelPlacement="inside"
                  isInvalid={!!error}
                  errorMessage={error?.message}
                  classNames={{
                    inputWrapper: "border-2 border-black rounded-md shadow-neo",
                  }}
                  onChange={onChange}
                  isRequired={true}
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
                  classNames={{
                    inputWrapper: "border-2 border-black rounded-md shadow-neo",
                  }}
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
                    label={<span className="text-light-text">City</span>}
                    labelPlacement="inside"
                    isInvalid={!!error}
                    errorMessage={error?.message}
                    classNames={{
                      inputWrapper:
                        "border-2 border-black rounded-md shadow-neo",
                    }}
                    onChange={onChange}
                    isRequired={true}
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
                      <span className="text-light-text">State/Province</span>
                    }
                    labelPlacement="inside"
                    isInvalid={!!error}
                    errorMessage={error?.message}
                    classNames={{
                      inputWrapper:
                        "border-2 border-black rounded-md shadow-neo",
                    }}
                    onChange={onChange}
                    isRequired={true}
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
                    label={<span className="text-light-text">Postal code</span>}
                    labelPlacement="inside"
                    isInvalid={!!error}
                    errorMessage={error?.message}
                    classNames={{
                      inputWrapper:
                        "border-2 border-black rounded-md shadow-neo",
                    }}
                    onChange={onChange}
                    isRequired={true}
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
                    label={<span className="text-light-text">Country</span>}
                    labelPlacement="inside"
                    isInvalid={!!error}
                    errorMessage={error?.message}
                    classNames={{
                      trigger:
                        "border-2 border-black rounded-md shadow-neo !bg-white",
                    }}
                    onChange={onChange}
                    isRequired={true}
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
                  <span className="text-light-text">
                    Enter {productData.required}
                  </span>
                }
                labelPlacement="inside"
                isInvalid={!!error}
                errorMessage={error?.message}
                classNames={{
                  inputWrapper: "border-2 border-black rounded-md shadow-neo",
                }}
                onChange={onChange}
                isRequired={true}
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
      <div className="flex min-h-screen w-full bg-white text-black">
        <div className="mx-auto flex w-full max-w-7xl flex-col lg:flex-row">
          {/* Left Side - Product Summary - maintain same width */}
          <div className="w-full bg-gray-50 p-6 lg:w-1/2">
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
                  <p className="mb-1 text-gray-600">Size: {selectedSize}</p>
                )}

                {selectedVolume && (
                  <p className="mb-1 text-gray-600">Volume: {selectedVolume}</p>
                )}
                {selectedWeight && (
                  <p className="mb-1 text-gray-600">Weight: {selectedWeight}</p>
                )}

                {selectedBulkOption && (
                  <p className="mb-1 text-gray-600">
                    Bundle: {selectedBulkOption} units
                  </p>
                )}
                <p className="mb-1 text-gray-600">Quantity: 1</p>

                {isSubscription && subscriptionFrequency && (
                  <div className="mt-3 rounded-md border-2 border-purple-300 bg-purple-50 p-3">
                    <div className="flex items-center gap-2">
                      <span className="text-lg">🔄</span>
                      <span className="font-semibold text-purple-700">
                        Subscribe & Save
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-purple-600">
                      Delivery every{" "}
                      {subscriptionFrequency === "weekly"
                        ? "week"
                        : subscriptionFrequency === "every_2_weeks"
                          ? "2 weeks"
                          : subscriptionFrequency === "monthly"
                            ? "month"
                            : subscriptionFrequency === "every_2_months"
                              ? "2 months"
                              : subscriptionFrequency === "quarterly"
                                ? "3 months"
                                : subscriptionFrequency}
                    </p>
                    {(subscriptionDiscount ?? 0) > 0 && (
                      <p className="text-sm font-medium text-green-600">
                        {subscriptionDiscount}% subscription discount applied
                      </p>
                    )}
                  </div>
                )}
              </div>

              <div className="border-t pt-4">
                <div className="space-y-3">
                  <h4 className="font-semibold text-gray-700">
                    Cost Breakdown
                  </h4>
                  <div className="space-y-2 border-l-2 border-gray-200 pl-3">
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
                        <div className="flex justify-between text-sm text-green-600">
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
                    <span>
                      {isSubscription && subscriptionFrequency
                        ? "Total (recurring):"
                        : "Total:"}
                    </span>
                    <span>
                      {formatWithCommas(discountedTotal, productData.currency)}
                      {isSubscription && subscriptionFrequency && (
                        <span className="text-sm font-normal text-purple-600">
                          /
                          {subscriptionFrequency === "weekly"
                            ? "wk"
                            : subscriptionFrequency === "every_2_weeks"
                              ? "2wk"
                              : subscriptionFrequency === "monthly"
                                ? "mo"
                                : subscriptionFrequency === "every_2_months"
                                  ? "2mo"
                                  : subscriptionFrequency === "quarterly"
                                    ? "qtr"
                                    : subscriptionFrequency}
                        </span>
                      )}
                      {!isSatsCurrency && satsEstimate != null && (
                        <span className="ml-2 text-sm font-normal text-gray-500">
                          ≈ {formatWithCommas(satsEstimate, "sats")}
                        </span>
                      )}
                    </span>
                  </div>
                </div>
              </div>

              <button
                onClick={() => setIsBeingPaid(false)}
                className="mt-4 text-black underline hover:text-gray-600"
              >
                ← Back to product
              </button>
            </div>
          </div>

          {/* Divider */}
          <div className="h-px w-full bg-gray-300 lg:h-full lg:w-px"></div>

          {/* Right Side - Payment */}
          <div className="w-full p-6 lg:w-1/2">
            <div className="w-full">
              <div className="mb-6">
                <h2 className="text-2xl font-bold">
                  {stripeClientSecret ? "Card Payment" : "Lightning Invoice"}
                </h2>
              </div>
              <div className="flex flex-col items-center">
                {!paymentConfirmed && !stripePaymentConfirmed ? (
                  <div className="flex w-full flex-col items-center justify-center">
                    {qrCodeUrl && (
                      <>
                        <h3 className="text-dark-text mt-3 text-center text-lg font-medium leading-6">
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
                            className={`text-dark-text ml-2 h-4 w-4 cursor-pointer ${
                              copiedToClipboard ? "hidden" : ""
                            }`}
                          />
                          <CheckIcon
                            className={`text-dark-text ml-2 h-4 w-4 cursor-pointer ${
                              copiedToClipboard ? "" : "hidden"
                            }`}
                          />
                        </div>
                      </>
                    )}
                    {stripeClientSecret && (
                      <div className="w-full">
                        <h3 className="text-dark-text mb-4 mt-3 text-center text-lg font-medium leading-6">
                          Enter your card details below to complete your
                          payment.
                        </h3>
                        <StripeCardForm
                          clientSecret={stripeClientSecret}
                          connectedAccountId={stripeConnectedAccountForForm}
                          onPaymentSuccess={handleStripePaymentSuccess}
                          onPaymentError={(error) => {
                            console.error("Stripe payment error:", error);
                            setFailureText(error);
                            setShowFailureModal(true);
                          }}
                          onCancel={() => {
                            setShowInvoiceCard(false);
                            setStripeClientSecret(null);
                            setStripePaymentIntentId(null);
                            setHasTimedOut(false);
                          }}
                        />
                      </div>
                    )}
                    {!qrCodeUrl && !stripeClientSecret && (
                      <div>
                        <p>Waiting for payment invoice...</p>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center">
                    <h3 className="text-dark-text mt-3 text-center text-lg font-medium leading-6">
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
    <div className="flex min-h-screen w-full bg-white text-black">
      <div className="mx-auto flex w-full max-w-7xl flex-col lg:flex-row">
        {/* Left Side - Product Summary */}
        <div className="w-full bg-gray-50 p-6 lg:w-1/2">
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
                <p className="mb-1 text-gray-600">Size: {selectedSize}</p>
              )}

              {selectedVolume && (
                <p className="mb-1 text-gray-600">Volume: {selectedVolume}</p>
              )}
              {selectedWeight && (
                <p className="mb-1 text-gray-600">Weight: {selectedWeight}</p>
              )}

              {selectedBulkOption && (
                <p className="mb-1 text-gray-600">
                  Bundle: {selectedBulkOption} units
                </p>
              )}
              <p className="mb-1 text-gray-600">Quantity: 1</p>
            </div>

            <div className="border-t pt-4">
              <div className="space-y-3">
                <h4 className="font-semibold text-gray-700">Cost Breakdown</h4>
                <div className="space-y-2 border-l-2 border-gray-200 pl-3">
                  <div className="text-sm font-medium">{productData.title}</div>
                  {appliedDiscount > 0 ? (
                    <>
                      <div className="flex justify-between text-sm">
                        <span className="ml-2">Product cost:</span>
                        <span className="text-gray-500 line-through">
                          {formatWithCommas(currentPrice, productData.currency)}
                        </span>
                      </div>
                      <div className="flex justify-between text-sm text-green-600">
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
                  {productData.shippingCost! > 0 && formType === "shipping" && (
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
                    {!isSatsCurrency && satsEstimate != null && (
                      <span className="ml-2 text-sm font-normal text-gray-500">
                        ≈ {formatWithCommas(satsEstimate, "sats")}
                      </span>
                    )}
                  </span>
                </div>
              </div>
            </div>

            <button
              onClick={() => setIsBeingPaid(false)}
              className="mt-4 text-black underline hover:text-gray-600"
            >
              ← Back to product
            </button>
          </div>
        </div>

        {/* Divider */}
        <div className="h-px w-full bg-gray-300 lg:h-full lg:w-px"></div>

        {/* Right Side - Order Type Selection, Forms, and Payment */}
        <div className="w-full p-6 lg:w-1/2">
          {/* Order Type Selection */}
          {showOrderTypeSelection && (
            <>
              <h2 className="mb-6 text-2xl font-bold">Select Order Type</h2>
              <div className="space-y-3">
                {productData.shippingType === "Free/Pickup" ||
                productData.shippingType === "Added Cost/Pickup" ? (
                  <>
                    <button
                      onClick={() => handleOrderTypeSelection("shipping")}
                      className="w-full rounded-md border-2 border-black bg-white p-4 text-left shadow-neo transition-transform hover:-translate-y-0.5 active:translate-y-0.5"
                    >
                      <div className="font-medium">Free or added shipping</div>
                      <div className="text-sm text-gray-500">
                        Get it shipped to your address
                      </div>
                    </button>
                    <button
                      onClick={() => handleOrderTypeSelection("contact")}
                      className="w-full rounded-md border-2 border-black bg-white p-4 text-left shadow-neo transition-transform hover:-translate-y-0.5 active:translate-y-0.5"
                    >
                      <div className="font-medium">Pickup</div>
                      <div className="text-sm text-gray-500">
                        Arrange pickup with seller
                      </div>
                    </button>
                  </>
                ) : productData.shippingType === "Free" ||
                  productData.shippingType === "Added Cost" ? (
                  <button
                    onClick={() => handleOrderTypeSelection("shipping")}
                    className="w-full rounded-md border-2 border-black bg-white p-4 text-left shadow-neo transition-transform hover:-translate-y-0.5 active:translate-y-0.5"
                  >
                    <div className="font-medium">
                      Online order with shipping
                    </div>
                    <div className="text-sm text-gray-500">
                      Get it shipped to your address
                    </div>
                  </button>
                ) : (
                  <button
                    onClick={() => handleOrderTypeSelection("contact")}
                    className="w-full rounded-md border-2 border-black bg-white p-4 text-left shadow-neo transition-transform hover:-translate-y-0.5 active:translate-y-0.5"
                  >
                    <div className="font-medium">Online order</div>
                    <div className="text-sm text-gray-500">
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

                {!isLoggedIn && (
                  <div className="mt-4 space-y-2">
                    <h3 className="text-lg font-semibold">
                      Email for Order Updates
                    </h3>
                    <p className="text-sm text-gray-500">
                      Enter your email to receive order confirmations and
                      updates.
                    </p>
                    <Input
                      variant="bordered"
                      fullWidth={true}
                      label={
                        <span className="text-light-text">Email Address</span>
                      }
                      labelPlacement="inside"
                      type="email"
                      isRequired={true}
                      classNames={{
                        inputWrapper: `border-2 rounded-md shadow-neo ${
                          emailError ? "border-red-500" : "border-black"
                        }`,
                      }}
                      value={buyerEmail}
                      onChange={(e) => {
                        setBuyerEmail(e.target.value);
                        if (emailError) setEmailError("");
                      }}
                    />
                    {emailError && (
                      <p className="text-xs font-medium text-red-500">
                        {emailError}
                      </p>
                    )}
                    <p className="text-xs text-gray-400">
                      Already have an account?{" "}
                      <button
                        type="button"
                        className="text-primary-blue underline"
                        onClick={onOpen}
                      >
                        Sign in
                      </button>
                    </p>
                  </div>
                )}

                {isLoggedIn && (
                  <div className="mt-4 space-y-2">
                    {isSubscription && (
                      <p className="text-sm font-medium text-purple-600">
                        Email is required for subscription management and
                        renewal notifications.
                      </p>
                    )}
                    <Input
                      variant="bordered"
                      fullWidth={true}
                      label={
                        <span className="text-light-text">
                          {isSubscription
                            ? "Email for Subscription Management (required)"
                            : "Email for Order Updates (optional)"}
                        </span>
                      }
                      labelPlacement="inside"
                      type="email"
                      isRequired={isSubscription}
                      classNames={{
                        inputWrapper: `border-2 rounded-md shadow-neo ${
                          emailError ? "border-red-500" : "border-black"
                        }`,
                      }}
                      value={buyerEmail}
                      onChange={(e) => {
                        setBuyerEmail(e.target.value);
                        if (emailError) setEmailError("");
                      }}
                    />
                    {emailError && (
                      <p className="text-xs font-medium text-red-500">
                        {emailError}
                      </p>
                    )}
                  </div>
                )}

                <div className="mt-6 space-y-3 border-t pt-6">
                  <h3 className="mb-4 text-xl font-bold">Payment Method</h3>

                  {!(isSubscription && subscriptionFrequency) && (
                    <>
                      <Button
                        className={`w-full rounded-md border-2 border-black bg-primary-blue px-4 py-2 font-bold text-white shadow-neo transition-transform hover:-translate-y-0.5 active:translate-y-0.5 ${
                          !isFormValid || (!isLoggedIn && !buyerEmail)
                            ? "cursor-not-allowed opacity-50"
                            : ""
                        }`}
                        disabled={!isFormValid || (!isLoggedIn && !buyerEmail)}
                        onClick={() => {
                          handleFormSubmit((data) =>
                            onFormSubmit(data, "lightning")
                          )();
                        }}
                        startContent={<BoltIcon className="h-6 w-6" />}
                      >
                        Pay with Lightning: {formattedLightningCost}
                        {getDiscountLabel(bitcoinDiscountPct)}
                      </Button>

                      {hasTokensAvailable && (
                        <Button
                          className={`w-full rounded-md border-2 border-black bg-black px-4 py-2 font-bold text-white shadow-neo transition-transform hover:-translate-y-0.5 active:translate-y-0.5 ${
                            !isFormValid || (!isLoggedIn && !buyerEmail)
                              ? "cursor-not-allowed opacity-50"
                              : ""
                          }`}
                          disabled={
                            !isFormValid || (!isLoggedIn && !buyerEmail)
                          }
                          onClick={() => {
                            handleFormSubmit((data) =>
                              onFormSubmit(data, "cashu")
                            )();
                          }}
                          startContent={<BanknotesIcon className="h-6 w-6" />}
                        >
                          Pay with Cashu: {formattedLightningCost}
                          {getDiscountLabel(bitcoinDiscountPct)}
                        </Button>
                      )}
                    </>
                  )}

                  {/* Stripe Payment Button */}
                  {isStripeMerchant && (
                    <Button
                      className={`w-full rounded-md border-2 border-black bg-black px-4 py-2 font-bold text-white shadow-neo transition-transform hover:-translate-y-0.5 active:translate-y-0.5 ${
                        !isFormValid ||
                        (!isLoggedIn && !buyerEmail) ||
                        (isSubscription && !buyerEmail)
                          ? "cursor-not-allowed opacity-50"
                          : ""
                      }`}
                      disabled={
                        !isFormValid ||
                        (!isLoggedIn && !buyerEmail) ||
                        (isSubscription && !buyerEmail)
                      }
                      onClick={() => {
                        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
                        if (!buyerEmail || !emailRegex.test(buyerEmail)) {
                          setEmailError(
                            "Please enter a valid email address to pay with card"
                          );
                          return;
                        }
                        setEmailError("");
                        handleFormSubmit((data) =>
                          onFormSubmit(data, "stripe")
                        )();
                      }}
                      startContent={<CurrencyDollarIcon className="h-6 w-6" />}
                    >
                      Pay with Card: {formattedCardCost}
                      {getDiscountLabel(stripeDiscountPct)}
                    </Button>
                  )}

                  {!(isSubscription && subscriptionFrequency) && (
                    <>
                      {Object.keys(fiatPaymentOptions).length > 0 && (
                        <Button
                          className={`w-full rounded-md border-2 border-black bg-black px-4 py-2 font-bold text-white shadow-neo transition-transform hover:-translate-y-0.5 active:translate-y-0.5 ${
                            !isFormValid || (!isLoggedIn && !buyerEmail)
                              ? "cursor-not-allowed opacity-50"
                              : ""
                          }`}
                          disabled={
                            !isFormValid || (!isLoggedIn && !buyerEmail)
                          }
                          onClick={() => {
                            handleFormSubmit((data) =>
                              onFormSubmit(data, "fiat")
                            )();
                          }}
                          startContent={
                            <CurrencyDollarIcon className="h-6 w-6" />
                          }
                        >
                          Pay with Cash or Payment App:{" "}
                          {(() => {
                            const fiatKeys = Object.keys(fiatPaymentOptions);
                            const fiatDiscounts = fiatKeys.map(
                              (k) => pmDiscounts[k] || 0
                            );
                            const allSame =
                              fiatDiscounts.length > 0 &&
                              fiatDiscounts.every(
                                (d) => d === fiatDiscounts[0]
                              );
                            if (allSame && fiatDiscounts[0]! > 0) {
                              return `${getFormattedFiatCost(
                                fiatKeys[0]!
                              )}${getDiscountLabel(fiatDiscounts[0]!)}`;
                            }
                            return formatMethodCost(
                              discountedTotal,
                              satsEstimate,
                              usdEstimate,
                              "card"
                            );
                          })()}
                        </Button>
                      )}

                      {/* NWC Button */}
                      {nwcInfo && (
                        <Button
                          className={`w-full rounded-md border-2 border-black bg-black px-4 py-2 font-bold text-white shadow-neo transition-transform hover:-translate-y-0.5 active:translate-y-0.5 ${
                            !isFormValid || (!isLoggedIn && !buyerEmail)
                              ? "cursor-not-allowed opacity-50"
                              : ""
                          }`}
                          disabled={
                            !isFormValid ||
                            (!isLoggedIn && !buyerEmail) ||
                            isNwcLoading
                          }
                          isLoading={isNwcLoading}
                          onClick={() => {
                            handleFormSubmit((data) =>
                              onFormSubmit(data, "nwc")
                            )();
                          }}
                          startContent={<WalletIcon className="h-6 w-6" />}
                        >
                          Pay with {nwcInfo.alias || "NWC"}:{" "}
                          {formattedLightningCost}
                          {getDiscountLabel(bitcoinDiscountPct)}
                        </Button>
                      )}
                    </>
                  )}
                </div>
              </form>
            </>
          )}

          {/* Order Confirmed Display */}
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
        </div>
      </div>

      {/* Fiat Payment Instructions */}
      {showFiatPaymentInstructions && (
        <Modal
          backdrop="blur"
          isOpen={showFiatPaymentInstructions}
          onClose={() => {
            setShowFiatPaymentInstructions(false);
            setFiatPaymentConfirmed(false);
            setSelectedFiatOption("");
            setPendingPaymentData(null);
          }}
          classNames={{
            wrapper: "shadow-neo",
            base: "border-2 border-black rounded-md",
            backdrop: "bg-black/20 backdrop-blur-sm",
            header: "border-b-2 border-black bg-white rounded-t-md text-black",
            body: "py-6 bg-white",
            footer: "border-t-2 border-black bg-white rounded-b-md",
            closeButton:
              "hover:bg-gray-200 active:bg-gray-300 rounded-md text-black",
          }}
          isDismissable={true}
          scrollBehavior={"normal"}
          placement={"center"}
          size="md"
        >
          <ModalContent>
            <ModalHeader className="flex items-center justify-center text-black">
              {selectedFiatOption === "cash" ? "Cash Payment" : "Send Payment"}
            </ModalHeader>
            <ModalBody className="flex flex-col overflow-hidden text-black">
              {selectedFiatOption === "cash" ? (
                <>
                  <p className="mb-4 text-center text-gray-600">
                    You will need{" "}
                    <span className="font-semibold text-black">
                      {formatWithCommas(discountedTotal, productData.currency)}
                    </span>{" "}
                    in cash for this order.
                  </p>
                  <div className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      id="paymentConfirmed"
                      checked={fiatPaymentConfirmed}
                      onChange={(e) =>
                        setFiatPaymentConfirmed(e.target.checked)
                      }
                      className="h-4 w-4 rounded border-2 border-black accent-black"
                    />
                    <label
                      htmlFor="paymentConfirmed"
                      className="text-left text-sm text-gray-700"
                    >
                      I will have the sufficient cash to complete the order upon
                      pickup or delivery
                    </label>
                  </div>
                </>
              ) : (
                <>
                  <p className="mb-4 text-center text-gray-600">
                    Please send{" "}
                    <span className="font-semibold text-black">
                      {formatWithCommas(discountedTotal, productData.currency)}
                    </span>{" "}
                    to:
                  </p>
                  <div className="mb-4 rounded-md border-2 border-black bg-gray-50 p-4 shadow-neo">
                    <p className="text-center font-semibold text-black">
                      {selectedFiatOption}:{" "}
                      {profileContext.profileData.get(productData.pubkey)
                        ?.content?.fiat_options?.[selectedFiatOption] || "N/A"}
                    </p>
                  </div>
                  <div className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      id="paymentConfirmed"
                      checked={fiatPaymentConfirmed}
                      onChange={(e) =>
                        setFiatPaymentConfirmed(e.target.checked)
                      }
                      className="h-4 w-4 rounded border-2 border-black accent-black"
                    />
                    <label
                      htmlFor="paymentConfirmed"
                      className="text-sm text-gray-700"
                    >
                      I have sent the payment
                    </label>
                  </div>
                </>
              )}
            </ModalBody>
            <ModalFooter className="flex justify-center gap-2">
              <Button
                onClick={() => {
                  setShowFiatPaymentInstructions(false);
                  setFiatPaymentConfirmed(false);
                  setSelectedFiatOption("");
                  setPendingPaymentData(null);
                }}
                className="rounded-md border-2 border-black bg-white px-6 py-2 font-bold text-black shadow-neo transition-transform hover:-translate-y-0.5 active:translate-y-0.5"
              >
                Cancel
              </Button>
              <Button
                onClick={async () => {
                  if (fiatPaymentConfirmed) {
                    setShowFiatPaymentInstructions(false);
                    await handleFiatPayment(
                      getFiatMethodTotal(selectedFiatOption),
                      pendingPaymentData || {}
                    );
                    setPendingPaymentData(null);
                  }
                }}
                disabled={!fiatPaymentConfirmed}
                className={`rounded-md border-2 border-black bg-black px-6 py-2 font-bold text-white shadow-neo transition-transform hover:-translate-y-0.5 active:translate-y-0.5 ${
                  !fiatPaymentConfirmed ? "cursor-not-allowed opacity-50" : ""
                }`}
              >
                {selectedFiatOption === "cash"
                  ? "Confirm Order"
                  : "Confirm Payment Sent"}
              </Button>
            </ModalFooter>
          </ModalContent>
        </Modal>
      )}

      {/* Modals */}
      <Modal
        backdrop="blur"
        isOpen={showFiatTypeOption}
        onClose={() => setShowFiatTypeOption(false)}
        classNames={{
          wrapper: "shadow-neo",
          base: "border-2 border-black rounded-md",
          backdrop: "bg-black/20 backdrop-blur-sm",
          header: "border-b-2 border-black bg-white rounded-t-md text-black",
          body: "py-6 bg-white",
          closeButton:
            "hover:bg-gray-200 active:bg-gray-300 rounded-md text-black",
        }}
        isDismissable={true}
        scrollBehavior={"normal"}
        placement={"center"}
        size="md"
      >
        <ModalContent>
          <ModalHeader className="flex items-center justify-center text-black">
            Select your payment method
          </ModalHeader>
          <ModalBody className="flex flex-col overflow-hidden text-black">
            <div className="flex items-center justify-center">
              <Select
                label="Payment Options"
                className="max-w-xs"
                classNames={{
                  trigger:
                    "border-2 border-black rounded-md shadow-neo !bg-white hover:!bg-white data-[hover=true]:!bg-white data-[focus=true]:!bg-white",
                  value: "!text-black",
                  label: "text-gray-600",
                  popoverContent: "border-2 border-black rounded-md bg-white",
                  listbox: "!text-black",
                }}
                onChange={(e) => {
                  setSelectedFiatOption(e.target.value);
                  setShowFiatTypeOption(false);
                  setShowFiatPaymentInstructions(true);
                }}
              >
                {fiatPaymentOptions &&
                  Object.keys(fiatPaymentOptions).map((option) => (
                    <SelectItem
                      key={option}
                      value={option}
                      className="text-black"
                    >
                      {option}
                    </SelectItem>
                  ))}
              </Select>
            </div>
          </ModalBody>
        </ModalContent>
      </Modal>

      <SignInModal isOpen={isOpen} onClose={onClose} />

      <FailureModal
        bodyText={failureText}
        isOpen={showFailureModal}
        onClose={() => {
          setShowFailureModal(false);
          setFailureText("");
        }}
      />

      {/* Stripe Timeout Modal */}
      <FailureModal
        bodyText="The payment window has timed out. Please try again if you'd like to complete your purchase."
        isOpen={hasTimedOut}
        onClose={() => {
          setHasTimedOut(false);
          setStripeTimeoutSeconds(STRIPE_TIMEOUT_SECONDS);
        }}
      />
    </div>
  );
}
