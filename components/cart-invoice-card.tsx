import { useContext, useState, useEffect, useMemo, useRef } from "react";
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
  Spinner,
  Checkbox,
} from "@heroui/react";
import {
  Mint as CashuMint,
  Wallet as CashuWallet,
  getEncodedToken,
  Proof,
  Keyset as MintKeyset,
} from "@cashu/cashu-ts";
import { safeSwap } from "@/utils/cashu/swap-retry-service";
import { pickMintForPayment } from "@/utils/cashu/wallet-mint-sync";
import { safeMeltProofs } from "@/utils/cashu/melt-retry-service";
import { stashProofsLocally } from "@/utils/cashu/local-wallet-stash";
import {
  RecoverableProofTracker,
  SendTokensRecoverableError,
} from "@/utils/cashu/recoverable-proof-tracker";
import {
  recordPendingMintQuote,
  markMintQuotePaid,
  markMintQuoteClaimed,
  removePendingMintQuote,
} from "@/utils/cashu/pending-mint-operations";
import WalletRecoveryModal from "@/components/utility-components/wallet-recovery-modal";
import {
  PaymentCountdown,
  PaymentElapsed,
} from "@/components/utility-components/payment-countdown";
import {
  constructGiftWrappedEvent,
  constructMessageSeal,
  constructMessageGiftWrap,
  getSavedAddresses,
  sendGiftWrappedMessageEvent,
  generateKeys,
  getLocalStorageData,
  publishProofEvent,
  saveAddress,
} from "@/utils/nostr/nostr-helper-functions";
import { LightningAddress } from "@getalby/lightning-tools";
import QRCode from "qrcode";
import { v4 as uuidv4 } from "uuid";
import { nip19 } from "nostr-tools";
import { ProductData } from "@/utils/parsers/product-parser-functions";
import { NostrWebLNProvider } from "@getalby/sdk";
import { createSellerActionAuthEventTemplate } from "@milk-market/nostr";
import { formatWithCommas } from "./utility-components/display-monetary-info";
import { BLUEBUTTONCLASSNAMES } from "@/utils/STATIC-VARIABLES";
import SignInModal from "./sign-in/SignInModal";
import FailureModal from "@/components/utility-components/failure-modal";
import CountryDropdown from "./utility-components/dropdowns/country-dropdown";
import AddressPicker from "./utility-components/address-picker";
import {
  NostrContext,
  SignerContext,
} from "@/components/utility-components/nostr-context-provider";
import {
  ShippingFormData,
  ContactFormData,
  CombinedFormData,
  SavedAddress,
  ShopProfile,
} from "@/utils/types/types";
import { Controller } from "react-hook-form";
import StripeCardForm from "./utility-components/stripe-card-form";
import {
  isSatsCurrency,
  applyStripeFloor,
  isAtStripeFloor,
  STRIPE_MINIMUM_CHARGE_USD,
  ZERO_DECIMAL_CURRENCIES,
} from "@/utils/stripe/currency";

