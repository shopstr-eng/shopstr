import { useContext, useState, useEffect, useRef } from "react";
import {
  CashuWalletContext,
  ChatsContext,
  ProfileMapContext,
  ShopMapContext,
} from "../utils/context/context";
import { copyToClipboard } from "@/utils/clipboard";
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
} from "@heroui/react";
import {
  BanknotesIcon,
  BoltIcon,
  CheckIcon,
  ClipboardIcon,
  CurrencyDollarIcon,
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
import { safeSwap } from "@/utils/cashu/swap-retry-service";
import { safeMeltProofs } from "@/utils/cashu/melt-retry-service";
import { stashProofsLocally } from "@/utils/cashu/local-wallet-stash";
import {
  RecoverableProofTracker,
  SendTokensRecoverableError,
} from "@/utils/cashu/recoverable-proof-tracker";
import {
  applyStripeFloor,
  isAtStripeFloor,
  STRIPE_MINIMUM_CHARGE_USD,
  ZERO_DECIMAL_CURRENCIES,
} from "@/utils/stripe/currency";
import {
  recordPendingMintQuote,
  markMintQuotePaid,
  markMintQuoteClaimed,
  removePendingMintQuote,
} from "@/utils/cashu/pending-mint-operations";
import WalletRecoveryModal from "@/components/utility-components/wallet-recovery-modal";
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
import { createSellerActionAuthEventTemplate } from "@milk-market/nostr";
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
  shippingDiscountType,
  shippingDiscountValue,
  isSubscription,
  subscriptionFrequency,
  subscriptionDiscount,
  originalPrice,
  affiliateMeta,
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
  // Shipping discount carried by the redeemed code. Applied below to the
  // FX-converted shipping cost before it's added to the total.
  shippingDiscountType?: "none" | "free" | "percent" | "fixed";
  shippingDiscountValue?: number;
  isSubscription?: boolean;
  subscriptionFrequency?: string;
  subscriptionDiscount?: number;
  originalPrice?: number;
  affiliateMeta?: {
    code: string;
    codeId: number;
    affiliateId: number;
    buyerDiscountType: "percent" | "fixed";
    buyerDiscountValue: number;
    rebateType: "percent" | "fixed";
    rebateValue: number;
  } | null;
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
    productId?: string;
    quantity?: number;
    donationAmount?: number;
    donationPercentage?: number;
  } | null>(null);

  const [buyerEmail, setBuyerEmail] = useState("");
  const [buyerEmailAutoFilled, setBuyerEmailAutoFilled] = useState(false);
  const [emailError, setEmailError] = useState("");

  useEffect(() => {
    if (isLoggedIn && userPubkey && signer?.sign && !buyerEmailAutoFilled) {
      const loadBuyerEmail = async () => {
        try {
          const signedEvent = await signer.sign(
            createSellerActionAuthEventTemplate(
              userPubkey,
              "notification-email-read"
            )
          );
          const res = await fetch("/api/email/notification-email/read", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              pubkey: userPubkey,
              role: "buyer",
              signedEvent,
            }),
          });
          const data = await res.json();
          if (res.ok && data.email) {
            setBuyerEmail(data.email);
            setBuyerEmailAutoFilled(true);
          }
        } catch {}
      };

      loadBuyerEmail();
    }
  }, [buyerEmailAutoFilled, isLoggedIn, signer, userPubkey]);

  const walletContext = useContext(CashuWalletContext);

  const [randomNpubForSender, setRandomNpubForSender] = useState<string>("");
  const [randomNsecForSender, setRandomNsecForSender] = useState<string>("");
  const [randomNpubForReceiver, setRandomNpubForReceiver] =
    useState<string>("");
  const [randomNsecForReceiver, setRandomNsecForReceiver] =
    useState<string>("");

  const { isOpen, onOpen, onClose } = useDisclosure();

  const [formType, setFormType] = useState<"shipping" | "contact" | null>(null);
  const [convertedShippingCost, setConvertedShippingCost] = useState<number>(0);
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
    productId?: string;
    quantity?: number;
  }) => {
    try {
      const res = await fetch("/api/email/send-order-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        keepalive: true,
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
          productId: params.productId,
          quantity: params.quantity,
        }),
      });
      if (!res.ok) {
        console.error("Order email API returned non-OK", {
          status: res.status,
          orderId: params.orderId,
          sellerPubkey: params.sellerPubkey,
        });
      } else {
        try {
          const data = await res.json();
          if (
            data?.buyerEmailSent === false ||
            data?.sellerEmailSent === false
          ) {
            console.error("Order email partial failure", {
              orderId: params.orderId,
              sellerPubkey: params.sellerPubkey,
              buyerEmailSent: data?.buyerEmailSent,
              sellerEmailSent: data?.sellerEmailSent,
            });
          }
        } catch {}
      }
    } catch (e) {
      console.error("Failed to send order email:", e);
    }
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
  const [walletRecovery, setWalletRecovery] = useState<{
    isOpen: boolean;
    amountSats: number;
    mintUrl?: string;
    pendingRecovery?: boolean;
  }>({ isOpen: false, amountSats: 0 });

  // Stripe payment states
  const [stripeClientSecret, setStripeClientSecret] = useState<string | null>(
    null
  );
  const [_stripePaymentIntentId, setStripePaymentIntentId] = useState<
    string | null
  >(null);

  // Sales-tax states (populated after shipping address is filled in)
  const [salesTaxSmallest, setSalesTaxSmallest] = useState(0);
  const [salesTaxNative, setSalesTaxNative] = useState(0);
  const [salesTaxCurrency, setSalesTaxCurrency] = useState("");
  const [taxCalculationId, setTaxCalculationId] = useState<string | null>(null);
  const [isCalculatingTax, setIsCalculatingTax] = useState(false);
  const [stripePaymentConfirmed, setStripePaymentConfirmed] = useState(false);
  const [_stripeTimeoutSeconds, setStripeTimeoutSeconds] =
    useState<number>(600); // 10 minutes
  const [hasTimedOut, setHasTimedOut] = useState(false);
  const [stripeConnectedAccountForForm, setStripeConnectedAccountForForm] =
    useState<string | null>(null);
  const [pendingStripeData, setPendingStripeData] = useState<any>(null);

  // Dispatch the queued order-confirmation email (and store the order summary
  // in sessionStorage for the confirmation page) immediately. Called inline
  // from every payment handler the moment payment confirms so the request is
  // in flight before any re-render or tab navigation. `keepalive: true` on the
  // fetch lets the POST survive even if the page closes mid-flight. The
  // useEffect below remains as a safety net; it short-circuits once
  // `pendingOrderEmailRef.current` is nulled here.
  const flushPendingOrderEmail = () => {
    if (!pendingOrderEmailRef.current) return;
    const entry = pendingOrderEmailRef.current;
    pendingOrderEmailRef.current = null;

    triggerOrderEmail(entry);

    try {
      sessionStorage.setItem(
        "orderSummary",
        JSON.stringify({
          productTitle: entry.productTitle,
          productImage: productData.images[0] || "",
          amount: entry.amount,
          currency: entry.currency,
          paymentMethod: entry.paymentMethod,
          orderId: entry.orderId,
          shippingCost:
            entry.shippingAddress && productData.shippingCost
              ? String(productData.shippingCost)
              : undefined,
          selectedSize,
          selectedVolume,
          selectedWeight,
          selectedBulkOption: selectedBulkOption
            ? String(selectedBulkOption)
            : undefined,
          buyerEmail: buyerEmail || undefined,
          shippingAddress: entry.shippingAddress,
          pickupLocation: selectedPickupLocation || undefined,
          sellerPubkey: entry.sellerPubkey,
          isSubscription: isSubscription && !!subscriptionFrequency,
        })
      );
    } catch {}
  };

  useEffect(() => {
    if (
      (paymentConfirmed || stripePaymentConfirmed) &&
      pendingOrderEmailRef.current
    ) {
      // Safety-net flush in case a payment handler somehow didn't call
      // flushPendingOrderEmail inline before confirming. Normal happy path:
      // the ref is already nulled by the inline call and this is a no-op.
      flushPendingOrderEmail();
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

  // Decides whether to consume a use of the buyer's discount code on this
  // order. A SHIPPING-ONLY code (product percent == 0) only consumes when
  // shipping was actually charged. If the buyer picked pickup (formType
  // !== "shipping"), no shipping cost was added (`shippingCostToAdd` is 0
  // for non-shipping flows), so the code extracted no value and should
  // stay available for a future order. Codes that carry a product percent
  // always consume because the product discount was applied regardless.
  const shouldRedeemDiscountCode = (): boolean => {
    if (appliedDiscount > 0) return true;
    const t = shippingDiscountType || "none";
    if (t === "none") return true;
    return formType === "shipping";
  };
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

  // Tracks the gross subtotal (smallest units) of the in-flight order so we
  // can record the affiliate referral after a Lightning or Cashu payment
  // confirms (those success callbacks live deep inside polling closures and
  // don't have orderId/gross in their own scope).
  const pendingAffiliateOrderRef = useRef<{
    orderId: string;
    grossSmallest: number;
    currency: string;
  } | null>(null);

  // Convert a native-unit amount to the currency's smallest unit, mirroring
  // the helpers in utils/stripe/currency.ts. BTC has 8 decimals (1 sat =
  // 1e-8 BTC), sats / zero-decimal fiats are whole-unit, all other fiats
  // are 2 decimals.
  const computeAffiliateGrossSmallest = (
    nativeAmount: number,
    cur: string
  ): number => {
    const c = (cur || "").toLowerCase();
    if (c === "btc") return Math.ceil(nativeAmount * 100000000);
    if (
      c === "sat" ||
      c === "sats" ||
      c === "satoshi" ||
      ZERO_DECIMAL_CURRENCIES.has(c)
    ) {
      return Math.ceil(nativeAmount);
    }
    return Math.ceil(nativeAmount * 100);
  };

  const recordAffiliateReferral = async (
    orderId: string,
    paymentRail: "stripe" | "lightning" | "cashu",
    grossSmallest: number,
    currency: string
  ) => {
    if (!affiliateMeta?.code) return;
    try {
      await fetch("/api/affiliates/record-referral", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderId,
          sellerPubkey: productData.pubkey,
          code: affiliateMeta.code,
          grossSmallest,
          currency,
          paymentRail,
        }),
      });
    } catch (e) {
      console.error("record-referral failed:", e);
    }
  };

  const recordPendingAffiliateReferral = (
    paymentRail: "lightning" | "cashu"
  ) => {
    const pending = pendingAffiliateOrderRef.current;
    if (!pending) return;
    pendingAffiliateOrderRef.current = null;
    void recordAffiliateReferral(
      pending.orderId,
      paymentRail,
      pending.grossSmallest,
      pending.currency
    );
  };

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
  ): Promise<boolean> => {
    // Guard: a recipient pubkey is required. Guest checkouts have no
    // userPubkey, so receipt-to-self calls would otherwise pass `undefined`
    // into the gift-wrap tags and fail nostr-tools event validation.
    if (!pubkeyToReceiveMessage) {
      return false;
    }
    const decodedRandomPubkeyForSender = nip19.decode(randomNpubForSender);
    const decodedRandomPrivkeyForSender = nip19.decode(randomNsecForSender);
    const decodedRandomPubkeyForReceiver = nip19.decode(randomNpubForReceiver);
    const decodedRandomPrivkeyForReceiver = nip19.decode(randomNsecForReceiver);

    const realBuyerPubkey = signer ? await signer.getPubKey?.() : undefined;
    const isGuest = !realBuyerPubkey;
    const buyerPubkey = realBuyerPubkey
      ? realBuyerPubkey
      : (decodedRandomPubkeyForSender.data as string);
    const guestBuyerEmail =
      isGuest && buyerEmail && buyerEmail.trim()
        ? buyerEmail.trim()
        : undefined;

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
        buyerEmail: guestBuyerEmail,
        isGuest,
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
        buyerEmail: guestBuyerEmail,
        isGuest,
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

        await sendGiftWrappedMessageEvent(nostr!, giftWrappedEvent, signer);

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
        return true;
      } catch (error) {
        console.warn(
          `Attempt ${attempt + 1} failed for message sending:`,
          error
        );

        if (attempt === retryCount - 1) {
          // Final attempt failed — log but don't throw. Returning `false`
          // lets proof-carrying callers keep the associated proofs in the
          // recoverable-tracker.
          console.error("Failed to send message after all retries:", error);
          return false;
        }

        // Wait before retrying (exponential backoff)
        await new Promise((resolve) =>
          setTimeout(resolve, Math.pow(2, attempt) * 1000)
        );
      }
    }
    return false;
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
          const numSats = await getSatoshiValue(currencyData);
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
      const sellerProfileForEmailDonation = profileContext.profileData.get(
        productData.pubkey
      );
      const isPlatformSeller =
        productData.pubkey === process.env.NEXT_PUBLIC_MILK_MARKET_PK;
      const onPlatformPayment =
        paymentType === "cashu" ||
        paymentType === "nwc" ||
        paymentType === "lightning" ||
        paymentType === "stripe";
      const orderAmountNumeric = !isSatsProduct
        ? Number(productData.totalCost) || 0
        : Number(price) || 0;
      const emailDonationPercentage =
        !isPlatformSeller && onPlatformPayment
          ? (sellerProfileForEmailDonation?.content?.mm_donation ?? 0)
          : 0;
      const emailDonationAmount =
        emailDonationPercentage > 0 && orderAmountNumeric > 0
          ? Math.ceil((orderAmountNumeric * emailDonationPercentage) / 100)
          : 0;
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
        productId: productData.id,
        quantity: productData.selectedQuantity || 1,
        donationAmount: emailDonationAmount,
        donationPercentage: emailDonationPercentage,
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
    } catch {
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

  // Auto-skip the order-type selection screen when there is only one possible
  // path. Buyers should never have to click a button that has no alternative.
  // The dual-option shipping types ("Free/Pickup", "Added Cost/Pickup") still
  // require a real choice and are left untouched.
  useEffect(() => {
    if (!showOrderTypeSelection) return;
    const st = productData?.shippingType;
    if (!st) return;
    if (st === "Free/Pickup" || st === "Added Cost/Pickup") return;
    if (st === "Free" || st === "Added Cost") {
      handleOrderTypeSelection("shipping");
    } else {
      handleOrderTypeSelection("contact");
    }
    // handleOrderTypeSelection is stable enough — only the inputs that decide
    // the auto-selection should retrigger this effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showOrderTypeSelection, productData?.shippingType]);

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
      const { request: pr, quote: hash } =
        await wallet.createMintQuoteBolt11(convertedPrice);
      recordPendingMintQuote({
        quoteId: hash,
        mintUrl: mints[0]!,
        amount: convertedPrice,
        invoice: pr,
      });

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

      // Stash affiliate context for this LN order so the success callback
      // (deep inside invoiceHasBeenPaid polling) can record the referral.
      if (affiliateMeta) {
        pendingAffiliateOrderRef.current = {
          orderId,
          grossSmallest: computeAffiliateGrossSmallest(
            currentPrice + shippingCostToAdd,
            productData.currency
          ),
          currency: productData.currency,
        };
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
            shippingCost:
              addressTag && productData.shippingCost
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
        productId: productData.id,
        quantity: productData.selectedQuantity || 1,
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
        await wallet.createMintQuoteBolt11(convertedPrice);
      recordPendingMintQuote({
        quoteId: hash,
        mintUrl: mints[0]!,
        amount: convertedPrice,
        invoice: pr,
      });

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
    let handledTerminalOutcome = false;

    while (retryCount < maxRetries) {
      try {
        // First check if the quote has been paid
        const quoteState = await wallet.checkMintQuoteBolt11(hash);

        if (quoteState.state === "PAID") {
          markMintQuotePaid(hash);
          // Quote is paid, try to mint proofs
          try {
            const proofs = await wallet.mintProofsBolt11(newPrice, hash);
            if (!proofs || proofs.length === 0) {
              // Mint returned no proofs without throwing — treat as a
              // transient state and back off, otherwise we'd spin in this
              // branch and never advance the retry counter.
              retryCount++;
              await new Promise((resolve) => setTimeout(resolve, 2100));
              continue;
            }
            if (proofs && proofs.length > 0) {
              try {
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
              } catch (sendErr) {
                console.warn(
                  "sendTokens failed after Lightning mint; stashing proofs locally:",
                  sendErr
                );
                // Prefer the live recoverable-proofs set computed inside
                // sendTokens — the original `proofs` array is mostly SPENT
                // on the mint by the time sendTokens fails partway through.
                const recoverableProofs =
                  sendErr instanceof SendTokensRecoverableError
                    ? sendErr.recoverableProofs
                    : proofs;
                const recoveryMintUrl =
                  sendErr instanceof SendTokensRecoverableError
                    ? sendErr.mintUrl
                    : mints[0]!;
                const stashed = stashProofsLocally(
                  recoverableProofs,
                  recoveryMintUrl,
                  { note: "Recovered from failed product Lightning payment" }
                );
                markMintQuoteClaimed(hash);
                setWalletRecovery({
                  isOpen: true,
                  amountSats: stashed,
                  mintUrl: recoveryMintUrl,
                });
                setShowInvoiceCard(false);
                setInvoice("");
                setQrCodeUrl(null);
                handledTerminalOutcome = true;
                return;
              }
              markMintQuoteClaimed(hash);
              flushPendingOrderEmail();
              setPaymentConfirmed(true);
              setQrCodeUrl(null);
              if (
                discountCode &&
                productData.pubkey &&
                shouldRedeemDiscountCode()
              ) {
                fetch("/api/db/discount-code-used", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    code: discountCode,
                    pubkey: productData.pubkey,
                  }),
                }).catch(() => {});
              }
              recordPendingAffiliateReferral("lightning");
              setInvoiceIsPaid(true);
              break;
            }
          } catch (mintError) {
            // If minting fails but quote is paid, it might be already issued
            if (
              mintError instanceof Error &&
              mintError.message.includes("issued")
            ) {
              // Quote was already processed elsewhere — proofs are not
              // recoverable client-side from this device.
              removePendingMintQuote(hash);
              flushPendingOrderEmail();
              setPaymentConfirmed(true);
              setQrCodeUrl(null);
              setFailureText(
                "Payment was received but your connection dropped! Please check your wallet balance."
              );
              setShowFailureModal(true);
              handledTerminalOutcome = true;
              break;
            }
            throw mintError;
          }
        } else if (quoteState.state === "ISSUED") {
          // Quote was already processed successfully (likely on another tab/device).
          removePendingMintQuote(hash);
          flushPendingOrderEmail();
          setPaymentConfirmed(true);
          setQrCodeUrl(null);
          setFailureText(
            "Payment was received but your connection dropped! Please check your wallet balance."
          );
          setShowFailureModal(true);
          handledTerminalOutcome = true;
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
          handledTerminalOutcome = true;
          break;
        }

        // If we've exceeded max retries, surface the recovery modal — the
        // pending mint quote stays in localStorage so MintRecoveryBoot can
        // finish the claim on next sign-in if the LN payment did settle.
        if (retryCount >= maxRetries) {
          setShowInvoiceCard(false);
          setInvoice("");
          setQrCodeUrl(null);
          setWalletRecovery({
            isOpen: true,
            amountSats: newPrice,
            mintUrl: mints[0],
            pendingRecovery: true,
          });
          handledTerminalOutcome = true;
          break;
        }

        await new Promise((resolve) => setTimeout(resolve, 2100));
      }
    }

    // Safety net: if the while loop exited naturally (e.g. retryCount hit
    // maxRetries on the UNPAID branch with no exception ever thrown), the
    // QR card would otherwise stay on screen forever with no success or
    // failure surfaced. Mirror the in-catch maxRetries handler so the
    // buyer always sees an outcome and any settled LN payment can be
    // recovered on next sign-in via MintRecoveryBoot. Skip if an in-loop
    // terminal branch already opened a modal so we don't double-fire.
    if (!handledTerminalOutcome && retryCount >= maxRetries) {
      setShowInvoiceCard(false);
      setInvoice("");
      setQrCodeUrl(null);
      setWalletRecovery({
        isOpen: true,
        amountSats: newPrice,
        mintUrl: mints[0],
        pendingRecovery: true,
      });
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
    let beefDonationToken;
    const sellerProfile = profileContext.profileData.get(productData.pubkey);
    const donationPercentage = sellerProfile?.content?.mm_donation ?? 0;
    const donationAmount = Math.ceil((totalPrice * donationPercentage) / 100);

    // Calculate beef donation if applicable
    const beefDonationPercentage =
      productData.beefinit_donation_percentage || 0;
    const beefDonationAmount =
      beefDonationPercentage > 0
        ? Math.ceil((totalPrice * beefDonationPercentage) / 100)
        : 0;

    const sellerAmount = totalPrice - donationAmount - beefDonationAmount;
    let sellerProofs: Proof[] = [];
    let donationProofs: Proof[] = [];
    let beefDonationProofs: Proof[] = [];

    // Track which proofs the buyer can still recover at any point. The
    // original `proofs` array is mutated through swaps/melts; on failure we
    // need to stash what's *currently* unspent + untransmitted, not the
    // original mint outputs (most of which are already spent on the mint).
    const __recoverableTracker = new RecoverableProofTracker(proofs);
    try {
      if (sellerAmount > 0) {
        const __swapOutcomeA_0 = await safeSwap(
          wallet,
          sellerAmount,
          remainingProofs,
          { sendConfig: { includeFees: true } }
        );
        if (__swapOutcomeA_0.status !== "swapped") {
          throw new Error(
            __swapOutcomeA_0.errorMessage ??
              `Swap did not complete (${__swapOutcomeA_0.status})`
          );
        }
        const { keep, send } = __swapOutcomeA_0;
        __recoverableTracker.replaceFromSwap(remainingProofs, keep, send);
        sellerProofs = send;
        sellerToken = getEncodedToken({
          mint: mints[0]!,
          proofs: send,
        });
        remainingProofs = keep;
      }

      if (donationAmount > 0) {
        const __swapOutcomeA_1 = await safeSwap(
          wallet,
          donationAmount,
          remainingProofs,
          { sendConfig: { includeFees: true } }
        );
        if (__swapOutcomeA_1.status !== "swapped") {
          throw new Error(
            __swapOutcomeA_1.errorMessage ??
              `Swap did not complete (${__swapOutcomeA_1.status})`
          );
        }
        const { keep, send } = __swapOutcomeA_1;
        __recoverableTracker.replaceFromSwap(remainingProofs, keep, send);
        donationProofs = send;
        donationToken = getEncodedToken({
          mint: mints[0]!,
          proofs: send,
        });
        remainingProofs = keep;
      }

      if (beefDonationAmount > 0) {
        const __swapOutcomeA_2 = await safeSwap(
          wallet,
          beefDonationAmount,
          remainingProofs,
          { sendConfig: { includeFees: true } }
        );
        if (__swapOutcomeA_2.status !== "swapped") {
          throw new Error(
            __swapOutcomeA_2.errorMessage ??
              `Swap did not complete (${__swapOutcomeA_2.status})`
          );
        }
        const { keep, send } = __swapOutcomeA_2;
        __recoverableTracker.replaceFromSwap(remainingProofs, keep, send);
        beefDonationProofs = send;
        beefDonationToken = getEncodedToken({
          mint: mints[0]!,
          proofs: send,
        });
        remainingProofs = keep;
      }

      const orderId = uuidv4();

      if (
        pendingOrderEmailRef.current &&
        !pendingOrderEmailRef.current.orderId
      ) {
        pendingOrderEmailRef.current.orderId = orderId;
      }

      if (affiliateMeta) {
        pendingAffiliateOrderRef.current = {
          orderId,
          grossSmallest: computeAffiliateGrossSmallest(
            currentPrice + shippingCostToAdd,
            productData.currency
          ),
          currency: productData.currency,
        };
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
          const __swapOutcomeA_3 = await safeSwap(
            wallet,
            meltQuoteTotal,
            sellerProofs,
            { sendConfig: { includeFees: true } }
          );
          if (__swapOutcomeA_3.status !== "swapped") {
            throw new Error(
              __swapOutcomeA_3.errorMessage ??
                `Swap did not complete (${__swapOutcomeA_3.status})`
            );
          }
          const { keep, send } = __swapOutcomeA_3;
          __recoverableTracker.replaceFromSwap(sellerProofs, keep, send);
          const __meltOutcome_0 = await safeMeltProofs(wallet, meltQuote, send);
          if (__meltOutcome_0.status !== "paid") {
            throw new Error(
              __meltOutcome_0.errorMessage ??
                `Melt outcome ${__meltOutcome_0.status}`
            );
          }
          __recoverableTracker.replaceFromMelt(
            send,
            __meltOutcome_0.changeProofs
          );
          const meltResponse = {
            change: __meltOutcome_0.changeProofs,
            quote: meltQuote,
          };
          if (meltResponse.quote) {
            const meltAmount = meltResponse.quote.amount.toNumber();
            const changeProofs = [...keep, ...meltResponse.change];
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
                productDetails +=
                  " (pickup at: " + selectedPickupLocation + ")";
              } else {
                productDetails +=
                  " (pickup at: " + selectedPickupLocation + ")";
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
                const __changeOk = await sendPaymentAndContactMessage(
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
                if (__changeOk) __recoverableTracker.consume(changeProofs);
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
                productDetails +=
                  " (pickup at: " + selectedPickupLocation + ")";
              } else {
                productDetails +=
                  " (pickup at: " + selectedPickupLocation + ")";
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
              const __unusedOk = await sendPaymentAndContactMessage(
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
              if (__unusedOk) __recoverableTracker.consume(unusedProofs);
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
          const __sellerOk = await sendPaymentAndContactMessage(
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
          if (__sellerOk) __recoverableTracker.consume(sellerProofs);
        }

        // Send beef donation if applicable
        if (beefDonationToken && beefDonationProofs && beefDonationAmount > 0) {
          const beefInitNpub =
            process.env.NEXT_PUBLIC_BEEF_INITIATIVE_NPUB || "";
          let beefInitHex = "";
          try {
            beefInitHex = nip19.decode(beefInitNpub).data as string;
          } catch {
            console.error("Invalid NEXT_PUBLIC_BEEF_INITIATIVE_NPUB");
          }
          if (beefInitHex) {
            let beefPaidViaLightning = false;
            const beefProfile = profileContext.profileData.get(beefInitHex);
            const beefLnAddress = beefProfile?.content?.lud16 || "";

            if (beefLnAddress && beefLnAddress !== "") {
              try {
                const beefLnAmount = Math.floor(beefDonationAmount * 0.98 - 2);
                if (beefLnAmount > 0) {
                  const ln = new LightningAddress(beefLnAddress);
                  await wallet.loadMint();
                  await ln.fetch();
                  const invoice = await ln.requestInvoice({
                    satoshi: beefLnAmount,
                  });
                  const meltQuote = await wallet.createMeltQuoteBolt11(
                    invoice.paymentRequest
                  );
                  if (meltQuote) {
                    const meltQuoteTotal =
                      meltQuote.amount.toNumber() +
                      meltQuote.fee_reserve.toNumber();
                    const __swapOutcomeB_0 = await safeSwap(
                      wallet,
                      meltQuoteTotal,
                      beefDonationProofs,
                      { sendConfig: { includeFees: true } }
                    );
                    if (__swapOutcomeB_0.status !== "swapped") {
                      throw new Error(
                        __swapOutcomeB_0.errorMessage ??
                          `Swap did not complete (${__swapOutcomeB_0.status})`
                      );
                    }
                    const { keep, send } = __swapOutcomeB_0;
                    __recoverableTracker.replaceFromSwap(
                      beefDonationProofs,
                      keep,
                      send
                    );
                    const __meltOutcome_1 = await safeMeltProofs(
                      wallet,
                      meltQuote,
                      send
                    );
                    if (__meltOutcome_1.status !== "paid") {
                      throw new Error(
                        __meltOutcome_1.errorMessage ??
                          `Melt outcome ${__meltOutcome_1.status}`
                      );
                    }
                    __recoverableTracker.replaceFromMelt(
                      send,
                      __meltOutcome_1.changeProofs
                    );
                    beefPaidViaLightning = true;
                  }
                }
              } catch (error) {
                console.error(
                  "Failed to pay beef donation via Lightning, falling back to ecash:",
                  error
                );
              }
            }

            if (!beefPaidViaLightning) {
              const beefDonationMessage =
                "Beef Initiative donation (" +
                beefDonationPercentage +
                "%) from purchase of " +
                productData.title +
                " by " +
                userNPub +
                " on milk.market: " +
                beefDonationToken;

              const __beefOk = await sendPaymentAndContactMessage(
                beefInitHex,
                beefDonationMessage,
                true,
                false,
                false,
                false,
                orderId + "_beef",
                "ecash",
                mints[0],
                JSON.stringify(beefDonationProofs),
                beefDonationAmount
              );
              if (__beefOk) __recoverableTracker.consume(beefDonationProofs);
            }
          }
        }
      }

      // Step 2: Send donation message
      if (donationToken) {
        const donationMessage = "Sale donation: " + donationToken;
        const donationRecipient = process.env.NEXT_PUBLIC_MILK_MARKET_PK;
        if (donationRecipient) {
          try {
            const __donationOk = await sendPaymentAndContactMessage(
              donationRecipient,
              donationMessage,
              false,
              false,
              true
            );
            if (__donationOk) __recoverableTracker.consume(donationProofs);
            await new Promise((resolve) => setTimeout(resolve, 500));
          } catch (error) {
            console.error("Failed to send donation message:", error);
          }
        } else {
          console.warn(
            "NEXT_PUBLIC_MILK_MARKET_PK not set; skipping donation message."
          );
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
    } catch (err) {
      throw new SendTokensRecoverableError(
        err instanceof Error ? err.message : "sendTokens failed",
        __recoverableTracker.getProofs(),
        mints[0]!,
        err
      );
    }
  };

  const handleCopyInvoice = async () => {
    await copyToClipboard(invoice);
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
      await wallet.loadMint();
      const mintKeySetIds = await wallet.keyChain.getKeysets();
      const filteredProofs = tokens.filter((p: Proof) =>
        mintKeySetIds?.some((keysetId: MintKeyset) => keysetId.id === p.id)
      ) as Proof[];
      const __swapOutcomeA_4 = await safeSwap(wallet, price, filteredProofs, {
        sendConfig: { includeFees: true },
      });
      if (__swapOutcomeA_4.status !== "swapped") {
        throw new Error(
          __swapOutcomeA_4.errorMessage ??
            `Swap did not complete (${__swapOutcomeA_4.status})`
        );
      }
      const { keep, send } = __swapOutcomeA_4;
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
      recordPendingAffiliateReferral("cashu");
      setCashuPaymentSent(true);
      flushPendingOrderEmail();
      setPaymentConfirmed(true);
    } catch {
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

        // For subscriptions with an affiliate code, send the BASE amount
        // (no affiliate discount baked in) so the server can keep the
        // recurring price at the regular subscribe-and-save rate and apply
        // the affiliate discount only to the first invoice via a one-time
        // Stripe coupon. Without this, the affiliate discount would persist
        // on every renewal forever.
        const baseAmountForSubscription =
          affiliateMeta && currentPrice > 0
            ? currentPrice + shippingCostToAdd
            : stripeAmount;

        // The server re-validates the affiliate code and recomputes the
        // buyer discount from the authoritative code config, so the values
        // we send here are advisory only (gross is used as a hint).
        const grossSubtotalSmallest = computeAffiliateGrossSmallest(
          baseAmountForSubscription,
          stripeCurrency || productData.currency
        );

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
            amount: baseAmountForSubscription,
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
            ...(affiliateMeta && {
              affiliateCode: affiliateMeta.code,
              affiliateGrossSubtotalSmallest: grossSubtotalSmallest,
            }),
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
            customerEmail: /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(buyerEmail || "")
              ? buyerEmail
              : userPubkey
                ? `${userPubkey.substring(0, 8)}@nostr.com`
                : `guest-${orderId.substring(0, 8)}@nostr.com`,
            productTitle: productData.title,
            productDescription:
              selectedSize || selectedVolume || selectedWeight
                ? `${selectedSize ? `Size: ${selectedSize}` : ""}${
                    selectedVolume ? ` Volume: ${selectedVolume}` : ""
                  }${selectedWeight ? ` Weight: ${selectedWeight}` : ""}`
                : undefined,
            metadata: {
              orderId: orderId.substring(0, 490),
              productId: (productData.id || "").substring(0, 490),
              sellerPubkey: (productData.pubkey || "").substring(0, 490),
              buyerPubkey: (userPubkey || "").substring(0, 490),
              productTitle: (productData.title || "").substring(0, 490),
              selectedSize: (selectedSize || "").substring(0, 490),
              selectedVolume: (selectedVolume || "").substring(0, 490),
              selectedWeight: (selectedWeight || "").substring(0, 490),
            },
            ...(salesTaxSmallest > 0 && {
              salesTaxSmallest,
              taxCalculationId: taxCalculationId || undefined,
            }),
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
      const detail = error instanceof Error ? error.message : "Unknown error";
      setFailureText(`Card payment setup failed: ${detail}`);
      setShowFailureModal(true);
    }
  };

  const handleStripePaymentSuccess = async (paymentIntentId: string) => {
    const data = pendingStripeData;
    if (!data) return;

    const orderId = uuidv4();

    if (pendingOrderEmailRef.current && !pendingOrderEmailRef.current.orderId) {
      pendingOrderEmailRef.current.orderId = orderId;
    }

    flushPendingOrderEmail();
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

    const sellerProfileForStripeDonation = profileContext.profileData.get(
      productData.pubkey
    );
    const stripeDonationPercentage =
      sellerProfileForStripeDonation?.content?.mm_donation ?? 0;
    const stripeDonationAmount =
      stripeDonationPercentage > 0
        ? Math.ceil((discountedTotal * stripeDonationPercentage) / 100)
        : 0;

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
      stripeDonationAmount,
      stripeDonationPercentage,
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
        discountedTotal,
        undefined,
        addressTag,
        selectedPickupLocation || undefined,
        stripeDonationAmount,
        stripeDonationPercentage,
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
        discountedTotal,
        undefined,
        undefined,
        selectedPickupLocation || undefined,
        stripeDonationAmount,
        stripeDonationPercentage,
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

    if (discountCode && productData.pubkey && shouldRedeemDiscountCode()) {
      fetch("/api/db/discount-code-used", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: discountCode,
          pubkey: productData.pubkey,
        }),
      }).catch(() => {});
    }

    // Record the affiliate referral for one-time Stripe payments only.
    // Stripe subscriptions are recorded server-side via the subscription
    // webhook (on billing_reason === "subscription_create") so we don't
    // double-record here.
    if (affiliateMeta && !(isSubscription && subscriptionFrequency)) {
      const grossSmallestAff = computeAffiliateGrossSmallest(
        currentPrice + shippingCostToAdd,
        productData.currency
      );
      void recordAffiliateReferral(
        orderId,
        "stripe",
        grossSmallestAff,
        productData.currency
      );
    }

    setInvoiceIsPaid(true);
  };

  // Calculate discounted price — always round the FINAL price UP
  // (round-up the sale price, not the discount, so charges are unambiguous)
  const _curLower = productData.currency.toLowerCase();
  const _isSatsCur = _curLower === "sats" || _curLower === "sat";
  const ceilUp = (n: number) =>
    _isSatsCur ? Math.ceil(n) : Math.ceil(n * 100) / 100;
  const discountedPrice =
    appliedDiscount > 0
      ? ceilUp(currentPrice * (1 - appliedDiscount / 100))
      : currentPrice;
  const discountAmount =
    appliedDiscount > 0 ? currentPrice - discountedPrice : 0;

  // Calculate shipping cost based on form type. Shipping is denominated in
  // the seller's shipping-tag currency, which may differ from the product
  // currency (e.g. USD product with sats shipping). Use the FX-converted
  // value computed in the effect below so we never add raw sats to a USD
  // price (which would inflate a $30 order to ~$38,030).
  //
  // If the redeemed discount code carries a shipping discount, apply it
  // here on the FX-converted shipping cost so it discounts the *displayed*
  // shipping in the cart's currency. For 'fixed' codes this treats the
  // value as the same unit as the converted shipping cost (best-effort
  // when the code's denomination differs).
  const rawShippingCostToAdd =
    formType === "shipping" ? convertedShippingCost : 0;
  const shippingCostToAdd = (() => {
    if (rawShippingCostToAdd <= 0) return 0;
    const t = shippingDiscountType || "none";
    if (t === "none") return rawShippingCostToAdd;
    if (t === "free") return 0;
    if (t === "percent") {
      const pct = Math.max(0, Math.min(100, shippingDiscountValue || 0));
      return _isSatsCur
        ? Math.ceil(rawShippingCostToAdd * (1 - pct / 100))
        : Math.ceil(rawShippingCostToAdd * (1 - pct / 100) * 100) / 100;
    }
    if (t === "fixed") {
      return Math.max(
        0,
        rawShippingCostToAdd - Math.max(0, shippingDiscountValue || 0)
      );
    }
    return rawShippingCostToAdd;
  })();

  const discountedTotal = discountedPrice + shippingCostToAdd;

  const sellerShopProfile = shopContext.shopData.get(productData.pubkey);
  const pmDiscounts = sellerShopProfile?.content?.paymentMethodDiscounts || {};

  const getMethodDiscountedTotal = (methodKey: string) => {
    const pct = pmDiscounts[methodKey] || 0;
    if (pct <= 0) return discountedTotal;
    // Round the FINAL discounted price UP (not the discount amount)
    const methodDiscountedPrice = ceilUp(discountedPrice * (1 - pct / 100));
    return methodDiscountedPrice + shippingCostToAdd;
  };

  const bitcoinTotal = getMethodDiscountedTotal("bitcoin");
  const stripeTotal = getMethodDiscountedTotal("stripe");
  const getFiatMethodTotal = (fiatKey: string) => {
    return getMethodDiscountedTotal(fiatKey);
  };

  // Convert the seller's shipping cost into the product's currency. Sellers
  // can denominate shipping in any currency (often sats), so we must FX it
  // before adding to the product price. Without this, a USD product with
  // sats shipping (e.g. 38000) would render a total of $38,030 for a $30
  // order.
  useEffect(() => {
    if (formType !== "shipping") {
      if (convertedShippingCost !== 0) setConvertedShippingCost(0);
      return;
    }
    const rawShipping = productData.shippingCost ?? 0;
    if (rawShipping === 0) {
      if (convertedShippingCost !== 0) setConvertedShippingCost(0);
      return;
    }
    const productCur = (productData.currency || "").toUpperCase();
    const shipCur = (
      productData.shippingCurrency ||
      productData.currency ||
      ""
    ).toUpperCase();
    if (!shipCur || shipCur === productCur) {
      if (convertedShippingCost !== rawShipping) {
        setConvertedShippingCost(rawShipping);
      }
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const { getSatoshiValue: gsv, getFiatValue: gfv } =
          await import("@getalby/lightning-tools");
        let inProductCurrency: number;
        const productIsSats = productCur === "SATS" || productCur === "SAT";
        const shipIsSats = shipCur === "SATS" || shipCur === "SAT";
        if (productIsSats) {
          inProductCurrency = shipIsSats
            ? rawShipping
            : Math.ceil(
                await gsv({
                  amount: rawShipping,
                  currency:
                    productData.shippingCurrency || productData.currency,
                })
              );
        } else {
          const satVal = shipIsSats
            ? rawShipping
            : await gsv({
                amount: rawShipping,
                currency: productData.shippingCurrency || productData.currency,
              });
          inProductCurrency = await gfv({
            satoshi: Math.ceil(satVal),
            currency: productCur,
          });
          inProductCurrency = Math.ceil(inProductCurrency * 100) / 100;
        }
        if (!cancelled) {
          setConvertedShippingCost((prev) =>
            prev === inProductCurrency ? prev : inProductCurrency
          );
        }
      } catch (err) {
        console.error("Error converting product shipping cost:", err);
        // Fall back to 0 rather than misrepresenting the total in the wrong
        // unit.
        if (!cancelled) {
          setConvertedShippingCost((prev) => (prev === 0 ? prev : 0));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
    // `convertedShippingCost` is intentionally omitted from deps: the setters
    // use the functional form with equality checks to avoid re-running the
    // async FX lookup in an infinite loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    formType,
    productData.shippingCost,
    productData.shippingCurrency,
    productData.currency,
  ]);

  // Debounced Stripe Tax lookup — fires when the shipping form has at least a
  // country + postal code. Resets when the form type changes away from shipping.
  useEffect(() => {
    const isShippingForm = formType === "shipping";
    if (!isStripeMerchant || !isShippingForm) {
      if (salesTaxSmallest !== 0 || salesTaxNative !== 0) {
        setSalesTaxSmallest(0);
        setSalesTaxNative(0);
        setSalesTaxCurrency("");
        setTaxCalculationId(null);
      }
      return;
    }

    const country = (watchedValues?.Country || "").toString().trim();
    const postal = (watchedValues?.["Postal Code"] || "").toString().trim();
    const city = (watchedValues?.City || "").toString().trim();
    const state = (watchedValues?.["State/Province"] || "").toString().trim();
    const line1 = (watchedValues?.Address || "").toString().trim();
    const line2 = (watchedValues?.Unit || "").toString().trim();

    if (!country || !postal) {
      if (salesTaxSmallest !== 0) {
        setSalesTaxSmallest(0);
        setSalesTaxNative(0);
        setSalesTaxCurrency("");
        setTaxCalculationId(null);
      }
      return;
    }

    if (!stripeTotal || stripeTotal <= 0) return;

    let cancelled = false;
    setIsCalculatingTax(true);
    const t = setTimeout(async () => {
      try {
        const res = await fetch("/api/stripe/calculate-tax", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            amount: stripeTotal,
            currency: productData.currency,
            shippingAddress: {
              line1: line1 || undefined,
              line2: line2 || undefined,
              city: city || undefined,
              state: state || undefined,
              postal_code: postal,
              country,
            },
            sellerPubkey: productData.pubkey,
            isMultiMerchant: false,
          }),
        });
        if (cancelled) return;
        const data = await res.json();
        if (
          res.ok &&
          data?.success &&
          typeof data.taxAmountSmallest === "number" &&
          data.taxAmountSmallest > 0
        ) {
          const denom = data.isZeroDecimal ? 1 : 100;
          setSalesTaxSmallest(data.taxAmountSmallest);
          setSalesTaxNative(data.taxAmountSmallest / denom);
          setSalesTaxCurrency(data.currency || productData.currency);
          setTaxCalculationId(data.calculationId || null);
        } else {
          setSalesTaxSmallest(0);
          setSalesTaxNative(0);
          setSalesTaxCurrency("");
          setTaxCalculationId(null);
        }
      } catch {
        if (!cancelled) {
          setSalesTaxSmallest(0);
          setSalesTaxNative(0);
          setSalesTaxCurrency("");
          setTaxCalculationId(null);
        }
      } finally {
        if (!cancelled) setIsCalculatingTax(false);
      }
    }, 600);
    return () => {
      cancelled = true;
      clearTimeout(t);
      setIsCalculatingTax(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    watchedValues?.Country,
    watchedValues?.["Postal Code"],
    watchedValues?.["State/Province"],
    watchedValues?.City,
    watchedValues?.Address,
    watchedValues?.Unit,
    formType,
    isStripeMerchant,
    stripeTotal,
    productData.currency,
    productData.pubkey,
  ]);

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
        const { getSatoshiValue } = await import("@getalby/lightning-tools");
        if (!isSatsCurrency) {
          const numSats = await getSatoshiValue({
            amount: discountedTotal,
            currency: productData.currency,
          });
          setSatsEstimate(Math.round(numSats));
          setUsdEstimate(null);

          const btcSats = await getSatoshiValue({
            amount: bitcoinTotal,
            currency: productData.currency,
          });
          setBitcoinSatsEstimate(Math.round(btcSats));
          setBitcoinUsdEstimate(null);

          const stSats = await getSatoshiValue({
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
            const fSats = await getSatoshiValue({
              amount: ft,
              currency: productData.currency,
            });
            fiatEst[fk] = { sats: Math.round(fSats), usd: null };
          }
          setFiatMethodEstimates(fiatEst);
        } else {
          const satsPerUsd = await getSatoshiValue({
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
    mode: "lightning" | "card",
    options: { stripeFloor?: boolean } = {}
  ) => {
    if (mode === "lightning") {
      return !isSatsCurrency && sEst != null
        ? `${formatWithCommas(
            total,
            productData.currency
          )} (≈ ${formatWithCommas(sEst, "sats")})`
        : formatWithCommas(total, productData.currency);
    }
    // Card / Stripe path — surface Stripe's $0.50 minimum-charge floor.
    const stripeFloor = options.stripeFloor === true;
    if (isSatsCurrency) {
      const flooredUsd =
        uEst != null ? Math.max(STRIPE_MINIMUM_CHARGE_USD, uEst) : null;
      const usdFloored =
        stripeFloor && uEst != null && uEst < STRIPE_MINIMUM_CHARGE_USD;
      if (flooredUsd != null) {
        const note = usdFloored ? " · Stripe minimum" : "";
        return `${formatWithCommas(
          total,
          productData.currency
        )} (≈ ${formatWithCommas(flooredUsd, "USD")}${note})`;
      }
      return formatWithCommas(total, productData.currency);
    }
    if (stripeFloor) {
      const displayTotal = applyStripeFloor(total, productData.currency);
      const note = isAtStripeFloor(total, productData.currency)
        ? " · Stripe minimum"
        : "";
      return `${formatWithCommas(displayTotal, productData.currency)}${note}`;
    }
    return formatWithCommas(total, productData.currency);
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
    "card",
    { stripeFloor: true }
  );

  const getFormattedFiatCost = (fiatKey: string) => {
    const ft = getFiatMethodTotal(fiatKey);
    const est = fiatMethodEstimates[fiatKey];
    return formatMethodCost(ft, est?.sats ?? null, est?.usd ?? null, "card", {
      stripeFloor: true,
    });
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
      <div className="flex min-h-screen w-full overflow-x-hidden bg-white text-black">
        <div className="mx-auto flex w-full max-w-7xl min-w-0 flex-col lg:flex-row">
          {/* Left Side - Product Summary - maintain same width */}
          <div className="w-full min-w-0 bg-gray-50 p-6 lg:w-1/2">
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
                      rawShippingCostToAdd > 0 &&
                      (() => {
                        // Use the SAME values the payment rails see:
                        // `rawShippingCostToAdd` is the pre-discount shipping
                        // in the cart currency (FX-converted from the
                        // shipping-tag currency by the effect that updates
                        // `convertedShippingCost`), and `shippingCostToAdd`
                        // already applies the redeemed code's percent/fixed
                        // /free reduction with the same ceil() rounding used
                        // by `discountedTotal`. Deriving the display from
                        // these two values guarantees that what the buyer
                        // sees struck-through + what they see as discounted
                        // shipping match the Bitcoin / Lightning / Cashu /
                        // Stripe / fiat totals to the cent.
                        const rawShip = rawShippingCostToAdd;
                        const discShip = shippingCostToAdd;
                        const t = shippingDiscountType || "none";
                        const v = shippingDiscountValue || 0;
                        if (t === "none") {
                          return (
                            <div className="flex justify-between text-sm">
                              <span className="ml-2">Shipping cost:</span>
                              <span>
                                {formatWithCommas(
                                  rawShip,
                                  productData.currency
                                )}
                              </span>
                            </div>
                          );
                        }
                        const pct = Math.max(0, Math.min(100, v));
                        const badgeLabel =
                          t === "free"
                            ? "Free"
                            : t === "percent"
                              ? `${pct}% off`
                              : `${formatWithCommas(
                                  Math.max(0, v),
                                  productData.currency
                                )} off`;
                        return (
                          <>
                            <div className="flex justify-between text-sm">
                              <span className="ml-2">Shipping cost:</span>
                              <span className="flex items-center gap-2">
                                <span className="text-gray-400 line-through">
                                  {formatWithCommas(
                                    rawShip,
                                    productData.currency
                                  )}
                                </span>
                                <span className="rounded-full border border-green-300 bg-green-100 px-2 py-0.5 text-xs font-bold text-green-700">
                                  {badgeLabel}
                                </span>
                              </span>
                            </div>
                            {t !== "free" && (
                              <div className="flex justify-between text-sm font-medium">
                                <span className="ml-2">
                                  Discounted shipping:
                                </span>
                                <span>
                                  {formatWithCommas(
                                    discShip,
                                    productData.currency
                                  )}
                                </span>
                              </div>
                            )}
                          </>
                        );
                      })()}
                  </div>
                  {(salesTaxNative > 0 || isCalculatingTax) && (
                    <div className="mt-2 flex justify-between border-t pt-2 text-sm">
                      <span className="ml-2">Sales tax:</span>
                      <span>
                        {isCalculatingTax && salesTaxNative === 0
                          ? "Calculating..."
                          : formatWithCommas(
                              salesTaxNative,
                              salesTaxCurrency || productData.currency
                            )}
                      </span>
                    </div>
                  )}
                  <div className="flex justify-between border-t pt-2 font-semibold">
                    <span>
                      {isSubscription && subscriptionFrequency
                        ? "Total (recurring):"
                        : "Total:"}
                    </span>
                    <span>
                      {formatWithCommas(
                        discountedTotal + salesTaxNative,
                        productData.currency
                      )}
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
          <div className="w-full min-w-0 p-6 lg:w-1/2">
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
                        <h3 className="text-dark-text mt-3 text-center text-lg leading-6 font-medium">
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
                        <h3 className="text-dark-text mt-3 mb-4 text-center text-lg leading-6 font-medium">
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
                    <h3 className="text-dark-text mt-3 text-center text-lg leading-6 font-medium">
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
    <div className="flex min-h-screen w-full overflow-x-hidden bg-white text-black">
      <div className="mx-auto flex w-full max-w-7xl min-w-0 flex-col lg:flex-row">
        {/* Left Side - Product Summary */}
        <div className="w-full min-w-0 bg-gray-50 p-6 lg:w-1/2">
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
                  {rawShippingCostToAdd > 0 &&
                    formType === "shipping" &&
                    (() => {
                      // Mirror the SAME math the patched in-payment branch
                      // uses so both summary views render identical numbers
                      // and both match the charged total. See the larger
                      // comment near the in-payment Shipping row.
                      const rawShip = rawShippingCostToAdd;
                      const discShip = shippingCostToAdd;
                      const t = shippingDiscountType || "none";
                      const v = shippingDiscountValue || 0;
                      if (t === "none") {
                        return (
                          <div className="flex justify-between text-sm">
                            <span className="ml-2">Shipping cost:</span>
                            <span>
                              {formatWithCommas(rawShip, productData.currency)}
                            </span>
                          </div>
                        );
                      }
                      const pct = Math.max(0, Math.min(100, v));
                      const badgeLabel =
                        t === "free"
                          ? "Free"
                          : t === "percent"
                            ? `${pct}% off`
                            : `${formatWithCommas(
                                Math.max(0, v),
                                productData.currency
                              )} off`;
                      return (
                        <>
                          <div className="flex justify-between text-sm">
                            <span className="ml-2">Shipping cost:</span>
                            <span className="flex items-center gap-2">
                              <span className="text-gray-400 line-through">
                                {formatWithCommas(
                                  rawShip,
                                  productData.currency
                                )}
                              </span>
                              <span className="rounded-full border border-green-300 bg-green-100 px-2 py-0.5 text-xs font-bold text-green-700">
                                {badgeLabel}
                              </span>
                            </span>
                          </div>
                          {t !== "free" && (
                            <div className="flex justify-between text-sm font-medium">
                              <span className="ml-2">Discounted shipping:</span>
                              <span>
                                {formatWithCommas(
                                  discShip,
                                  productData.currency
                                )}
                              </span>
                            </div>
                          )}
                        </>
                      );
                    })()}
                </div>
                {(salesTaxNative > 0 || isCalculatingTax) && (
                  <div className="mt-2 flex justify-between border-t pt-2 text-sm">
                    <span className="ml-2">Sales tax:</span>
                    <span>
                      {isCalculatingTax && salesTaxNative === 0
                        ? "Calculating..."
                        : formatWithCommas(
                            salesTaxNative,
                            salesTaxCurrency || productData.currency
                          )}
                    </span>
                  </div>
                )}
                <div className="flex justify-between border-t pt-2 font-semibold">
                  <span>Total:</span>
                  <span>
                    {formatWithCommas(
                      discountedTotal + salesTaxNative,
                      productData.currency
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

        {/* Right Side - Order Type Selection, Forms, and Payment */}
        <div className="w-full max-w-full min-w-0 overflow-x-hidden p-4 sm:p-6 lg:w-1/2">
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
                      className="shadow-neo w-full rounded-md border-2 border-black bg-white p-4 text-left transition-transform hover:-translate-y-0.5 active:translate-y-0.5"
                    >
                      <div className="font-medium">Free or added shipping</div>
                      <div className="text-sm text-gray-500">
                        Get it shipped to your address
                      </div>
                    </button>
                    <button
                      onClick={() => handleOrderTypeSelection("contact")}
                      className="shadow-neo w-full rounded-md border-2 border-black bg-white p-4 text-left transition-transform hover:-translate-y-0.5 active:translate-y-0.5"
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
                    className="shadow-neo w-full rounded-md border-2 border-black bg-white p-4 text-left transition-transform hover:-translate-y-0.5 active:translate-y-0.5"
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
                    className="shadow-neo w-full rounded-md border-2 border-black bg-white p-4 text-left transition-transform hover:-translate-y-0.5 active:translate-y-0.5"
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
                className="w-full max-w-full min-w-0 space-y-6"
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
                        className={`bg-primary-blue shadow-neo h-auto min-h-12 w-full rounded-md border-2 border-black px-4 py-3 text-center font-bold break-words whitespace-normal text-white transition-transform hover:-translate-y-0.5 active:translate-y-0.5 ${
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
                          className={`shadow-neo h-auto min-h-12 w-full rounded-md border-2 border-black bg-black px-4 py-3 text-center font-bold break-words whitespace-normal text-white transition-transform hover:-translate-y-0.5 active:translate-y-0.5 ${
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
                      className={`shadow-neo h-auto min-h-12 w-full rounded-md border-2 border-black bg-black px-4 py-3 text-center font-bold break-words whitespace-normal text-white transition-transform hover:-translate-y-0.5 active:translate-y-0.5 ${
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
                          className={`shadow-neo h-auto min-h-12 w-full rounded-md border-2 border-black bg-black px-4 py-3 text-center font-bold break-words whitespace-normal text-white transition-transform hover:-translate-y-0.5 active:translate-y-0.5 ${
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
                          className={`shadow-neo h-auto min-h-12 w-full rounded-md border-2 border-black bg-black px-4 py-3 text-center font-bold break-words whitespace-normal text-white transition-transform hover:-translate-y-0.5 active:translate-y-0.5 ${
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
              <h3 className="mt-3 text-center text-lg leading-6 font-medium text-gray-900">
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
                  <div className="shadow-neo mb-4 rounded-md border-2 border-black bg-gray-50 p-4">
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
                className="shadow-neo rounded-md border-2 border-black bg-white px-6 py-2 font-bold text-black transition-transform hover:-translate-y-0.5 active:translate-y-0.5"
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
                className={`shadow-neo rounded-md border-2 border-black bg-black px-6 py-2 font-bold text-white transition-transform hover:-translate-y-0.5 active:translate-y-0.5 ${
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
                    <SelectItem key={option} className="text-black">
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

      <WalletRecoveryModal
        isOpen={walletRecovery.isOpen}
        onClose={() => setWalletRecovery({ isOpen: false, amountSats: 0 })}
        amountSats={walletRecovery.amountSats}
        mintUrl={walletRecovery.mintUrl}
        isLoggedIn={isLoggedIn}
        pendingRecovery={walletRecovery.pendingRecovery}
      />
    </div>
  );
}
