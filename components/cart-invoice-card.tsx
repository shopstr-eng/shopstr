import { useContext, useState, useEffect, useMemo, useRef } from "react";
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
import {
  CashuMint,
  CashuWallet,
  getEncodedToken,
  Proof,
  MintKeyset,
} from "@cashu/cashu-ts";
import {
  constructGiftWrappedEvent,
  constructMessageSeal,
  constructMessageGiftWrap,
  sendGiftWrappedMessageEvent,
  generateKeys,
  getLocalStorageData,
  publishProofEvent,
} from "@/utils/nostr/nostr-helper-functions";
import { LightningAddress } from "@getalby/lightning-tools";
import QRCode from "qrcode";
import { v4 as uuidv4 } from "uuid";
import { nip19 } from "nostr-tools";
import { ProductData } from "@/utils/parsers/product-parser-functions";
import { webln } from "@getalby/sdk";
import { formatWithCommas } from "./utility-components/display-monetary-info";
import { BLUEBUTTONCLASSNAMES } from "@/utils/STATIC-VARIABLES";
import SignInModal from "./sign-in/SignInModal";
import FailureModal from "@/components/utility-components/failure-modal";
import CountryDropdown from "./utility-components/dropdowns/country-dropdown";
import {
  NostrContext,
  SignerContext,
} from "@/components/utility-components/nostr-context-provider";
import {
  ShippingFormData,
  ContactFormData,
  CombinedFormData,
  ShopProfile,
} from "@/utils/types/types";
import { Controller } from "react-hook-form";
import StripeCardForm from "./utility-components/stripe-card-form";