export default function CartInvoiceCard({
  products,
  quantities,
  shippingTypes,
  totalCostsInSats,
  subtotalCost,
  appliedDiscounts = {},
  appliedShippingDiscounts = {},
  discountCodes = {},
  affiliateMetaBySeller = {},
  shopProfiles,
  onBackToCart,
  setInvoiceIsPaid,
  setInvoiceGenerationFailed,
  setCashuPaymentSent,
  setCashuPaymentFailed,
  subscriptionSelections = {},
}: {
  products: ProductData[];
  quantities: { [key: string]: number };
  shippingTypes: { [key: string]: string };
  totalCostsInSats: { [key: string]: number };
  subtotalCost: number;
  appliedDiscounts?: { [key: string]: number };
  // Per-seller shipping discount carried by the buyer's redeemed discount
  // code. Applied at every per-seller shipping accumulator below. 'free'
  // zeroes shipping, 'percent' multiplies, 'fixed' subtracts (treated as
  // the same unit as the accumulator — for sats accumulators this means
  // the value is in sats).
  appliedShippingDiscounts?: {
    [key: string]: {
      type: "none" | "free" | "percent" | "fixed";
      value: number;
    };
  };
  discountCodes?: { [key: string]: string };
  affiliateMetaBySeller?: {
    [pubkey: string]: {
      code: string;
      codeId: number;
      affiliateId: number;
      rebateType: "percent" | "fixed";
      rebateValue: number;
    };
  };
  shopProfiles?: Map<string, ShopProfile>;
  onBackToCart?: () => void;
  setInvoiceIsPaid?: (invoiceIsPaid: boolean) => void;
  setInvoiceGenerationFailed?: (invoiceGenerationFailed: boolean) => void;
  setCashuPaymentSent?: (cashuPaymentSent: boolean) => void;
  setCashuPaymentFailed?: (cashuPaymentFailed: boolean) => void;
  subscriptionSelections?: {
    [productId: string]: { enabled: boolean; frequency: string };
  };
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

  const recordAffiliateReferrals = async (
    orderId: string,
    paymentRail: "stripe" | "lightning" | "cashu"
  ) => {
    const entries = Object.entries(affiliateMetaBySeller || {});
    if (entries.length === 0) return;
    await Promise.all(
      entries.map(async ([sellerPubkey, aff]) => {
        try {
          const sellerProducts = products.filter(
            (p) => p.pubkey === sellerPubkey
          );
          if (sellerProducts.length === 0) return;
          const sellerCurrency = (
            sellerProducts[0]?.currency || "usd"
          ).toLowerCase();
          const isZero =
            isSatsCurrency(sellerCurrency) ||
            ZERO_DECIMAL_CURRENCIES.has(sellerCurrency);
          let grossSmallest = 0;
          for (const p of sellerProducts) {
            const price =
              p.bulkPrice !== undefined
                ? p.bulkPrice
                : p.weightPrice !== undefined
                  ? p.weightPrice
                  : p.volumePrice !== undefined
                    ? p.volumePrice
                    : p.price;
            const qty = quantities[p.id] || 1;
            const line = price * qty;
            grossSmallest += isZero ? Math.ceil(line) : Math.ceil(line * 100);
          }
          await fetch("/api/affiliates/record-referral", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              orderId,
              sellerPubkey,
              code: aff.code,
              grossSmallest,
              currency: sellerCurrency,
              paymentRail,
            }),
          });
        } catch (e) {
          console.error("record-referral failed:", e);
        }
      })
    );
  };

  const clearPurchasedFromCart = () => {
    const sfPubkey =
      typeof window !== "undefined"
        ? sessionStorage.getItem("sf_seller_pubkey")
        : null;
    if (sfPubkey) {
      const fullCart = localStorage.getItem("cart");
      if (fullCart) {
        const allItems = JSON.parse(fullCart) as ProductData[];
        const purchasedIds = new Set(products.map((p) => p.id));
        const remaining = allItems.filter((item) => !purchasedIds.has(item.id));
        localStorage.setItem("cart", JSON.stringify(remaining));
      } else {
        localStorage.setItem("cart", JSON.stringify([]));
      }
    } else {
      localStorage.setItem("cart", JSON.stringify([]));
    }
  };

  const [showInvoiceCard, setShowInvoiceCard] = useState(false);

  const [paymentConfirmed, setPaymentConfirmed] = useState(false);
  const [qrCodeUrl, setQrCodeUrl] = useState<string | null>(null);
  const [saveDetails, setSaveDetails] = useState(false);
  const [saveAddressLabel, setSaveAddressLabel] = useState("");
  const [selectedSavedAddressId, setSelectedSavedAddressId] = useState<
    string | null
  >(null);
  const [savedAddresses, setSavedAddresses] = useState<SavedAddress[]>([]);
  const [invoice, setInvoice] = useState("");
  const [copiedToClipboard, setCopiedToClipboard] = useState(false);
  // Wall-clock deadline (ms) the Lightning polling loop will give up at; null
  // when no poll is in flight. Drives the visible countdown above the "don't
  // refresh" message so the buyer can see we're still actively watching.
  const [pollDeadlineMs, setPollDeadlineMs] = useState<number | null>(null);
  // Wall-clock start (ms) of a direct Cashu swap+melt; null when no payment
  // is in flight. Drives the count-up timer in the processing overlay so the
  // buyer can see the swap/melt is still alive when the mint is slow.
  const [cashuStartedAtMs, setCashuStartedAtMs] = useState<number | null>(null);

  const [orderConfirmed, setOrderConfirmed] = useState(false);

  const isSingleSeller = useMemo(() => {
    if (products.length === 0) return false;
    const firstPubkey = products[0]!.pubkey;
    return products.every((p) => p.pubkey === firstPubkey);
  }, [products]);

  const hasActiveSubscription = useMemo(() => {
    return products.some((p) => subscriptionSelections[p.id]?.enabled);
  }, [products, subscriptionSelections]);

  const uniqueSellerPubkeys = useMemo(() => {
    return [...new Set(products.map((p) => p.pubkey))];
  }, [products]);

  const singleSellerPubkey = useMemo(() => {
    if (!isSingleSeller || products.length === 0) return null;
    return products[0]!.pubkey;
  }, [isSingleSeller, products]);

  const [fiatPaymentOptions, setFiatPaymentOptions] = useState<{
    [key: string]: string;
  }>({});
  const [showFiatTypeOption, setShowFiatTypeOption] = useState(false);
  const [selectedFiatOption, setSelectedFiatOption] = useState("");
  const [showFiatPaymentInstructions, setShowFiatPaymentInstructions] =
    useState(false);
  const [fiatPaymentConfirmed, setFiatPaymentConfirmed] = useState(false);
  const [pendingPaymentData, setPendingPaymentData] = useState<any>(null);

  const [multiFiatOptions, setMultiFiatOptions] = useState<{
    [sellerPubkey: string]: { [method: string]: string };
  }>({});
  const [multiFiatSelections, setMultiFiatSelections] = useState<{
    [sellerPubkey: string]: string;
  }>({});
  const [multiFiatConfirmed, setMultiFiatConfirmed] = useState<{
    [sellerPubkey: string]: boolean;
  }>({});

  const [isStripeMerchant, setIsStripeMerchant] = useState(false);
  const [allSellersHaveStripe, setAllSellersHaveStripe] = useState(false);

  const sellersWithFiat = useMemo(() => {
    if (isSingleSeller) return [];
    return uniqueSellerPubkeys.filter((pk) => {
      const opts = multiFiatOptions[pk];
      return opts && Object.keys(opts).length > 0;
    });
  }, [isSingleSeller, uniqueSellerPubkeys, multiFiatOptions]);

  const allSellersHaveFiat =
    !isSingleSeller &&
    uniqueSellerPubkeys.length > 0 &&
    sellersWithFiat.length === uniqueSellerPubkeys.length;

  const isMultiFiatAvailable = allSellersHaveFiat;

  const getSellerDisplayName = (pubkey: string): string => {
    const profile = profileContext.profileData.get(pubkey);
    return profile?.content?.name || pubkey.substring(0, 8) + "...";
  };

  const getSellerCostBreakdown = (pubkey: string) => {
    const sellerProducts = products.filter((p) => p.pubkey === pubkey);
    let nativeTotal: number | null = null;
    let satsTotal = 0;
    if (!isSatsCart && nativeCostsPerProduct) {
      nativeTotal = sellerProducts.reduce(
        (sum, p) => sum + (nativeCostsPerProduct[p.id] || 0),
        0
      );
    }
    satsTotal =
      totalCostsInSats[pubkey] ||
      sellerProducts.reduce((sum, p) => sum + (totalCostsInSats[p.id] || 0), 0);
    return { nativeTotal, satsTotal, products: sellerProducts };
  };

  const allMultiFiatConfirmed = useMemo(() => {
    if (sellersWithFiat.length === 0) return false;
    return sellersWithFiat.every((pk) => multiFiatConfirmed[pk] === true);
  }, [sellersWithFiat, multiFiatConfirmed]);

  const allMultiFiatSelected = useMemo(() => {
    if (sellersWithFiat.length === 0) return false;
    return sellersWithFiat.every((pk) => {
      const sel = multiFiatSelections[pk];
      return sel !== undefined && sel.length > 0;
    });
  }, [sellersWithFiat, multiFiatSelections]);

  const hasSubscriptionStripeConflict = useMemo(() => {
    if (!hasActiveSubscription) return false;
    if (isSingleSeller && isStripeMerchant) return false;
    if (isSingleSeller && !isStripeMerchant) return true;
    if (!isSingleSeller && allSellersHaveStripe) return false;
    if (!isSingleSeller && !allSellersHaveStripe) return true;
    return false;
  }, [
    hasActiveSubscription,
    isSingleSeller,
    isStripeMerchant,
    allSellersHaveStripe,
  ]);
  const [_sellerStripeAccounts, setSellerStripeAccounts] = useState<
    Record<string, string>
  >({});
  const [sellerConnectedAccountId, setSellerConnectedAccountId] = useState<
    string | null
  >(null);
  const [multiMerchantTransferGroup, setMultiMerchantTransferGroup] = useState<
    string | null
  >(null);
  const [multiMerchantSellerSplits, setMultiMerchantSellerSplits] = useState<
    { pubkey: string; amountCents: number; accountId: string }[] | null
  >(null);
  const [stripeClientSecret, setStripeClientSecret] = useState<string | null>(
    null
  );
  const [_stripePaymentIntentId, setStripePaymentIntentId] = useState<
    string | null
  >(null);
  const [stripePaymentConfirmed, setStripePaymentConfirmed] = useState(false);
  const STRIPE_TIMEOUT_SECONDS = 600;
  const [_stripeTimeoutSeconds, setStripeTimeoutSeconds] = useState<number>(
    STRIPE_TIMEOUT_SECONDS
  );
  const [hasTimedOut, setHasTimedOut] = useState(false);
  const [stripeConnectedAccountForForm, setStripeConnectedAccountForForm] =
    useState<string | null>(null);
  const [pendingStripeData, setPendingStripeData] = useState<any>(null);
  const [stripeSubscriptionId, setStripeSubscriptionId] = useState<
    string | null
  >(null);
  const [usdEstimate, setUsdEstimate] = useState<number | null>(null);

  const pendingOrderEmailRef = useRef<Array<{
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
    selectedVariant?: string;
    variantLabel?: string;
    selectedBulkOption?: string;
    donationAmount?: number;
    donationPercentage?: number;
  }> | null>(null);

  const [buyerEmail, setBuyerEmail] = useState("");
  const [buyerEmailAutoFilled, setBuyerEmailAutoFilled] = useState(false);
  const [emailError, setEmailError] = useState("");

  // Stripe sales tax — calculated against shipping address once it's filled.
  // `salesTaxNative` is in the cart's display currency (e.g. USD); the
  // smallest-unit value sent to Stripe is in `salesTaxSmallest`.
  const [salesTaxSmallest, setSalesTaxSmallest] = useState<number>(0);
  const [salesTaxNative, setSalesTaxNative] = useState<number>(0);
  const [salesTaxCurrency, setSalesTaxCurrency] = useState<string>("");
  const [taxCalculationId, setTaxCalculationId] = useState<string | null>(null);
  const [isCalculatingTax, setIsCalculatingTax] = useState(false);

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
    selectedVariant?: string;
    variantLabel?: string;
    selectedBulkOption?: string;
    includeBuyerEmail?: boolean;
    subscriptionFrequency?: string;
    productId?: string;
    quantity?: number;
    donationAmount?: number;
    donationPercentage?: number;
  }) => {
    try {
      const shouldIncludeBuyer = params.includeBuyerEmail !== false;
      const res = await fetch("/api/email/send-order-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        keepalive: true,
        body: JSON.stringify({
          buyerEmail: shouldIncludeBuyer ? buyerEmail || undefined : undefined,
          buyerEmailForSeller: buyerEmail || undefined,
          buyerPubkey: shouldIncludeBuyer ? userPubkey || undefined : undefined,
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
          selectedVariant: params.selectedVariant,
          variantLabel: params.variantLabel,
          selectedBulkOption: params.selectedBulkOption,
          subscriptionFrequency: params.subscriptionFrequency,
          productId: params.productId,
          quantity: params.quantity,
          donationAmount: params.donationAmount,
          donationPercentage: params.donationPercentage,
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

  // Dispatch all queued order-confirmation emails (and supporting side-effects
  // like inventory deduction + order summary) immediately. Called inline from
  // every payment handler the moment payment confirms so the request is in
  // flight before any re-render or tab navigation. `keepalive: true` on the
  // fetch lets the POST survive even if the page closes mid-flight. The
  // useEffect below remains as a safety net; it short-circuits once
  // `pendingOrderEmailRef.current` is nulled here.
  const flushPendingOrderEmails = () => {
    if (
      !pendingOrderEmailRef.current ||
      pendingOrderEmailRef.current.length === 0
    ) {
      return;
    }
    const emailEntries = pendingOrderEmailRef.current;
    pendingOrderEmailRef.current = null;

    emailEntries.forEach((entry, index) => {
      triggerOrderEmail({
        ...entry,
        includeBuyerEmail: index === 0,
      });
    });

    products.forEach((p: any) => {
      const qty = quantities[p.id] || 1;
      const bulkMultiplier = p.selectedBulkOption
        ? Number(p.selectedBulkOption)
        : 1;
      const effectiveQty = qty * (isNaN(bulkMultiplier) ? 1 : bulkMultiplier);
      const variantKey = p.selectedSize ? `size:${p.selectedSize}` : "_default";
      fetch("/api/inventory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        keepalive: true,
        body: JSON.stringify({
          action: "deduct",
          productId: p.id,
          amount: effectiveQty,
          orderId: emailEntries[0]?.orderId || "cart_order",
          variantKey,
        }),
      }).catch(() => {});
    });

    try {
      const firstEntry = emailEntries[0]!;
      const allProductTitles = emailEntries
        .map((e) => e.productTitle)
        .join("; ");
      const cartItems = products.map((p: any) => ({
        title: p.title || p.productName,
        image: p.images?.[0] || "",
        amount:
          !isSatsCart && nativeCostsPerProduct
            ? String(nativeCostsPerProduct[p.id] || 0)
            : String(totalCostsInSats[p.id] || 0),
        currency: !isSatsCart && cartCurrency ? cartCurrency : "sats",
        quantity: quantities[p.id] || 1,
        shipping: selectedPickupLocations[p.id]
          ? "Pickup"
          : shippingTypes[p.id] &&
              shippingTypes[p.id] !== "N/A" &&
              shippingTypes[p.id] !== "Pickup"
            ? "Shipping"
            : undefined,
        pickupLocation: selectedPickupLocations[p.id] || undefined,
        selectedSize: p.selectedSize || undefined,
        selectedVolume: p.selectedVolume || undefined,
        selectedWeight: p.selectedWeight || undefined,
        selectedVariant: p.selectedVariant || undefined,
        variantLabel: p.variantLabel || undefined,
        selectedBulkOption: p.selectedBulkOption
          ? String(p.selectedBulkOption)
          : undefined,
      }));
      const anyFreeShipping = Object.values(sellerFreeShippingStatus).some(
        (s) => s.qualifies
      );
      let originalShipping = 0;
      if (anyFreeShipping) {
        const sellersSeen = new Set<string>();
        products.forEach((p) => {
          if (sellersSeen.has(p.pubkey)) return;
          sellersSeen.add(p.pubkey);
          if (sellerFreeShippingStatus[p.pubkey]?.qualifies) {
            const { highestShippingCost } = getConsolidatedShippingForSeller(
              p.pubkey
            );
            originalShipping += highestShippingCost;
          }
        });
      }
      sessionStorage.setItem(
        "orderSummary",
        JSON.stringify({
          productTitle: allProductTitles,
          productImage: products[0]?.images?.[0] || "",
          amount:
            !isSatsCart && nativeTotalCost !== null
              ? String(nativeTotalCost)
              : String(totalCost),
          subtotal:
            !isSatsCart && nativeTotalCost !== null
              ? String(nativeTotalCost)
              : String(subtotalCost),
          currency: firstEntry.currency,
          paymentMethod: firstEntry.paymentMethod,
          orderId: firstEntry.orderId,
          buyerEmail: buyerEmail || undefined,
          shippingAddress: firstEntry.shippingAddress,
          sellerPubkey: firstEntry.sellerPubkey,
          isCart: true,
          cartItems,
          freeShippingApplied: anyFreeShipping,
          originalShippingCost: anyFreeShipping
            ? String(originalShipping)
            : undefined,
        })
      );
    } catch {}
  };

  useEffect(() => {
    if (
      (paymentConfirmed || stripePaymentConfirmed) &&
      pendingOrderEmailRef.current &&
      pendingOrderEmailRef.current.length > 0
    ) {
      // Safety-net flush in case a payment handler somehow didn't call
      // flushPendingOrderEmails inline before confirming. Normal happy path:
      // the ref is already nulled by the inline call and this is a no-op.
      flushPendingOrderEmails();
    }
  }, [paymentConfirmed, stripePaymentConfirmed]);

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

  const cartReportedRef = useRef(false);

  const reportCartActivity = async (email: string) => {
    if (!email || cartReportedRef.current) return;
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) return;

    cartReportedRef.current = true;

    const productsBySeller: { [pubkey: string]: typeof products } = {};
    for (const p of products) {
      if (!productsBySeller[p.pubkey]) {
        productsBySeller[p.pubkey] = [];
      }
      productsBySeller[p.pubkey]!.push(p);
    }

    for (const [sellerPubkey, sellerProducts] of Object.entries(
      productsBySeller
    )) {
      try {
        await fetch("/api/email/flows/report-cart", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            seller_pubkey: sellerPubkey,
            buyer_email: email,
            buyer_pubkey: userPubkey || undefined,
            cart_items: sellerProducts.map((p) => ({
              title: p.title,
              id: p.id,
              price: p.price,
              currency: p.currency,
              quantity: quantities[p.id] || 1,
            })),
          }),
        });
      } catch {}
    }
  };

  useEffect(() => {
    if (buyerEmail && buyerEmailAutoFilled && products.length > 0) {
      reportCartActivity(buyerEmail);
    }
  }, [buyerEmailAutoFilled, buyerEmail, products.length]);

  const walletContext = useContext(CashuWalletContext);

  const { isOpen, onOpen, onClose } = useDisclosure();

  const [formType, setFormType] = useState<
    "shipping" | "contact" | "combined" | null
  >(null);
  const [showOrderTypeSelection, setShowOrderTypeSelection] = useState(true);

  const sendInquiryDM = async (sellerPubkey: string, productTitle: string) => {
    if (!signer || !nostr) return;

    try {
      const actualUserPubkey = await signer.getPubKey?.();
      if (!actualUserPubkey) return;

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
        actualUserPubkey,
        sellerPubkey,
        inquiryMessage,
        "listing-inquiry"
      );
      // Also send a copy to the buyer
      const giftWrappedMessageEventForBuyer = await constructGiftWrappedEvent(
        actualUserPubkey,
        actualUserPubkey,
        inquiryMessage,
        "listing-inquiry"
      );

      const sealedEventForSeller = await constructMessageSeal(
        signer,
        giftWrappedMessageEventForSeller,
        actualUserPubkey,
        sellerPubkey
      );
      const sealedEventForBuyer = await constructMessageSeal(
        signer,
        giftWrappedMessageEventForBuyer,
        actualUserPubkey,
        actualUserPubkey
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
        actualUserPubkey
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

  const [showFailureModal, setShowFailureModal] = useState(false);
  const [walletRecovery, setWalletRecovery] = useState<{
    isOpen: boolean;
    amountSats: number;
    mintUrl?: string;
    pendingRecovery?: boolean;
  }>({ isOpen: false, amountSats: 0 });

  // NWC State
  const [nwcInfo, setNwcInfo] = useState<any | null>(null);
  const [isNwcLoading, setIsNwcLoading] = useState(false);
  const [failureText, setFailureText] = useState("");

  const [isFormValid, setIsFormValid] = useState(false);
  const [shippingPickupPreference, setShippingPickupPreference] = useState<
    "shipping" | "contact"
  >("shipping");
  const [showFreePickupSelection, setShowFreePickupSelection] = useState(false);
  const [selectedPickupLocations, setSelectedPickupLocations] = useState<{
    [productId: string]: string;
  }>({});

  const [totalCost, setTotalCost] = useState<number>(subtotalCost);

  const cartCurrency = useMemo(() => {
    if (products.length === 0) return null;
    const currencyCounts: { [key: string]: number } = {};
    products.forEach((p) => {
      const c = p.currency.toUpperCase();
      currencyCounts[c] = (currencyCounts[c] || 0) + 1;
    });
    let best: string | null = null;
    let maxCount = 0;
    for (const [cur, count] of Object.entries(currencyCounts)) {
      if (
        count > maxCount ||
        (count === maxCount &&
          best &&
          (cur === "USD"
            ? true
            : best === "USD"
              ? false
              : cur === "SATS" || cur === "SAT"
                ? true
                : cur < best))
      ) {
        maxCount = count;
        best = cur;
      }
    }
    return best
      ? (products.find((p) => p.currency.toUpperCase() === best)?.currency ??
          best)
      : null;
  }, [products]);

  const {
    handleSubmit: handleFormSubmit,
    control: formControl,
    watch,
    setValue,
  } = useForm();

  // Watch form values to validate completion
  const watchedValues = watch();

  const uniqueShippingTypes = useMemo(() => {
    return Array.from(new Set(Object.values(shippingTypes)));
  }, [shippingTypes]);

  const hasShippingPickupProducts = useMemo(() => {
    return (
      Object.values(shippingTypes).includes("Free/Pickup") ||
      Object.values(shippingTypes).includes("Added Cost/Pickup")
    );
  }, [shippingTypes]);

  const hasMixedShippingWithPickup = useMemo(() => {
    return uniqueShippingTypes.length > 1 && hasShippingPickupProducts;
  }, [uniqueShippingTypes, hasShippingPickupProducts]);

  // Returns true if a redemption POST should be sent for this seller's
  // discount code on the current order. Rule (per spec): a SHIPPING-ONLY
  // code (product percent == 0) must only consume a use when the buyer
  // actually paid for shipping for that seller — pickup orders extract no
  // value from the code, so it stays available for later. Codes that carry
  // a product percent (with or without a shipping discount) always consume
  // because the product discount was applied regardless of fulfillment.
  const shouldRedeemCodeForSeller = (pubkey: string): boolean => {
    const pct = appliedDiscounts[pubkey] || 0;
    if (pct > 0) return true;
    const shipType = appliedShippingDiscounts[pubkey]?.type || "none";
    if (shipType === "none") return true;
    // Shipping-only code → only consume if shipping was actually charged
    // for at least one of this seller's products. The cart's formType is
    // "shipping" | "contact" | "combined" | null. "contact" is the
    // pickup-only flow (no shipping), "shipping" always charges shipping,
    // and "combined" carries a per-product decision recorded in
    // shippingTypes.
    if (!formType || formType === "contact") return false;
    if (formType === "shipping") return true;
    if (formType === "combined") {
      return products.some(
        (p) =>
          p.pubkey === pubkey &&
          (shippingTypes[p.id] === "Added Cost" ||
            shippingTypes[p.id] === "Free")
      );
    }
    return true;
  };

  // Apply the per-seller shipping discount to a shipping `amount`. The
  // `amount` may be sats or native currency — the helper treats the value
  // in the same unit. Returns a non-negative number; callers are
  // responsible for any final `Math.ceil` rounding.
  const applyShippingDiscount = (amount: number, pubkey: string): number => {
    const d = appliedShippingDiscounts[pubkey];
    if (!d || d.type === "none") return amount;
    if (d.type === "free") return 0;
    if (d.type === "percent") {
      const pct = Math.max(0, Math.min(100, d.value));
      return Math.max(0, amount * (1 - pct / 100));
    }
    if (d.type === "fixed") {
      return Math.max(0, amount - Math.max(0, d.value));
    }
    return amount;
  };

  // Build the per-seller shipping rows the cost breakdown renders. Used by
  // both the pre-payment summary and the in-payment summary, so the two
  // views stay in sync. Each row carries the price the buyer is actually
  // charged (`cost`), the pre-discount price for strike-through display
  // (`originalCost`), and a label that names the discount (`discountBadge`,
  // null when shipping is not discounted). Three discount paths can mark a
  // row as discounted: (1) freeShippingThreshold met → "Free", (2) a
  // redeemed code with type === 'free' → "Free", (3) a redeemed code with
  // percent/fixed → "X% off" or "$X off". The numeric `cost` value is
  // derived from `applyShippingDiscount`, which is the same helper the
  // shippingTotal accumulator uses to compute `totalCost`, so the
  // displayed shipping number always matches what Bitcoin / Lightning /
  // Cashu / Stripe / fiat invoices ultimately charge.
  type ShippingLine = {
    pubkey: string;
    name: string;
    cost: number;
    originalCost: number;
    currency: string;
    discountBadge: string | null;
  };
  const buildShippingLines = (sellersSeen: Set<string>): ShippingLine[] => {
    const lines: ShippingLine[] = [];
    products.forEach((product) => {
      if (sellersSeen.has(product.pubkey)) return;
      sellersSeen.add(product.pubkey);
      const freeStatus = sellerFreeShippingStatus[product.pubkey];
      const shipDisc = appliedShippingDiscounts?.[product.pubkey];
      const shipType = shipDisc?.type || "none";
      const shipVal = shipDisc?.value || 0;
      if (freeStatus?.qualifies) {
        const { highestShippingCost, highestShippingProduct } =
          getConsolidatedShippingForSeller(product.pubkey);
        // Shipping prices are denominated in the shipping-tag currency
        // (which may differ from the product currency, e.g. USD shipping
        // on a sats-priced product). Match that label here so the row's
        // formatted amount agrees with what charge accumulators use.
        lines.push({
          pubkey: product.pubkey,
          name: freeStatus.sellerName,
          cost: 0,
          originalCost: highestShippingCost,
          currency:
            highestShippingProduct?.shippingCurrency ||
            highestShippingProduct?.currency ||
            product.currency,
          discountBadge: "Free",
        });
        return;
      }
      const sellerProducts = products.filter(
        (p) => p.pubkey === product.pubkey
      );
      const buildBadge = (curr: string): string | null => {
        if (shipType === "free") return "Free";
        if (shipType === "percent") {
          const pct = Math.max(0, Math.min(100, shipVal));
          return pct > 0 ? `${pct}% off` : null;
        }
        if (shipType === "fixed" && shipVal > 0) {
          return `${formatWithCommas(shipVal, curr)} off`;
        }
        return null;
      };
      if (sellerProducts.length > 1) {
        const { highestShippingCost, highestShippingProduct } =
          getConsolidatedShippingForSeller(product.pubkey);
        if (highestShippingCost > 0) {
          const discounted = applyShippingDiscount(
            highestShippingCost,
            product.pubkey
          );
          const curr =
            highestShippingProduct?.shippingCurrency ||
            highestShippingProduct?.currency ||
            product.currency;
          lines.push({
            pubkey: product.pubkey,
            name:
              shopProfiles?.get(product.pubkey)?.content?.name ||
              product.pubkey.substring(0, 8),
            cost: discounted,
            originalCost: highestShippingCost,
            currency: curr,
            discountBadge: buildBadge(curr),
          });
        }
      } else if (product.shippingCost && product.shippingCost > 0) {
        const rawCost = product.shippingCost * (quantities[product.id] || 1);
        const discounted = applyShippingDiscount(rawCost, product.pubkey);
        const curr = product.shippingCurrency || product.currency;
        lines.push({
          pubkey: product.pubkey,
          name:
            shopProfiles?.get(product.pubkey)?.content?.name ||
            product.pubkey.substring(0, 8),
          cost: discounted,
          originalCost: rawCost,
          currency: curr,
          discountBadge: buildBadge(curr),
        });
      }
    });
    return lines;
  };

  const sellerFreeShippingStatus = useMemo(() => {
    const statusMap: {
      [pubkey: string]: {
        qualifies: boolean;
        threshold: number;
        currency: string;
        sellerSubtotal: number;
        sellerName: string;
      };
    } = {};
    const productsBySeller: { [pubkey: string]: ProductData[] } = {};
    products.forEach((p) => {
      if (!productsBySeller[p.pubkey]) productsBySeller[p.pubkey] = [];
      productsBySeller[p.pubkey]!.push(p);
    });

    Object.entries(productsBySeller).forEach(([pubkey, sellerProducts]) => {
      const profile = shopProfiles?.get(pubkey);
      if (
        !profile?.content?.freeShippingThreshold ||
        profile.content.freeShippingThreshold <= 0
      )
        return;
      let sellerSubtotal = 0;
      sellerProducts.forEach((product) => {
        const discount = appliedDiscounts[pubkey] || 0;
        const basePrice =
          product.bulkPrice !== undefined
            ? product.bulkPrice
            : product.weightPrice !== undefined
              ? product.weightPrice
              : product.volumePrice !== undefined
                ? product.volumePrice
                : product.price;
        const qty = quantities[product.id] || 1;
        const rawDiscountedPrice =
          discount > 0 ? basePrice * (1 - discount / 100) : basePrice;
        const discountedPrice = isSatsCurrency(product.currency)
          ? Math.ceil(rawDiscountedPrice)
          : Math.ceil(rawDiscountedPrice * 100) / 100;
        sellerSubtotal += discountedPrice * qty;
      });
      statusMap[pubkey] = {
        qualifies: sellerSubtotal >= profile.content.freeShippingThreshold,
        threshold: profile.content.freeShippingThreshold,
        currency: profile.content.freeShippingCurrency || "USD",
        sellerSubtotal,
        sellerName: profile.content.name || pubkey.substring(0, 8),
      };
    });
    return statusMap;
  }, [products, quantities, appliedDiscounts, shopProfiles]);

  const getConsolidatedShippingForSeller = (
    sellerPubkey: string
  ): {
    highestShippingProduct: ProductData | null;
    highestShippingCost: number;
  } => {
    const sellerProducts = products.filter((p) => p.pubkey === sellerPubkey);
    let highestShippingCost = 0;
    let highestShippingProduct: ProductData | null = null;
    sellerProducts.forEach((product) => {
      const cost = product.shippingCost || 0;
      if (cost > highestShippingCost) {
        highestShippingCost = cost;
        highestShippingProduct = product;
      }
    });
    return { highestShippingProduct, highestShippingCost };
  };

  const [nativeTotalCost, setNativeTotalCost] = useState<number | null>(null);
  // Per-seller shipping total expressed in the cart's display currency.
  // Computed alongside `nativeTotalCost` (which needs the same FX work) so
  // downstream consumers like `getMethodDiscountedCosts` can add shipping in
  // the correct unit without re-doing the conversion.
  const [nativeShippingTotal, setNativeShippingTotal] = useState<number>(0);

  // Per-seller discounted shipping, kept in two units so the reported order
  // totals (DMs / email / dashboard) can include the shipping the buyer is
  // actually charged. These are REPORTING-ONLY mirrors of the same per-seller
  // shipping math the charge accumulators use — they never feed fund
  // distribution (ecash proofs, Stripe intents, etc.).
  const [shippingCostsInSats, setShippingCostsInSats] = useState<
    Record<string, number>
  >({});
  const [nativeShippingPerSeller, setNativeShippingPerSeller] = useState<
    Record<string, number>
  >({});

  useEffect(() => {
    if (
      !cartCurrency ||
      cartCurrency.toLowerCase() === "sats" ||
      cartCurrency.toLowerCase() === "sat"
    ) {
      setNativeTotalCost(null);
      setNativeShippingTotal(0);
      setNativeShippingPerSeller({});
      return;
    }
    let cancelled = false;
    const compute = async () => {
      const { getSatoshiValue, getFiatValue } =
        await import("@getalby/lightning-tools");
      const cartCurrencyUpper = cartCurrency.toUpperCase();
      const cartIsZeroDecimal =
        isSatsCurrency(cartCurrencyUpper) ||
        ZERO_DECIMAL_CURRENCIES.has(cartCurrencyUpper.toLowerCase());
      // Accumulate the cart total as an integer count of cart-currency smallest
      // units (cents for normal fiat, whole sats for sats, whole units for
      // zero-decimal fiat). This prevents floating-point drift from causing
      // an over-ceiled grand total — e.g. summing 0.10 * 7 in floats yields
      // 0.7000000000000001 which a final ceil would inflate to $0.71.
      const lineToSmallest = (val: number): number =>
        cartIsZeroDecimal ? Math.ceil(val) : Math.ceil(val * 100);
      let totalSmallest = 0;
      for (const product of products) {
        const basePrice =
          product.bulkPrice !== undefined
            ? product.bulkPrice
            : product.weightPrice !== undefined
              ? product.weightPrice
              : product.volumePrice !== undefined
                ? product.volumePrice
                : product.price;
        const discount = appliedDiscounts[product.pubkey] || 0;
        const rawDiscountedPrice =
          discount > 0 ? basePrice * (1 - discount / 100) : basePrice;
        const discountedPrice = isSatsCurrency(product.currency)
          ? Math.ceil(rawDiscountedPrice)
          : Math.ceil(rawDiscountedPrice * 100) / 100;
        const qty = quantities[product.id] || 1;
        const productCurrencyUpper = product.currency.toUpperCase();
        let lineInCartCurrency: number;
        if (productCurrencyUpper === cartCurrencyUpper) {
          lineInCartCurrency = discountedPrice * qty;
        } else {
          try {
            const satVal =
              productCurrencyUpper === "SATS" || productCurrencyUpper === "SAT"
                ? discountedPrice * qty
                : await getSatoshiValue({
                    amount: discountedPrice * qty,
                    currency: product.currency,
                  });
            lineInCartCurrency = await getFiatValue({
              satoshi: Math.ceil(satVal),
              currency: cartCurrencyUpper,
            });
          } catch {
            lineInCartCurrency = discountedPrice * qty;
          }
        }
        totalSmallest += lineToSmallest(lineInCartCurrency);
      }
      let nativeShippingSum = 0;
      const nativeShipPerSeller: Record<string, number> = {};
      if (
        formType === "shipping" ||
        (formType === "combined" && shippingPickupPreference === "shipping")
      ) {
        const sellersSeen = new Set<string>();
        for (const product of products) {
          if (sellersSeen.has(product.pubkey)) continue;
          sellersSeen.add(product.pubkey);
          if (sellerFreeShippingStatus[product.pubkey]?.qualifies) continue;
          const sellerProducts = products.filter(
            (p) => p.pubkey === product.pubkey
          );
          let shippingForSeller: number;
          let shippingProductCurrency: string;
          if (sellerProducts.length > 1) {
            const { highestShippingCost, highestShippingProduct } =
              getConsolidatedShippingForSeller(product.pubkey);
            shippingForSeller = highestShippingCost;
            const hsp = highestShippingProduct as ProductData | null;
            // Prefer the explicit shipping-tag currency over the product
            // price currency: a seller can legitimately price the product in
            // USD while denominating shipping in sats.
            shippingProductCurrency =
              hsp?.shippingCurrency || hsp?.currency || product.currency;
          } else {
            shippingForSeller =
              (product.shippingCost || 0) * (quantities[product.id] || 1);
            shippingProductCurrency =
              product.shippingCurrency || product.currency;
          }
          // Apply any per-seller shipping discount carried by the redeemed
          // discount code, in the seller's shipping-currency units. For
          // 'fixed' codes this treats `value` as the same unit (best-effort
          // when the code's denomination differs from the seller's
          // shipping currency).
          shippingForSeller = applyShippingDiscount(
            shippingForSeller,
            product.pubkey
          );
          // Shipping is denominated in the seller's product currency. Convert
          // it to the cart's display currency before adding — otherwise a
          // sats-priced product's shipping (e.g. 38000 sats) added to a USD
          // cart inflates the total to $38,030 instead of ~$30.
          const shipCurUpper = (shippingProductCurrency || "").toUpperCase();
          let shippingInCartCurrency = shippingForSeller;
          if (shipCurUpper && shipCurUpper !== cartCurrencyUpper) {
            try {
              const satVal =
                shipCurUpper === "SATS" || shipCurUpper === "SAT"
                  ? shippingForSeller
                  : await getSatoshiValue({
                      amount: shippingForSeller,
                      currency: shippingProductCurrency,
                    });
              shippingInCartCurrency = await getFiatValue({
                satoshi: Math.ceil(satVal),
                currency: cartCurrencyUpper,
              });
            } catch {
              // If FX lookup fails, fall back to 0 rather than misrepresenting
              // the total in the wrong unit.
              shippingInCartCurrency = 0;
            }
          }
          totalSmallest += lineToSmallest(shippingInCartCurrency);
          nativeShippingSum += shippingInCartCurrency;
          nativeShipPerSeller[product.pubkey] =
            (nativeShipPerSeller[product.pubkey] || 0) + shippingInCartCurrency;
        }
      }
      if (!cancelled) {
        setNativeTotalCost(
          cartIsZeroDecimal ? totalSmallest : totalSmallest / 100
        );
        setNativeShippingTotal(
          cartIsZeroDecimal
            ? Math.round(nativeShippingSum)
            : Math.round(nativeShippingSum * 100) / 100
        );
        const roundedNativeShipPerSeller: Record<string, number> = {};
        for (const pk of Object.keys(nativeShipPerSeller)) {
          const v = nativeShipPerSeller[pk] || 0;
          roundedNativeShipPerSeller[pk] = cartIsZeroDecimal
            ? Math.round(v)
            : Math.round(v * 100) / 100;
        }
        setNativeShippingPerSeller(roundedNativeShipPerSeller);
      }
    };
    compute();
    return () => {
      cancelled = true;
    };
  }, [
    products,
    quantities,
    appliedDiscounts,
    appliedShippingDiscounts,
    cartCurrency,
    formType,
    shippingPickupPreference,
    sellerFreeShippingStatus,
  ]);

  const isSatsCart =
    !cartCurrency ||
    cartCurrency.toLowerCase() === "sats" ||
    cartCurrency.toLowerCase() === "sat";

  const [nativeCostsPerProduct, setNativeCostsPerProduct] = useState<{
    [productId: string]: number;
  } | null>(null);

  useEffect(() => {
    if (isSatsCart) {
      setNativeCostsPerProduct(null);
      return;
    }
    let cancelled = false;
    const compute = async () => {
      const { getSatoshiValue, getFiatValue } =
        await import("@getalby/lightning-tools");
      const map: { [productId: string]: number } = {};
      const cartCurrencyUpper = cartCurrency!.toUpperCase();
      for (const product of products) {
        const basePrice =
          product.bulkPrice !== undefined
            ? product.bulkPrice
            : product.weightPrice !== undefined
              ? product.weightPrice
              : product.volumePrice !== undefined
                ? product.volumePrice
                : product.price;
        const discount = appliedDiscounts[product.pubkey] || 0;
        const rawDiscountedPrice =
          discount > 0 ? basePrice * (1 - discount / 100) : basePrice;
        const discountedPrice = isSatsCurrency(product.currency)
          ? Math.ceil(rawDiscountedPrice)
          : Math.ceil(rawDiscountedPrice * 100) / 100;
        const qty = quantities[product.id] || 1;
        const productCurrencyUpper = product.currency.toUpperCase();
        if (productCurrencyUpper === cartCurrencyUpper) {
          map[product.id] = isSatsCurrency(cartCurrencyUpper)
            ? Math.ceil(discountedPrice * qty)
            : Math.ceil(discountedPrice * qty * 100) / 100;
        } else {
          try {
            const satVal =
              productCurrencyUpper === "SATS" || productCurrencyUpper === "SAT"
                ? discountedPrice * qty
                : await getSatoshiValue({
                    amount: discountedPrice * qty,
                    currency: product.currency,
                  });
            const fiatVal = await getFiatValue({
              satoshi: Math.ceil(satVal),
              currency: cartCurrencyUpper,
            });
            map[product.id] = isSatsCurrency(cartCurrencyUpper)
              ? Math.ceil(fiatVal)
              : Math.ceil(fiatVal * 100) / 100;
          } catch {
            map[product.id] = isSatsCurrency(cartCurrencyUpper)
              ? Math.ceil(discountedPrice * qty)
              : Math.ceil(discountedPrice * qty * 100) / 100;
          }
        }
      }
      if (!cancelled) setNativeCostsPerProduct(map);
    };
    compute();
    return () => {
      cancelled = true;
    };
  }, [products, quantities, appliedDiscounts, isSatsCart, cartCurrency]);

  useEffect(() => {
    if (!isSatsCart) {
      setUsdEstimate(null);
      return;
    }
    const fetchUsdEstimate = async () => {
      try {
        const { getSatoshiValue } = await import("@getalby/lightning-tools");
        const satsPerUsd = await getSatoshiValue({
          amount: 1,
          currency: "USD",
        });
        if (satsPerUsd > 0) {
          setUsdEstimate(Math.ceil((totalCost / satsPerUsd) * 100) / 100);
        }
      } catch {
        setUsdEstimate(null);
      }
    };
    fetchUsdEstimate();
  }, [totalCost, isSatsCart]);

  const [requiredInfo, setRequiredInfo] = useState("");

  useEffect(() => {
    if (products && products.length > 0) {
      const requiredFields = products
        .map((product) => product.required)
        .filter((field) => field)
        .join(", ");
      setRequiredInfo(requiredFields);
    }
  }, [products]);

  useEffect(() => {
    const loadSavedAddresses = () => {
      setSavedAddresses(getSavedAddresses());
    };

    loadSavedAddresses();
    window.addEventListener("storage", loadSavedAddresses);

    return () => {
      window.removeEventListener("storage", loadSavedAddresses);
    };
  }, []);

  const applySavedAddress = (address: SavedAddress) => {
    setValue("Name", address.name);
    setValue("Address", address.address);
    setValue("Unit", address.unit || "");
    setValue("City", address.city);
    setValue("Postal Code", address.zip);
    setValue("State/Province", address.state);
    setValue("Country", address.country);
    setSelectedSavedAddressId(address.id);
  };

  // Check if any products have pickup locations
  const productsWithPickupLocations = useMemo(() => {
    return products.filter(
      (product) =>
        (product.shippingType === "Added Cost/Pickup" ||
          product.shippingType === "Free/Pickup" ||
          product.shippingType === "Pickup") &&
        product.pickupLocations &&
        product.pickupLocations.length > 0
    );
  }, [products]);

  // Load NWC info and check cart for NWC compatibility
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
    window.addEventListener("storage", loadNwcInfo);
    return () => window.removeEventListener("storage", loadNwcInfo);
  }, [products, profileContext.profileData]);

  useEffect(() => {
    setIsStripeMerchant(false);
    setAllSellersHaveStripe(false);
    setSellerConnectedAccountId(null);
    setSellerStripeAccounts({});
    setStripeClientSecret(null);
    setStripePaymentIntentId(null);
    setStripePaymentConfirmed(false);
    setHasTimedOut(false);
    setStripeTimeoutSeconds(STRIPE_TIMEOUT_SECONDS);
    setMultiMerchantTransferGroup(null);
    setMultiMerchantSellerSplits(null);

    if (products.length === 0 || uniqueSellerPubkeys.length === 0) {
      setFiatPaymentOptions({});
      setShowFiatTypeOption(false);
      setShowFiatPaymentInstructions(false);
      setSelectedFiatOption("");
      setFiatPaymentConfirmed(false);
      setPendingPaymentData(null);
      return;
    }

    if (!isSingleSeller) {
      setFiatPaymentOptions({});
      setShowFiatTypeOption(false);
      setShowFiatPaymentInstructions(false);
      setSelectedFiatOption("");
      setFiatPaymentConfirmed(false);
      setPendingPaymentData(null);
    }

    const checkAllSellersStripe = async () => {
      try {
        const accounts: Record<string, string> = {};
        let allHaveStripe = true;

        for (const pubkey of uniqueSellerPubkeys) {
          if (pubkey === process.env.NEXT_PUBLIC_MILK_MARKET_PK) {
            accounts[pubkey] = "platform";
            continue;
          }
          const res = await fetch("/api/stripe/connect/seller-status", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ pubkey }),
          });
          if (res.ok) {
            const data = await res.json();
            if (data.hasStripeAccount && data.chargesEnabled) {
              if (data.connectedAccountId) {
                accounts[pubkey] = data.connectedAccountId;
              }
            } else {
              allHaveStripe = false;
            }
          } else {
            allHaveStripe = false;
          }
        }

        setSellerStripeAccounts(accounts);

        if (isSingleSeller && singleSellerPubkey) {
          const hasStripe = !!accounts[singleSellerPubkey];
          setIsStripeMerchant(hasStripe);
          if (hasStripe && accounts[singleSellerPubkey] !== "platform") {
            setSellerConnectedAccountId(accounts[singleSellerPubkey]!);
          }
        }

        setAllSellersHaveStripe(
          allHaveStripe &&
            Object.keys(accounts).length === uniqueSellerPubkeys.length
        );
      } catch {
        setAllSellersHaveStripe(false);
      }
    };

    checkAllSellersStripe();
  }, [
    isSingleSeller,
    singleSellerPubkey,
    uniqueSellerPubkeys.length,
    products.length,
  ]);

  useEffect(() => {
    if (isSingleSeller && singleSellerPubkey) {
      const sellerProfile = profileContext.profileData.get(singleSellerPubkey);
      const fiatOptions = sellerProfile?.content?.fiat_options || {};
      setFiatPaymentOptions(fiatOptions);
      setMultiFiatOptions({});
    } else if (!isSingleSeller && uniqueSellerPubkeys.length > 1) {
      setFiatPaymentOptions({});
      const perSeller: { [pubkey: string]: { [method: string]: string } } = {};
      for (const pubkey of uniqueSellerPubkeys) {
        const profile = profileContext.profileData.get(pubkey);
        const opts = profile?.content?.fiat_options || {};
        if (Object.keys(opts).length > 0) {
          perSeller[pubkey] = opts;
        }
      }
      setMultiFiatOptions(perSeller);
    } else {
      setFiatPaymentOptions({});
      setMultiFiatOptions({});
    }
  }, [
    isSingleSeller,
    singleSellerPubkey,
    uniqueSellerPubkeys,
    profileContext.profileData,
  ]);

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

    // Check pickup location requirements
    const pickupLocationValid = productsWithPickupLocations.every((product) => {
      const shouldCheckPickup =
        formType === "contact" ||
        (formType === "combined" && shippingPickupPreference === "contact");

      if (shouldCheckPickup) {
        return watchedValues[`pickupLocation_${product.id}`]?.trim();
      }
      return true;
    });

    if (formType === "shipping") {
      isValid = !!(
        watchedValues.Name?.trim() &&
        watchedValues.Address?.trim() &&
        watchedValues.City?.trim() &&
        watchedValues["Postal Code"]?.trim() &&
        watchedValues["State/Province"]?.trim() &&
        watchedValues.Country?.trim() &&
        (!saveDetails || saveAddressLabel.trim()) &&
        (!requiredInfo || watchedValues.Required?.trim()) &&
        pickupLocationValid
      );
    } else if (formType === "contact") {
      isValid = true;
    } else if (formType === "combined") {
      isValid = !!(
        watchedValues.Name?.trim() &&
        watchedValues.Address?.trim() &&
        watchedValues.City?.trim() &&
        watchedValues["Postal Code"]?.trim() &&
        watchedValues["State/Province"]?.trim() &&
        watchedValues.Country?.trim() &&
        (!saveDetails || saveAddressLabel.trim()) &&
        (!requiredInfo || watchedValues.Required?.trim()) &&
        pickupLocationValid
      );
    }

    setIsFormValid(isValid);
  }, [
    watchedValues,
    formType,
    requiredInfo,
    productsWithPickupLocations,
    shippingPickupPreference,
    saveDetails,
    saveAddressLabel,
  ]);

  const generateNewKeys = async () => {
    try {
      const { nsec: nsecForSender, npub: npubForSender } = await generateKeys();
      const { nsec: nsecForReceiver, npub: npubForReceiver } =
        await generateKeys();

      return {
        senderNpub: npubForSender,
        senderNsec: nsecForSender,
        receiverNpub: npubForReceiver,
        receiverNsec: nsecForReceiver,
      };
    } catch {
      return null;
    }
  };

  // Returns true iff a delivery attempt to the recipient succeeded. Callers
  // that pass a cashu token in the message gate proof-tracker consumption on
  // this so that proofs in a fully-failed send remain recoverable.
  const sendPaymentAndContactMessage = async (
    pubkeyToReceiveMessage: string,
    message: string,
    product: ProductData,
    isPayment?: boolean,
    isReceipt?: boolean,
    isDonation?: boolean,
    isHerdshare?: boolean,
    orderId?: string,
    paymentType?: string,
    paymentReference?: string,
    paymentProof?: string,
    messageAmount?: number,
    productQuantity?: number,
    contact?: string,
    address?: string,
    pickup?: string,
    donationAmountValue?: number,
    donationPercentageValue?: number,
    retryCount: number = 3,
    subscriptionInfo?: {
      enabled: boolean;
      frequency: string;
      stripeSubscriptionId: string;
    },
    orderCurrency?: string
  ): Promise<boolean> => {
    if (!pubkeyToReceiveMessage) {
      return false;
    }
    const newKeys = await generateNewKeys();
    if (!newKeys) {
      setFailureText("Failed to generate new keys for messages!");
      setShowFailureModal(true);
      return false;
    }

    for (let attempt = 0; attempt < retryCount; attempt++) {
      try {
        await sendPaymentAndContactMessageWithKeys(
          pubkeyToReceiveMessage,
          message,
          product,
          isPayment,
          isReceipt,
          isDonation,
          isHerdshare,
          orderId,
          paymentType,
          paymentReference,
          paymentProof,
          messageAmount,
          productQuantity,
          newKeys,
          contact,
          address,
          pickup,
          donationAmountValue,
          donationPercentageValue,
          subscriptionInfo,
          orderCurrency
        );
        // If we get here, the message was sent successfully
        return true;
      } catch (error) {
        console.warn(
          `Attempt ${attempt + 1} failed for message sending:`,
          error
        );

        if (attempt === retryCount - 1) {
          // This was the last attempt, log the error but don't throw.
          // Returning `false` lets proof-carrying callers keep the
          // associated proofs in the recoverable-tracker.
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

  const sendPaymentAndContactMessageWithKeys = async (
    pubkeyToReceiveMessage: string,
    message: string,
    product: ProductData,
    isPayment?: boolean,
    isReceipt?: boolean,
    isDonation?: boolean,
    isHerdshare?: boolean,
    orderId?: string,
    paymentType?: string,
    paymentReference?: string,
    paymentProof?: string,
    messageAmount?: number,
    productQuantity?: number,
    keys?: {
      senderNpub: string;
      senderNsec: string;
      receiverNpub: string;
      receiverNsec: string;
    },
    contact?: string,
    address?: string,
    pickup?: string,
    donationAmountValue?: number,
    donationPercentageValue?: number,
    subscriptionInfo?: {
      enabled: boolean;
      frequency: string;
      stripeSubscriptionId: string;
    },
    orderCurrency?: string
  ) => {
    if (!pubkeyToReceiveMessage) {
      return;
    }
    if (!keys) {
      setFailureText("Message keys are required!");
      setShowFailureModal(true);
      return;
    }

    const decodedRandomPubkeyForSender = nip19.decode(keys.senderNpub);
    const decodedRandomPrivkeyForSender = nip19.decode(keys.senderNsec);
    const decodedRandomPubkeyForReceiver = nip19.decode(keys.receiverNpub);
    const decodedRandomPrivkeyForReceiver = nip19.decode(keys.receiverNsec);

    const realBuyerPubkey = await signer?.getPubKey?.();
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
        // Only emit an amount when the caller explicitly passed one. The old
        // `messageAmount || totalCost` fallback paired a sats-denominated
        // totalCost with whatever orderCurrency the caller passed (e.g. USD),
        // which the orders dashboard would render as ~1500x the real amount.
        // We also treat 0 as "no amount" so the dashboard can fall back to
        // productPrice * quantity in the product's own currency.
        orderAmount:
          messageAmount && messageAmount > 0 ? messageAmount : undefined,
        orderCurrency: orderCurrency || undefined,
        orderId,
        productData: product,
        paymentType,
        paymentReference,
        contact,
        address,
        buyerPubkey,
        buyerEmail: guestBuyerEmail,
        isGuest,
        pickup,
        donationAmount: donationAmountValue,
        donationPercentage: donationPercentageValue,
        selectedSize: product.selectedSize,
        selectedVolume: product.selectedVolume,
        selectedWeight: product.selectedWeight,
        selectedVariant: product.selectedVariant,
        variantLabel: product.variantLabel,
        selectedBulkOption: product.selectedBulkOption,
        subscriptionInfo,
      };
    } else if (isReceipt) {
      messageSubject = "order-receipt";
      messageOptions = {
        isOrder: true,
        type: 4,
        // See note on order-payment above — don't fall back to sats totalCost
        // when the caller's orderCurrency may be a fiat currency.
        orderAmount:
          messageAmount && messageAmount > 0 ? messageAmount : undefined,
        orderCurrency: orderCurrency || undefined,
        orderId,
        productData: product,
        status: "confirmed",
        paymentType,
        paymentReference,
        paymentProof,
        address,
        buyerPubkey,
        pickup,
        donationAmount: donationAmountValue,
        donationPercentage: donationPercentageValue,
        selectedSize: product.selectedSize,
        selectedVolume: product.selectedVolume,
        selectedWeight: product.selectedWeight,
        selectedVariant: product.selectedVariant,
        variantLabel: product.variantLabel,
        selectedBulkOption: product.selectedBulkOption,
      };
    } else if (isDonation) {
      messageSubject = "donation";
    } else if (isHerdshare) {
      messageSubject = "order-info";
      messageOptions = {
        isOrder: true,
        type: 1,
        orderAmount:
          messageAmount && messageAmount > 0 ? messageAmount : undefined,
        orderCurrency: orderCurrency || undefined,
        orderId,
        productData: product,
        quantity: productQuantity ? productQuantity : 1,
      };
    } else if (orderId) {
      messageSubject = "order-info";
      messageOptions = {
        isOrder: true,
        type: 1,
        // See note on order-payment above — don't fall back to sats totalCost
        // when the caller's orderCurrency may be a fiat currency.
        orderAmount:
          messageAmount && messageAmount > 0 ? messageAmount : undefined,
        orderCurrency: orderCurrency || undefined,
        orderId,
        productData: product,
        quantity: productQuantity ? productQuantity : 1,
        contact,
        address,
        buyerPubkey,
        buyerEmail: guestBuyerEmail,
        isGuest,
        pickup,
        donationAmount: donationAmountValue,
        donationPercentage: donationPercentageValue,
        selectedSize: product.selectedSize,
        selectedVolume: product.selectedVolume,
        selectedWeight: product.selectedWeight,
        selectedVariant: product.selectedVariant,
        variantLabel: product.variantLabel,
        selectedBulkOption: product.selectedBulkOption,
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
    // Only seller-bound order messages drive the orders dashboard; deliver
    // those to the seller's own relays (server + client fallback). Buyer
    // receipts and donations don't need this and would just add latency.
    const deliverToRecipientRelays = !!orderId && !isReceipt && !isDonation;
    await sendGiftWrappedMessageEvent(nostr!, giftWrappedEvent, signer, {
      deliverToRecipientRelays,
    });

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
  };

  const validatePaymentData = (
    price: number,
    data?: ShippingFormData | ContactFormData | CombinedFormData
  ) => {
    if (price < 1) {
      throw new Error("Payment amount must be greater than 0 sats");
    }

    if (data) {
      if ("Name" in data && "Contact" in data) {
        const combinedData = data as CombinedFormData;
        if (
          !combinedData.Name?.trim() ||
          !combinedData.Address?.trim() ||
          !combinedData.City?.trim() ||
          !combinedData["Postal Code"]?.trim() ||
          !combinedData["State/Province"]?.trim() ||
          !combinedData.Country?.trim() ||
          !combinedData.Contact?.trim() ||
          !combinedData["Contact Type"]?.trim() ||
          !combinedData.Instructions?.trim()
        ) {
          throw new Error("Required fields are missing");
        }
      } else if ("Name" in data) {
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
    paymentType?: "lightning" | "cashu" | "nwc" | "stripe" | "fiat"
  ) => {
    try {
      if (buyerEmail) {
        reportCartActivity(buyerEmail);
      }

      const methodCosts =
        paymentType === "lightning" ||
        paymentType === "cashu" ||
        paymentType === "nwc"
          ? bitcoinCosts
          : paymentType === "stripe"
            ? stripeCosts
            : { nativeTotal: nativeTotalCost, satsTotal: totalCost };
      const price = methodCosts.satsTotal;

      if (price < 1) {
        throw new Error("Total price is less than 1 sat.");
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
      } else if (formType === "combined") {
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

      if (
        saveDetails &&
        (formType === "shipping" || formType === "combined") &&
        paymentData.shippingName &&
        paymentData.shippingAddress
      ) {
        saveAddress({
          id: selectedSavedAddressId || undefined,
          name: paymentData.shippingName,
          address: paymentData.shippingAddress,
          unit: paymentData.shippingUnitNo || "",
          city: paymentData.shippingCity,
          state: paymentData.shippingState,
          zip: paymentData.shippingPostalCode,
          country: paymentData.shippingCountry,
          label: saveAddressLabel.trim(),
          isDefault: false,
        });
      }

      if (paymentType === "fiat") {
        setPendingPaymentData(paymentData);
        if (isSingleSeller) {
          const fiatOptionKeys = Object.keys(fiatPaymentOptions);
          if (fiatOptionKeys.length === 1) {
            setSelectedFiatOption(fiatOptionKeys[0]!);
            setShowFiatPaymentInstructions(true);
          } else if (fiatOptionKeys.length > 1) {
            setShowFiatTypeOption(true);
          }
        } else {
          setMultiFiatSelections({});
          setMultiFiatConfirmed({});
          const autoSelections: { [pk: string]: string } = {};
          for (const pk of sellersWithFiat) {
            const opts = multiFiatOptions[pk];
            if (opts && Object.keys(opts).length === 1) {
              autoSelections[pk] = Object.keys(opts)[0]!;
            }
          }
          setMultiFiatSelections(autoSelections);
          const allAutoSelected = sellersWithFiat.every(
            (pk) => autoSelections[pk]
          );
          if (allAutoSelected) {
            setShowFiatPaymentInstructions(true);
          } else {
            setShowFiatTypeOption(true);
          }
        }
        return;
      }

      const emailAddressTag =
        paymentData.shippingName && paymentData.shippingAddress
          ? `${paymentData.shippingName}, ${paymentData.shippingAddress}, ${
              paymentData.shippingUnitNo
                ? `${paymentData.shippingUnitNo}, `
                : ""
            }${paymentData.shippingCity || ""}, ${
              paymentData.shippingState || ""
            }, ${paymentData.shippingPostalCode || ""}, ${
              paymentData.shippingCountry || ""
            }`
          : undefined;
      const productsBySeller: { [pubkey: string]: typeof products } = {};
      for (const p of products) {
        if (!productsBySeller[p.pubkey]) {
          productsBySeller[p.pubkey] = [];
        }
        productsBySeller[p.pubkey]!.push(p);
      }

      pendingOrderEmailRef.current = Object.entries(productsBySeller).map(
        ([sellerPubkey, sellerProducts]) => {
          const sellerProductTitles = sellerProducts
            .map((p: any) => {
              const parts = [p.title || p.productName];
              if (p.selectedSize) parts.push(`Size: ${p.selectedSize}`);
              if (p.selectedVolume) parts.push(`Volume: ${p.selectedVolume}`);
              if (p.selectedWeight) parts.push(`Weight: ${p.selectedWeight}`);
              if (p.selectedVariant)
                parts.push(
                  `${p.variantLabel || "Option"}: ${p.selectedVariant}`
                );
              if (p.selectedBulkOption)
                parts.push(`Bundle: ${p.selectedBulkOption} units`);
              const qty = quantities[p.id];
              if (qty && qty > 1) parts.push(`Qty: ${qty}`);
              return parts.join(" - ");
            })
            .join("; ");
          const sellerPickupSummary = sellerProducts
            .map((p: any) => selectedPickupLocations[p.id])
            .filter(Boolean)
            .join(", ");
          const sellerShipSats = shippingCostsInSats[sellerPubkey] || 0;
          const sellerShipNative = nativeShippingPerSeller[sellerPubkey] || 0;
          const sellerAmountSats =
            (totalCostsInSats[sellerPubkey] || 0) + sellerShipSats;
          const sellerAmountNative =
            !isSatsCart && nativeCostsPerProduct
              ? sellerProducts.reduce(
                  (sum: number, p: any) =>
                    sum + (nativeCostsPerProduct[p.id] || 0),
                  0
                ) + sellerShipNative
              : null;
          const orderCurrency =
            !isSatsCart && cartCurrency ? cartCurrency : "sats";
          const orderAmount =
            sellerAmountNative !== null
              ? String(Math.ceil(sellerAmountNative * 100) / 100)
              : String(sellerAmountSats || price);
          const sellerSubFrequencies = sellerProducts
            .map((p: any) => subscriptionSelections[p.id])
            .filter((s: any) => s?.enabled)
            .map((s: any) => s.frequency);
          const sellerSubFrequency =
            sellerSubFrequencies.length > 0
              ? sellerSubFrequencies[0]
              : undefined;
          const sellerProfileForEmailDonation =
            profileContext.profileData.get(sellerPubkey);
          const isPlatformSeller =
            sellerPubkey === process.env.NEXT_PUBLIC_MILK_MARKET_PK;
          const onPlatformPayment =
            paymentType === "cashu" ||
            paymentType === "nwc" ||
            paymentType === "lightning" ||
            paymentType === "stripe";
          const orderAmountNumeric = parseFloat(orderAmount) || 0;
          const emailDonationPercentage =
            !isPlatformSeller && onPlatformPayment
              ? (sellerProfileForEmailDonation?.content?.mm_donation ?? 0)
              : 0;
          const emailDonationAmount =
            emailDonationPercentage > 0 && orderAmountNumeric > 0
              ? Math.ceil((orderAmountNumeric * emailDonationPercentage) / 100)
              : 0;
          return {
            orderId: "",
            productTitle: sellerProductTitles,
            amount: orderAmount,
            currency: orderCurrency,
            paymentMethod: paymentType || "lightning",
            sellerPubkey,
            buyerName: paymentData.shippingName || undefined,
            shippingAddress: emailAddressTag,
            buyerContact:
              paymentData.contactEmail || paymentData.contactPhone || undefined,
            pickupLocation: sellerPickupSummary || undefined,
            subscriptionFrequency: sellerSubFrequency,
            donationAmount: emailDonationAmount,
            donationPercentage: emailDonationPercentage,
          };
        }
      );

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
      setFailureText("Payment failed. Please try again.");
      setShowFailureModal(true);
    }
  };

  // Auto-skip the order-type selection screen when there is only one possible
  // path. Buyers should never have to click a button that has no alternative.
  // - Mixed shipping types: only "Mixed delivery" is offered, so auto-pick
  //   "combined" (the downstream pickup-vs-shipping preference is a real
  //   2-option choice and is preserved).
  // - All-Free / All-Added-Cost cart: only shipping is offered, auto-pick it.
  // - All-Pickup cart: only contact is offered, auto-pick it.
  // - Single-type carts of "Free/Pickup" or "Added Cost/Pickup" still
  //   present a genuine 2-option choice (shipping vs pickup) and are
  //   left untouched.
  useEffect(() => {
    if (!showOrderTypeSelection) return;
    if (products.length === 0) return;
    if (uniqueShippingTypes.length === 0) return;
    if (uniqueShippingTypes.length > 1) {
      handleOrderTypeSelection("combined");
      return;
    }
    const st = uniqueShippingTypes[0];
    if (st === "Free/Pickup" || st === "Added Cost/Pickup") return;
    if (st === "Free" || st === "Added Cost") {
      handleOrderTypeSelection("shipping");
    } else {
      handleOrderTypeSelection("contact");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showOrderTypeSelection, uniqueShippingTypes, products.length]);

  const handleOrderTypeSelection = async (selectedOrderType: string) => {
    setShowOrderTypeSelection(false);

    if (selectedOrderType === "shipping") {
      setFormType("shipping");
      let shippingTotal = 0;
      const updatedTotalCostsInSats: { [productId: string]: number } = {};
      const processedSellers = new Set<string>();

      for (const product of products) {
        const sellerPubkey = product.pubkey;
        if (sellerFreeShippingStatus[sellerPubkey]?.qualifies) {
          updatedTotalCostsInSats[product.id] =
            totalCostsInSats[product.id] || 0;
          continue;
        }
        if (!processedSellers.has(sellerPubkey)) {
          processedSellers.add(sellerPubkey);
          const sellerProducts = products.filter(
            (p) => p.pubkey === sellerPubkey
          );
          if (sellerProducts.length > 1) {
            const { highestShippingProduct } =
              getConsolidatedShippingForSeller(sellerPubkey);
            if (highestShippingProduct) {
              const shippingCostInSats = await convertShippingToSats(
                highestShippingProduct
              );
              shippingTotal += Math.ceil(
                applyShippingDiscount(shippingCostInSats, sellerPubkey)
              );
            }
            sellerProducts.forEach((sp) => {
              updatedTotalCostsInSats[sp.id] = totalCostsInSats[sp.id] || 0;
            });
          } else {
            const shippingCostInSats = await convertShippingToSats(product);
            const quantity = quantities[product.id] || 1;
            const productShippingCost = Math.ceil(
              applyShippingDiscount(shippingCostInSats * quantity, sellerPubkey)
            );
            shippingTotal += productShippingCost;
            updatedTotalCostsInSats[product.id] =
              (totalCostsInSats[product.id] || 0) + productShippingCost;
          }
        }
      }

      setTotalCost(subtotalCost + shippingTotal);
    } else if (selectedOrderType === "contact") {
      setFormType("contact");
      setIsFormValid(true);
      setTotalCost(subtotalCost);
    } else if (selectedOrderType === "combined") {
      setFormType("combined");
      if (hasMixedShippingWithPickup) {
        setShowFreePickupSelection(true);
      } else {
        let shippingTotal = 0;
        const updatedTotalCostsInSats: { [productId: string]: number } = {};
        const processedSellers = new Set<string>();

        for (const product of products) {
          const sellerPubkey = product.pubkey;
          const productShippingType = shippingTypes[product.id];

          if (sellerFreeShippingStatus[sellerPubkey]?.qualifies) {
            updatedTotalCostsInSats[product.id] =
              totalCostsInSats[product.id] || 0;
            continue;
          }

          if (
            productShippingType === "Added Cost" ||
            productShippingType === "Free"
          ) {
            if (!processedSellers.has(sellerPubkey)) {
              processedSellers.add(sellerPubkey);
              const sellerProducts = products.filter(
                (p) =>
                  p.pubkey === sellerPubkey &&
                  (shippingTypes[p.id] === "Added Cost" ||
                    shippingTypes[p.id] === "Free")
              );
              if (sellerProducts.length > 1) {
                const { highestShippingProduct } =
                  getConsolidatedShippingForSeller(sellerPubkey);
                if (highestShippingProduct) {
                  const shippingCostInSats = await convertShippingToSats(
                    highestShippingProduct
                  );
                  shippingTotal += Math.ceil(
                    applyShippingDiscount(shippingCostInSats, sellerPubkey)
                  );
                }
                sellerProducts.forEach((sp) => {
                  updatedTotalCostsInSats[sp.id] = totalCostsInSats[sp.id] || 0;
                });
              } else {
                const shippingCostInSats = await convertShippingToSats(product);
                const quantity = quantities[product.id] || 1;
                const productShippingCost = Math.ceil(
                  applyShippingDiscount(
                    shippingCostInSats * quantity,
                    sellerPubkey
                  )
                );
                shippingTotal += productShippingCost;
                updatedTotalCostsInSats[product.id] =
                  (totalCostsInSats[product.id] || 0) + productShippingCost;
              }
            }
          } else {
            updatedTotalCostsInSats[product.id] =
              totalCostsInSats[product.id] || 0;
          }
        }

        setTotalCost(subtotalCost + shippingTotal);
      }
    }
  };

  // Reactively recompute totalCost (sats) whenever inputs that affect the
  // shipping math change AFTER the buyer has already picked an order type.
  // handleOrderTypeSelection runs once on click and sets totalCost; without
  // this effect, applying/changing a shipping discount code after that point
  // would leave totalCost stale and the buyer would be charged the
  // un-discounted shipping. Mirrors the per-seller logic in
  // handleOrderTypeSelection — consolidated shipping, free-shipping
  // threshold, and applyShippingDiscount in the same order.
  useEffect(() => {
    let cancelled = false;
    const recompute = async () => {
      if (formType !== "shipping" && formType !== "combined") {
        if (!cancelled) {
          setTotalCost(subtotalCost);
          setShippingCostsInSats({});
        }
        return;
      }
      let shippingTotal = 0;
      const shipPerSeller: Record<string, number> = {};
      const processedSellers = new Set<string>();
      for (const product of products) {
        const sellerPubkey = product.pubkey;
        if (sellerFreeShippingStatus[sellerPubkey]?.qualifies) continue;
        if (formType === "combined") {
          const st = shippingTypes[product.id];
          if (st !== "Added Cost" && st !== "Free") continue;
        }
        if (processedSellers.has(sellerPubkey)) continue;
        processedSellers.add(sellerPubkey);
        const sellerProducts = products.filter(
          (p) =>
            p.pubkey === sellerPubkey &&
            (formType !== "combined" ||
              shippingTypes[p.id] === "Added Cost" ||
              shippingTypes[p.id] === "Free")
        );
        if (sellerProducts.length > 1) {
          const { highestShippingProduct } =
            getConsolidatedShippingForSeller(sellerPubkey);
          if (highestShippingProduct) {
            const shippingCostInSats = await convertShippingToSats(
              highestShippingProduct
            );
            const discountedShip = Math.ceil(
              applyShippingDiscount(shippingCostInSats, sellerPubkey)
            );
            shippingTotal += discountedShip;
            shipPerSeller[sellerPubkey] = discountedShip;
          }
        } else if (sellerProducts.length === 1) {
          const shippingCostInSats = await convertShippingToSats(
            sellerProducts[0]!
          );
          const quantity = quantities[sellerProducts[0]!.id] || 1;
          const discountedShip = Math.ceil(
            applyShippingDiscount(shippingCostInSats * quantity, sellerPubkey)
          );
          shippingTotal += discountedShip;
          shipPerSeller[sellerPubkey] = discountedShip;
        }
      }
      if (!cancelled) {
        setTotalCost(subtotalCost + shippingTotal);
        setShippingCostsInSats(shipPerSeller);
      }
    };
    recompute();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    appliedShippingDiscounts,
    formType,
    shippingPickupPreference,
    subtotalCost,
    products,
    quantities,
    shippingTypes,
    sellerFreeShippingStatus,
  ]);

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
      validatePaymentData(convertedPrice, data);

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
      await invoiceHasBeenPaid(wallet, convertedPrice, hash, data);
    } catch (error: any) {
      handleNWCError(error);
    } finally {
      nwc?.close();
      setIsNwcLoading(false);
    }
  };

  const handleStripePayment = async (convertedPrice: number, data: any) => {
    try {
      validatePaymentData(convertedPrice, data);

      const orderId = uuidv4();

      if (pendingOrderEmailRef.current) {
        pendingOrderEmailRef.current.forEach((entry) => {
          if (!entry.orderId) entry.orderId = orderId;
        });
      }

      const productTitles = products
        .map((p: any) => p.title || p.productName)
        .join(", ");

      // Use the discounted Stripe-method totals (matches what's shown on the
      // "Pay with Card" button) so the buyer is charged exactly the price
      // they see. Falling back to the un-discounted nativeTotalCost would
      // double-charge the discount or under/over-charge the merchant.
      const stripeAmount =
        stripeCosts.nativeTotal !== null && cartCurrency
          ? stripeCosts.nativeTotal
          : stripeCosts.satsTotal;
      const stripeCurrency =
        stripeCosts.nativeTotal !== null && cartCurrency
          ? cartCurrency
          : "sats";

      const isMultiMerchant = !isSingleSeller && allSellersHaveStripe;

      if (hasActiveSubscription) {
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

        const cartItems = products.map((product) => {
          const sel = subscriptionSelections[product.id];
          const basePrice =
            product.bulkPrice !== undefined
              ? product.bulkPrice
              : product.weightPrice !== undefined
                ? product.weightPrice
                : product.volumePrice !== undefined
                  ? product.volumePrice
                  : product.price;
          const qty = quantities[product.id] || 1;

          return {
            productTitle: product.title,
            productEventId: `30402:${product.pubkey}:${product.d}`,
            amount: basePrice * qty,
            currency: product.currency,
            quantity: qty,
            isSubscription: !!(sel && sel.enabled),
            frequency: sel?.enabled ? sel.frequency : undefined,
            discountPercent: appliedDiscounts[product.pubkey] || 0,
            subscriptionDiscount: sel?.enabled
              ? product.subscriptionDiscount || 0
              : 0,
            sellerPubkey: product.pubkey,
            variantInfo:
              product.selectedSize ||
              product.selectedVolume ||
              product.selectedWeight ||
              product.selectedVariant ||
              product.selectedBulkOption
                ? {
                    size: product.selectedSize || undefined,
                    volume: product.selectedVolume || undefined,
                    weight: product.selectedWeight || undefined,
                    selectedVariant: product.selectedVariant || undefined,
                    variantLabel: product.variantLabel || undefined,
                    bulk: product.selectedBulkOption || undefined,
                  }
                : undefined,
          };
        });

        const response = await fetch("/api/stripe/create-cart-subscription", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            items: cartItems,
            customerEmail: buyerEmail,
            sellerPubkey: isSingleSeller
              ? singleSellerPubkey || products[0]?.pubkey || ""
              : undefined,
            buyerPubkey: userPubkey || null,
            shippingAddress: shippingAddressObj,
          }),
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(
            errorData.details || "Failed to create cart subscription"
          );
        }

        const respData = await response.json();

        setStripeSubscriptionId(respData.subscriptionId);
        setStripeClientSecret(respData.clientSecret);
        setStripePaymentIntentId(null);
        setStripeConnectedAccountForForm(
          respData.isMultiMerchant
            ? null
            : respData.connectedAccountId || sellerConnectedAccountId || null
        );
        if (respData.isMultiMerchant) {
          setMultiMerchantTransferGroup(respData.transferGroup);
          setMultiMerchantSellerSplits(respData.sellerSplits);
        }
        setPendingStripeData(data);
        setShowInvoiceCard(true);
        setStripeTimeoutSeconds(STRIPE_TIMEOUT_SECONDS);
        setHasTimedOut(false);
      } else {
        const sellerSplitsPayload = isMultiMerchant
          ? uniqueSellerPubkeys.map((pubkey) => {
              const sellerProducts = products.filter(
                (p) => p.pubkey === pubkey
              );
              const sellerCurrency = sellerProducts[0]?.currency || "usd";
              const sellerCurrencyLower = sellerCurrency.toLowerCase();
              const sellerIsZeroDecimal =
                isSatsCurrency(sellerCurrencyLower) ||
                ZERO_DECIMAL_CURRENCIES.has(sellerCurrencyLower);
              // Sum each line in the seller's native currency, ceiling each
              // line to the seller-currency smallest unit. Then ceil the
              // shipping. The per-seller smallest-unit total is the single
              // source of truth: the API sums these to compute the buyer
              // charge, so the buyer is never billed less than the merchants
              // expect to receive in aggregate.
              let sellerSmallest = 0;
              for (const p of sellerProducts) {
                const price =
                  p.bulkPrice !== undefined
                    ? p.bulkPrice
                    : p.weightPrice !== undefined
                      ? p.weightPrice
                      : p.volumePrice !== undefined
                        ? p.volumePrice
                        : p.price;
                const qty = quantities[p.id] || 1;
                const discount = appliedDiscounts[p.pubkey] || 0;
                const discountedPrice =
                  discount > 0 ? price * (1 - discount / 100) : price;
                const lineNative = discountedPrice * qty;
                sellerSmallest += sellerIsZeroDecimal
                  ? Math.ceil(lineNative)
                  : Math.ceil(lineNative * 100);
              }
              const { highestShippingCost } =
                getConsolidatedShippingForSeller(pubkey);
              // Apply per-seller shipping discount (free / % / fixed) before
              // converting to Stripe's smallest-unit so the buyer is charged
              // the discounted amount.
              const discountedSellerShipping = applyShippingDiscount(
                highestShippingCost,
                pubkey
              );
              if (discountedSellerShipping > 0) {
                sellerSmallest += sellerIsZeroDecimal
                  ? Math.ceil(discountedSellerShipping)
                  : Math.ceil(discountedSellerShipping * 100);
              }
              const aff = affiliateMetaBySeller[pubkey];
              let affiliateRebateSmallest: number | undefined;
              if (aff) {
                if (aff.rebateType === "percent") {
                  affiliateRebateSmallest = Math.floor(
                    (sellerSmallest * aff.rebateValue) / 100
                  );
                } else {
                  affiliateRebateSmallest = sellerIsZeroDecimal
                    ? Math.floor(aff.rebateValue)
                    : Math.floor(aff.rebateValue * 100);
                }
              }
              return {
                sellerPubkey: pubkey,
                amountSmallest: sellerSmallest,
                currency: sellerCurrency,
                ...(aff
                  ? {
                      affiliateId: aff.affiliateId,
                      affiliateCodeId: aff.codeId,
                      affiliateCode: aff.code,
                      affiliateRebateSmallest,
                    }
                  : {}),
              };
            })
          : undefined;

        const singleSellerAffiliate =
          !isMultiMerchant && singleSellerPubkey
            ? affiliateMetaBySeller[singleSellerPubkey]
            : undefined;

        const response = await fetch("/api/stripe/create-payment-intent", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            amount: stripeAmount,
            currency: stripeCurrency,
            customerEmail:
              buyerEmail ||
              (userPubkey
                ? `${userPubkey.substring(0, 8)}@nostr.com`
                : `guest-${orderId.substring(0, 8)}@nostr.com`),
            productTitle: `Cart Order: ${productTitles}`,
            metadata: {
              orderId,
              productId: products.map((p) => p.id).join(","),
              sellerPubkey: singleSellerPubkey || uniqueSellerPubkeys.join(","),
              buyerPubkey: userPubkey || "",
              productTitle: productTitles,
              isCart: "true",
            },
            sellerSplits: sellerSplitsPayload,
            ...(salesTaxSmallest > 0 && {
              salesTaxSmallest,
              taxCalculationId: taxCalculationId || undefined,
            }),
            ...(singleSellerAffiliate
              ? {
                  affiliateId: singleSellerAffiliate.affiliateId,
                  affiliateCodeId: singleSellerAffiliate.codeId,
                  affiliateCode: singleSellerAffiliate.code,
                  affiliateRebateSmallest:
                    singleSellerAffiliate.rebateType === "percent"
                      ? Math.floor(
                          (stripeAmount * singleSellerAffiliate.rebateValue) /
                            100
                        )
                      : Math.floor(singleSellerAffiliate.rebateValue * 100),
                }
              : {}),
          }),
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.details || "Failed to create payment");
        }

        const respData = await response.json();

        setStripeClientSecret(respData.clientSecret);
        setStripePaymentIntentId(respData.paymentIntentId);
        setStripeConnectedAccountForForm(
          respData.isMultiMerchant
            ? null
            : respData.connectedAccountId || sellerConnectedAccountId || null
        );
        if (respData.isMultiMerchant) {
          setMultiMerchantTransferGroup(respData.transferGroup);
          setMultiMerchantSellerSplits(respData.sellerSplits);
        }
        setPendingStripeData(data);
        setShowInvoiceCard(true);
        setStripeTimeoutSeconds(STRIPE_TIMEOUT_SECONDS);
        setHasTimedOut(false);
      }
    } catch (error) {
      console.error("Stripe payment error:", error);
      if (setInvoiceGenerationFailed) {
        setInvoiceGenerationFailed(true);
      }
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

    if (pendingOrderEmailRef.current) {
      pendingOrderEmailRef.current.forEach((entry) => {
        if (!entry.orderId) entry.orderId = orderId;
      });
    }

    flushPendingOrderEmails();
    setStripePaymentConfirmed(true);

    const productTitles = products
      .map((p: any) => p.title || p.productName)
      .join(", ");

    const addressTag =
      data.shippingName && data.shippingAddress
        ? data.shippingUnitNo
          ? `${data.shippingName}, ${data.shippingAddress}, ${data.shippingUnitNo}, ${data.shippingCity}, ${data.shippingState}, ${data.shippingPostalCode}, ${data.shippingCountry}`
          : `${data.shippingName}, ${data.shippingAddress}, ${data.shippingCity}, ${data.shippingState}, ${data.shippingPostalCode}, ${data.shippingCountry}`
        : undefined;

    if (multiMerchantSellerSplits && multiMerchantTransferGroup) {
      try {
        const transferResponse = await fetch("/api/stripe/process-transfers", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            paymentIntentId,
            sellerSplits: multiMerchantSellerSplits,
            transferGroup: multiMerchantTransferGroup,
          }),
        });
        const transferResult = await transferResponse.json();
        if (!transferResult.success) {
          const failedSellers = (transferResult.results || [])
            .filter((r: any) => r.error)
            .map((r: any) => r.sellerPubkey?.substring(0, 8) + "...")
            .join(", ");
          console.error("Some merchant transfers failed:", failedSellers);
          setFailureText(
            "Your payment was received, but there was an issue distributing funds to some sellers. The platform will resolve this. Your order is confirmed."
          );
          setShowFailureModal(true);
        }
      } catch (e) {
        console.error("Failed to process merchant transfers:", e);
        setFailureText(
          "Your payment was received, but there was an issue distributing funds to sellers. The platform will resolve this. Your order is confirmed."
        );
        setShowFailureModal(true);
      }
    }

    const subscriptionProductNames = products
      .filter((p) => subscriptionSelections[p.id]?.enabled)
      .map((p) => p.title)
      .join(", ");

    const subscriptionLabel = hasActiveSubscription
      ? ` (includes subscriptions: ${subscriptionProductNames})`
      : "";

    const sellerGroupedProducts: Record<string, typeof products> = {};
    for (const product of products) {
      if (!sellerGroupedProducts[product.pubkey]) {
        sellerGroupedProducts[product.pubkey] = [];
      }
      sellerGroupedProducts[product.pubkey]!.push(product);
    }

    for (const [sellerPk, sellerProducts] of Object.entries(
      sellerGroupedProducts
    )) {
      const sellerProductTitles = sellerProducts
        .map((p: any) => p.title || p.productName)
        .join(", ");

      const paymentMessage =
        "You have received a stripe payment from " +
        (userNPub || "a guest buyer") +
        " for your cart order (" +
        sellerProductTitles +
        ")" +
        subscriptionLabel +
        " on Milk Market! Check your Stripe account for the payment.";

      for (const product of sellerProducts) {
        const sel = subscriptionSelections[product.id];
        const subInfo =
          sel?.enabled && stripeSubscriptionId
            ? {
                enabled: true,
                frequency: sel.frequency,
                stripeSubscriptionId: stripeSubscriptionId,
              }
            : undefined;

        // The native and sats branches must be gated by the same condition,
        // otherwise we can pick the sats value (from totalCostsInSats) while
        // still tagging it as the cart's native currency (e.g. USD) — which
        // renders as ~1500x the actual amount in the orders dashboard. We
        // also intentionally do NOT fall back to product.price, because for
        // a product priced in a currency that differs from the cart's
        // native currency, product.price would be in the wrong unit.
        const nativeAmt = nativeCostsPerProduct?.[product.id];
        const useNativeForMsg =
          !isSatsCart &&
          !!cartCurrency &&
          typeof nativeAmt === "number" &&
          nativeAmt > 0;
        const productAmount = useNativeForMsg
          ? nativeAmt
          : totalCostsInSats[product.id] ||
            totalCostsInSats[product.pubkey] ||
            0;
        const productCurrency = useNativeForMsg
          ? (cartCurrency as string)
          : "sats";

        // Fold the seller's discounted shipping into the REPORTED amount only
        // (attributed to the first product so multi-product sellers don't
        // double-count). The Stripe charge and donation base are unchanged.
        const reportShipStripe =
          product === sellerProducts[0]
            ? useNativeForMsg
              ? nativeShippingPerSeller[product.pubkey] || 0
              : shippingCostsInSats[product.pubkey] || 0
            : 0;
        const reportedProductAmount = productAmount + reportShipStripe;

        const sellerProfileForDonation = profileContext.profileData.get(
          product.pubkey
        );
        const stripeDonationPercentage =
          sellerProfileForDonation?.content?.mm_donation ?? 0;
        const stripeDonationAmount =
          stripeDonationPercentage > 0 && productAmount
            ? Math.ceil((productAmount * stripeDonationPercentage) / 100)
            : 0;

        await sendPaymentAndContactMessage(
          sellerPk,
          paymentMessage,
          product,
          true,
          false,
          false,
          false,
          orderId,
          "stripe",
          paymentIntentId,
          paymentIntentId,
          reportedProductAmount,
          quantities[product.id] || 1,
          undefined,
          addressTag,
          selectedPickupLocations[product.id] || undefined,
          stripeDonationAmount,
          stripeDonationPercentage,
          undefined,
          subInfo,
          productCurrency
        );
      }
    }

    if (hasActiveSubscription) {
      try {
        const existingSummary = sessionStorage.getItem("orderSummary");
        if (existingSummary) {
          const summaryData = JSON.parse(existingSummary);
          summaryData.isSubscription = true;
          sessionStorage.setItem("orderSummary", JSON.stringify(summaryData));
        }
      } catch (e) {
        console.error(
          "Failed to update order summary with subscription info:",
          e
        );
      }
    }

    if (data.additionalInfo) {
      await new Promise((resolve) => setTimeout(resolve, 500));
      const additionalMessage =
        "Additional customer information: " + data.additionalInfo;

      for (const sellerPk of uniqueSellerPubkeys) {
        const sellerProduct = products.find((p) => p.pubkey === sellerPk);
        if (sellerProduct) {
          await sendPaymentAndContactMessage(
            sellerPk,
            additionalMessage,
            sellerProduct,
            false,
            false,
            false,
            false,
            orderId
          );
        }
      }
    }

    if (data.shippingName && data.shippingAddress) {
      await new Promise((resolve) => setTimeout(resolve, 500));
      const contactMessage = data.shippingUnitNo
        ? "Please ship the products to " +
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
          "."
        : "Please ship the products to " +
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
      for (const sellerPk of uniqueSellerPubkeys) {
        const sellerProduct = products.find((p) => p.pubkey === sellerPk);
        if (sellerProduct) {
          await sendPaymentAndContactMessage(
            sellerPk,
            contactMessage,
            sellerProduct,
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
            addressTag
          );
        }
      }

      await new Promise((resolve) => setTimeout(resolve, 500));
      const sellerNames = uniqueSellerPubkeys
        .map((pk) => nip19.npubEncode(pk))
        .join(", ");
      for (const product of products) {
        // Keep amount and currency tags in the same unit — see the matching
        // comment on the seller-side stripe payment message above.
        const nativeAmt = nativeCostsPerProduct?.[product.id];
        const useNativeForMsg =
          !isSatsCart &&
          !!cartCurrency &&
          typeof nativeAmt === "number" &&
          nativeAmt > 0;
        const productAmount = useNativeForMsg
          ? nativeAmt
          : totalCostsInSats[product.id] ||
            totalCostsInSats[product.pubkey] ||
            0;
        const productCurrency = useNativeForMsg
          ? (cartCurrency as string)
          : "sats";
        const qty = quantities[product.id] || 1;
        const sel = subscriptionSelections[product.id];
        const subInfo =
          sel?.enabled && stripeSubscriptionId
            ? {
                enabled: true,
                frequency: sel.frequency,
                stripeSubscriptionId: stripeSubscriptionId,
              }
            : undefined;
        const receiptMessage =
          "Your cart order (" +
          productTitles +
          ") was processed successfully via Stripe. You should be receiving delivery information from " +
          sellerNames +
          " as soon as they review your order.";
        const sellerProfileForReceiptDonation = profileContext.profileData.get(
          product.pubkey
        );
        const receiptDonationPercentage =
          sellerProfileForReceiptDonation?.content?.mm_donation ?? 0;
        const receiptDonationAmount =
          receiptDonationPercentage > 0
            ? Math.ceil((productAmount * receiptDonationPercentage) / 100)
            : 0;
        await sendPaymentAndContactMessage(
          userPubkey!,
          receiptMessage,
          product,
          false,
          true,
          false,
          false,
          orderId,
          "stripe",
          paymentIntentId,
          paymentIntentId,
          productAmount,
          qty,
          undefined,
          addressTag,
          selectedPickupLocations[product.id] || undefined,
          receiptDonationAmount,
          receiptDonationPercentage,
          undefined,
          subInfo,
          productCurrency
        );
      }
    }

    for (const product of products) {
      await sendInquiryDM(product.pubkey, product.title);
    }

    clearPurchasedFromCart();
    flushPendingOrderEmails();
    setPaymentConfirmed(true);
    setOrderConfirmed(true);
    if (discountCodes) {
      Object.entries(discountCodes).forEach(([pubkey, code]) => {
        if (code && shouldRedeemCodeForSeller(pubkey)) {
          fetch("/api/db/discount-code-used", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ code, pubkey }),
          }).catch(() => {});
        }
      });
    }
    // NOTE: Stripe referrals are recorded server-side from
    // /api/stripe/process-transfers (and reversed by the webhook on refund)
    // so we deliberately do NOT call recordAffiliateReferrals here. Calling
    // it from the browser would race with the server insert and risk
    // double-counting toward max_uses, and a buyer who closes the tab
    // before this fires would lose attribution.
    if (setInvoiceIsPaid) {
      setInvoiceIsPaid(true);
    }
  };

  const handleFiatPayment = async (convertedPrice: number, data: any) => {
    try {
      validatePaymentData(convertedPrice, data);

      const orderId = uuidv4();

      if (pendingOrderEmailRef.current) {
        pendingOrderEmailRef.current.forEach((entry) => {
          if (!entry.orderId) entry.orderId = orderId;
        });
      }

      const addressTag =
        data.shippingName && data.shippingAddress
          ? data.shippingUnitNo
            ? `${data.shippingName}, ${data.shippingAddress}, ${data.shippingUnitNo}, ${data.shippingCity}, ${data.shippingState}, ${data.shippingPostalCode}, ${data.shippingCountry}`
            : `${data.shippingName}, ${data.shippingAddress}, ${data.shippingCity}, ${data.shippingState}, ${data.shippingPostalCode}, ${data.shippingCountry}`
          : undefined;

      const productTitles = products
        .map((p: any) => p.title || p.productName)
        .join(", ");

      const isMultiFiat = !isSingleSeller && sellersWithFiat.length > 0;

      if (isMultiFiat) {
        for (const sellerPubkey of sellersWithFiat) {
          const sellerFiatOption = multiFiatSelections[sellerPubkey] || "";
          const sellerFiatHandle =
            multiFiatOptions[sellerPubkey]?.[sellerFiatOption] || "";
          const sellerProducts = products.filter(
            (p) => p.pubkey === sellerPubkey
          );
          const sellerProductTitles = sellerProducts
            .map((p: any) => p.title || p.productName)
            .join(", ");

          const paymentMessage =
            "You have received an order from " +
            (userNPub || "a guest buyer") +
            " for your cart order (" +
            sellerProductTitles +
            ") on Milk Market! Check your " +
            sellerFiatOption +
            " account for the payment.";

          for (const product of sellerProducts) {
            // Keep amount and currency tags in the same unit — see the
            // matching comment on the stripe payment message above.
            const nativeAmt = nativeCostsPerProduct?.[product.id];
            const useNativeForMsg =
              !isSatsCart &&
              !!cartCurrency &&
              typeof nativeAmt === "number" &&
              nativeAmt > 0;
            const fiatAmount = useNativeForMsg
              ? nativeAmt
              : totalCostsInSats[product.id] ||
                totalCostsInSats[product.pubkey] ||
                0;
            const fiatCurrency = useNativeForMsg
              ? (cartCurrency as string)
              : "sats";
            // Reporting-only: fold the seller's discounted shipping into the
            // amount tag once (first product), leaving fund handling unchanged.
            const reportShipFiat =
              product === sellerProducts[0]
                ? useNativeForMsg
                  ? nativeShippingPerSeller[product.pubkey] || 0
                  : shippingCostsInSats[product.pubkey] || 0
                : 0;
            const reportedFiatAmount = fiatAmount + reportShipFiat;
            await sendPaymentAndContactMessage(
              sellerPubkey,
              paymentMessage,
              product,
              true,
              false,
              false,
              false,
              orderId,
              sellerFiatOption,
              sellerFiatHandle,
              sellerFiatHandle,
              reportedFiatAmount,
              quantities[product.id] || 1,
              undefined,
              addressTag,
              selectedPickupLocations[product.id] || undefined,
              undefined,
              undefined,
              undefined,
              undefined,
              fiatCurrency
            );
          }

          if (data.additionalInfo) {
            await new Promise((resolve) => setTimeout(resolve, 500));
            const additionalMessage =
              "Additional customer information: " + data.additionalInfo;
            await sendPaymentAndContactMessage(
              sellerPubkey,
              additionalMessage,
              sellerProducts[0]!,
              false,
              false,
              false,
              false,
              orderId
            );
          }

          if (data.shippingName && data.shippingAddress) {
            await new Promise((resolve) => setTimeout(resolve, 500));
            const contactMessage = data.shippingUnitNo
              ? "Please ship the products to " +
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
                "."
              : "Please ship the products to " +
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
            await sendPaymentAndContactMessage(
              sellerPubkey,
              contactMessage,
              sellerProducts[0]!,
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
              addressTag
            );

            await new Promise((resolve) => setTimeout(resolve, 500));
            for (const product of sellerProducts) {
              // Keep amount and currency tags in the same unit — see the
              // matching comment on the stripe payment message above.
              const nativeAmt = nativeCostsPerProduct?.[product.id];
              const useNativeForMsg =
                !isSatsCart &&
                !!cartCurrency &&
                typeof nativeAmt === "number" &&
                nativeAmt > 0;
              const productAmount = useNativeForMsg
                ? nativeAmt
                : totalCostsInSats[product.id] ||
                  totalCostsInSats[product.pubkey] ||
                  0;
              const productCurrency = useNativeForMsg
                ? (cartCurrency as string)
                : "sats";
              const qty = quantities[product.id] || 1;
              const receiptMessage =
                "Your cart order (" +
                sellerProductTitles +
                ") was processed successfully via " +
                sellerFiatOption +
                ". You should be receiving delivery information from " +
                nip19.npubEncode(sellerPubkey) +
                " as soon as they review your order.";
              await sendPaymentAndContactMessage(
                userPubkey!,
                receiptMessage,
                product,
                false,
                true,
                false,
                false,
                orderId,
                sellerFiatOption,
                sellerFiatHandle,
                sellerFiatHandle,
                productAmount,
                qty,
                undefined,
                addressTag,
                selectedPickupLocations[product.id] || undefined,
                undefined,
                undefined,
                undefined,
                undefined,
                productCurrency
              );
            }
          }
        }
      } else {
        const sellerPubkey = singleSellerPubkey || products[0]?.pubkey || "";

        const paymentMessage =
          "You have received an order from " +
          (userNPub || "a guest buyer") +
          " for your cart order (" +
          productTitles +
          ") on Milk Market! Check your " +
          selectedFiatOption +
          " account for the payment.";

        for (const product of products) {
          // Keep amount and currency tags in the same unit — see the
          // matching comment on the stripe payment message above.
          const nativeAmt = nativeCostsPerProduct?.[product.id];
          const useNativeForMsg =
            !isSatsCart &&
            !!cartCurrency &&
            typeof nativeAmt === "number" &&
            nativeAmt > 0;
          const fiatAmount = useNativeForMsg
            ? nativeAmt
            : totalCostsInSats[product.id] ||
              totalCostsInSats[product.pubkey] ||
              0;
          const fiatCurrency = useNativeForMsg
            ? (cartCurrency as string)
            : "sats";
          // Reporting-only: fold the seller's discounted shipping into the
          // amount tag once (first product), leaving fund handling unchanged.
          const reportShipFiat =
            product === products[0]
              ? useNativeForMsg
                ? nativeShippingPerSeller[product.pubkey] || 0
                : shippingCostsInSats[product.pubkey] || 0
              : 0;
          const reportedFiatAmount = fiatAmount + reportShipFiat;
          await sendPaymentAndContactMessage(
            sellerPubkey,
            paymentMessage,
            product,
            true,
            false,
            false,
            false,
            orderId,
            selectedFiatOption,
            (fiatPaymentOptions as any)[selectedFiatOption] || "",
            (fiatPaymentOptions as any)[selectedFiatOption] || "",
            reportedFiatAmount,
            quantities[product.id] || 1,
            undefined,
            addressTag,
            selectedPickupLocations[product.id] || undefined,
            undefined,
            undefined,
            undefined,
            undefined,
            fiatCurrency
          );
        }

        if (data.additionalInfo) {
          await new Promise((resolve) => setTimeout(resolve, 500));
          const additionalMessage =
            "Additional customer information: " + data.additionalInfo;
          await sendPaymentAndContactMessage(
            sellerPubkey,
            additionalMessage,
            products[0]!,
            false,
            false,
            false,
            false,
            orderId
          );
        }

        if (data.shippingName && data.shippingAddress) {
          await new Promise((resolve) => setTimeout(resolve, 500));
          const contactMessage = data.shippingUnitNo
            ? "Please ship the products to " +
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
              "."
            : "Please ship the products to " +
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
          await sendPaymentAndContactMessage(
            sellerPubkey,
            contactMessage,
            products[0]!,
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
            addressTag
          );

          await new Promise((resolve) => setTimeout(resolve, 500));
          for (const product of products) {
            // Keep amount and currency tags in the same unit — see the
            // matching comment on the stripe payment message above.
            const nativeAmt = nativeCostsPerProduct?.[product.id];
            const useNativeForMsg =
              !isSatsCart &&
              !!cartCurrency &&
              typeof nativeAmt === "number" &&
              nativeAmt > 0;
            const productAmount = useNativeForMsg
              ? nativeAmt
              : totalCostsInSats[product.id] ||
                totalCostsInSats[product.pubkey] ||
                0;
            const productCurrency = useNativeForMsg
              ? (cartCurrency as string)
              : "sats";
            const qty = quantities[product.id] || 1;
            const receiptMessage =
              "Your cart order (" +
              productTitles +
              ") was processed successfully via " +
              selectedFiatOption +
              ". You should be receiving delivery information from " +
              nip19.npubEncode(sellerPubkey) +
              " as soon as they review your order.";
            await sendPaymentAndContactMessage(
              userPubkey!,
              receiptMessage,
              product,
              false,
              true,
              false,
              false,
              orderId,
              selectedFiatOption,
              (fiatPaymentOptions as any)[selectedFiatOption] || "",
              (fiatPaymentOptions as any)[selectedFiatOption] || "",
              productAmount,
              qty,
              undefined,
              addressTag,
              selectedPickupLocations[product.id] || undefined,
              undefined,
              undefined,
              undefined,
              undefined,
              productCurrency
            );
          }
        }
      }

      const emailAddressTag =
        data.shippingName && data.shippingAddress
          ? `${data.shippingName}, ${data.shippingAddress}, ${
              data.shippingUnitNo ? `${data.shippingUnitNo}, ` : ""
            }${data.shippingCity || ""}, ${data.shippingState || ""}, ${
              data.shippingPostalCode || ""
            }, ${data.shippingCountry || ""}`
          : undefined;

      if (isMultiFiat) {
        pendingOrderEmailRef.current = sellersWithFiat.map((sellerPubkey) => {
          const sellerProducts = products.filter(
            (p) => p.pubkey === sellerPubkey
          );
          const sellerProductTitles = sellerProducts
            .map((p: any) => p.title || p.productName)
            .join(", ");
          const breakdown = getSellerCostBreakdown(sellerPubkey);
          const sellerPickupSummary = sellerProducts
            .map((p: any) => selectedPickupLocations[p.id])
            .filter(Boolean)
            .join(", ");
          return {
            orderId,
            productTitle: sellerProductTitles,
            amount:
              !isSatsCart && breakdown.nativeTotal !== null
                ? String(Math.round(breakdown.nativeTotal * 100) / 100)
                : String(breakdown.satsTotal),
            currency: !isSatsCart && cartCurrency ? cartCurrency : "sats",
            paymentMethod: multiFiatSelections[sellerPubkey] || "fiat",
            sellerPubkey,
            buyerName: data.shippingName || undefined,
            shippingAddress: emailAddressTag,
            buyerContact: data.contactEmail || data.contactPhone || undefined,
            pickupLocation: sellerPickupSummary || undefined,
            // External fiat (Cash App / Venmo / Zelle / PayPal) — funds do
            // not flow through the platform, so no donation is withheld.
            donationAmount: 0,
            donationPercentage: 0,
          };
        });
      } else {
        const sellerPubkey = singleSellerPubkey || products[0]?.pubkey || "";
        pendingOrderEmailRef.current = [
          {
            orderId,
            productTitle: productTitles,
            amount:
              !isSatsCart && nativeTotalCost !== null
                ? String(nativeTotalCost)
                : String(totalCost),
            currency: !isSatsCart && cartCurrency ? cartCurrency : "sats",
            paymentMethod: selectedFiatOption || "fiat",
            sellerPubkey,
            buyerName: data.shippingName || undefined,
            shippingAddress: emailAddressTag,
            buyerContact: data.contactEmail || data.contactPhone || undefined,
            pickupLocation:
              Object.values(selectedPickupLocations)
                .filter(Boolean)
                .join(", ") || undefined,
            // External fiat path — no platform cut.
            donationAmount: 0,
            donationPercentage: 0,
          },
        ];
      }

      for (const product of products) {
        await sendInquiryDM(product.pubkey, product.title);
      }

      clearPurchasedFromCart();
      flushPendingOrderEmails();
      setPaymentConfirmed(true);
      setOrderConfirmed(true);
      if (discountCodes) {
        Object.entries(discountCodes).forEach(([pubkey, code]) => {
          if (code && shouldRedeemCodeForSeller(pubkey)) {
            fetch("/api/db/discount-code-used", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ code, pubkey }),
            }).catch(() => {});
          }
        });
      }
      if (setInvoiceIsPaid) {
        setInvoiceIsPaid(true);
      }
    } catch (error) {
      console.error("Fiat payment error:", error);
      setFailureText("Payment failed. Please try again.");
      setShowFailureModal(true);
    }
  };

  const handleLightningPayment = async (convertedPrice: number, data: any) => {
    try {
      validatePaymentData(convertedPrice, data);

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
      await invoiceHasBeenPaid(wallet, convertedPrice, hash, data);
    } catch {
      if (setInvoiceGenerationFailed) {
        setInvoiceGenerationFailed(true);
      } else {
        setFailureText("Lightning payment failed. Please try again.");
        setShowFailureModal(true);
      }
      setShowInvoiceCard(false);
      setInvoice("");
      setQrCodeUrl(null);
    }
  };

  /** CHECKS WHETHER INVOICE HAS BEEN PAID */
  async function invoiceHasBeenPaid(
    wallet: CashuWallet,
    convertedPrice: number,
    hash: string,
    data: any
  ) {
    let retryCount = 0;
    // ~2.1s per round * 150 ≈ 5 minutes of mint polling. Lightning invoices
    // typically don't expire for an hour, so 5 minutes is comfortable headroom
    // for routing retries / sender wallet delays without giving up early.
    const maxRetries = 150;
    const pollIntervalMs = 2100;
    setPollDeadlineMs(Date.now() + maxRetries * pollIntervalMs);
    let handledTerminalOutcome = false;

    try {
      while (retryCount < maxRetries) {
        try {
          // First check if the quote has been paid
          const quoteState = await wallet.checkMintQuoteBolt11(hash);

          if (quoteState.state === "PAID") {
            markMintQuotePaid(hash);
            // Quote is paid, try to mint proofs
            try {
              const proofs = await wallet.mintProofsBolt11(
                convertedPrice,
                hash
              );
              if (!proofs || proofs.length === 0) {
                // Mint returned no proofs without throwing — treat as a
                // transient state and back off, otherwise we'd spin in this
                // branch and never advance the retry counter (the outer
                // else only catches UNPAID).
                retryCount++;
                await new Promise((resolve) => setTimeout(resolve, 2100));
                continue;
              }
              if (proofs && proofs.length > 0) {
                try {
                  // Lightning-mint path constructs `wallet` against mints[0]
                  // (the buyer's default receiving mint); pass that explicitly
                  // so recovery stashes proofs against the correct mint.
                  await sendTokens(wallet, proofs, data, mints[0]!);
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
                    { note: "Recovered from failed cart Lightning payment" }
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
                clearPurchasedFromCart();
                flushPendingOrderEmails();
                setPaymentConfirmed(true);
                if (discountCodes) {
                  Object.entries(discountCodes).forEach(([pubkey, code]) => {
                    if (code && shouldRedeemCodeForSeller(pubkey)) {
                      fetch("/api/db/discount-code-used", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ code, pubkey }),
                      }).catch(() => {});
                    }
                  });
                }
                if (setInvoiceIsPaid) {
                  setInvoiceIsPaid(true);
                }
                setQrCodeUrl(null);
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
                clearPurchasedFromCart();
                flushPendingOrderEmails();
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
            clearPurchasedFromCart();
            flushPendingOrderEmails();
            setPaymentConfirmed(true);
            setQrCodeUrl(null);
            setFailureText(
              "Payment was received but your connection dropped! Please check your wallet balance."
            );
            setShowFailureModal(true);
            handledTerminalOutcome = true;
            break;
          } else {
            // Quote not paid yet (UNPAID), or PAID but mintProofsBolt11
            // returned an empty array without throwing — in either case we
            // need to advance the retry counter and back off, otherwise we
            // tight-loop or silently fall out of the while when the counter
            // is exhausted.
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
            if (setInvoiceGenerationFailed) {
              setInvoiceGenerationFailed(true);
            } else {
              setFailureText(
                "Failed to validate invoice! Change your mint in settings and/or please try again."
              );
              setShowFailureModal(true);
            }
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
              amountSats: convertedPrice,
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
          amountSats: convertedPrice,
          mintUrl: mints[0],
          pendingRecovery: true,
        });
      }
    } finally {
      // Polling done (success, failure, early return, or thrown) — always
      // clear the countdown so stale deadline state can't bleed into a later
      // session if the component is reused.
      setPollDeadlineMs(null);
    }
  }

  const sendTokens = async (
    wallet: CashuWallet,
    proofs: Proof[],
    data: any,
    spendMint: string
  ) => {
    let remainingProofs = proofs;
    // Track which proofs the buyer can still recover at any point. The
    // original `proofs` array is mutated through swaps/melts across each
    // product iteration; on failure we need to stash what's *currently*
    // unspent + untransmitted, not the original mint outputs (most of
    // which are already spent on the mint).
    const __recoverableTracker = new RecoverableProofTracker(proofs);
    try {
      // Construct address tag early so it can be passed to all messages
      // Handle both form field naming conventions
      const hasShippingInfo = data.shippingName || data.Name;
      const shippingAddressTag = hasShippingInfo
        ? data.shippingName
          ? data.shippingUnitNo
            ? `${data.shippingName}, ${data.shippingAddress}, ${data.shippingUnitNo}, ${data.shippingCity}, ${data.shippingState}, ${data.shippingPostalCode}, ${data.shippingCountry}`
            : `${data.shippingName}, ${data.shippingAddress}, ${data.shippingCity}, ${data.shippingState}, ${data.shippingPostalCode}, ${data.shippingCountry}`
          : data.Unit
            ? `${data.Name}, ${data.Address}, ${data.Unit}, ${data.City}, ${data["State/Province"]}, ${data["Postal Code"]}, ${data.Country}`
            : `${data.Name}, ${data.Address}, ${data.City}, ${data["State/Province"]}, ${data["Postal Code"]}, ${data.Country}`
        : undefined;

      const orderId = uuidv4();

      if (pendingOrderEmailRef.current) {
        pendingOrderEmailRef.current.forEach((entry) => {
          if (!entry.orderId) entry.orderId = orderId;
        });
      }

      // Track which sellers already had their (sats) shipping folded into a
      // reported order total, so multi-product sellers don't double-count
      // shipping across this per-product message loop. Reporting only — the
      // ecash proof amounts (sellerAmount) below are untouched.
      const cashuShipReported = new Set<string>();

      for (const product of products) {
        const title = product.title;
        const pubkey = product.pubkey;
        const required = product.required;
        const tokenAmount = totalCostsInSats[pubkey];
        const reportedShipSats = cashuShipReported.has(pubkey)
          ? 0
          : shippingCostsInSats[pubkey] || 0;
        cashuShipReported.add(pubkey);
        const reportedOrderAmount = (tokenAmount || 0) + reportedShipSats;
        let sellerToken;
        let donationToken;
        let beefDonationToken;
        const sellerProfile = profileContext.profileData.get(pubkey);
        const donationPercentage = sellerProfile?.content?.mm_donation ?? 0;
        const beefDonationPercentage =
          product.beefinit_donation_percentage || 0;

        const donationAmount = Math.ceil(
          (tokenAmount! * donationPercentage) / 100
        );
        const beefDonationAmount =
          beefDonationPercentage > 0
            ? Math.ceil((tokenAmount! * beefDonationPercentage) / 100)
            : 0;

        const sellerAmount = tokenAmount! - donationAmount - beefDonationAmount;
        let sellerProofs: Proof[] = [];
        let donationProofs: Proof[] = [];
        let beefDonationProofs: Proof[] = [];

        let shippingData = data; // Assume data contains shipping info
        if (formType === "shipping") {
          shippingData = {
            Name: data.Name,
            Address: data.Address,
            Unit: data.Unit,
            City: data.City,
            "State/Province": data["State/Province"],
            "Postal Code": data["Postal Code"],
            Country: data.Country,
          };
        } else if (formType === "combined") {
          shippingData = {
            Name: data.Name,
            Address: data.Address,
            Unit: data.Unit,
            City: data.City,
            "State/Province": data["State/Province"],
            "Postal Code": data["Postal Code"],
            Country: data.Country,
          };
        }

        // Generate keys once per order to ensure consistent sender pubkey
        const orderKeys = await generateNewKeys();
        if (!orderKeys) {
          setFailureText("Failed to generate new keys for messages!");
          setShowFailureModal(true);
          // Throw so the outer try/catch wraps as SendTokensRecoverableError
          // and the caller stashes the (still-untouched) minted proofs. A
          // silent return here would mark the order as success and lose funds.
          throw new Error("Failed to generate new keys for messages");
        }
        const paymentPreference =
          sellerProfile?.content?.payment_preference || "ecash";
        const lnurl = sellerProfile?.content?.lud16 || "";

        // Construct address string for order-info type
        const addressString = shippingData.Name
          ? `${shippingData.Name}, ${shippingData.Address}${
              shippingData.Unit ? `, ${shippingData.Unit}` : ""
            }, ${shippingData.City}, ${shippingData["State/Province"]}, ${
              shippingData["Postal Code"]
            }, ${shippingData.Country}`
          : "";

        // Construct order-info message with address tag
        const orderInfoMessage = await constructMessageGiftWrap(
          pubkey as any,
          "", // Placeholder for seal
          orderKeys.receiverNsec as any, // Placeholder for keypair
          pubkey // Recipient pubkey
        );
        const orderInfoTags: string[][] = [
          ["type", "1"],
          ["subject", "order-info"],
          ["order", orderId],
          ["item", product.id],
          ["shipping", shippingTypes[product.id] || ""], // Assuming shippingId can be derived from shippingTypes
        ];
        if (addressString) {
          orderInfoTags.push(["address", addressString]);
        }
        if (tokenAmount) {
          orderInfoTags.push(["amount", reportedOrderAmount.toString()]);
        }
        if (donationAmount > 0) {
          orderInfoTags.push([
            "donation_amount",
            donationAmount.toString(),
            donationPercentage.toString(),
          ]);
        }
        orderInfoMessage.tags = orderInfoTags;

        // Construct payment message with cashu token tag
        let paymentMessageText;
        let paymentTags;

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

          // Construct payment message with cashu token tag
          paymentMessageText = await constructMessageGiftWrap(
            pubkey as any,
            "", // Placeholder for seal
            orderKeys.receiverNsec as any, // Placeholder for keypair
            pubkey // Recipient pubkey
          );
          paymentTags = [
            ["type", "2"],
            ["subject", "order-payment"],
            ["order", orderId],
            ["payment", "ecash", sellerToken],
          ];
          if (sellerAmount) {
            paymentTags.push(["amount", sellerAmount.toString()]);
          }
          if (donationAmount > 0) {
            paymentTags.push([
              "donation_amount",
              donationAmount.toString(),
              donationPercentage.toString(),
            ]);
          }
          paymentMessageText.tags = paymentTags;
        }

        // Handle donation if applicable
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

        // Step 1: Send payment message (if applicable)
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
            const __meltOutcome_0 = await safeMeltProofs(
              wallet,
              meltQuote,
              send
            );
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
              if (product.selectedSize) {
                productDetails += " in size " + product.selectedSize;
              }
              if (product.selectedVolume) {
                if (productDetails) {
                  productDetails += " and a " + product.selectedVolume;
                } else {
                  productDetails += " in a " + product.selectedVolume;
                }
              }
              if (product.selectedWeight) {
                if (productDetails) {
                  productDetails += " and weighing " + product.selectedWeight;
                } else {
                  productDetails += " weighing " + product.selectedWeight;
                }
              }
              if (product.selectedVariant) {
                productDetails +=
                  " (" +
                  (product.variantLabel || "Option") +
                  ": " +
                  product.selectedVariant +
                  ")";
              }
              if (product.selectedBulkOption) {
                if (productDetails) {
                  productDetails +=
                    " (bulk: " + product.selectedBulkOption + " units)";
                } else {
                  productDetails +=
                    " (bulk: " + product.selectedBulkOption + " units)";
                }
              }

              // Add pickup location if available for this specific product
              const pickupLocation =
                selectedPickupLocations[product.id] ||
                data[`pickupLocation_${product.id}`];
              if (pickupLocation) {
                if (productDetails) {
                  productDetails += " (pickup at: " + pickupLocation + ")";
                } else {
                  productDetails += " (pickup at: " + pickupLocation + ")";
                }
              }

              let paymentMessage = "";
              if (quantities[product.id] && quantities[product.id]! > 1) {
                paymentMessage =
                  "You have received a payment from " +
                  (userNPub || "a guest buyer") +
                  " for " +
                  quantities[product.id] +
                  " of your " +
                  title +
                  " listing" +
                  productDetails +
                  " on Milk Market! Check your Lightning address (" +
                  lnurl +
                  ") for your sats.";
              } else {
                paymentMessage =
                  "You have received a payment from " +
                  (userNPub || "a guest buyer") +
                  " for your " +
                  title +
                  " listing" +
                  productDetails +
                  " on Milk Market! Check your Lightning address (" +
                  lnurl +
                  ") for your sats.";
              }
              const pickupLocationForLightning =
                selectedPickupLocations[product.id] ||
                data[`pickupLocation_${product.id}`];
              await sendPaymentAndContactMessageWithKeys(
                pubkey,
                paymentMessage,
                product,
                true,
                false,
                false,
                false,
                orderId,
                "lightning",
                lnurl,
                undefined,
                meltAmount,
                quantities[product.id] && quantities[product.id]! > 1
                  ? quantities[product.id]
                  : 1,
                orderKeys,
                undefined,
                shippingAddressTag,
                pickupLocationForLightning || undefined,
                undefined,
                undefined,
                undefined,
                // meltAmount is always in sats — tag it as such so the
                // orders dashboard doesn't fall back to the product's
                // listed currency (which would render sats as USD).
                "sats"
              );

              if (
                changeAmount >= 1 &&
                changeProofs &&
                changeProofs.length > 0
              ) {
                // Add delay between messages to prevent browser throttling
                await new Promise((resolve) => setTimeout(resolve, 500));

                const encodedChange = getEncodedToken({
                  mint: mints[0]!,
                  proofs: changeProofs,
                });
                const changeMessage = "Overpaid fee change: " + encodedChange;
                try {
                  await sendPaymentAndContactMessageWithKeys(
                    pubkey,
                    changeMessage,
                    product,
                    true,
                    false,
                    false,
                    false,
                    orderId,
                    "ecash",
                    encodedChange,
                    undefined,
                    changeAmount,
                    undefined,
                    orderKeys,
                    undefined,
                    undefined,
                    undefined,
                    undefined,
                    undefined,
                    undefined,
                    // changeAmount is in sats — tag it so the dashboard
                    // doesn't fall back to the product's listed currency.
                    "sats"
                  );
                  __recoverableTracker.consume(changeProofs);
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
              if (product.selectedSize) {
                productDetails += " in size " + product.selectedSize;
              }
              if (product.selectedVolume) {
                if (productDetails) {
                  productDetails += " and a " + product.selectedVolume;
                } else {
                  productDetails += " in a " + product.selectedVolume;
                }
              }
              if (product.selectedWeight) {
                if (productDetails) {
                  productDetails += " and weighing " + product.selectedWeight;
                } else {
                  productDetails += " weighing " + product.selectedWeight;
                }
              }
              if (product.selectedVariant) {
                productDetails +=
                  " (" +
                  (product.variantLabel || "Option") +
                  ": " +
                  product.selectedVariant +
                  ")";
              }
              if (product.selectedBulkOption) {
                if (productDetails) {
                  productDetails +=
                    " (bulk: " + product.selectedBulkOption + " units)";
                } else {
                  productDetails +=
                    " (bulk: " + product.selectedBulkOption + " units)";
                }
              }

              // Add pickup location if available for this specific product
              const pickupLocation =
                selectedPickupLocations[product.id] ||
                data[`pickupLocation_${product.id}`];
              if (pickupLocation) {
                if (productDetails) {
                  productDetails += " (pickup at: " + pickupLocation + ")";
                } else {
                  productDetails += " (pickup at: " + pickupLocation + ")";
                }
              }

              let paymentMessage = "";
              if (unusedToken && unusedProofs) {
                if (quantities[product.id] && quantities[product.id]! > 1) {
                  paymentMessage =
                    "This is a Cashu token payment from " +
                    (userNPub || "a guest buyer") +
                    " for " +
                    quantities[product.id] +
                    " of your " +
                    title +
                    " listing" +
                    productDetails +
                    " on Milk Market: " +
                    unusedToken;
                } else {
                  paymentMessage =
                    "This is a Cashu token payment from " +
                    (userNPub || "a guest buyer") +
                    " for your " +
                    title +
                    " listing" +
                    productDetails +
                    " on Milk Market: " +
                    unusedToken;
                }
                await sendPaymentAndContactMessageWithKeys(
                  pubkey,
                  paymentMessage,
                  product,
                  true,
                  false,
                  false,
                  false,
                  orderId,
                  "ecash",
                  unusedToken,
                  undefined,
                  unusedAmount,
                  quantities[product.id] && quantities[product.id]! > 1
                    ? quantities[product.id]
                    : 1,
                  orderKeys,
                  undefined,
                  shippingAddressTag,
                  pickupLocation || undefined,
                  undefined,
                  undefined,
                  undefined,
                  // unusedAmount is in sats — tag it so the dashboard
                  // doesn't fall back to the product's listed currency.
                  "sats"
                );
                __recoverableTracker.consume(unusedProofs);
              }
            }
          }
        } else {
          let productDetails = "";
          if (product.selectedSize) {
            productDetails += " in size " + product.selectedSize;
          }
          if (product.selectedVolume) {
            if (productDetails) {
              productDetails += " and a " + product.selectedVolume;
            } else {
              productDetails += " in a " + product.selectedVolume;
            }
          }
          if (product.selectedWeight) {
            if (productDetails) {
              productDetails += " and weighing " + product.selectedWeight;
            } else {
              productDetails += " weighing " + product.selectedWeight;
            }
          }
          if (product.selectedVariant) {
            productDetails +=
              " (" +
              (product.variantLabel || "Option") +
              ": " +
              product.selectedVariant +
              ")";
          }
          if (product.selectedBulkOption) {
            if (productDetails) {
              productDetails +=
                " (bulk: " + product.selectedBulkOption + " units)";
            } else {
              productDetails +=
                " (bulk: " + product.selectedBulkOption + " units)";
            }
          }

          // Add pickup location if available for this specific product
          const pickupLocation =
            selectedPickupLocations[product.id] ||
            data[`pickupLocation_${product.id}`];
          if (pickupLocation) {
            if (productDetails) {
              productDetails += " (pickup at: " + pickupLocation + ")";
            } else {
              productDetails += " (pickup at: " + pickupLocation + ")";
            }
          }

          let paymentMessage = "";
          if (sellerToken && sellerProofs) {
            if (quantities[product.id] && quantities[product.id]! > 1) {
              paymentMessage =
                "This is a Cashu token payment from " +
                (userNPub || "a guest buyer") +
                " for " +
                quantities[product.id] +
                " of your " +
                title +
                " listing" +
                productDetails +
                " on Milk Market: " +
                sellerToken;
            } else {
              paymentMessage =
                "This is a Cashu token payment from " +
                (userNPub || "a guest buyer") +
                " for your " +
                title +
                " listing" +
                productDetails +
                " on Milk Market: " +
                sellerToken;
            }
            await sendPaymentAndContactMessageWithKeys(
              pubkey,
              paymentMessage,
              product,
              true,
              false,
              false,
              false,
              orderId,
              "ecash",
              sellerToken,
              undefined,
              sellerAmount,
              quantities[product.id] && quantities[product.id]! > 1
                ? quantities[product.id]
                : 1,
              orderKeys,
              undefined,
              shippingAddressTag,
              pickupLocation || undefined,
              undefined,
              undefined,
              undefined,
              // sellerAmount is in sats (Cashu proofs are denominated in
              // sats), so the currency tag must be "sats". Previously
              // this used cartCurrency, which tagged a sats value as USD
              // and rendered as ~1500x in the orders dashboard.
              "sats"
            );
            __recoverableTracker.consume(sellerProofs);
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
                product,
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

        // Step 2.5: Send beef donation if applicable
        if (beefDonationToken && beefDonationAmount > 0) {
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

            if (
              beefLnAddress &&
              beefLnAddress !== "" &&
              beefDonationProofs.length > 0
            ) {
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
                title +
                " by " +
                (userNPub || "a guest buyer") +
                " on milk.market: " +
                beefDonationToken;
              try {
                const __beefOk = await sendPaymentAndContactMessage(
                  beefInitHex,
                  beefDonationMessage,
                  product,
                  false,
                  false,
                  true
                );
                if (__beefOk) __recoverableTracker.consume(beefDonationProofs);
                await new Promise((resolve) => setTimeout(resolve, 500));
              } catch (error) {
                console.error("Failed to send beef donation message:", error);
              }
            }
          }
        }

        // Step 3: Send additional info message
        if (required && required !== "" && data.additionalInfo) {
          // Add delay before additional info message
          await new Promise((resolve) => setTimeout(resolve, 500));

          const additionalMessage =
            "Additional customer information: " + data.additionalInfo;
          try {
            await sendPaymentAndContactMessageWithKeys(
              pubkey,
              additionalMessage,
              product,
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
              orderKeys,
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
        if (product.herdshareAgreement) {
          // Add delay before herdshare message
          await new Promise((resolve) => setTimeout(resolve, 500));

          const herdshareMessage =
            "To finalize your purchase, sign and send the following herdshare agreement for the dairy: " +
            product.herdshareAgreement;
          await sendPaymentAndContactMessageWithKeys(
            userPubkey!,
            herdshareMessage,
            product,
            false,
            false,
            false,
            true,
            orderId,
            undefined,
            undefined,
            undefined,
            undefined,
            undefined,
            orderKeys
          );
        }

        // Step 4: Handle shipping and contact information
        const productShippingType = shippingTypes[product.id];
        const shouldUseShipping =
          formType === "shipping" ||
          (formType === "combined" &&
            (productShippingType !== "Free/Pickup" ||
              ((productShippingType === "Free/Pickup" ||
                productShippingType === "Added Cost/Pickup") &&
                shippingPickupPreference === "shipping")));

        const shouldUseContact =
          formType === "contact" ||
          (formType === "combined" &&
            (productShippingType === "N/A" ||
              productShippingType === "Pickup" ||
              ((productShippingType === "Free/Pickup" ||
                productShippingType === "Added Cost/Pickup") &&
                shippingPickupPreference === "contact")));

        if (
          shouldUseShipping &&
          data.shippingName &&
          data.shippingAddress &&
          data.shippingCity &&
          data.shippingPostalCode &&
          data.shippingState &&
          data.shippingCountry
        ) {
          // Shipping information provided
          if (
            productShippingType === "Added Cost" ||
            productShippingType === "Free" ||
            productShippingType === "Free/Pickup" ||
            productShippingType === "Added Cost/Pickup"
          ) {
            let productDetails = "";
            if (product.selectedSize) {
              productDetails += " in size " + product.selectedSize;
            }
            if (product.selectedVolume) {
              if (productDetails) {
                productDetails += " and a " + product.selectedVolume;
              } else {
                productDetails += " in a " + product.selectedVolume;
              }
            }
            if (product.selectedWeight) {
              if (productDetails) {
                productDetails += " and weighing " + product.selectedWeight;
              } else {
                productDetails += " weighing " + product.selectedWeight;
              }
            }
            if (product.selectedVariant) {
              productDetails +=
                " (" +
                (product.variantLabel || "Option") +
                ": " +
                product.selectedVariant +
                ")";
            }
            if (product.selectedBulkOption) {
              if (productDetails) {
                productDetails +=
                  " (bulk: " + product.selectedBulkOption + " units)";
              } else {
                productDetails +=
                  " (bulk: " + product.selectedBulkOption + " units)";
              }
            }

            // Add pickup location if available for this specific product
            const pickupLocation =
              selectedPickupLocations[product.id] ||
              data[`pickupLocation_${product.id}`];
            if (pickupLocation) {
              if (productDetails) {
                productDetails += " (pickup at: " + pickupLocation + ")";
              } else {
                productDetails += " (pickup at: " + pickupLocation + ")";
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
            const addressTagForShipping = data.shippingUnitNo
              ? `${data.shippingName}, ${data.shippingAddress}, ${data.shippingUnitNo}, ${data.shippingCity}, ${data.shippingState}, ${data.shippingPostalCode}, ${data.shippingCountry}`
              : `${data.shippingName}, ${data.shippingAddress}, ${data.shippingCity}, ${data.shippingState}, ${data.shippingPostalCode}, ${data.shippingCountry}`;
            await sendPaymentAndContactMessageWithKeys(
              pubkey,
              contactMessage,
              product,
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
              orderKeys,
              undefined,
              addressTagForShipping,
              pickupLocation || undefined,
              donationAmount,
              donationPercentage
            );

            if (userPubkey) {
              const receiptMessage =
                "Your order for " +
                title +
                productDetails +
                " was processed successfully! If applicable, you should be receiving delivery information from " +
                nip19.npubEncode(product.pubkey) +
                " as soon as they review your order.";

              // Add delay between messages
              await new Promise((resolve) => setTimeout(resolve, 500));

              await sendPaymentAndContactMessageWithKeys(
                userPubkey,
                receiptMessage,
                product,
                false,
                true,
                false,
                false,
                orderId,
                undefined,
                undefined,
                undefined,
                sellerAmount,
                quantities[product.id] || 1,
                orderKeys,
                undefined,
                shippingAddressTag,
                pickupLocation || undefined,
                donationAmount,
                donationPercentage,
                undefined,
                // sellerAmount is in sats — see matching comment on the cashu
                // payment message above. Tagging this as cartCurrency rendered
                // sats as USD (~1500x) in the orders dashboard.
                "sats"
              );
            }
          }
        } else if (
          shouldUseContact &&
          (productShippingType === "N/A" ||
            productShippingType === "Pickup" ||
            productShippingType === "Free/Pickup" ||
            productShippingType === "Added Cost/Pickup")
        ) {
          await sendInquiryDM(pubkey, title);

          let productDetails = "";
          if (product.selectedSize) {
            productDetails += " in size " + product.selectedSize;
          }
          if (product.selectedVolume) {
            if (productDetails) {
              productDetails += " and a " + product.selectedVolume;
            } else {
              productDetails += " in a " + product.selectedVolume;
            }
          }
          if (product.selectedWeight) {
            if (productDetails) {
              productDetails += " and weighing " + product.selectedWeight;
            } else {
              productDetails += " weighing " + product.selectedWeight;
            }
          }
          if (product.selectedVariant) {
            productDetails +=
              " (" +
              (product.variantLabel || "Option") +
              ": " +
              product.selectedVariant +
              ")";
          }
          if (product.selectedBulkOption) {
            if (productDetails) {
              productDetails +=
                " (bulk: " + product.selectedBulkOption + " units)";
            } else {
              productDetails +=
                " (bulk: " + product.selectedBulkOption + " units)";
            }
          }

          const pickupLocation =
            selectedPickupLocations[product.id] ||
            data[`pickupLocation_${product.id}`];
          if (pickupLocation) {
            if (productDetails) {
              productDetails += " (pickup at: " + pickupLocation + ")";
            } else {
              productDetails += " (pickup at: " + pickupLocation + ")";
            }
          }

          if (userPubkey) {
            const receiptMessage =
              "Your order for " +
              title +
              productDetails +
              " was processed successfully! If applicable, you should be receiving delivery information from " +
              nip19.npubEncode(product.pubkey) +
              " as soon as they review your order.";

            // Add delay between messages
            await new Promise((resolve) => setTimeout(resolve, 500));

            await sendPaymentAndContactMessageWithKeys(
              userPubkey,
              receiptMessage,
              product,
              false,
              true,
              false,
              false,
              orderId,
              undefined,
              undefined,
              undefined,
              sellerAmount,
              quantities[product.id] || 1,
              orderKeys,
              undefined,
              shippingAddressTag,
              pickupLocation || undefined,
              donationAmount,
              donationPercentage,
              undefined,
              // sellerAmount is in sats — see matching comment on the cashu
              // payment message above. Tagging this as cartCurrency rendered
              // sats as USD (~1500x) in the orders dashboard.
              "sats"
            );
          }
        } else {
          // Step 5: Always send final receipt message
          let productDetails = "";
          if (product.selectedSize) {
            productDetails += " in size " + product.selectedSize;
          }
          if (product.selectedVolume) {
            if (productDetails) {
              productDetails += " and a " + product.selectedVolume;
            } else {
              productDetails += " in a " + product.selectedVolume;
            }
          }
          if (product.selectedWeight) {
            if (productDetails) {
              productDetails += " and weighing " + product.selectedWeight;
            } else {
              productDetails += " weighing " + product.selectedWeight;
            }
          }
          if (product.selectedVariant) {
            productDetails +=
              " (" +
              (product.variantLabel || "Option") +
              ": " +
              product.selectedVariant +
              ")";
          }
          if (product.selectedBulkOption) {
            if (productDetails) {
              productDetails +=
                " (bulk: " + product.selectedBulkOption + " units)";
            } else {
              productDetails +=
                " (bulk: " + product.selectedBulkOption + " units)";
            }
          }

          // Add pickup location if available for this specific product
          const pickupLocation =
            selectedPickupLocations[product.id] ||
            data[`pickupLocation_${product.id}`];
          if (pickupLocation) {
            if (productDetails) {
              productDetails += " (pickup at: " + pickupLocation + ")";
            } else {
              productDetails += " (pickup at: " + pickupLocation + ")";
            }
          }

          const receiptMessage =
            "Thank you for your purchase of " +
            title +
            productDetails +
            " from " +
            nip19.npubEncode(product.pubkey) +
            ".";
          await sendPaymentAndContactMessageWithKeys(
            userPubkey!,
            receiptMessage,
            product,
            false,
            true,
            false,
            false,
            orderId,
            undefined,
            undefined,
            undefined,
            sellerAmount,
            quantities[product.id] || 1,
            orderKeys,
            undefined,
            shippingAddressTag,
            pickupLocation || undefined,
            donationAmount,
            donationPercentage,
            undefined,
            // sellerAmount is in sats — see matching comment on the cashu
            // payment message above. Tagging this as cartCurrency rendered
            // sats as USD (~1500x) in the orders dashboard.
            "sats"
          );
        }
      }
    } catch (err) {
      // Use the actual mint we swapped/melted against, not mints[0]. In
      // multi-mint wallets the spend mint may differ from the default, and
      // stashing recovered proofs under the wrong mint would mis-attribute
      // their keysets and they'd present as an unusable balance.
      throw new SendTokensRecoverableError(
        err instanceof Error ? err.message : "sendTokens failed",
        __recoverableTracker.getProofs(),
        spendMint || mints[0]!,
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

  const convertShippingToSats = async (
    product: ProductData
  ): Promise<number> => {
    const shippingCost = product.shippingCost || 0;
    if (shippingCost === 0) return 0;

    // Shipping is denominated in the shipping-tag currency, which may differ
    // from the product's price currency (e.g. USD product with sats shipping).
    // Falling back to product.currency only when the shipping-tag currency is
    // missing on legacy listings.
    const shippingCurrency = (
      product.shippingCurrency ||
      product.currency ||
      ""
    ).toLowerCase();

    if (shippingCurrency === "sats" || shippingCurrency === "sat") {
      return shippingCost;
    }

    if (shippingCurrency === "btc") {
      return shippingCost * 100000000;
    }

    try {
      const currencyData = {
        amount: shippingCost,
        currency: product.shippingCurrency || product.currency,
      };
      const { getSatoshiValue } = await import("@getalby/lightning-tools");
      const numSats = await getSatoshiValue(currencyData);
      return Math.round(numSats);
    } catch (err) {
      console.error("Error converting shipping cost to sats:", err);
      return 0;
    }
  };

  const singleSellerShopProfile =
    isSingleSeller && singleSellerPubkey
      ? shopContext.shopData.get(singleSellerPubkey)
      : undefined;
  const pmDiscounts =
    singleSellerShopProfile?.content?.paymentMethodDiscounts || {};

  const getMethodDiscountedCosts = (methodKey: string) => {
    const pct = pmDiscounts[methodKey] || 0;
    if (pct <= 0)
      return {
        nativeTotal: nativeTotalCost,
        satsTotal: totalCost,
      };
    let nativeMethodSubtotal = 0;
    if (!isSatsCart && nativeCostsPerProduct) {
      products.forEach((product) => {
        const productNative = nativeCostsPerProduct[product.id] || 0;
        nativeMethodSubtotal += productNative * (1 - pct / 100);
      });
    } else {
      products.forEach((product) => {
        const satsPrice = totalCostsInSats[product.id] || 0;
        nativeMethodSubtotal += satsPrice * (1 - pct / 100);
      });
    }
    let nativeShipping = 0;
    if (
      formType === "shipping" ||
      (formType === "combined" && shippingPickupPreference === "shipping")
    ) {
      if (!isSatsCart) {
        // Use the FX-converted total computed in the nativeTotalCost effect so
        // shipping in a different currency (e.g. sats shipping on a USD cart)
        // doesn't get added as if it were already in cart-currency units.
        nativeShipping = nativeShippingTotal;
      } else {
        const sellersSeen = new Set<string>();
        products.forEach((product) => {
          if (sellersSeen.has(product.pubkey)) return;
          sellersSeen.add(product.pubkey);
          if (sellerFreeShippingStatus[product.pubkey]?.qualifies) return;
          const sellerProducts = products.filter(
            (p) => p.pubkey === product.pubkey
          );
          let sellerShipping: number;
          if (sellerProducts.length > 1) {
            const { highestShippingCost } = getConsolidatedShippingForSeller(
              product.pubkey
            );
            sellerShipping = highestShippingCost;
          } else {
            sellerShipping =
              (product.shippingCost || 0) * (quantities[product.id] || 1);
          }
          nativeShipping += applyShippingDiscount(
            sellerShipping,
            product.pubkey
          );
        });
      }
    }
    const nativeMethodTotal =
      Math.round((nativeMethodSubtotal + nativeShipping) * 100) / 100;
    const ratio =
      nativeTotalCost && nativeTotalCost > 0
        ? nativeMethodTotal / nativeTotalCost
        : nativeMethodSubtotal / (subtotalCost > 0 ? subtotalCost : 1);
    const satsMethodTotal = Math.round(totalCost * ratio);
    return {
      nativeTotal: !isSatsCart && cartCurrency ? nativeMethodTotal : null,
      satsTotal: isSatsCart
        ? Math.round(nativeMethodSubtotal + nativeShipping)
        : satsMethodTotal,
    };
  };

  const bitcoinCosts = getMethodDiscountedCosts("bitcoin");
  const stripeCosts = getMethodDiscountedCosts("stripe");
  const getFiatMethodCosts = (fiatKey: string) =>
    getMethodDiscountedCosts(fiatKey);

  // Watch shipping address fields and request a Stripe Tax calculation
  // once a country + postal code are present. Debounced to avoid hammering
  // the API on every keystroke. Resets to zero when shipping form isn't
  // active or when the cart isn't Stripe-eligible.
  useEffect(() => {
    const stripeAvailable =
      (isSingleSeller && isStripeMerchant) ||
      (!isSingleSeller && allSellersHaveStripe);
    const isShippingForm = formType === "shipping" || formType === "combined";

    if (!stripeAvailable || !isShippingForm) {
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

    const stripeAmt =
      stripeCosts.nativeTotal !== null && cartCurrency
        ? stripeCosts.nativeTotal
        : stripeCosts.satsTotal;
    const stripeCur =
      stripeCosts.nativeTotal !== null && cartCurrency ? cartCurrency : "sats";
    const isMM = !isSingleSeller && allSellersHaveStripe;

    if (!stripeAmt || stripeAmt <= 0) return;

    let cancelled = false;
    setIsCalculatingTax(true);
    const t = setTimeout(async () => {
      try {
        const res = await fetch("/api/stripe/calculate-tax", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            amount: stripeAmt,
            currency: stripeCur,
            shippingAddress: {
              line1: line1 || undefined,
              line2: line2 || undefined,
              city: city || undefined,
              state: state || undefined,
              postal_code: postal,
              country,
            },
            sellerPubkey: singleSellerPubkey || undefined,
            isMultiMerchant: isMM,
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
          setSalesTaxCurrency(data.currency || stripeCur);
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
    isSingleSeller,
    isStripeMerchant,
    allSellersHaveStripe,
    stripeCosts.nativeTotal,
    stripeCosts.satsTotal,
    cartCurrency,
    singleSellerPubkey,
  ]);

  const bitcoinDiscountPct = pmDiscounts["bitcoin"] || 0;
  const stripeDiscountPct = pmDiscounts["stripe"] || 0;

  const getDiscountLabel = (pct: number) => {
    if (pct <= 0) return "";
    return ` (${pct}% off)`;
  };

  const formatCartMethodCost = (
    native: number | null,
    sats: number,
    mode: "lightning" | "card",
    options: { stripeFloor?: boolean } = {}
  ) => {
    if (mode === "lightning") {
      return native !== null && cartCurrency
        ? `${formatWithCommas(native, cartCurrency)} (≈ ${formatWithCommas(
            sats,
            "sats"
          )})`
        : formatWithCommas(sats, "sats");
    }
    // Card / Stripe path — surface Stripe's $0.50 minimum-charge floor.
    const stripeFloor = options.stripeFloor === true;
    if (native !== null && cartCurrency) {
      if (stripeFloor) {
        const display = applyStripeFloor(native, cartCurrency);
        const note = isAtStripeFloor(native, cartCurrency)
          ? " · Stripe minimum"
          : "";
        return `${formatWithCommas(display, cartCurrency)}${note}`;
      }
      return formatWithCommas(native, cartCurrency);
    }
    if (usdEstimate != null && totalCost > 0) {
      const ratio = sats / totalCost;
      const rawMethodUsd = Math.ceil(usdEstimate * ratio * 100) / 100;
      const methodUsd = stripeFloor
        ? Math.max(STRIPE_MINIMUM_CHARGE_USD, rawMethodUsd)
        : rawMethodUsd;
      const note =
        stripeFloor && rawMethodUsd < STRIPE_MINIMUM_CHARGE_USD
          ? " · Stripe minimum"
          : "";
      return `${formatWithCommas(sats, "sats")} (≈ ${formatWithCommas(
        methodUsd,
        "USD"
      )}${note})`;
    }
    return formatWithCommas(sats, "sats");
  };

  const formattedLightningCost = formatCartMethodCost(
    bitcoinCosts.nativeTotal,
    bitcoinCosts.satsTotal,
    "lightning"
  );

  const formattedCardCost = formatCartMethodCost(
    stripeCosts.nativeTotal,
    stripeCosts.satsTotal,
    "card",
    { stripeFloor: true }
  );

  const getFormattedFiatCost = (fiatKey: string) => {
    const costs = getFiatMethodCosts(fiatKey);
    return formatCartMethodCost(costs.nativeTotal, costs.satsTotal, "card", {
      stripeFloor: true,
    });
  };

  const handleCashuPayment = async (price: number, data: any) => {
    // Track recoverable proofs from the moment the mint swaps the buyer's
    // inputs. If `sendTokens` (or anything after the swap) throws, we stash
    // these so the buyer's wallet doesn't lose the new outputs while still
    // showing the now-SPENT inputs as a phantom balance.
    let postSwapRecovery: {
      mintUrl: string;
      proofs: Proof[];
    } | null = null;
    // Drive the "Processing payment: 0:23 elapsed" overlay so the buyer
    // gets feedback while the mint is doing swap+melt. Cleared in finally
    // regardless of outcome so a slow mint can never leave the spinner up.
    setCashuStartedAtMs(Date.now());
    try {
      if (!mints || mints.length === 0) {
        throw new Error("No Cashu mint available");
      }

      if (!walletContext) {
        throw new Error("Wallet context not available");
      }

      validatePaymentData(price, data);

      // Pick the mint that actually holds enough proofs to cover `price`
      // instead of blindly using mints[0]. Without this, a stale or wrongly-
      // ordered default mint surfaces a misleading "not enough funds" error
      // even though the buyer's wallet has the sats under another mint.
      const payMint =
        (await pickMintForPayment(price, mints, tokens)) ?? mints[0]!;
      const mint = new CashuMint(payMint);
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
      postSwapRecovery = { mintUrl: payMint, proofs: [...keep, ...send] };
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
      await sendTokens(wallet, send, data, payMint);
      // sendTokens returned without throwing — `send` is now in flight to
      // the seller / donation recipient(s). Narrow recovery to just `keep`
      // (still in the buyer's wallet), which the localStorage write below
      // commits.
      postSwapRecovery = { mintUrl: payMint, proofs: keep };
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
      // Change is committed; nothing left to recover from this flow.
      postSwapRecovery = null;
      localStorage.setItem(
        "history",
        JSON.stringify([
          { type: 5, amount: price, date: Math.floor(Date.now() / 1000) },
          ...history,
        ])
      );
      // Tag the proof event with the mint we actually spent from, otherwise
      // the syncMintsFromTokens reverse-lookup will mis-attribute future
      // change proofs to mints[0] and corrupt the mint-order/default logic.
      await publishProofEvent(
        nostr!,
        signer!,
        payMint,
        changeProofs && changeProofs.length >= 1 ? changeProofs : [],
        "out",
        price.toString(),
        deletedEventIds
      );
      clearPurchasedFromCart();
      flushPendingOrderEmails();
      setOrderConfirmed(true);
      setPaymentConfirmed(true);
      recordAffiliateReferrals(uuidv4(), "cashu").catch(() => {});
      if (setCashuPaymentSent) {
        setCashuPaymentSent(true);
      }
    } catch (err) {
      console.error("Cart cashu payment failed:", err);
      // Prefer the live recoverable-proofs set the tracker inside sendTokens
      // computed; the original swap outputs are mostly SPENT by the time
      // sendTokens fails partway through. Fall back to keep+send when the
      // throw happened outside sendTokens (pre-melt, swap stage, etc.).
      const recoveryProofs =
        err instanceof SendTokensRecoverableError
          ? err.recoverableProofs
          : (postSwapRecovery?.proofs ?? []);
      const recoveryMint =
        err instanceof SendTokensRecoverableError
          ? err.mintUrl
          : (postSwapRecovery?.mintUrl ?? mints?.[0]);
      if (recoveryProofs.length > 0 && recoveryMint) {
        try {
          const stashed = stashProofsLocally(recoveryProofs, recoveryMint, {
            note: "Recovered from failed cart cashu payment",
          });
          setWalletRecovery({
            isOpen: true,
            amountSats: stashed,
            mintUrl: recoveryMint,
          });
        } catch (stashErr) {
          console.error(
            "Failed to stash post-swap proofs after cart cashu failure:",
            stashErr
          );
        }
      }
      if (setCashuPaymentFailed) {
        setCashuPaymentFailed(true);
      } else {
        setFailureText("Cashu payment failed. Please try again.");
        setShowFailureModal(true);
      }
    } finally {
      setCashuStartedAtMs(null);
    }
  };

  const renderContactForm = () => {
    if (!formType) return null;

    if (formType === "contact") {
      return null;
    }

    return (
      <div className="space-y-4">
        {(formType === "shipping" || formType === "combined") && (
          <>
            {savedAddresses.length > 0 && (
              <AddressPicker
                compact
                autoSelect={false}
                allowInlineAdd={false}
                onSelect={applySavedAddress}
              />
            )}

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
                  classNames={{
                    inputWrapper:
                      "border-2 border-black rounded-md shadow-neo !bg-white hover:!bg-white focus-within:!bg-white data-[hover=true]:!bg-white group-data-[focus=true]:!bg-white",
                    input: "!text-black placeholder:text-gray-400",
                    label: "text-gray-600",
                    innerWrapper: "!bg-white",
                  }}
                  fullWidth={true}
                  label={<span>Name</span>}
                  labelPlacement="inside"
                  isInvalid={!!error}
                  errorMessage={error?.message}
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
                  classNames={{
                    inputWrapper:
                      "border-2 border-black rounded-md shadow-neo !bg-white hover:!bg-white focus-within:!bg-white data-[hover=true]:!bg-white group-data-[focus=true]:!bg-white",
                    input: "!text-black placeholder:text-gray-400",
                    label: "text-gray-600",
                    innerWrapper: "!bg-white",
                  }}
                  fullWidth={true}
                  label={<span>Address</span>}
                  labelPlacement="inside"
                  isInvalid={!!error}
                  errorMessage={error?.message}
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
                  classNames={{
                    inputWrapper:
                      "border-2 border-black rounded-md shadow-neo !bg-white hover:!bg-white focus-within:!bg-white data-[hover=true]:!bg-white group-data-[focus=true]:!bg-white",
                    input: "!text-black placeholder:text-gray-400",
                    label: "text-gray-600",
                    innerWrapper: "!bg-white",
                  }}
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

            {/* Two-column layout for City and State/Province */}
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
                    classNames={{
                      inputWrapper:
                        "border-2 border-black rounded-md shadow-neo !bg-white hover:!bg-white focus-within:!bg-white data-[hover=true]:!bg-white group-data-[focus=true]:!bg-white",
                      input: "!text-black placeholder:text-gray-400",
                      label: "text-gray-600",
                      innerWrapper: "!bg-white",
                    }}
                    fullWidth={true}
                    label={<span>City</span>}
                    labelPlacement="inside"
                    isInvalid={!!error}
                    errorMessage={error?.message}
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
                    classNames={{
                      inputWrapper:
                        "border-2 border-black rounded-md shadow-neo !bg-white hover:!bg-white focus-within:!bg-white data-[hover=true]:!bg-white group-data-[focus=true]:!bg-white",
                      input: "!text-black placeholder:text-gray-400",
                      label: "text-gray-600",
                      innerWrapper: "!bg-white",
                    }}
                    fullWidth={true}
                    label={<span>State/Province</span>}
                    labelPlacement="inside"
                    isInvalid={!!error}
                    errorMessage={error?.message}
                    onChange={onChange}
                    isRequired={true}
                    onBlur={onBlur}
                    value={value || ""}
                  />
                )}
              />
            </div>

            {/* Two-column layout for Postal Code and Country */}
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
                    classNames={{
                      inputWrapper:
                        "border-2 border-black rounded-md shadow-neo !bg-white hover:!bg-white focus-within:!bg-white data-[hover=true]:!bg-white group-data-[focus=true]:!bg-white",
                      input: "!text-black placeholder:text-gray-400",
                      label: "text-gray-600",
                      innerWrapper: "!bg-white",
                    }}
                    fullWidth={true}
                    label={<span>Postal code</span>}
                    labelPlacement="inside"
                    isInvalid={!!error}
                    errorMessage={error?.message}
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
                    classNames={{
                      trigger:
                        "border-2 border-black rounded-md shadow-neo !bg-white hover:!bg-white data-[hover=true]:!bg-white data-[focus=true]:!bg-white",
                      value: "!text-black",
                      label: "text-gray-600 font-normal",
                      innerWrapper: "!bg-white",
                    }}
                    aria-label="Select Country"
                    label={<span>Country</span>}
                    labelPlacement="inside"
                    isInvalid={!!error}
                    errorMessage={error?.message}
                    onChange={onChange}
                    isRequired={true}
                    onBlur={onBlur}
                    value={value || ""}
                  />
                )}
              />
            </div>

            <div className="space-y-3">
              <Checkbox
                isSelected={saveDetails}
                onValueChange={setSaveDetails}
                classNames={{
                  label: "text-black",
                  wrapper:
                    "before:border-2 before:border-black after:bg-primary-yellow",
                }}
              >
                Save this address for future orders
              </Checkbox>

              {saveDetails && (
                <Input
                  classNames={{
                    inputWrapper:
                      "border-2 border-black rounded-md shadow-neo !bg-white hover:!bg-white focus-within:!bg-white data-[hover=true]:!bg-white group-data-[focus=true]:!bg-white",
                    input: "!text-black placeholder:text-gray-400",
                    label: "text-gray-600",
                    innerWrapper: "!bg-white",
                  }}
                  fullWidth={true}
                  label={<span>Address Label</span>}
                  placeholder="e.g. Home, Office"
                  labelPlacement="inside"
                  isRequired={true}
                  value={saveAddressLabel}
                  onValueChange={setSaveAddressLabel}
                />
              )}
            </div>
          </>
        )}

        {/* Pickup location selectors for products with pickup locations */}
        {productsWithPickupLocations.length > 0 &&
          formType === "combined" &&
          shippingPickupPreference === "contact" && (
            <div className="space-y-4">
              <h4 className="font-medium text-gray-700">
                Select Pickup Locations
              </h4>
              {productsWithPickupLocations.map((product) => (
                <Controller
                  key={product.id}
                  name={`pickupLocation_${product.id}`}
                  control={formControl}
                  rules={{ required: "A pickup location is required." }}
                  render={({
                    field: { onChange, onBlur, value },
                    fieldState: { error },
                  }) => (
                    <Select
                      className="shadow-neo rounded-md border-2 border-black bg-white"
                      classNames={{
                        trigger:
                          "border-2 border-black rounded-md shadow-neo !bg-white hover:!bg-white data-[hover=true]:!bg-white data-[focus=true]:!bg-white",
                        value: "!text-black",
                        label: "text-gray-600",
                        popoverContent:
                          "border-2 border-black rounded-md bg-white",
                        listbox: "!text-black",
                      }}
                      label={<span>{product.title} - Pickup Location</span>}
                      placeholder="Select pickup location"
                      isInvalid={!!error}
                      errorMessage={error?.message}
                      onChange={(e) => {
                        onChange(e);
                        setSelectedPickupLocations((prev) => ({
                          ...prev,
                          [product.id]: e.target.value,
                        }));
                      }}
                      isRequired={true}
                      onBlur={onBlur}
                      value={value || ""}
                    >
                      {(product.pickupLocations || []).map((location) => (
                        <SelectItem key={location}>{location}</SelectItem>
                      ))}
                    </Select>
                  )}
                />
              ))}
            </div>
          )}

        {requiredInfo && requiredInfo !== "" && (
          <Controller
            name="Required"
            control={formControl}
            rules={{ required: "Additional information is required." }}
            render={({
              field: { onChange, onBlur, value },
              fieldState: { error },
            }) => (
              <Input
                classNames={{
                  inputWrapper:
                    "border-2 border-black rounded-md shadow-neo !bg-white hover:!bg-white focus-within:!bg-white data-[hover=true]:!bg-white group-data-[focus=true]:!bg-white",
                  input: "!text-black placeholder:text-gray-400",
                  label: "text-gray-600",
                  innerWrapper: "!bg-white",
                }}
                fullWidth={true}
                label={<span>Enter {requiredInfo}</span>}
                labelPlacement="inside"
                isInvalid={!!error}
                errorMessage={error?.message}
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
        <div className="mx-auto flex w-full min-w-0 flex-col lg:flex-row">
          {/* Order Summary - Full width on mobile, half on desktop */}
          <div className="w-full min-w-0 bg-white p-6 lg:w-1/2">
            <div className="sticky top-6">
              <h2 className="mb-6 text-2xl font-bold">Order Summary</h2>

              <div className="mb-6 space-y-4">
                {products.map((product) => (
                  <div key={product.id} className="flex items-center space-x-4">
                    <Image
                      src={product.images[0]}
                      alt={product.title}
                      className="h-16 w-16 rounded-lg object-cover"
                    />
                    <div className="flex-1">
                      <h3 className="font-medium">{product.title}</h3>
                      {product.selectedSize && (
                        <p className="text-sm text-gray-600">
                          Size: {product.selectedSize}
                        </p>
                      )}
                      {product.selectedVolume && (
                        <p className="text-sm text-gray-600">
                          Volume: {product.selectedVolume}
                        </p>
                      )}
                      {product.selectedWeight && (
                        <p className="text-sm text-gray-600">
                          Weight: {product.selectedWeight}
                        </p>
                      )}
                      {product.selectedVariant && (
                        <p className="text-sm text-gray-600">
                          {product.variantLabel || "Option"}:{" "}
                          {product.selectedVariant}
                        </p>
                      )}
                      {product.selectedBulkOption && (
                        <p className="text-sm text-gray-600">
                          Bundle: {product.selectedBulkOption} units
                        </p>
                      )}
                      <p className="text-sm text-gray-600">
                        Quantity: {quantities[product.id] || 1}
                      </p>
                      {subscriptionSelections[product.id]?.enabled && (
                        <div className="mt-1 flex items-center gap-1">
                          <span className="text-xs">🔄</span>
                          <span className="text-xs font-semibold text-purple-600">
                            Subscription
                            {subscriptionSelections[product.id]?.frequency ===
                            "weekly"
                              ? " (Weekly)"
                              : subscriptionSelections[product.id]
                                    ?.frequency === "every_2_weeks"
                                ? " (Every 2 Weeks)"
                                : subscriptionSelections[product.id]
                                      ?.frequency === "monthly"
                                  ? " (Monthly)"
                                  : subscriptionSelections[product.id]
                                        ?.frequency === "every_2_months"
                                    ? " (Every 2 Months)"
                                    : subscriptionSelections[product.id]
                                          ?.frequency === "quarterly"
                                      ? " (Quarterly)"
                                      : ""}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              <div className="border-t pt-4">
                <div className="space-y-3">
                  <h4 className="font-semibold text-gray-700">
                    Cost Breakdown
                  </h4>
                  <div className="space-y-3">
                    {products.map((product) => {
                      const discount = appliedDiscounts[product.pubkey] || 0;
                      const basePrice =
                        (product.bulkPrice !== undefined
                          ? product.bulkPrice
                          : product.weightPrice !== undefined
                            ? product.weightPrice
                            : product.volumePrice !== undefined
                              ? product.volumePrice
                              : product.price) * (quantities[product.id] || 1);
                      const discountedPrice =
                        discount > 0
                          ? basePrice * (1 - discount / 100)
                          : basePrice;

                      // Calculate beef donation for this product
                      const beefDonationPercentage =
                        product.beefinit_donation_percentage || 0;
                      let beefDonationAmount = 0;
                      if (beefDonationPercentage > 0) {
                        beefDonationAmount = Math.ceil(
                          (basePrice * beefDonationPercentage) / 100
                        );
                      }

                      // Calculate milk market donation for this product
                      const milkMarketDonationPercentage =
                        profileContext.profileData.get(product.pubkey)?.content
                          ?.mm_donation ?? 0;
                      const milkMarketDonationAmount = Math.ceil(
                        (basePrice * milkMarketDonationPercentage) / 100
                      );

                      return (
                        <div
                          key={product.id}
                          className="space-y-2 border-l-2 border-gray-200 pl-3"
                        >
                          <div className="text-sm font-medium">
                            {product.title}{" "}
                            {quantities[product.id] &&
                              quantities[product.id]! > 1 &&
                              `(x${quantities[product.id]})`}
                          </div>
                          <div className="flex justify-between text-sm">
                            <span className="ml-2">Product cost:</span>
                            <span
                              className={
                                discount > 0 ? "text-gray-500 line-through" : ""
                              }
                            >
                              {formatWithCommas(basePrice, product.currency)}
                            </span>
                          </div>
                          {discount > 0 && (
                            <>
                              <div className="flex justify-between text-sm text-green-600">
                                <span className="ml-2">
                                  {(discountCodes &&
                                    discountCodes[product.pubkey]) ||
                                    "Discount"}{" "}
                                  ({discount}%):
                                </span>
                                <span>
                                  -
                                  {formatWithCommas(
                                    Math.ceil(
                                      ((basePrice * discount) / 100) * 100
                                    ) / 100,
                                    product.currency
                                  )}
                                </span>
                              </div>
                              <div className="flex justify-between text-sm font-medium">
                                <span className="ml-2">Discounted price:</span>
                                <span>
                                  {formatWithCommas(
                                    discountedPrice,
                                    product.currency
                                  )}
                                </span>
                              </div>
                            </>
                          )}
                          {beefDonationAmount > 0 && (
                            <div className="flex justify-between text-sm text-red-600">
                              <span className="ml-2">
                                Beef Donation ({beefDonationPercentage}%):
                              </span>
                              <span>
                                -
                                {formatWithCommas(
                                  beefDonationAmount,
                                  product.currency
                                )}
                              </span>
                            </div>
                          )}
                          {milkMarketDonationAmount > 0 && (
                            <div className="flex justify-between text-sm text-orange-600">
                              <span className="ml-2">
                                Milk Market Donation (
                                {milkMarketDonationPercentage}%):
                              </span>
                              <span>
                                -
                                {formatWithCommas(
                                  milkMarketDonationAmount,
                                  product.currency
                                )}
                              </span>
                            </div>
                          )}
                          {subscriptionSelections[product.id]?.enabled &&
                            product.subscriptionDiscount &&
                            product.subscriptionDiscount > 0 && (
                              <div className="flex justify-between text-sm text-purple-600">
                                <span className="ml-2">
                                  Subscription ({product.subscriptionDiscount}
                                  %):
                                </span>
                                <span>
                                  -
                                  {formatWithCommas(
                                    Math.ceil(
                                      (((discount > 0
                                        ? discountedPrice
                                        : basePrice) *
                                        product.subscriptionDiscount) /
                                        100) *
                                        100
                                    ) / 100,
                                    product.currency
                                  )}
                                </span>
                              </div>
                            )}
                        </div>
                      );
                    })}
                  </div>
                  {hasActiveSubscription && (
                    <div className="mt-3 rounded-md border-2 border-purple-300 bg-purple-50 p-3">
                      <div className="flex items-center gap-2">
                        <span className="text-lg">🔄</span>
                        <span className="font-semibold text-purple-700">
                          Subscription Order
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-purple-600">
                        Subscription items will be charged recurrently. One-time
                        items are charged only on this initial order. Card
                        payment only.
                      </p>
                    </div>
                  )}
                  {((formType === "combined" &&
                    shippingPickupPreference === "shipping") ||
                    formType === "shipping") &&
                    (() => {
                      const sellersSeen = new Set<string>();
                      const shippingLines = buildShippingLines(sellersSeen);
                      if (shippingLines.length === 0) return null;
                      return (
                        <div className="mt-3 space-y-2 border-t border-gray-100 pt-3">
                          <h4 className="text-sm font-semibold text-gray-700">
                            Shipping
                          </h4>
                          {shippingLines.map((line) => (
                            <div
                              key={line.pubkey}
                              className="flex justify-between text-sm"
                            >
                              <span className="ml-2">
                                Shipping ({line.name}):
                              </span>
                              {line.discountBadge ? (
                                <span className="flex items-center gap-2">
                                  <span className="text-gray-400 line-through">
                                    {formatWithCommas(
                                      line.originalCost,
                                      line.currency
                                    )}
                                  </span>
                                  {line.discountBadge !== "Free" &&
                                    line.cost > 0 && (
                                      <span className="font-medium">
                                        {formatWithCommas(
                                          line.cost,
                                          line.currency
                                        )}
                                      </span>
                                    )}
                                  <span className="rounded-full border border-green-300 bg-green-100 px-2 py-0.5 text-xs font-bold text-green-700">
                                    {line.discountBadge}
                                  </span>
                                </span>
                              ) : (
                                <span>
                                  {formatWithCommas(line.cost, line.currency)}
                                </span>
                              )}
                            </div>
                          ))}
                        </div>
                      );
                    })()}
                  {(salesTaxNative > 0 || isCalculatingTax) && (
                    <div className="mt-2 flex justify-between border-t pt-2 text-sm">
                      <span className="ml-2">Sales tax:</span>
                      <span>
                        {isCalculatingTax && salesTaxNative === 0
                          ? "Calculating..."
                          : formatWithCommas(
                              salesTaxNative,
                              salesTaxCurrency || cartCurrency || "USD"
                            )}
                      </span>
                    </div>
                  )}
                  <div className="flex justify-between border-t pt-2 font-semibold">
                    <span>Total:</span>
                    <span>
                      {nativeTotalCost !== null && cartCurrency ? (
                        <>
                          {formatWithCommas(
                            nativeTotalCost + salesTaxNative,
                            cartCurrency
                          )}
                          <span className="ml-2 text-sm font-normal text-gray-500">
                            ≈ {formatWithCommas(totalCost, "sats")}
                          </span>
                        </>
                      ) : (
                        formatWithCommas(totalCost, "sats")
                      )}
                    </span>
                  </div>
                </div>
              </div>

              <button
                onClick={() => onBackToCart?.()}
                className="mt-4 text-black underline hover:text-gray-700"
              >
                ← Back to cart
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
                        <PaymentCountdown deadlineMs={pollDeadlineMs} />
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
                          <button
                            type="button"
                            aria-label="Copy invoice"
                            onClick={handleCopyInvoice}
                            className={`ml-2 cursor-pointer text-sm leading-none ${
                              copiedToClipboard ? "hidden" : ""
                            }`}
                          >
                            📋
                          </button>
                          <span
                            aria-hidden="true"
                            className={`ml-2 cursor-pointer text-sm leading-none ${
                              copiedToClipboard ? "" : "hidden"
                            }`}
                          >
                            ✔️
                          </span>
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
      <div className="mx-auto flex w-full min-w-0 flex-col lg:flex-row">
        {/* Order Summary - Full width on mobile, half on desktop */}
        <div className="w-full min-w-0 bg-white p-6 lg:w-1/2">
          <div className="sticky top-6">
            <h2 className="mb-6 text-2xl font-bold">Order Summary</h2>

            <div className="mb-6 space-y-4">
              {products.map((product) => (
                <div key={product.id} className="flex items-center space-x-4">
                  <Image
                    src={product.images[0]}
                    alt={product.title}
                    className="h-16 w-16 rounded-lg object-cover"
                  />
                  <div className="flex-1">
                    <h3 className="font-medium">{product.title}</h3>
                    {product.selectedSize && (
                      <p className="text-sm text-gray-600">
                        Size: {product.selectedSize}
                      </p>
                    )}
                    {product.selectedVolume && (
                      <p className="text-sm text-gray-600">
                        Volume: {product.selectedVolume}
                      </p>
                    )}
                    {product.selectedWeight && (
                      <p className="text-sm text-gray-600">
                        Weight: {product.selectedWeight}
                      </p>
                    )}
                    {product.selectedVariant && (
                      <p className="text-sm text-gray-600">
                        {product.variantLabel || "Option"}:{" "}
                        {product.selectedVariant}
                      </p>
                    )}
                    {product.selectedBulkOption && (
                      <p className="text-sm text-gray-600">
                        Bundle: {product.selectedBulkOption} units
                      </p>
                    )}
                    <p className="text-sm text-gray-600">
                      Quantity: {quantities[product.id] || 1}
                    </p>
                    {subscriptionSelections[product.id]?.enabled && (
                      <div className="mt-1 flex items-center gap-1">
                        <span className="text-xs">🔄</span>
                        <span className="text-xs font-semibold text-purple-600">
                          Subscription
                          {subscriptionSelections[product.id]?.frequency ===
                          "weekly"
                            ? " (Weekly)"
                            : subscriptionSelections[product.id]?.frequency ===
                                "every_2_weeks"
                              ? " (Every 2 Weeks)"
                              : subscriptionSelections[product.id]
                                    ?.frequency === "monthly"
                                ? " (Monthly)"
                                : subscriptionSelections[product.id]
                                      ?.frequency === "every_2_months"
                                  ? " (Every 2 Months)"
                                  : subscriptionSelections[product.id]
                                        ?.frequency === "quarterly"
                                    ? " (Quarterly)"
                                    : ""}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>

            <div className="border-t pt-4">
              <div className="space-y-3">
                <h4 className="font-semibold text-gray-700">Cost Breakdown</h4>
                <div className="space-y-3">
                  {products.map((product) => {
                    const discount = appliedDiscounts[product.pubkey] || 0;
                    const originalPrice =
                      product.bulkPrice !== undefined
                        ? product.bulkPrice
                        : product.weightPrice != undefined
                          ? product.weightPrice
                          : product.volumePrice !== undefined
                            ? product.volumePrice
                            : product.price;
                    const basePrice =
                      originalPrice * (quantities[product.id] || 1);
                    const discountedPrice =
                      discount > 0
                        ? basePrice * (1 - discount / 100)
                        : basePrice;

                    // Calculate beef donation for this product
                    const beefDonationPercentage =
                      product.beefinit_donation_percentage || 0;
                    let beefDonationAmount = 0;
                    if (beefDonationPercentage > 0) {
                      beefDonationAmount = Math.ceil(
                        (basePrice * beefDonationPercentage) / 100
                      );
                    }

                    // Calculate milk market donation for this product
                    const milkMarketDonationPercentage =
                      profileContext.profileData.get(product.pubkey)?.content
                        ?.mm_donation ?? 0;
                    const milkMarketDonationAmount = Math.ceil(
                      (basePrice * milkMarketDonationPercentage) / 100
                    );

                    return (
                      <div
                        key={product.id}
                        className="space-y-2 border-l-2 border-gray-200 pl-3"
                      >
                        <div className="text-sm font-medium">
                          {product.title}{" "}
                          {quantities[product.id] &&
                            quantities[product.id]! > 1 &&
                            `(x${quantities[product.id]})`}
                        </div>
                        <div className="flex justify-between text-sm text-gray-500">
                          <span className="ml-2">Price:</span>
                          <span>
                            {formatWithCommas(originalPrice, product.currency)}
                          </span>
                        </div>
                        {quantities[product.id] &&
                          quantities[product.id]! > 1 && (
                            <div className="flex justify-between text-sm">
                              <span className="ml-2">
                                Base cost ({quantities[product.id]}x):
                              </span>
                              <span
                                className={
                                  discount > 0
                                    ? "text-gray-500 line-through"
                                    : ""
                                }
                              >
                                {formatWithCommas(basePrice, product.currency)}
                              </span>
                            </div>
                          )}
                        {discount > 0 && (
                          <>
                            <div className="flex justify-between text-sm text-green-600">
                              <span className="ml-2">
                                {(discountCodes &&
                                  discountCodes[product.pubkey]) ||
                                  "Discount"}{" "}
                                ({discount}%):
                              </span>
                              <span>
                                -
                                {formatWithCommas(
                                  Math.ceil(
                                    ((basePrice * discount) / 100) * 100
                                  ) / 100,
                                  product.currency
                                )}
                              </span>
                            </div>
                            <div className="flex justify-between text-sm font-medium">
                              <span className="ml-2">Discounted price:</span>
                              <span>
                                {formatWithCommas(
                                  discountedPrice,
                                  product.currency
                                )}
                              </span>
                            </div>
                          </>
                        )}
                        {beefDonationAmount > 0 && (
                          <div className="flex justify-between text-sm text-red-600">
                            <span className="ml-2">
                              Beef Donation ({beefDonationPercentage}%):
                            </span>
                            <span>
                              -
                              {formatWithCommas(
                                beefDonationAmount,
                                product.currency
                              )}
                            </span>
                          </div>
                        )}
                        {milkMarketDonationAmount > 0 && (
                          <div className="flex justify-between text-sm text-orange-600">
                            <span className="ml-2">
                              Milk Market Donation (
                              {milkMarketDonationPercentage}%):
                            </span>
                            <span>
                              -
                              {formatWithCommas(
                                milkMarketDonationAmount,
                                product.currency
                              )}
                            </span>
                          </div>
                        )}
                        {subscriptionSelections[product.id]?.enabled &&
                          product.subscriptionDiscount &&
                          product.subscriptionDiscount > 0 && (
                            <div className="flex justify-between text-sm text-purple-600">
                              <span className="ml-2">
                                Subscription ({product.subscriptionDiscount}%):
                              </span>
                              <span>
                                -
                                {formatWithCommas(
                                  Math.ceil(
                                    (((discount > 0
                                      ? discountedPrice
                                      : basePrice) *
                                      product.subscriptionDiscount) /
                                      100) *
                                      100
                                  ) / 100,
                                  product.currency
                                )}
                              </span>
                            </div>
                          )}
                      </div>
                    );
                  })}
                </div>
                {hasActiveSubscription && (
                  <div className="mt-3 rounded-md border-2 border-purple-300 bg-purple-50 p-3">
                    <div className="flex items-center gap-2">
                      <span className="text-lg">🔄</span>
                      <span className="font-semibold text-purple-700">
                        Subscription Order
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-purple-600">
                      Subscription items will be charged recurrently. One-time
                      items are charged only on this initial order. Card payment
                      only.
                    </p>
                  </div>
                )}
                {((formType === "combined" &&
                  shippingPickupPreference === "shipping") ||
                  formType === "shipping") &&
                  (() => {
                    const sellersSeen2 = new Set<string>();
                    const shippingLines2 = buildShippingLines(sellersSeen2);
                    if (shippingLines2.length === 0) return null;
                    return (
                      <div className="mt-3 space-y-2 border-t border-gray-100 pt-3">
                        <h4 className="text-sm font-semibold text-gray-700">
                          Shipping
                        </h4>
                        {shippingLines2.map((line) => (
                          <div
                            key={line.pubkey}
                            className="flex justify-between text-sm"
                          >
                            <span className="ml-2">
                              Shipping ({line.name}):
                            </span>
                            {line.discountBadge ? (
                              <span className="flex items-center gap-2">
                                <span className="text-gray-400 line-through">
                                  {formatWithCommas(
                                    line.originalCost,
                                    line.currency
                                  )}
                                </span>
                                {line.discountBadge !== "Free" &&
                                  line.cost > 0 && (
                                    <span className="font-medium">
                                      {formatWithCommas(
                                        line.cost,
                                        line.currency
                                      )}
                                    </span>
                                  )}
                                <span className="rounded-full border border-green-300 bg-green-100 px-2 py-0.5 text-xs font-bold text-green-700">
                                  {line.discountBadge}
                                </span>
                              </span>
                            ) : (
                              <span>
                                {formatWithCommas(line.cost, line.currency)}
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    );
                  })()}
                {(salesTaxNative > 0 || isCalculatingTax) && (
                  <div className="mt-2 flex justify-between border-t pt-2 text-sm">
                    <span className="ml-2">Sales tax:</span>
                    <span>
                      {isCalculatingTax && salesTaxNative === 0
                        ? "Calculating..."
                        : formatWithCommas(
                            salesTaxNative,
                            salesTaxCurrency || cartCurrency || "USD"
                          )}
                    </span>
                  </div>
                )}
                <div className="flex justify-between border-t pt-2 font-semibold">
                  <span>Total:</span>
                  <span>
                    {nativeTotalCost !== null && cartCurrency ? (
                      <>
                        {formatWithCommas(
                          nativeTotalCost + salesTaxNative,
                          cartCurrency
                        )}
                        <span className="ml-2 text-sm font-normal text-gray-500">
                          ≈ {formatWithCommas(totalCost, "sats")}
                        </span>
                      </>
                    ) : (
                      formatWithCommas(totalCost, "sats")
                    )}
                  </span>
                </div>
              </div>
            </div>

            <button
              onClick={() => onBackToCart?.()}
              className="mt-4 text-black underline hover:text-gray-700"
            >
              ← Back to cart
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
              <div className="space-y-4">
                {/* Check if we have mixed shipping types or all products are Free/Pickup */}
                {uniqueShippingTypes.length > 1 ? (
                  <>
                    {/* Mixed shipping types - only show combined */}
                    <button
                      onClick={() => handleOrderTypeSelection("combined")}
                      className="shadow-neo w-full transform rounded-md border-2 border-black bg-white p-4 text-left transition-transform hover:-translate-y-0.5 active:translate-y-0.5"
                    >
                      <div className="font-medium">Mixed delivery</div>
                      <div className="text-sm text-gray-500">
                        {hasShippingPickupProducts
                          ? "Products require different delivery methods (includes flexible shipping/pickup options)"
                          : "Products require different delivery methods"}
                      </div>
                    </button>
                  </>
                ) : uniqueShippingTypes.length === 1 &&
                  (uniqueShippingTypes[0] === "Free/Pickup" ||
                    uniqueShippingTypes[0] === "Added Cost/Pickup") ? (
                  <>
                    {/* All products have Free/Pickup - show shipping and contact options */}
                    <button
                      onClick={() => handleOrderTypeSelection("shipping")}
                      className="shadow-neo w-full transform rounded-md border-2 border-black bg-white p-4 text-left transition-transform hover:-translate-y-0.5 active:translate-y-0.5"
                    >
                      <div className="font-medium">Free or added shipping</div>
                      <div className="text-sm text-gray-500">
                        Get products shipped to your address
                      </div>
                    </button>
                    <button
                      onClick={() => handleOrderTypeSelection("contact")}
                      className="shadow-neo w-full transform rounded-md border-2 border-black bg-white p-4 text-left transition-transform hover:-translate-y-0.5 active:translate-y-0.5"
                    >
                      <div className="font-medium">Pickup</div>
                      <div className="text-sm text-gray-500">
                        Arrange pickup with seller
                      </div>
                    </button>
                  </>
                ) : uniqueShippingTypes.includes("Free") ||
                  uniqueShippingTypes.includes("Added Cost") ? (
                  <button
                    onClick={() => handleOrderTypeSelection("shipping")}
                    className="shadow-neo w-full transform rounded-md border-2 border-black bg-white p-4 text-left transition-transform hover:-translate-y-0.5 active:translate-y-0.5"
                  >
                    <div className="font-medium">
                      Online order with shipping
                    </div>
                    <div className="text-sm text-gray-500">
                      Get products shipped to your address
                    </div>
                  </button>
                ) : (
                  <button
                    onClick={() => handleOrderTypeSelection("contact")}
                    className="shadow-neo w-full transform rounded-md border-2 border-black bg-white p-4 text-left transition-transform hover:-translate-y-0.5 active:translate-y-0.5"
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

          {/* Free/Pickup Preference Selection */}
          {showFreePickupSelection && (
            <>
              <h2 className="mb-6 text-2xl font-bold">
                Shipping/Pickup Products Preference
              </h2>
              <p className="mb-4 text-gray-600">
                Some products offer both shipping and pickup options. How would
                you like to handle these products?
              </p>
              <div className="mb-6 space-y-4">
                <button
                  onClick={async () => {
                    setShippingPickupPreference("shipping");
                    setShowFreePickupSelection(false);
                    let shippingTotal = 0;
                    const processedSellers = new Set<string>();

                    for (const product of products) {
                      const sellerPubkey = product.pubkey;
                      const productShippingType = shippingTypes[product.id];
                      if (sellerFreeShippingStatus[sellerPubkey]?.qualifies)
                        continue;
                      if (
                        productShippingType === "Added Cost" ||
                        productShippingType === "Free" ||
                        productShippingType === "Free/Pickup"
                      ) {
                        if (!processedSellers.has(sellerPubkey)) {
                          processedSellers.add(sellerPubkey);
                          const sellerProducts = products.filter(
                            (p) =>
                              p.pubkey === sellerPubkey &&
                              (shippingTypes[p.id] === "Added Cost" ||
                                shippingTypes[p.id] === "Free" ||
                                shippingTypes[p.id] === "Free/Pickup")
                          );
                          if (sellerProducts.length > 1) {
                            const { highestShippingProduct } =
                              getConsolidatedShippingForSeller(sellerPubkey);
                            if (highestShippingProduct) {
                              const shippingCostInSats =
                                await convertShippingToSats(
                                  highestShippingProduct
                                );
                              shippingTotal += Math.ceil(
                                applyShippingDiscount(
                                  shippingCostInSats,
                                  sellerPubkey
                                )
                              );
                            }
                          } else {
                            const shippingCostInSats =
                              await convertShippingToSats(product);
                            const quantity = quantities[product.id] || 1;
                            shippingTotal += Math.ceil(
                              applyShippingDiscount(
                                shippingCostInSats * quantity,
                                sellerPubkey
                              )
                            );
                          }
                        }
                      }
                    }

                    setTotalCost(subtotalCost + shippingTotal);
                  }}
                  className={`shadow-neo w-full transform rounded-md border-2 border-black p-4 text-left transition-transform hover:-translate-y-0.5 active:translate-y-0.5 ${
                    shippingPickupPreference === "shipping"
                      ? "bg-primary-yellow"
                      : "bg-white"
                  }`}
                >
                  <div className="font-medium">Free or added shipping</div>
                  <div className="text-sm text-gray-500">
                    Arrange shipping for products that offer it
                  </div>
                </button>
                <button
                  onClick={async () => {
                    setShippingPickupPreference("contact");
                    setShowFreePickupSelection(false);
                    let shippingTotal = 0;
                    const processedSellers = new Set<string>();

                    for (const product of products) {
                      const sellerPubkey = product.pubkey;
                      const productShippingType = shippingTypes[product.id];
                      if (sellerFreeShippingStatus[sellerPubkey]?.qualifies)
                        continue;
                      if (
                        productShippingType === "Added Cost" ||
                        productShippingType === "Free"
                      ) {
                        if (!processedSellers.has(sellerPubkey)) {
                          processedSellers.add(sellerPubkey);
                          const sellerProducts = products.filter(
                            (p) =>
                              p.pubkey === sellerPubkey &&
                              (shippingTypes[p.id] === "Added Cost" ||
                                shippingTypes[p.id] === "Free")
                          );
                          if (sellerProducts.length > 1) {
                            const { highestShippingProduct } =
                              getConsolidatedShippingForSeller(sellerPubkey);
                            if (highestShippingProduct) {
                              const shippingCostInSats =
                                await convertShippingToSats(
                                  highestShippingProduct
                                );
                              shippingTotal += Math.ceil(
                                applyShippingDiscount(
                                  shippingCostInSats,
                                  sellerPubkey
                                )
                              );
                            }
                          } else {
                            const shippingCostInSats =
                              await convertShippingToSats(product);
                            const quantity = quantities[product.id] || 1;
                            shippingTotal += Math.ceil(
                              applyShippingDiscount(
                                shippingCostInSats * quantity,
                                sellerPubkey
                              )
                            );
                          }
                        }
                      }
                    }

                    setTotalCost(subtotalCost + shippingTotal);
                  }}
                  className={`shadow-neo w-full transform rounded-md border-2 border-black p-4 text-left transition-transform hover:-translate-y-0.5 active:translate-y-0.5 ${
                    shippingPickupPreference === "contact"
                      ? "bg-primary-yellow"
                      : "bg-white"
                  }`}
                >
                  <div className="font-medium">Pickup</div>
                  <div className="text-sm text-gray-500">
                    Arrange pickup for products that offer it
                  </div>
                </button>
              </div>

              {/* Show pickup location selection for products with pickup locations */}
              {productsWithPickupLocations.length > 0 &&
                shippingPickupPreference === "contact" && (
                  <div className="space-y-6">
                    <h3 className="text-lg font-semibold">
                      Select Pickup Locations
                    </h3>
                    {productsWithPickupLocations.map((product) => (
                      <div key={product.id} className="space-y-2">
                        <h4 className="font-medium">{product.title}</h4>
                        <Select
                          classNames={{
                            trigger:
                              "border-2 border-black rounded-md shadow-neo !bg-white hover:!bg-white data-[hover=true]:!bg-white data-[focus=true]:!bg-white",
                            value: "!text-black",
                            label: "text-gray-600",
                            popoverContent:
                              "border-2 border-black rounded-md bg-white",
                            listbox: "!text-black",
                          }}
                          label="Select pickup location"
                          placeholder="Choose a pickup location"
                          value={selectedPickupLocations[product.id] || ""}
                          onChange={(e) => {
                            setSelectedPickupLocations((prev) => ({
                              ...prev,
                              [product.id]: e.target.value,
                            }));
                          }}
                        >
                          {(product.pickupLocations || []).map((location) => (
                            <SelectItem key={location}>{location}</SelectItem>
                          ))}
                        </Select>
                      </div>
                    ))}
                  </div>
                )}
            </>
          )}

          {/* Contact/Shipping Form */}
          {formType && !showFreePickupSelection && (
            <>
              {formType === "shipping" && (
                <h2 className="mb-6 text-2xl font-bold">
                  Shipping Information
                </h2>
              )}
              {formType === "contact" && (
                <h2 className="mb-6 text-2xl font-bold">Payment Method</h2>
              )}
              {formType === "combined" && (
                <h2 className="mb-6 text-2xl font-bold">
                  Shipping Information
                </h2>
              )}

              <form
                onSubmit={handleFormSubmit((data) => onFormSubmit(data))}
                className="w-full max-w-full min-w-0 space-y-6"
              >
                {renderContactForm()}

                {!isLoggedIn && (
                  <div className="mt-4 space-y-2">
                    <Input
                      variant="bordered"
                      fullWidth={true}
                      label={
                        <span className="text-light-text">
                          Email for Order Updates
                        </span>
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
                    <Input
                      variant="bordered"
                      fullWidth={true}
                      label={
                        <span className="text-light-text">
                          Email for Order Updates (optional)
                        </span>
                      }
                      labelPlacement="inside"
                      type="email"
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

                <div
                  className={`space-y-4 ${
                    formType !== "contact" ? "border-t pt-6" : ""
                  }`}
                >
                  {formType !== "contact" && (
                    <h3 className="mb-4 text-lg font-semibold">
                      Payment Method
                    </h3>
                  )}

                  {!hasActiveSubscription && !hasSubscriptionStripeConflict && (
                    <>
                      <Button
                        className={`${BLUEBUTTONCLASSNAMES} h-auto min-h-12 w-full py-3 text-center break-words whitespace-normal ${
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
                        startContent={
                          <span
                            aria-hidden="true"
                            className="text-2xl leading-none"
                          >
                            ⚡
                          </span>
                        }
                      >
                        Pay with Lightning: {formattedLightningCost}
                        {getDiscountLabel(bitcoinDiscountPct)}
                      </Button>

                      {hasTokensAvailable && (
                        <Button
                          className={`${BLUEBUTTONCLASSNAMES} h-auto min-h-12 w-full py-3 text-center break-words whitespace-normal ${
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
                          startContent={
                            <span
                              aria-hidden="true"
                              className="text-2xl leading-none"
                            >
                              🥜
                            </span>
                          }
                        >
                          Pay with Cashu: {formattedLightningCost}
                          {getDiscountLabel(bitcoinDiscountPct)}
                        </Button>
                      )}

                      {nwcInfo && (
                        <Button
                          className={`${BLUEBUTTONCLASSNAMES} h-auto min-h-12 w-full py-3 text-center break-words whitespace-normal ${
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
                          startContent={
                            <span
                              aria-hidden="true"
                              className="text-2xl leading-none"
                            >
                              👛
                            </span>
                          }
                        >
                          Pay with {nwcInfo.alias || "NWC"}:{" "}
                          {formattedLightningCost}
                          {getDiscountLabel(bitcoinDiscountPct)}
                        </Button>
                      )}
                    </>
                  )}

                  {((isSingleSeller && isStripeMerchant) ||
                    (!isSingleSeller && allSellersHaveStripe)) && (
                    <Button
                      className={`shadow-neo h-auto min-h-12 w-full rounded-md border-2 border-black bg-black px-4 py-3 text-center font-bold break-words whitespace-normal text-white transition-transform hover:-translate-y-0.5 active:translate-y-0.5 ${
                        !isFormValid || (!isLoggedIn && !buyerEmail)
                          ? "cursor-not-allowed opacity-50"
                          : ""
                      }`}
                      disabled={!isFormValid || (!isLoggedIn && !buyerEmail)}
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
                      startContent={
                        <span
                          aria-hidden="true"
                          className="text-2xl leading-none"
                        >
                          💳️
                        </span>
                      }
                    >
                      Pay with Card: {formattedCardCost}
                      {getDiscountLabel(stripeDiscountPct)}
                    </Button>
                  )}

                  {!hasActiveSubscription &&
                    (isSingleSeller
                      ? Object.keys(fiatPaymentOptions).length > 0
                      : isMultiFiatAvailable) && (
                      <Button
                        className={`shadow-neo h-auto min-h-12 w-full rounded-md border-2 border-black bg-black px-4 py-3 text-center font-bold break-words whitespace-normal text-white transition-transform hover:-translate-y-0.5 active:translate-y-0.5 ${
                          !isFormValid || (!isLoggedIn && !buyerEmail)
                            ? "cursor-not-allowed opacity-50"
                            : ""
                        }`}
                        disabled={!isFormValid || (!isLoggedIn && !buyerEmail)}
                        onClick={() => {
                          handleFormSubmit((data) =>
                            onFormSubmit(data, "fiat")
                          )();
                        }}
                        startContent={
                          <span
                            aria-hidden="true"
                            className="text-2xl leading-none"
                          >
                            💵
                          </span>
                        }
                      >
                        Pay with Cash or Payment App:{" "}
                        {(() => {
                          if (isSingleSeller) {
                            const fiatKeys = Object.keys(fiatPaymentOptions);
                            const fiatDiscountVals = fiatKeys.map(
                              (k) => pmDiscounts[k] || 0
                            );
                            const allSame =
                              fiatDiscountVals.length > 0 &&
                              fiatDiscountVals.every(
                                (d) => d === fiatDiscountVals[0]
                              );
                            if (allSame && fiatDiscountVals[0]! > 0) {
                              return `${getFormattedFiatCost(
                                fiatKeys[0]!
                              )}${getDiscountLabel(fiatDiscountVals[0]!)}`;
                            }
                          }
                          return formatCartMethodCost(
                            nativeTotalCost,
                            totalCost,
                            "card",
                            { stripeFloor: true }
                          );
                        })()}
                      </Button>
                    )}

                  {!isSingleSeller && !allSellersHaveStripe && (
                    <p className="mt-2 text-center text-sm text-gray-500">
                      Card payment requires all merchants to have Stripe
                      enabled. Bitcoin payments are available for all carts.
                    </p>
                  )}
                </div>
              </form>
            </>
          )}
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

      {showFiatPaymentInstructions && (
        <Modal
          backdrop="blur"
          isOpen={showFiatPaymentInstructions}
          onClose={() => {
            setShowFiatPaymentInstructions(false);
            setFiatPaymentConfirmed(false);
            setSelectedFiatOption("");
            setMultiFiatConfirmed({});
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
              {isSingleSeller
                ? selectedFiatOption === "cash"
                  ? "Cash Payment"
                  : "Send Payment"
                : "Send Payments"}
            </ModalHeader>
            <ModalBody className="flex flex-col overflow-hidden text-black">
              {isSingleSeller ? (
                selectedFiatOption === "cash" ? (
                  <>
                    <p className="mb-4 text-center text-gray-600">
                      You will need{" "}
                      <span className="font-semibold text-black">
                        {nativeTotalCost !== null && cartCurrency
                          ? `${formatWithCommas(
                              nativeTotalCost,
                              cartCurrency
                            )} (≈ ${formatWithCommas(totalCost, "sats")})`
                          : formatWithCommas(totalCost, "sats")}
                      </span>{" "}
                      in cash for this order.
                    </p>
                    <div className="flex items-center space-x-2">
                      <input
                        type="checkbox"
                        id="paymentConfirmedCart"
                        checked={fiatPaymentConfirmed}
                        onChange={(e) =>
                          setFiatPaymentConfirmed(e.target.checked)
                        }
                        className="h-4 w-4 rounded border-2 border-black accent-black"
                      />
                      <label
                        htmlFor="paymentConfirmedCart"
                        className="text-left text-sm text-gray-700"
                      >
                        I will have the sufficient cash to complete the order
                        upon pickup or delivery
                      </label>
                    </div>
                  </>
                ) : (
                  <>
                    <p className="mb-4 text-center text-gray-600">
                      Please send{" "}
                      <span className="font-semibold text-black">
                        {nativeTotalCost !== null && cartCurrency
                          ? `${formatWithCommas(
                              nativeTotalCost,
                              cartCurrency
                            )} (≈ ${formatWithCommas(totalCost, "sats")})`
                          : formatWithCommas(totalCost, "sats")}
                      </span>{" "}
                      to:
                    </p>
                    <div className="shadow-neo mb-4 rounded-md border-2 border-black bg-gray-50 p-4">
                      <p className="text-center font-semibold text-black">
                        {selectedFiatOption}:{" "}
                        {singleSellerPubkey &&
                          (profileContext.profileData.get(singleSellerPubkey)
                            ?.content?.fiat_options?.[selectedFiatOption] ||
                            "N/A")}
                      </p>
                    </div>
                    <div className="flex items-center space-x-2">
                      <input
                        type="checkbox"
                        id="paymentConfirmedCart"
                        checked={fiatPaymentConfirmed}
                        onChange={(e) =>
                          setFiatPaymentConfirmed(e.target.checked)
                        }
                        className="h-4 w-4 rounded border-2 border-black accent-black"
                      />
                      <label
                        htmlFor="paymentConfirmedCart"
                        className="text-sm text-gray-700"
                      >
                        I have sent the payment
                      </label>
                    </div>
                  </>
                )
              ) : (
                <div className="space-y-6">
                  {sellersWithFiat.map((sellerPubkey) => {
                    const sellerName = getSellerDisplayName(sellerPubkey);
                    const breakdown = getSellerCostBreakdown(sellerPubkey);
                    const sellerFiatOption =
                      multiFiatSelections[sellerPubkey] || "";
                    const sellerFiatHandle =
                      multiFiatOptions[sellerPubkey]?.[sellerFiatOption] || "";
                    const amountDisplay =
                      !isSatsCart &&
                      breakdown.nativeTotal !== null &&
                      cartCurrency
                        ? `${formatWithCommas(
                            breakdown.nativeTotal,
                            cartCurrency
                          )} (≈ ${formatWithCommas(
                            breakdown.satsTotal,
                            "sats"
                          )})`
                        : formatWithCommas(breakdown.satsTotal, "sats");

                    return (
                      <div
                        key={sellerPubkey}
                        className="shadow-neo rounded-md border-2 border-black bg-gray-50 p-4"
                      >
                        <p className="mb-2 font-bold text-black">
                          {sellerName}
                        </p>
                        {sellerFiatOption === "cash" ? (
                          <>
                            <p className="mb-2 text-sm text-gray-600">
                              You will need{" "}
                              <span className="font-semibold text-black">
                                {amountDisplay}
                              </span>{" "}
                              in cash for this merchant.
                            </p>
                            <div className="flex items-center space-x-2">
                              <input
                                type="checkbox"
                                id={`paymentConfirmed-${sellerPubkey}`}
                                checked={
                                  multiFiatConfirmed[sellerPubkey] || false
                                }
                                onChange={(e) =>
                                  setMultiFiatConfirmed((prev) => ({
                                    ...prev,
                                    [sellerPubkey]: e.target.checked,
                                  }))
                                }
                                className="h-4 w-4 rounded border-2 border-black accent-black"
                              />
                              <label
                                htmlFor={`paymentConfirmed-${sellerPubkey}`}
                                className="text-left text-sm text-gray-700"
                              >
                                I will have the sufficient cash for this
                                merchant
                              </label>
                            </div>
                          </>
                        ) : (
                          <>
                            <p className="mb-2 text-sm text-gray-600">
                              Please send{" "}
                              <span className="font-semibold text-black">
                                {amountDisplay}
                              </span>{" "}
                              to:
                            </p>
                            <p className="mb-3 text-center font-semibold text-black">
                              {sellerFiatOption}: {sellerFiatHandle || "N/A"}
                            </p>
                            <div className="flex items-center space-x-2">
                              <input
                                type="checkbox"
                                id={`paymentConfirmed-${sellerPubkey}`}
                                checked={
                                  multiFiatConfirmed[sellerPubkey] || false
                                }
                                onChange={(e) =>
                                  setMultiFiatConfirmed((prev) => ({
                                    ...prev,
                                    [sellerPubkey]: e.target.checked,
                                  }))
                                }
                                className="h-4 w-4 rounded border-2 border-black accent-black"
                              />
                              <label
                                htmlFor={`paymentConfirmed-${sellerPubkey}`}
                                className="text-sm text-gray-700"
                              >
                                I have sent the payment to this merchant
                              </label>
                            </div>
                          </>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </ModalBody>
            <ModalFooter className="flex justify-center gap-2">
              <Button
                onClick={() => {
                  setShowFiatPaymentInstructions(false);
                  setFiatPaymentConfirmed(false);
                  setSelectedFiatOption("");
                  setMultiFiatConfirmed({});
                  setPendingPaymentData(null);
                }}
                className="shadow-neo rounded-md border-2 border-black bg-white px-6 py-2 font-bold text-black transition-transform hover:-translate-y-0.5 active:translate-y-0.5"
              >
                Cancel
              </Button>
              <Button
                onClick={async () => {
                  const confirmed = isSingleSeller
                    ? fiatPaymentConfirmed
                    : allMultiFiatConfirmed;
                  if (confirmed) {
                    setShowFiatPaymentInstructions(false);
                    const fiatCosts = isSingleSeller
                      ? getFiatMethodCosts(selectedFiatOption)
                      : { nativeTotal: nativeTotalCost, satsTotal: totalCost };
                    await handleFiatPayment(
                      fiatCosts.satsTotal,
                      pendingPaymentData || {}
                    );
                    setPendingPaymentData(null);
                  }
                }}
                disabled={
                  isSingleSeller
                    ? !fiatPaymentConfirmed
                    : !allMultiFiatConfirmed
                }
                className={`shadow-neo rounded-md border-2 border-black bg-black px-6 py-2 font-bold text-white transition-transform hover:-translate-y-0.5 active:translate-y-0.5 ${
                  (
                    isSingleSeller
                      ? !fiatPaymentConfirmed
                      : !allMultiFiatConfirmed
                  )
                    ? "cursor-not-allowed opacity-50"
                    : ""
                }`}
              >
                {isSingleSeller
                  ? selectedFiatOption === "cash"
                    ? "Confirm Order"
                    : "Confirm Payment Sent"
                  : "Confirm All Payments"}
              </Button>
            </ModalFooter>
          </ModalContent>
        </Modal>
      )}

      <Modal
        backdrop="blur"
        isOpen={showFiatTypeOption}
        onClose={() => {
          setShowFiatTypeOption(false);
          setMultiFiatSelections({});
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
            Select your payment method{!isSingleSeller ? "s" : ""}
          </ModalHeader>
          <ModalBody className="flex flex-col overflow-hidden text-black">
            {isSingleSeller ? (
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
            ) : (
              <div className="space-y-4">
                {sellersWithFiat.map((sellerPubkey) => {
                  const sellerName = getSellerDisplayName(sellerPubkey);
                  const opts = multiFiatOptions[sellerPubkey] || {};
                  return (
                    <div key={sellerPubkey}>
                      <p className="mb-1 font-bold text-black">{sellerName}</p>
                      <Select
                        label="Payment Option"
                        className="max-w-xs"
                        classNames={{
                          trigger:
                            "border-2 border-black rounded-md shadow-neo !bg-white hover:!bg-white data-[hover=true]:!bg-white data-[focus=true]:!bg-white",
                          value: "!text-black",
                          label: "text-gray-600",
                          popoverContent:
                            "border-2 border-black rounded-md bg-white",
                          listbox: "!text-black",
                        }}
                        selectedKeys={
                          multiFiatSelections[sellerPubkey]
                            ? new Set([multiFiatSelections[sellerPubkey]!])
                            : new Set<string>()
                        }
                        onChange={(e) => {
                          setMultiFiatSelections((prev) => ({
                            ...prev,
                            [sellerPubkey]: e.target.value,
                          }));
                        }}
                      >
                        {Object.keys(opts).map((option) => (
                          <SelectItem key={option} className="text-black">
                            {option}
                          </SelectItem>
                        ))}
                      </Select>
                    </div>
                  );
                })}
              </div>
            )}
          </ModalBody>
          {!isSingleSeller && (
            <ModalFooter className="flex justify-center">
              <Button
                onClick={() => {
                  setShowFiatTypeOption(false);
                  setShowFiatPaymentInstructions(true);
                }}
                disabled={!allMultiFiatSelected}
                className={`shadow-neo rounded-md border-2 border-black bg-black px-6 py-2 font-bold text-white transition-transform hover:-translate-y-0.5 active:translate-y-0.5 ${
                  !allMultiFiatSelected ? "cursor-not-allowed opacity-50" : ""
                }`}
              >
                Continue
              </Button>
            </ModalFooter>
          )}
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

      {/* Direct Cashu processing overlay. Non-dismissable so the buyer
          can't accidentally close it mid-swap; cleared by the finally in
          handleCashuPayment regardless of outcome. */}
      <Modal
        backdrop="blur"
        isOpen={cashuStartedAtMs !== null}
        hideCloseButton
        isDismissable={false}
        isKeyboardDismissDisabled
        classNames={{
          body: "py-6 bg-white",
          backdrop: "bg-[#292f46]/50 backdrop-opacity-60",
          header: "border-b-4 border-black bg-white rounded-t-md",
          wrapper: "items-center justify-center",
          base: "border-4 border-black shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] rounded-md",
        }}
        placement="center"
        size="sm"
      >
        <ModalContent>
          <ModalHeader className="flex items-center justify-center font-bold text-black">
            Processing Cashu payment
          </ModalHeader>
          <ModalBody className="flex flex-col items-center gap-3 text-black">
            <Spinner size="lg" />
            <PaymentElapsed startedAtMs={cashuStartedAtMs} />
            <p className="text-center text-sm">
              Please don&apos;t close this tab while your mint completes the
              payment.
            </p>
          </ModalBody>
        </ModalContent>
      </Modal>
    </div>
  );
}