export default function CartInvoiceCard({
  products,
  quantities,
  shippingTypes,
  totalCostsInSats,
  subtotalCost,
  appliedDiscounts = {},
  discountCodes = {},
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
  discountCodes?: { [key: string]: string };
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
  const [invoice, setInvoice] = useState("");
  const [copiedToClipboard, setCopiedToClipboard] = useState(false);

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
    selectedBulkOption?: string;
  }> | null>(null);

  const [buyerEmail, setBuyerEmail] = useState("");
  const [buyerEmailAutoFilled, setBuyerEmailAutoFilled] = useState(false);
  const [emailError, setEmailError] = useState("");

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
    includeBuyerEmail?: boolean;
    subscriptionFrequency?: string;
  }) => {
    try {
      const shouldIncludeBuyer = params.includeBuyerEmail !== false;
      await fetch("/api/email/send-order-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          buyerEmail: shouldIncludeBuyer ? buyerEmail || undefined : undefined,
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
          selectedBulkOption: params.selectedBulkOption,
          subscriptionFrequency: params.subscriptionFrequency,
        }),
      });
    } catch (e) {}
  };

  useEffect(() => {
    if (
      (paymentConfirmed || stripePaymentConfirmed) &&
      pendingOrderEmailRef.current &&
      pendingOrderEmailRef.current.length > 0
    ) {
      const emailEntries = pendingOrderEmailRef.current;
      emailEntries.forEach((entry, index) => {
        triggerOrderEmail({
          ...entry,
          includeBuyerEmail: index === 0,
        });
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
          shipping: shippingTypes[p.id] || "",
          pickupLocation: selectedPickupLocations[p.id] || undefined,
          selectedSize: p.selectedSize || undefined,
          selectedVolume: p.selectedVolume || undefined,
          selectedWeight: p.selectedWeight || undefined,
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

      pendingOrderEmailRef.current = null;
    }
  }, [paymentConfirmed, stripePaymentConfirmed]);

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

  const [showFailureModal, setShowFailureModal] = useState(false);

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
      ? products.find((p) => p.currency.toUpperCase() === best)?.currency ??
          best
      : null;
  }, [products]);

  const {
    handleSubmit: handleFormSubmit,
    control: formControl,
    watch,
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
        const discountedPrice =
          discount > 0 ? basePrice * (1 - discount / 100) : basePrice;
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

  useEffect(() => {
    if (
      !cartCurrency ||
      cartCurrency.toLowerCase() === "sats" ||
      cartCurrency.toLowerCase() === "sat"
    ) {
      setNativeTotalCost(null);
      return;
    }
    let cancelled = false;
    const compute = async () => {
      const { fiat: fiatLib } = await import("@getalby/lightning-tools");
      let nativeSubtotal = 0;
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
        const discountedPrice =
          discount > 0 ? basePrice * (1 - discount / 100) : basePrice;
        const qty = quantities[product.id] || 1;
        const productCurrencyUpper = product.currency.toUpperCase();
        const cartCurrencyUpper = cartCurrency.toUpperCase();
        if (productCurrencyUpper === cartCurrencyUpper) {
          nativeSubtotal += discountedPrice * qty;
        } else {
          try {
            const satVal =
              productCurrencyUpper === "SATS" || productCurrencyUpper === "SAT"
                ? discountedPrice * qty
                : await fiatLib.getSatoshiValue({
                    amount: discountedPrice * qty,
                    currency: product.currency,
                  });
            const fiatVal = await fiatLib.getFiatValue({
              satoshi: Math.round(satVal),
              currency: cartCurrencyUpper,
            });
            nativeSubtotal += fiatVal;
          } catch {
            nativeSubtotal += discountedPrice * qty;
          }
        }
      }
      let nativeShipping = 0;
      if (
        formType === "shipping" ||
        (formType === "combined" && shippingPickupPreference === "shipping")
      ) {
        const sellersSeen = new Set<string>();
        products.forEach((product) => {
          if (sellersSeen.has(product.pubkey)) return;
          sellersSeen.add(product.pubkey);
          if (sellerFreeShippingStatus[product.pubkey]?.qualifies) return;
          const sellerProducts = products.filter(
            (p) => p.pubkey === product.pubkey
          );
          if (sellerProducts.length > 1) {
            const { highestShippingCost } = getConsolidatedShippingForSeller(
              product.pubkey
            );
            nativeShipping += highestShippingCost;
          } else {
            nativeShipping +=
              (product.shippingCost || 0) * (quantities[product.id] || 1);
          }
        });
      }
      if (!cancelled) {
        setNativeTotalCost(
          Math.round((nativeSubtotal + nativeShipping) * 100) / 100
        );
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
      const { fiat: fiatLib } = await import("@getalby/lightning-tools");
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
        const discountedPrice =
          discount > 0 ? basePrice * (1 - discount / 100) : basePrice;
        const qty = quantities[product.id] || 1;
        const productCurrencyUpper = product.currency.toUpperCase();
        if (productCurrencyUpper === cartCurrencyUpper) {
          map[product.id] = Math.round(discountedPrice * qty * 100) / 100;
        } else {
          try {
            const satVal =
              productCurrencyUpper === "SATS" || productCurrencyUpper === "SAT"
                ? discountedPrice * qty
                : await fiatLib.getSatoshiValue({
                    amount: discountedPrice * qty,
                    currency: product.currency,
                  });
            const fiatVal = await fiatLib.getFiatValue({
              satoshi: Math.round(satVal),
              currency: cartCurrencyUpper,
            });
            map[product.id] = Math.round(fiatVal * 100) / 100;
          } catch {
            map[product.id] = Math.round(discountedPrice * qty * 100) / 100;
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
        const { fiat } = await import("@getalby/lightning-tools");
        const satsPerUsd = await fiat.getSatoshiValue({
          amount: 1,
          currency: "USD",
        });
        if (satsPerUsd > 0) {
          setUsdEstimate(Math.round((totalCost / satsPerUsd) * 100) / 100);
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
    } catch (_) {
      return null;
    }
  };

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
  ) => {
    const newKeys = await generateNewKeys();
    if (!newKeys) {
      setFailureText("Failed to generate new keys for messages!");
      setShowFailureModal(true);
      return;
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
    if (!keys) {
      setFailureText("Message keys are required!");
      setShowFailureModal(true);
      return;
    }

    const decodedRandomPubkeyForSender = nip19.decode(keys.senderNpub);
    const decodedRandomPrivkeyForSender = nip19.decode(keys.senderNsec);
    const decodedRandomPubkeyForReceiver = nip19.decode(keys.receiverNpub);
    const decodedRandomPrivkeyForReceiver = nip19.decode(keys.receiverNsec);

    let buyerPubkey = await signer?.getPubKey?.();
    if (!buyerPubkey) {
      buyerPubkey = decodedRandomPubkeyForSender.data as string;
    }

    let messageSubject = "";
    let messageOptions: any = {};
    if (isPayment) {
      messageSubject = "order-payment";
      messageOptions = {
        isOrder: true,
        type: 2,
        orderAmount: messageAmount ? messageAmount : totalCost,
        orderCurrency: orderCurrency || undefined,
        orderId,
        productData: product,
        paymentType,
        paymentReference,
        contact,
        address,
        buyerPubkey,
        pickup,
        donationAmount: donationAmountValue,
        donationPercentage: donationPercentageValue,
        selectedSize: product.selectedSize,
        selectedVolume: product.selectedVolume,
        selectedWeight: product.selectedWeight,
        selectedBulkOption: product.selectedBulkOption,
        subscriptionInfo,
      };
    } else if (isReceipt) {
      messageSubject = "order-receipt";
      messageOptions = {
        isOrder: true,
        type: 4,
        orderAmount: messageAmount ? messageAmount : totalCost,
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
        selectedBulkOption: product.selectedBulkOption,
      };
    } else if (isDonation) {
      messageSubject = "donation";
    } else if (isHerdshare) {
      messageSubject = "order-info";
      messageOptions = {
        isOrder: true,
        type: 1,
        orderAmount: messageAmount ? messageAmount : undefined,
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
        orderAmount: messageAmount ? messageAmount : totalCost,
        orderCurrency: orderCurrency || undefined,
        orderId,
        productData: product,
        quantity: productQuantity ? productQuantity : 1,
        contact,
        address,
        buyerPubkey,
        pickup,
        donationAmount: donationAmountValue,
        donationPercentage: donationPercentageValue,
        selectedSize: product.selectedSize,
        selectedVolume: product.selectedVolume,
        selectedWeight: product.selectedWeight,
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
              paymentData.shippingCity || ""
            }, ${paymentData.shippingState || ""}, ${
              paymentData.shippingPostalCode || ""
            }, ${paymentData.shippingCountry || ""}`
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
          const sellerAmountSats = totalCostsInSats[sellerPubkey] || 0;
          const sellerAmountNative =
            !isSatsCart && nativeCostsPerProduct
              ? sellerProducts.reduce(
                  (sum: number, p: any) =>
                    sum + (nativeCostsPerProduct[p.id] || 0),
                  0
                )
              : null;
          const orderCurrency =
            !isSatsCart && cartCurrency ? cartCurrency : "sats";
          const orderAmount =
            sellerAmountNative !== null
              ? String(Math.round(sellerAmountNative * 100) / 100)
              : String(sellerAmountSats || price);
          const sellerSubFrequencies = sellerProducts
            .map((p: any) => subscriptionSelections[p.id])
            .filter((s: any) => s?.enabled)
            .map((s: any) => s.frequency);
          const sellerSubFrequency =
            sellerSubFrequencies.length > 0
              ? sellerSubFrequencies[0]
              : undefined;
          return {
            orderId: "",
            productTitle: sellerProductTitles,
            amount: orderAmount,
            currency: orderCurrency,
            paymentMethod: paymentType || "lightning",
            sellerPubkey,
            buyerName: paymentData.shippingName || undefined,
            shippingAddress: emailAddressTag,
            pickupLocation: sellerPickupSummary || undefined,
            subscriptionFrequency: sellerSubFrequency,
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
    } catch (error) {
      setFailureText("Payment failed. Please try again.");
      setShowFailureModal(true);
    }
  };

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
              shippingTotal += Math.ceil(shippingCostInSats);
            }
            sellerProducts.forEach((sp) => {
              updatedTotalCostsInSats[sp.id] = totalCostsInSats[sp.id] || 0;
            });
          } else {
            const shippingCostInSats = await convertShippingToSats(product);
            const quantity = quantities[product.id] || 1;
            const productShippingCost = Math.ceil(
              shippingCostInSats * quantity
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
                  shippingTotal += Math.ceil(shippingCostInSats);
                }
                sellerProducts.forEach((sp) => {
                  updatedTotalCostsInSats[sp.id] = totalCostsInSats[sp.id] || 0;
                });
              } else {
                const shippingCostInSats = await convertShippingToSats(product);
                const quantity = quantities[product.id] || 1;
                const productShippingCost = Math.ceil(
                  shippingCostInSats * quantity
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
      validatePaymentData(convertedPrice, data);

      const wallet = new CashuWallet(new CashuMint(mints[0]!));
      const { request: pr, quote: hash } =
        await wallet.createMintQuote(convertedPrice);

      const { nwcString } = getLocalStorageData();
      if (!nwcString) throw new Error("NWC connection not found.");

      nwc = new webln.NostrWebLNProvider({ nostrWalletConnectUrl: nwcString });
      await nwc.enable();

      await nwc.sendPayment(pr);
      await invoiceHasBeenPaid(wallet, totalCost, hash, data);
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

      const stripeAmount =
        nativeTotalCost !== null && cartCurrency
          ? nativeTotalCost
          : convertedPrice;
      const stripeCurrency =
        nativeTotalCost !== null && cartCurrency ? cartCurrency : "sats";

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
              product.selectedBulkOption
                ? {
                    size: product.selectedSize || undefined,
                    volume: product.selectedVolume || undefined,
                    weight: product.selectedWeight || undefined,
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
              const sellerTotal = sellerProducts.reduce((sum, p) => {
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
                return sum + discountedPrice * qty;
              }, 0);
              const { highestShippingCost } =
                getConsolidatedShippingForSeller(pubkey);
              return {
                sellerPubkey: pubkey,
                amount: sellerTotal + highestShippingCost,
                currency: sellerProducts[0]?.currency || "usd",
              };
            })
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

        const productAmount =
          !isSatsCart && nativeCostsPerProduct
            ? nativeCostsPerProduct[product.id] || product.price
            : totalCostsInSats[product.pubkey];
        const productCurrency =
          !isSatsCart && cartCurrency ? cartCurrency : "sats";

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
          productAmount,
          quantities[product.id] || 1,
          undefined,
          addressTag,
          selectedPickupLocations[product.id] || undefined,
          undefined,
          undefined,
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
        const productAmount =
          !isSatsCart && nativeCostsPerProduct
            ? nativeCostsPerProduct[product.id] || product.price
            : totalCostsInSats[product.id] ||
              totalCostsInSats[product.pubkey] ||
              0;
        const productCurrency =
          !isSatsCart && cartCurrency ? cartCurrency : "sats";
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
          undefined,
          undefined,
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
    setPaymentConfirmed(true);
    setOrderConfirmed(true);
    if (discountCodes) {
      Object.entries(discountCodes).forEach(([pubkey, code]) => {
        if (code) {
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
              !isSatsCart && nativeCostsPerProduct
                ? nativeCostsPerProduct[product.id] || product.price
                : totalCostsInSats[product.id] ||
                    totalCostsInSats[product.pubkey] ||
                    0,
              quantities[product.id] || 1,
              undefined,
              addressTag,
              selectedPickupLocations[product.id] || undefined,
              undefined,
              undefined,
              undefined,
              undefined,
              !isSatsCart && cartCurrency ? cartCurrency : "sats"
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
              const productAmount =
                !isSatsCart && nativeCostsPerProduct
                  ? nativeCostsPerProduct[product.id] || product.price
                  : totalCostsInSats[product.id] ||
                    totalCostsInSats[product.pubkey] ||
                    0;
              const productCurrency =
                !isSatsCart && cartCurrency ? cartCurrency : "sats";
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
            !isSatsCart && nativeCostsPerProduct
              ? nativeCostsPerProduct[product.id] || product.price
              : totalCostsInSats[product.pubkey],
            quantities[product.id] || 1,
            undefined,
            addressTag,
            selectedPickupLocations[product.id] || undefined,
            undefined,
            undefined,
            undefined,
            undefined,
            !isSatsCart && cartCurrency ? cartCurrency : "sats"
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
            const productAmount =
              !isSatsCart && nativeCostsPerProduct
                ? nativeCostsPerProduct[product.id] || product.price
                : totalCostsInSats[product.id] ||
                  totalCostsInSats[product.pubkey] ||
                  0;
            const productCurrency =
              !isSatsCart && cartCurrency ? cartCurrency : "sats";
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
              data.shippingCity || ""
            }, ${data.shippingState || ""}, ${data.shippingPostalCode || ""}, ${
              data.shippingCountry || ""
            }`
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
          },
        ];
      }

      for (const product of products) {
        await sendInquiryDM(product.pubkey, product.title);
      }

      clearPurchasedFromCart();
      setPaymentConfirmed(true);
      setOrderConfirmed(true);
      if (discountCodes) {
        Object.entries(discountCodes).forEach(([pubkey, code]) => {
          if (code) {
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
      await invoiceHasBeenPaid(wallet, totalCost, hash, data);
    } catch (error) {
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
    const maxRetries = 30; // Maximum 30 retries (about 1 minute)

    while (retryCount < maxRetries) {
      try {
        // First check if the quote has been paid
        const quoteState = await wallet.checkMintQuote(hash);

        if (quoteState.state === "PAID") {
          // Quote is paid, try to mint proofs
          try {
            const proofs = await wallet.mintProofs(convertedPrice, hash);
            if (proofs && proofs.length > 0) {
              await sendTokens(wallet, proofs, data);
              clearPurchasedFromCart();
              setPaymentConfirmed(true);
              if (discountCodes) {
                Object.entries(discountCodes).forEach(([pubkey, code]) => {
                  if (code) {
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
              // Quote was already processed, consider it successful
              clearPurchasedFromCart();
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
        } else if (quoteState.state === "UNPAID") {
          // Quote not paid yet, continue waiting
          retryCount++;
          await new Promise((resolve) => setTimeout(resolve, 2100));
          continue;
        } else if (quoteState.state === "ISSUED") {
          // Quote was already processed successfully
          clearPurchasedFromCart();
          setPaymentConfirmed(true);
          setQrCodeUrl(null);
          setFailureText(
            "Payment was received but your connection dropped! Please check your wallet balance."
          );
          setShowFailureModal(true);
          break;
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
          break;
        }

        // If we've exceeded max retries, show error
        if (retryCount >= maxRetries) {
          setShowInvoiceCard(false);
          setInvoice("");
          setQrCodeUrl(null);
          if (setInvoiceGenerationFailed) {
            setInvoiceGenerationFailed(true);
          } else {
            setFailureText(
              "Payment timed out! Please check your wallet balance or try again."
            );
            setShowFailureModal(true);
          }
          break;
        }

        await new Promise((resolve) => setTimeout(resolve, 2100));
      }
    }
  }

  const sendTokens = async (
    wallet: CashuWallet,
    proofs: Proof[],
    data: any
  ) => {
    let remainingProofs = proofs;

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

    for (const product of products) {
      const title = product.title;
      const pubkey = product.pubkey;
      const required = product.required;
      const tokenAmount = totalCostsInSats[pubkey];
      let sellerToken;
      let donationToken;
      let beefDonationToken;
      const sellerProfile = profileContext.profileData.get(pubkey);
      const donationPercentage =
        sellerProfile?.content?.shopstr_donation || 2.1;
      const beefDonationPercentage = product.beefinit_donation_percentage || 0;

      const donationAmount = Math.ceil(
        (tokenAmount! * donationPercentage) / 100
      );
      const beefDonationAmount =
        beefDonationPercentage > 0
          ? Math.ceil((tokenAmount! * beefDonationPercentage) / 100)
          : 0;

      const sellerAmount = tokenAmount! - donationAmount - beefDonationAmount;
      let sellerProofs: Proof[] = [];
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
        return;
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
        orderInfoTags.push(["amount", tokenAmount.toString()]);
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
        const { keep, send } = await wallet.send(
          sellerAmount,
          remainingProofs,
          {
            includeFees: true,
          }
        );
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

      if (beefDonationAmount > 0) {
        const { keep, send } = await wallet.send(
          beefDonationAmount,
          remainingProofs,
          {
            includeFees: true,
          }
        );
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
        const meltQuote = await wallet.createMeltQuote(invoicePaymentRequest);
        if (meltQuote) {
          const meltQuoteTotal = meltQuote.amount + meltQuote.fee_reserve;
          const { keep, send } = await wallet.send(
            meltQuoteTotal,
            sellerProofs,
            {
              includeFees: true,
            }
          );
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
              pickupLocationForLightning || undefined
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
                  orderKeys
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
                pickupLocation || undefined
              );
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
            !isSatsCart && cartCurrency ? cartCurrency : undefined
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
            product,
            false,
            false,
            true
          );
          await new Promise((resolve) => setTimeout(resolve, 500));
        } catch (error) {
          console.error("Failed to send donation message:", error);
        }
      }

      // Step 2.5: Send beef donation if applicable
      if (beefDonationToken && beefDonationAmount > 0) {
        const beefInitNpub = process.env.NEXT_PUBLIC_BEEF_INITIATIVE_NPUB || "";
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
                const meltQuote = await wallet.createMeltQuote(
                  invoice.paymentRequest
                );
                if (meltQuote) {
                  const meltQuoteTotal =
                    meltQuote.amount + meltQuote.fee_reserve;
                  const { send } = await wallet.send(
                    meltQuoteTotal,
                    beefDonationProofs,
                    {
                      includeFees: true,
                    }
                  );
                  const meltResponse = await wallet.meltProofs(meltQuote, send);
                  if (meltResponse.quote) {
                    beefPaidViaLightning = true;
                  }
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
              await sendPaymentAndContactMessage(
                beefInitHex,
                beefDonationMessage,
                product,
                false,
                false,
                true
              );
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
              !isSatsCart && cartCurrency ? cartCurrency : undefined
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
            !isSatsCart && cartCurrency ? cartCurrency : undefined
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
          !isSatsCart && cartCurrency ? cartCurrency : undefined
        );
      }
    }
  };

  const handleCopyInvoice = () => {
    navigator.clipboard.writeText(invoice);
    setCopiedToClipboard(true);
    setTimeout(() => {
      setCopiedToClipboard(false);
    }, 2100);
  };

  const convertShippingToSats = async (
    product: ProductData
  ): Promise<number> => {
    const shippingCost = product.shippingCost || 0;

    if (
      product.currency.toLowerCase() === "sats" ||
      product.currency.toLowerCase() === "sat"
    ) {
      return shippingCost;
    }

    if (product.currency.toLowerCase() === "btc") {
      return shippingCost * 100000000;
    }

    try {
      const currencyData = {
        amount: shippingCost,
        currency: product.currency,
      };
      const { fiat } = await import("@getalby/lightning-tools");
      const numSats = await fiat.getSatoshiValue(currencyData);
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
      const sellersSeen = new Set<string>();
      products.forEach((product) => {
        if (sellersSeen.has(product.pubkey)) return;
        sellersSeen.add(product.pubkey);
        if (sellerFreeShippingStatus[product.pubkey]?.qualifies) return;
        const sellerProducts = products.filter(
          (p) => p.pubkey === product.pubkey
        );
        if (sellerProducts.length > 1) {
          const { highestShippingCost } = getConsolidatedShippingForSeller(
            product.pubkey
          );
          nativeShipping += highestShippingCost;
        } else {
          nativeShipping +=
            (product.shippingCost || 0) * (quantities[product.id] || 1);
        }
      });
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

  const bitcoinDiscountPct = pmDiscounts["bitcoin"] || 0;
  const stripeDiscountPct = pmDiscounts["stripe"] || 0;

  const getDiscountLabel = (pct: number) => {
    if (pct <= 0) return "";
    return ` (${pct}% off)`;
  };

  const formatCartMethodCost = (
    native: number | null,
    sats: number,
    mode: "lightning" | "card"
  ) => {
    if (mode === "lightning") {
      return native !== null && cartCurrency
        ? `${formatWithCommas(native, cartCurrency)} (≈ ${formatWithCommas(
            sats,
            "sats"
          )})`
        : formatWithCommas(sats, "sats");
    }
    if (native !== null && cartCurrency) {
      return formatWithCommas(native, cartCurrency);
    }
    if (usdEstimate != null && totalCost > 0) {
      const ratio = sats / totalCost;
      const methodUsd = Math.round(usdEstimate * ratio * 100) / 100;
      return `${formatWithCommas(sats, "sats")} (≈ ${formatWithCommas(
        methodUsd,
        "USD"
      )})`;
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
    "card"
  );

  const getFormattedFiatCost = (fiatKey: string) => {
    const costs = getFiatMethodCosts(fiatKey);
    return formatCartMethodCost(costs.nativeTotal, costs.satsTotal, "card");
  };

  const handleCashuPayment = async (price: number, data: any) => {
    try {
      if (!mints || mints.length === 0) {
        throw new Error("No Cashu mint available");
      }

      if (!walletContext) {
        throw new Error("Wallet context not available");
      }

      validatePaymentData(price, data);

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
      await sendTokens(wallet, send, data);
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
      clearPurchasedFromCart();
      setOrderConfirmed(true);
      setPaymentConfirmed(true);
      if (setCashuPaymentSent) {
        setCashuPaymentSent(true);
      }
    } catch (error) {
      if (setCashuPaymentFailed) {
        setCashuPaymentFailed(true);
      } else {
        setFailureText("Cashu payment failed. Please try again.");
        setShowFailureModal(true);
      }
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
                      className="rounded-md border-2 border-black bg-white shadow-neo"
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
                        <SelectItem key={location} value={location}>
                          {location}
                        </SelectItem>
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
      <div className="flex min-h-screen w-full bg-white text-black">
        <div className="mx-auto flex w-full flex-col lg:flex-row">
          {/* Order Summary - Full width on mobile, half on desktop */}
          <div className="w-full bg-white p-6 lg:w-1/2">
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
                          ?.shopstr_donation || 0;
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
                      const shippingLines: {
                        pubkey: string;
                        name: string;
                        cost: number;
                        currency: string;
                        isFree: boolean;
                      }[] = [];
                      products.forEach((product) => {
                        if (sellersSeen.has(product.pubkey)) return;
                        sellersSeen.add(product.pubkey);
                        const freeStatus =
                          sellerFreeShippingStatus[product.pubkey];
                        if (freeStatus?.qualifies) {
                          const {
                            highestShippingCost,
                            highestShippingProduct,
                          } = getConsolidatedShippingForSeller(product.pubkey);
                          shippingLines.push({
                            pubkey: product.pubkey,
                            name: freeStatus.sellerName,
                            cost: highestShippingCost,
                            currency:
                              highestShippingProduct?.currency ||
                              product.currency,
                            isFree: true,
                          });
                        } else {
                          const sellerProducts = products.filter(
                            (p) => p.pubkey === product.pubkey
                          );
                          if (sellerProducts.length > 1) {
                            const {
                              highestShippingCost,
                              highestShippingProduct,
                            } = getConsolidatedShippingForSeller(
                              product.pubkey
                            );
                            if (highestShippingCost > 0) {
                              shippingLines.push({
                                pubkey: product.pubkey,
                                name:
                                  shopProfiles?.get(product.pubkey)?.content
                                    ?.name || product.pubkey.substring(0, 8),
                                cost: highestShippingCost,
                                currency:
                                  highestShippingProduct?.currency ||
                                  product.currency,
                                isFree: false,
                              });
                            }
                          } else if (
                            product.shippingCost &&
                            product.shippingCost > 0
                          ) {
                            shippingLines.push({
                              pubkey: product.pubkey,
                              name:
                                shopProfiles?.get(product.pubkey)?.content
                                  ?.name || product.pubkey.substring(0, 8),
                              cost:
                                product.shippingCost *
                                (quantities[product.id] || 1),
                              currency: product.currency,
                              isFree: false,
                            });
                          }
                        }
                      });
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
                              {line.isFree ? (
                                <span className="flex items-center gap-2">
                                  <span className="text-gray-400 line-through">
                                    {formatWithCommas(line.cost, line.currency)}
                                  </span>
                                  <span className="rounded-full border border-green-300 bg-green-100 px-2 py-0.5 text-xs font-bold text-green-700">
                                    Free
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
                  <div className="flex justify-between border-t pt-2 font-semibold">
                    <span>Total:</span>
                    <span>
                      {nativeTotalCost !== null && cartCurrency ? (
                        <>
                          {formatWithCommas(nativeTotalCost, cartCurrency)}
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
      <div className="mx-auto flex w-full flex-col lg:flex-row">
        {/* Order Summary - Full width on mobile, half on desktop */}
        <div className="w-full bg-white p-6 lg:w-1/2">
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
                        ?.shopstr_donation || 0;
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
                    const shippingLines2: {
                      pubkey: string;
                      name: string;
                      cost: number;
                      currency: string;
                      isFree: boolean;
                    }[] = [];
                    products.forEach((product) => {
                      if (sellersSeen2.has(product.pubkey)) return;
                      sellersSeen2.add(product.pubkey);
                      const freeStatus =
                        sellerFreeShippingStatus[product.pubkey];
                      if (freeStatus?.qualifies) {
                        const { highestShippingCost, highestShippingProduct } =
                          getConsolidatedShippingForSeller(product.pubkey);
                        shippingLines2.push({
                          pubkey: product.pubkey,
                          name: freeStatus.sellerName,
                          cost: highestShippingCost,
                          currency:
                            highestShippingProduct?.currency ||
                            product.currency,
                          isFree: true,
                        });
                      } else {
                        const sellerProducts = products.filter(
                          (p) => p.pubkey === product.pubkey
                        );
                        if (sellerProducts.length > 1) {
                          const {
                            highestShippingCost,
                            highestShippingProduct,
                          } = getConsolidatedShippingForSeller(product.pubkey);
                          if (highestShippingCost > 0) {
                            shippingLines2.push({
                              pubkey: product.pubkey,
                              name:
                                shopProfiles?.get(product.pubkey)?.content
                                  ?.name || product.pubkey.substring(0, 8),
                              cost: highestShippingCost,
                              currency:
                                highestShippingProduct?.currency ||
                                product.currency,
                              isFree: false,
                            });
                          }
                        } else if (
                          product.shippingCost &&
                          product.shippingCost > 0
                        ) {
                          shippingLines2.push({
                            pubkey: product.pubkey,
                            name:
                              shopProfiles?.get(product.pubkey)?.content
                                ?.name || product.pubkey.substring(0, 8),
                            cost:
                              product.shippingCost *
                              (quantities[product.id] || 1),
                            currency: product.currency,
                            isFree: false,
                          });
                        }
                      }
                    });
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
                            {line.isFree ? (
                              <span className="flex items-center gap-2">
                                <span className="text-gray-400 line-through">
                                  {formatWithCommas(line.cost, line.currency)}
                                </span>
                                <span className="rounded-full border border-green-300 bg-green-100 px-2 py-0.5 text-xs font-bold text-green-700">
                                  Free
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
                <div className="flex justify-between border-t pt-2 font-semibold">
                  <span>Total:</span>
                  <span>
                    {nativeTotalCost !== null && cartCurrency ? (
                      <>
                        {formatWithCommas(nativeTotalCost, cartCurrency)}
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
        <div className="w-full p-6 lg:w-1/2">
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
                      className="w-full transform rounded-md border-2 border-black bg-white p-4 text-left shadow-neo transition-transform hover:-translate-y-0.5 active:translate-y-0.5"
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
                      className="w-full transform rounded-md border-2 border-black bg-white p-4 text-left shadow-neo transition-transform hover:-translate-y-0.5 active:translate-y-0.5"
                    >
                      <div className="font-medium">Free or added shipping</div>
                      <div className="text-sm text-gray-500">
                        Get products shipped to your address
                      </div>
                    </button>
                    <button
                      onClick={() => handleOrderTypeSelection("contact")}
                      className="w-full transform rounded-md border-2 border-black bg-white p-4 text-left shadow-neo transition-transform hover:-translate-y-0.5 active:translate-y-0.5"
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
                    className="w-full transform rounded-md border-2 border-black bg-white p-4 text-left shadow-neo transition-transform hover:-translate-y-0.5 active:translate-y-0.5"
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
                    className="w-full transform rounded-md border-2 border-black bg-white p-4 text-left shadow-neo transition-transform hover:-translate-y-0.5 active:translate-y-0.5"
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
                              shippingTotal += Math.ceil(shippingCostInSats);
                            }
                          } else {
                            const shippingCostInSats =
                              await convertShippingToSats(product);
                            const quantity = quantities[product.id] || 1;
                            shippingTotal += Math.ceil(
                              shippingCostInSats * quantity
                            );
                          }
                        }
                      }
                    }

                    setTotalCost(subtotalCost + shippingTotal);
                  }}
                  className={`w-full transform rounded-md border-2 border-black p-4 text-left shadow-neo transition-transform hover:-translate-y-0.5 active:translate-y-0.5 ${
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
                              shippingTotal += Math.ceil(shippingCostInSats);
                            }
                          } else {
                            const shippingCostInSats =
                              await convertShippingToSats(product);
                            const quantity = quantities[product.id] || 1;
                            shippingTotal += Math.ceil(
                              shippingCostInSats * quantity
                            );
                          }
                        }
                      }
                    }

                    setTotalCost(subtotalCost + shippingTotal);
                  }}
                  className={`w-full transform rounded-md border-2 border-black p-4 text-left shadow-neo transition-transform hover:-translate-y-0.5 active:translate-y-0.5 ${
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
                            <SelectItem key={location} value={location}>
                              {location}
                            </SelectItem>
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
                className="space-y-6"
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
                        className={`${BLUEBUTTONCLASSNAMES} w-full ${
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
                          className={`${BLUEBUTTONCLASSNAMES} w-full ${
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

                      {nwcInfo && (
                        <Button
                          className={`${BLUEBUTTONCLASSNAMES} w-full ${
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

                  {((isSingleSeller && isStripeMerchant) ||
                    (!isSingleSeller && allSellersHaveStripe)) && (
                    <Button
                      className={`w-full rounded-md border-2 border-black bg-black px-4 py-2 font-bold text-white shadow-neo transition-transform hover:-translate-y-0.5 active:translate-y-0.5 ${
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
                      startContent={<CurrencyDollarIcon className="h-6 w-6" />}
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
                        className={`w-full rounded-md border-2 border-black bg-black px-4 py-2 font-bold text-white shadow-neo transition-transform hover:-translate-y-0.5 active:translate-y-0.5 ${
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
                          <CurrencyDollarIcon className="h-6 w-6" />
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
                            "card"
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
                    <div className="mb-4 rounded-md border-2 border-black bg-gray-50 p-4 shadow-neo">
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
                        className="rounded-md border-2 border-black bg-gray-50 p-4 shadow-neo"
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
                className="rounded-md border-2 border-black bg-white px-6 py-2 font-bold text-black shadow-neo transition-transform hover:-translate-y-0.5 active:translate-y-0.5"
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
                className={`rounded-md border-2 border-black bg-black px-6 py-2 font-bold text-white shadow-neo transition-transform hover:-translate-y-0.5 active:translate-y-0.5 ${
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
                className={`rounded-md border-2 border-black bg-black px-6 py-2 font-bold text-white shadow-neo transition-transform hover:-translate-y-0.5 active:translate-y-0.5 ${
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
    </div>
  );
}
