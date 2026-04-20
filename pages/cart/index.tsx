/* eslint-disable @next/next/no-img-element */

import { useContext, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";
import Link from "next/link";
import {
  Button,
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  Input,
  Select,
  SelectItem,
} from "@heroui/react";
import {
  PlusIcon,
  MinusIcon,
  ShoppingBagIcon,
  XCircleIcon,
  InformationCircleIcon,
  TruckIcon,
  ArrowPathIcon,
} from "@heroicons/react/24/outline";
import {
  BLUEBUTTONCLASSNAMES,
  ShippingOptionsType,
} from "@/utils/STATIC-VARIABLES";
import { ProductData } from "@/utils/parsers/product-parser-functions";
import CartInvoiceCard from "../../components/cart-invoice-card";
import { getSatoshiValue, getFiatValue } from "@getalby/lightning-tools";
import currencySelection from "../../public/currencySelection.json";
import { ShopMapContext, ProfileMapContext } from "@/utils/context/context";
import { nip19 } from "nostr-tools";
import StorefrontThemeWrapper from "@/components/storefront/storefront-theme-wrapper";
import ProtectedRoute from "@/components/utility-components/protected-route";
import { getLocalStorageJson } from "@/utils/safe-json";
import { CartDiscountsMap, isCartDiscountsMap } from "@/utils/cart-discounts";

interface QuantitySelectorProps {
  value: number;
  onDecrease: () => void;
  onIncrease: () => void;
  onChange: (newValue: number) => void;
  min: number;
  max: number;
}

function QuantitySelector({
  value,
  onDecrease,
  onIncrease,
  onChange,
  min,
  max,
}: QuantitySelectorProps) {
  return (
    <div className="mt-2 flex items-center space-x-2">
      <button
        onClick={onDecrease}
        disabled={value <= min}
        className="flex h-8 w-8 items-center justify-center rounded-md border-2 border-black bg-white text-black transition-colors hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <MinusIcon className="h-4 w-4" />
      </button>
      <input
        type="number"
        value={value}
        onChange={(e) => {
          const newVal = parseInt(e.target.value) || min;
          onChange(Math.min(Math.max(newVal, min), max));
        }}
        min={min}
        max={max}
        className="w-16 rounded-md border-2 border-black bg-white px-2 py-1 text-center font-semibold text-black outline-none [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
      />
      <button
        onClick={onIncrease}
        disabled={value >= max}
        className="flex h-8 w-8 items-center justify-center rounded-md border-2 border-black bg-white text-black transition-colors hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <PlusIcon className="h-4 w-4" />
      </button>
    </div>
  );
}

const FREQUENCY_LABELS: Record<string, string> = {
  weekly: "Weekly",
  every_2_weeks: "Every 2 Weeks",
  monthly: "Monthly",
  every_2_months: "Every 2 Months",
  quarterly: "Quarterly",
};

export interface SubscriptionSelection {
  enabled: boolean;
  frequency: string;
}

export default function Component() {
  const shopContext = useContext(ShopMapContext);
  const profileContext = useContext(ProfileMapContext);

  const [sfSellerPubkey, setSfSellerPubkey] = useState("");
  const [sfShopSlug, setSfShopSlug] = useState("");

  useEffect(() => {
    const stored = sessionStorage.getItem("sf_seller_pubkey");
    if (stored) setSfSellerPubkey(stored);
    const storedSlug = sessionStorage.getItem("sf_shop_slug");
    if (storedSlug) setSfShopSlug(storedSlug);
  }, []);

  const [products, setProducts] = useState<ProductData[]>([]);
  const [satPrices, setSatPrices] = useState<{ [key: string]: number | null }>(
    {}
  );
  const [totalCostsInSats, setTotalCostsInSats] = useState<{
    [key: string]: number;
  }>({});
  const [subtotal, setSubtotal] = useState<number>(0);
  const [subtotalNative, setSubtotalNative] = useState<number>(0);
  const [cartCurrency, setCartCurrency] = useState<string | null>(null);
  const [shippingTypes, setShippingTypes] = useState<{
    [key: string]: ShippingOptionsType;
  }>({});
  const [subscriptionSelections, setSubscriptionSelections] = useState<{
    [productId: string]: SubscriptionSelection;
  }>({});

  // Initialize quantities state
  const initializeQuantities = (products: ProductData[]) => {
    const initialQuantities: { [key: string]: number } = {};
    products.forEach((product) => {
      initialQuantities[product.id] = 1;
    });
    return initialQuantities;
  };

  // Use the initialized quantities
  const [quantities, setQuantities] = useState<{ [key: string]: number }>(() =>
    initializeQuantities(products)
  );
  const [hasReachedMax, setHasReachedMax] = useState<{
    [key: string]: boolean;
  }>(Object.fromEntries(products.map((product) => [product.id, false])));
  const [isBeingPaid, setIsBeingPaid] = useState(false);

  const [invoiceIsPaid, setInvoiceIsPaid] = useState(false);
  const [invoiceGenerationFailed, setInvoiceGenerationFailed] = useState(false);
  const [cashuPaymentSent, setCashuPaymentSent] = useState(false);
  const [cashuPaymentFailed, setCashuPaymentFailed] = useState(false);

  const [discountCodes, setDiscountCodes] = useState<{
    [pubkey: string]: string;
  }>({});
  const [appliedDiscounts, setAppliedDiscounts] = useState<{
    [pubkey: string]: number;
  }>({});
  const [discountErrors, setDiscountErrors] = useState<{
    [pubkey: string]: string;
  }>({});
  const [isValidatingDiscounts, setIsValidatingDiscounts] = useState(false);

  type AffiliateMeta = {
    code: string;
    codeId: number;
    affiliateId: number;
    rebateType: "percent" | "fixed";
    rebateValue: number;
  };
  const [affiliateMetaBySeller, setAffiliateMetaBySeller] = useState<{
    [pubkey: string]: AffiliateMeta;
  }>({});

  const [sellerStripeStatus, setSellerStripeStatus] = useState<
    Record<string, boolean>
  >({});
  const [sellerStripeLoading, setSellerStripeLoading] = useState(false);

  const uniqueSellerPubkeys = useMemo(() => {
    return [...new Set(products.map((p) => p.pubkey))];
  }, [products]);

  const sellerPubkeyKey = useMemo(
    () => uniqueSellerPubkeys.sort().join(","),
    [uniqueSellerPubkeys]
  );

  useEffect(() => {
    if (uniqueSellerPubkeys.length === 0) {
      setSellerStripeStatus({});
      setSellerStripeLoading(false);
      return;
    }
    let cancelled = false;
    setSellerStripeLoading(true);
    const checkSellers = async () => {
      const statuses: Record<string, boolean> = {};
      for (const pubkey of uniqueSellerPubkeys) {
        if (cancelled) return;
        if (pubkey === process.env.NEXT_PUBLIC_MILK_MARKET_PK) {
          statuses[pubkey] = true;
          continue;
        }
        try {
          const res = await fetch("/api/stripe/connect/seller-status", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ pubkey }),
          });
          if (cancelled) return;
          if (res.ok) {
            const data = await res.json();
            statuses[pubkey] = !!(data.hasStripeAccount && data.chargesEnabled);
          } else {
            statuses[pubkey] = false;
          }
        } catch {
          if (cancelled) return;
          statuses[pubkey] = false;
        }
      }
      if (!cancelled) {
        setSellerStripeStatus(statuses);
        setSellerStripeLoading(false);
      }
    };
    checkSellers();
    return () => {
      cancelled = true;
    };
  }, [sellerPubkeyKey]);

  const allSellersHaveStripe = useMemo(() => {
    if (uniqueSellerPubkeys.length === 0) return false;
    return uniqueSellerPubkeys.every((pk) => sellerStripeStatus[pk] === true);
  }, [uniqueSellerPubkeys, sellerStripeStatus]);

  const hasActiveSubscription = useMemo(() => {
    return products.some((p) => subscriptionSelections[p.id]?.enabled);
  }, [products, subscriptionSelections]);

  const sellerStatusKnown = useMemo(() => {
    if (sellerStripeLoading) return false;
    return uniqueSellerPubkeys.every((pk) => pk in sellerStripeStatus);
  }, [sellerStripeLoading, uniqueSellerPubkeys, sellerStripeStatus]);

  const hasSubscriptionStripeConflict = useMemo(() => {
    if (!hasActiveSubscription) return false;
    if (!sellerStatusKnown) return false;
    if (uniqueSellerPubkeys.length <= 1) {
      const pk = uniqueSellerPubkeys[0];
      return pk ? sellerStripeStatus[pk] === false : false;
    }
    return !allSellersHaveStripe;
  }, [
    hasActiveSubscription,
    sellerStatusKnown,
    uniqueSellerPubkeys,
    sellerStripeStatus,
    allSellersHaveStripe,
  ]);

  // Group products by seller pubkey
  const productsBySeller = products.reduce(
    (acc, product) => {
      if (!acc[product.pubkey]) {
        acc[product.pubkey] = [];
      }
      acc[product.pubkey]!.push(product);
      return acc;
    },
    {} as { [pubkey: string]: ProductData[] }
  );

  const getSellerName = (pubkey: string): string => {
    const shopProfile = shopContext.shopData.get(pubkey);
    if (shopProfile?.content?.name) return shopProfile.content.name;
    const profile = profileContext.profileData.get(pubkey);
    if (profile?.content?.name) return profile.content.name;
    return nip19.npubEncode(pubkey).slice(0, 12) + "...";
  };

  const getSellerNpub = (pubkey: string): string => {
    return nip19.npubEncode(pubkey);
  };

  const getSellerSubtotalInCurrency = (sellerPubkey: string): number => {
    const sellerProducts = productsBySeller[sellerPubkey] || [];
    let total = 0;
    for (const product of sellerProducts) {
      const basePrice =
        product.bulkPrice !== undefined
          ? product.bulkPrice
          : product.weightPrice !== undefined
            ? product.weightPrice
            : product.volumePrice !== undefined
              ? product.volumePrice
              : product.price;
      const qty = quantities[product.id] || 1;
      const discount = appliedDiscounts[product.pubkey] || 0;
      const discountedPrice =
        discount > 0 ? basePrice * (1 - discount / 100) : basePrice;
      total += discountedPrice * qty;
    }
    return total;
  };

  const router = useRouter();

  // Once payment lands, let the inline "Payment confirmed!" indicator play
  // through once and then push straight to the order summary page. Avoids
  // the prior friction of a "click X to dismiss" success modal.
  useEffect(() => {
    if (!invoiceIsPaid && !cashuPaymentSent) return;
    const timer = setTimeout(() => {
      setInvoiceIsPaid(false);
      setCashuPaymentSent(false);
      if (sfSellerPubkey && sfShopSlug) {
        router.push(`/shop/${sfShopSlug}/order-confirmation`);
      } else {
        router.push("/order-summary");
      }
    }, 2500);
    return () => clearTimeout(timer);
  }, [invoiceIsPaid, cashuPaymentSent, sfSellerPubkey, sfShopSlug, router]);

  const [excludedItemCount, setExcludedItemCount] = useState(0);

  useEffect(() => {
    let isCancelled = false;

    const loadCart = async () => {
      if (typeof window === "undefined") {
        return;
      }

      const sfPk =
        sessionStorage.getItem("sf_seller_pubkey") ||
        localStorage.getItem("sf_seller_pubkey") ||
        "";
      const fullCart = getLocalStorageJson<ProductData[]>("cart", [], {
        removeOnError: true,
        validate: Array.isArray,
      });

      let cartList = fullCart;
      if (sfPk) {
        const filtered = fullCart.filter((item) => item.pubkey === sfPk);
        if (!isCancelled) {
          setExcludedItemCount(fullCart.length - filtered.length);
        }
        cartList = filtered;
      }

      if (!isCancelled && cartList.length > 0) {
        setProducts(cartList);
        const initialSubSelections: {
          [productId: string]: SubscriptionSelection;
        } = {};
        for (const item of cartList as ProductData[]) {
          if (item.selectedQuantity) {
            setQuantities((prev) => ({
              ...prev,
              [item.id]: item.selectedQuantity || 1,
            }));
          }
          if (
            item.subscriptionEnabled &&
            item.subscriptionFrequency &&
            item.subscriptionFrequency.length > 0
          ) {
            initialSubSelections[item.id] = {
              enabled: true,
              frequency: item.subscriptionFrequency[0]!,
            };
          }
        }
        setSubscriptionSelections(initialSubSelections);
      }

      if (cartList.length === 0) {
        return;
      }

      const discounts = getLocalStorageJson<CartDiscountsMap>(
        "cartDiscounts",
        {},
        {
          removeOnError: true,
          removeOnValidationError: true,
          validate: isCartDiscountsMap,
        }
      );

      if (Object.keys(discounts).length === 0) {
        return;
      }

      if (!isCancelled) {
        setIsValidatingDiscounts(true);
      }

      const validatedDiscounts = await Promise.all(
        Object.entries(discounts).map(async ([pubkey, data]) => {
          if (!data || typeof data !== "object") return null;

          const code = (data as { code?: unknown }).code;
          if (typeof code !== "string" || !code.trim()) return null;

          try {
            const response = await fetch(
              `/api/db/discount-codes?validate=true&code=${encodeURIComponent(
                code
              )}&pubkey=${pubkey}`
            );

            if (!response.ok) {
              console.warn(
                `Could not verify discount code for ${pubkey} (server error ${response.status}); keeping for next load.`
              );
              return { pubkey, code, percentage: null as null };
            }

            const result = await response.json();
            if (
              result.valid &&
              typeof result.discount_percentage === "number" &&
              result.discount_percentage > 0
            ) {
              return { pubkey, code, percentage: result.discount_percentage };
            }

            return null;
          } catch (error) {
            console.error(
              `Network error revalidating discount code for ${pubkey}; keeping for next load.`,
              error
            );
            return { pubkey, code, percentage: null as null };
          }
        })
      );

      if (isCancelled) {
        return;
      }

      const codes: { [pubkey: string]: string } = {};
      const applied: { [pubkey: string]: number } = {};
      const refreshedDiscounts: CartDiscountsMap = {};

      validatedDiscounts.forEach((entry) => {
        if (!entry) return;

        refreshedDiscounts[entry.pubkey] = { code: entry.code };

        if (entry.percentage !== null) {
          codes[entry.pubkey] = entry.code;
          applied[entry.pubkey] = entry.percentage;
        }
      });

      setDiscountCodes(codes);
      setAppliedDiscounts(applied);
      setIsValidatingDiscounts(false);

      if (Object.keys(refreshedDiscounts).length > 0) {
        localStorage.setItem(
          "cartDiscounts",
          JSON.stringify(refreshedDiscounts)
        );
      } else {
        localStorage.removeItem("cartDiscounts");
      }
    };

    loadCart();

    return () => {
      isCancelled = true;
    };
  }, []);

  useEffect(() => {
    const fetchSatPrices = async () => {
      const prices: { [key: string]: number | null } = {};
      const shipping: { [key: string]: number } = {};
      const totals: { [key: string]: number } = {};
      let subtotalAmount = 0;
      let nativeSubtotal = 0;

      const currencyCounts: { [key: string]: number } = {};
      products.forEach((p) => {
        const c = p.currency.toUpperCase();
        currencyCounts[c] = (currencyCounts[c] || 0) + 1;
      });
      let commonCurrency: string | null = null;
      let maxCount = 0;
      for (const [cur, count] of Object.entries(currencyCounts)) {
        if (
          count > maxCount ||
          (count === maxCount &&
            commonCurrency &&
            (cur === "USD"
              ? true
              : commonCurrency === "USD"
                ? false
                : cur === "SATS" || cur === "SAT"
                  ? true
                  : cur < commonCurrency))
        ) {
          maxCount = count;
          commonCurrency = cur;
        }
      }
      const originalCurrency = commonCurrency
        ? products.find((p) => p.currency.toUpperCase() === commonCurrency)
            ?.currency || commonCurrency
        : null;

      for (const product of products) {
        try {
          const priceSats = await convertPriceToSats(product);
          const shippingSatPrice = await convertShippingToSats(product);
          const discount = appliedDiscounts[product.pubkey] || 0;
          let discountedPrice = priceSats;
          let productSubtotal = 0;
          let productShipping = 0;

          const basePrice =
            product.bulkPrice !== undefined
              ? product.bulkPrice
              : product.weightPrice !== undefined
                ? product.weightPrice
                : product.volumePrice !== undefined
                  ? product.volumePrice
                  : product.price;

          if (discount > 0) {
            discountedPrice = Math.ceil(priceSats * (1 - discount / 100));
          }

          if (discountedPrice !== null || shippingSatPrice !== null) {
            const qty = quantities[product.id] || 1;
            productSubtotal = Math.ceil(discountedPrice * qty);
            productShipping = Math.ceil(shippingSatPrice * qty);
            subtotalAmount += productSubtotal;

            const nativePrice =
              discount > 0 ? basePrice * (1 - discount / 100) : basePrice;
            const productCurrencyUpper = product.currency.toUpperCase();
            const cartCurrencyUpper = commonCurrency || "";
            if (productCurrencyUpper === cartCurrencyUpper) {
              nativeSubtotal += nativePrice * qty;
            } else if (
              cartCurrencyUpper === "SATS" ||
              cartCurrencyUpper === "SAT"
            ) {
              nativeSubtotal += priceSats * qty;
            } else if (
              productCurrencyUpper === "SATS" ||
              productCurrencyUpper === "SAT"
            ) {
              try {
                const fiatVal = await getFiatValue({
                  satoshi: Math.ceil(nativePrice * qty),
                  currency: cartCurrencyUpper,
                });
                nativeSubtotal += fiatVal;
              } catch {
                nativeSubtotal += nativePrice * qty;
              }
            } else {
              try {
                const satVal = await getSatoshiValue({
                  amount: nativePrice * qty,
                  currency: product.currency,
                });
                const fiatVal = await getFiatValue({
                  satoshi: Math.ceil(satVal),
                  currency: cartCurrencyUpper,
                });
                nativeSubtotal += fiatVal;
              } catch {
                nativeSubtotal += nativePrice * qty;
              }
            }
            prices[product.id] = productSubtotal;
            shipping[product.id] = productShipping;
            totals[product.pubkey] = productSubtotal;
          }
        } catch (error) {
          console.error(
            `Error converting price for product ${product.id}:`,
            error
          );
          prices[product.id] = null;
          shipping[product.id] = 0;
        }
      }

      setSatPrices(prices);
      setSubtotal(subtotalAmount);
      setSubtotalNative(Math.ceil(nativeSubtotal * 100) / 100);
      setCartCurrency(originalCurrency);
      setTotalCostsInSats(totals);
    };

    fetchSatPrices();
  }, [products, quantities, appliedDiscounts]);

  useEffect(() => {
    if (typeof document === "undefined") return;
    if (uniqueSellerPubkeys.length === 0) return;
    const m = document.cookie.match(/(?:^|; )mm_aff_ref=([^;]*)/);
    if (!m) return;
    const code = decodeURIComponent(m[1]!);
    if (!code) return;
    let cancelled = false;
    (async () => {
      for (const pubkey of uniqueSellerPubkeys) {
        if (cancelled) return;
        if (discountCodes[pubkey] || affiliateMetaBySeller[pubkey]) continue;
        try {
          const res = await fetch(
            `/api/affiliates/validate?sellerPubkey=${pubkey}&code=${encodeURIComponent(
              code
            )}`
          );
          if (!res.ok) continue;
          const aff = await res.json();
          if (!aff?.valid) continue;
          let percent = 0;
          if (aff.buyerDiscountType === "percent") {
            percent = Number(aff.buyerDiscountValue) || 0;
          } else if (aff.buyerDiscountType === "fixed") {
            const sub = getSellerSubtotalInCurrency(pubkey);
            if (sub > 0) {
              percent = Math.min(
                100,
                (Number(aff.buyerDiscountValue) / sub) * 100
              );
            }
          }
          if (cancelled) return;
          setDiscountCodes((p) => ({ ...p, [pubkey]: code }));
          setAppliedDiscounts((p) => ({ ...p, [pubkey]: percent }));
          setAffiliateMetaBySeller((p) => ({
            ...p,
            [pubkey]: {
              code,
              codeId: aff.codeId,
              affiliateId: aff.affiliateId,
              rebateType: aff.rebateType,
              rebateValue: Number(aff.rebateValue) || 0,
            },
          }));
        } catch {}
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sellerPubkeyKey]);

  useEffect(() => {
    const shippingTypeMap: { [key: string]: ShippingOptionsType } = {};
    products.forEach((product) => {
      if (product.shippingType !== undefined) {
        shippingTypeMap[product.id] = product.shippingType;
      }
    });
    setShippingTypes(shippingTypeMap);
  }, [products]);

  const toggleCheckout = () => {
    setIsBeingPaid(!isBeingPaid);
  };

  const handleQuantityChange = (id: string, newQuantity: number) => {
    setQuantities((prev) => {
      const product = products.find((p) => p.id === id);
      if (!product || !product.quantity) return prev;
      const maxQuantity = parseInt(String(product.quantity));
      const finalQuantity = Math.min(Math.max(newQuantity, 1), maxQuantity);
      setHasReachedMax((prevState) => ({
        ...prevState,
        [id]: finalQuantity === maxQuantity && maxQuantity !== 1,
      }));
      return {
        ...prev,
        [id]: finalQuantity,
      };
    });
  };

  const handleRemoveFromCart = (productId: string) => {
    const cartContent = getLocalStorageJson<ProductData[]>("cart", [], {
      removeOnError: true,
      validate: Array.isArray,
    });
    if (cartContent.length > 0) {
      const updatedCart = cartContent.filter(
        (obj: ProductData) => obj.id !== productId
      );
      localStorage.setItem("cart", JSON.stringify(updatedCart));
      if (sfSellerPubkey) {
        setProducts(
          updatedCart.filter((p: ProductData) => p.pubkey === sfSellerPubkey)
        );
        setExcludedItemCount(
          updatedCart.filter((p: ProductData) => p.pubkey !== sfSellerPubkey)
            .length
        );
      } else {
        setProducts(updatedCart);
      }
    }
  };

  const handleApplyDiscount = async (pubkey: string) => {
    const code = discountCodes[pubkey];
    if (!code?.trim()) {
      setDiscountErrors({
        ...discountErrors,
        [pubkey]: "Please enter a discount code",
      });
      return;
    }

    try {
      const response = await fetch(
        `/api/db/discount-codes?validate=true&code=${encodeURIComponent(
          code
        )}&pubkey=${pubkey}`
      );

      if (!response.ok) {
        setDiscountErrors({
          ...discountErrors,
          [pubkey]: "Failed to validate discount code",
        });
        return;
      }

      const result = await response.json();

      if (result.valid && result.discount_percentage) {
        setAppliedDiscounts({
          ...appliedDiscounts,
          [pubkey]: result.discount_percentage,
        });
        setDiscountErrors({ ...discountErrors, [pubkey]: "" });

        // Save to localStorage
        const discounts = getLocalStorageJson<CartDiscountsMap>(
          "cartDiscounts",
          {},
          {
            removeOnError: true,
            removeOnValidationError: true,
            validate: isCartDiscountsMap,
          }
        );
        discounts[pubkey] = {
          code: code,
        };
        localStorage.setItem("cartDiscounts", JSON.stringify(discounts));
      } else {
        const affRes = await fetch(
          `/api/affiliates/validate?sellerPubkey=${pubkey}&code=${encodeURIComponent(
            code
          )}`
        );
        const aff = affRes.ok ? await affRes.json() : null;
        if (aff?.valid) {
          let percent = 0;
          if (aff.buyerDiscountType === "percent") {
            percent = Number(aff.buyerDiscountValue) || 0;
          } else if (aff.buyerDiscountType === "fixed") {
            const sellerSubtotal = getSellerSubtotalInCurrency(pubkey);
            if (sellerSubtotal > 0) {
              percent = Math.min(
                100,
                (Number(aff.buyerDiscountValue) / sellerSubtotal) * 100
              );
            }
          }
          setAppliedDiscounts({ ...appliedDiscounts, [pubkey]: percent });
          setAffiliateMetaBySeller({
            ...affiliateMetaBySeller,
            [pubkey]: {
              code,
              codeId: aff.codeId,
              affiliateId: aff.affiliateId,
              rebateType: aff.rebateType,
              rebateValue: Number(aff.rebateValue) || 0,
            },
          });
          setDiscountErrors({ ...discountErrors, [pubkey]: "" });
          const discounts = getLocalStorageJson<CartDiscountsMap>(
            "cartDiscounts",
            {},
            {
              removeOnError: true,
              removeOnValidationError: true,
              validate: isCartDiscountsMap,
            }
          );
          discounts[pubkey] = { code };
          localStorage.setItem("cartDiscounts", JSON.stringify(discounts));
          return;
        }
        setDiscountErrors({
          ...discountErrors,
          [pubkey]: "Invalid or expired discount code",
        });
        setAppliedDiscounts({ ...appliedDiscounts, [pubkey]: 0 });
      }
    } catch (error) {
      console.error("Failed to apply discount:", error);
      setDiscountErrors({
        ...discountErrors,
        [pubkey]: "Failed to apply discount code",
      });
      setAppliedDiscounts({ ...appliedDiscounts, [pubkey]: 0 });
    }
  };

  const handleRemoveDiscount = (pubkey: string) => {
    setDiscountCodes({ ...discountCodes, [pubkey]: "" });
    setAppliedDiscounts({ ...appliedDiscounts, [pubkey]: 0 });
    setDiscountErrors({ ...discountErrors, [pubkey]: "" });
    setAffiliateMetaBySeller((prev) => {
      const next = { ...prev };
      delete next[pubkey];
      return next;
    });

    // Remove from localStorage
    const discounts = getLocalStorageJson<CartDiscountsMap>(
      "cartDiscounts",
      {},
      {
        removeOnError: true,
        removeOnValidationError: true,
        validate: isCartDiscountsMap,
      }
    );
    if (Object.keys(discounts).length > 0) {
      delete discounts[pubkey];
      localStorage.setItem("cartDiscounts", JSON.stringify(discounts));
    }
  };

  const convertPriceToSats = async (product: ProductData): Promise<number> => {
    const basePrice =
      product.bulkPrice !== undefined
        ? product.bulkPrice
        : product.weightPrice !== undefined
          ? product.weightPrice
          : product.volumePrice !== undefined
            ? product.volumePrice
            : product.price;

    if (
      product.currency.toLowerCase() === "sats" ||
      product.currency.toLowerCase() === "sat"
    ) {
      return basePrice;
    }
    let price = 0;
    if (!currencySelection.hasOwnProperty(product.currency.toUpperCase())) {
      throw new Error(`${product.currency} is not a supported currency.`);
    } else if (
      currencySelection.hasOwnProperty(product.currency.toUpperCase()) &&
      product.currency.toLowerCase() !== "sats" &&
      product.currency.toLowerCase() !== "sat"
    ) {
      try {
        const currencyData = {
          amount: basePrice,
          currency: product.currency,
        };
        const numSats = await getSatoshiValue(currencyData);
        price = Math.ceil(numSats);
      } catch (err) {
        console.error("ERROR", err);
      }
    } else if (product.currency.toLowerCase() === "btc") {
      price = basePrice * 100000000;
    }
    return price;
  };

  const convertShippingToSats = async (
    product: ProductData
  ): Promise<number> => {
    const shippingCost = product.shippingCost ? product.shippingCost : 0;
    if (
      product.currency.toLowerCase() === "sats" ||
      product.currency.toLowerCase() === "sat"
    ) {
      return shippingCost;
    }
    let cost = 0;
    if (!currencySelection.hasOwnProperty(product.currency.toUpperCase())) {
      throw new Error(`${product.currency} is not a supported currency.`);
    } else if (
      currencySelection.hasOwnProperty(product.currency.toUpperCase()) &&
      product.currency.toLowerCase() !== "sats" &&
      product.currency.toLowerCase() !== "sat"
    ) {
      try {
        const currencyData = {
          amount: shippingCost,
          currency: product.currency,
        };
        const numSats = await getSatoshiValue(currencyData);
        cost = Math.ceil(numSats);
      } catch (err) {
        console.error("ERROR", err);
      }
    } else if (product.currency.toLowerCase() === "btc") {
      cost = shippingCost * 100000000;
    }
    return cost;
  };

  const cartContent = (
    <ProtectedRoute>
      {!isBeingPaid ? (
        <div className="flex min-h-screen flex-col bg-white p-4 text-black">
          <div className="mx-auto w-full max-w-4xl pt-20">
            <div className="mb-8">
              <h1 className="text-4xl font-bold">Shopping Cart</h1>
            </div>
            {sfSellerPubkey && excludedItemCount > 0 && (
              <div className="mb-4 flex items-start rounded-md border-2 border-black bg-yellow-50 p-4">
                <InformationCircleIcon className="mr-3 h-5 w-5 flex-shrink-0 text-yellow-600" />
                <p className="text-sm text-black">
                  You have {excludedItemCount} other{" "}
                  {excludedItemCount === 1 ? "item" : "items"} from other
                  sellers in your cart.{" "}
                  <Link
                    href="/cart"
                    onClick={(e) => {
                      e.preventDefault();
                      sessionStorage.removeItem("sf_seller_pubkey");
                      sessionStorage.removeItem("sf_shop_slug");
                      setSfSellerPubkey("");
                      setSfShopSlug("");
                      setExcludedItemCount(0);
                    }}
                    className="font-semibold underline"
                  >
                    View full cart
                  </Link>
                </p>
              </div>
            )}
            {products.length > 0 ? (
              <>
                <div className="space-y-4">
                  {Object.entries(productsBySeller).map(
                    ([sellerPubkey, sellerProducts]) => (
                      <div key={sellerPubkey} className="space-y-4">
                        {sellerProducts.map((product) => (
                          <div
                            key={product.id}
                            className="rounded-md border-4 border-black bg-white p-6 shadow-[8px_8px_0px_0px_rgba(0,0,0,1)]"
                          >
                            <div className="flex gap-4">
                              <img
                                src={product.images[0]}
                                alt={product.title}
                                className="h-24 w-24 flex-shrink-0 rounded-md border-2 border-black object-cover"
                              />
                              <div className="flex min-w-0 flex-1 flex-col">
                                <div className="flex items-start justify-between gap-4">
                                  <h2 className="flex-1 text-lg font-bold">
                                    {product.title}
                                  </h2>
                                  <div className="flex flex-col items-end">
                                    <p className="text-lg font-bold">
                                      {product.bulkPrice !== undefined
                                        ? `${product.bulkPrice} ${product.currency}`
                                        : product.volumePrice !== undefined
                                          ? `${product.volumePrice} ${product.currency}`
                                          : `${product.price} ${product.currency}`}
                                    </p>
                                    {product.currency.toLowerCase() !==
                                      "sats" &&
                                      product.currency.toLowerCase() !==
                                        "sat" && (
                                        <p className="text-sm text-gray-500">
                                          {satPrices[product.id] !== undefined
                                            ? satPrices[product.id] !== null
                                              ? `≈ ${
                                                  satPrices[product.id]
                                                } sats`
                                              : "Price unavailable"
                                            : "Loading..."}
                                        </p>
                                      )}
                                  </div>
                                </div>
                                {product.selectedBulkOption && (
                                  <p className="text-sm text-yellow-700">
                                    Bundle: {product.selectedBulkOption} units
                                  </p>
                                )}
                                {product.quantity && (
                                  <div className="mt-2">
                                    <p className="mb-2 text-sm font-semibold text-green-600">
                                      {product.quantity} in stock
                                    </p>
                                    <QuantitySelector
                                      value={quantities[product.id] || 1}
                                      onDecrease={() =>
                                        handleQuantityChange(
                                          product.id,
                                          (quantities[product.id] || 1) - 1
                                        )
                                      }
                                      onIncrease={() =>
                                        handleQuantityChange(
                                          product.id,
                                          (quantities[product.id] || 1) + 1
                                        )
                                      }
                                      onChange={(newVal) =>
                                        handleQuantityChange(product.id, newVal)
                                      }
                                      min={1}
                                      max={parseInt(String(product.quantity))}
                                    />
                                    {hasReachedMax[product.id] && (
                                      <p className="mt-2 text-xs font-semibold text-red-500">
                                        Maximum quantity reached
                                      </p>
                                    )}
                                  </div>
                                )}
                                <div className="mt-auto flex justify-end pt-2">
                                  <button
                                    onClick={() =>
                                      handleRemoveFromCart(product.id)
                                    }
                                    className="cursor-pointer text-sm font-bold text-red-500"
                                  >
                                    Remove
                                  </button>
                                </div>
                              </div>
                            </div>
                            {product.subscriptionEnabled &&
                              product.subscriptionFrequency &&
                              product.subscriptionFrequency.length > 0 && (
                                <div className="mt-4 rounded-md border-2 border-purple-300 bg-purple-50 p-3">
                                  <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                      <ArrowPathIcon className="h-5 w-5 text-purple-600" />
                                      <span className="font-semibold text-purple-700">
                                        Subscribe & Save
                                        {product.subscriptionDiscount
                                          ? ` (${product.subscriptionDiscount}% off)`
                                          : ""}
                                      </span>
                                    </div>
                                    <button
                                      onClick={() => {
                                        setSubscriptionSelections((prev) => ({
                                          ...prev,
                                          [product.id]: {
                                            enabled: !prev[product.id]?.enabled,
                                            frequency:
                                              prev[product.id]?.frequency ||
                                              product
                                                .subscriptionFrequency![0]!,
                                          },
                                        }));
                                      }}
                                      className={`relative inline-flex h-6 w-11 items-center rounded-full border-2 border-black transition-colors ${
                                        subscriptionSelections[product.id]
                                          ?.enabled
                                          ? "bg-purple-600"
                                          : "bg-gray-300"
                                      }`}
                                    >
                                      <span
                                        className={`inline-block h-4 w-4 transform rounded-full border border-black bg-white transition-transform ${
                                          subscriptionSelections[product.id]
                                            ?.enabled
                                            ? "translate-x-5"
                                            : "translate-x-0.5"
                                        }`}
                                      />
                                    </button>
                                  </div>
                                  {subscriptionSelections[product.id]
                                    ?.enabled && (
                                    <div className="mt-3">
                                      <Select
                                        variant="bordered"
                                        aria-label="Delivery Frequency"
                                        label={
                                          <span className="text-sm font-semibold text-purple-700">
                                            Frequency
                                          </span>
                                        }
                                        labelPlacement="outside"
                                        size="sm"
                                        selectedKeys={
                                          subscriptionSelections[product.id]
                                            ?.frequency
                                            ? new Set([
                                                subscriptionSelections[
                                                  product.id
                                                ]!.frequency,
                                              ])
                                            : new Set()
                                        }
                                        onSelectionChange={(keys) => {
                                          const key = Array.from(
                                            keys
                                          )[0] as string;
                                          if (key) {
                                            setSubscriptionSelections(
                                              (prev) => ({
                                                ...prev,
                                                [product.id]: {
                                                  ...prev[product.id]!,
                                                  frequency: key,
                                                },
                                              })
                                            );
                                          }
                                        }}
                                        className="w-full max-w-xs"
                                        classNames={{
                                          trigger:
                                            "border-2 border-purple-300 rounded-md bg-white",
                                          value:
                                            "text-purple-700 font-semibold",
                                        }}
                                      >
                                        {product.subscriptionFrequency!.map(
                                          (freq) => (
                                            <SelectItem
                                              key={freq}
                                              className="font-semibold text-black"
                                            >
                                              {FREQUENCY_LABELS[freq] || freq}
                                            </SelectItem>
                                          )
                                        )}
                                      </Select>
                                      <p className="mt-2 text-xs text-purple-500">
                                        Card payment only
                                      </p>
                                    </div>
                                  )}
                                </div>
                              )}
                          </div>
                        ))}
                        {/* Discount code section for this seller */}
                        <div className="rounded-lg border border-gray-300 p-4 shadow-sm">
                          <h3 className="mb-3 font-semibold">
                            Have a discount code from this seller?
                          </h3>
                          {isValidatingDiscounts ? (
                            <p className="text-sm text-gray-500">
                              Verifying saved discount codes&hellip;
                            </p>
                          ) : (
                            <>
                              <div className="flex gap-2">
                                <Input
                                  label="Discount Code"
                                  placeholder="Enter code"
                                  value={discountCodes[sellerPubkey] || ""}
                                  onChange={(e) =>
                                    setDiscountCodes({
                                      ...discountCodes,
                                      [sellerPubkey]:
                                        e.target.value.toUpperCase(),
                                    })
                                  }
                                  className="flex-1 text-white"
                                  disabled={appliedDiscounts[sellerPubkey]! > 0}
                                  isInvalid={!!discountErrors[sellerPubkey]}
                                  errorMessage={discountErrors[sellerPubkey]}
                                />
                                {appliedDiscounts[sellerPubkey]! > 0 ? (
                                  <Button
                                    color="warning"
                                    onClick={() =>
                                      handleRemoveDiscount(sellerPubkey)
                                    }
                                  >
                                    Remove
                                  </Button>
                                ) : (
                                  <Button
                                    className={BLUEBUTTONCLASSNAMES}
                                    onClick={() =>
                                      handleApplyDiscount(sellerPubkey)
                                    }
                                  >
                                    Apply
                                  </Button>
                                )}
                              </div>
                              {appliedDiscounts[sellerPubkey]! > 0 && (
                                <p className="mt-2 text-sm text-green-600">
                                  {appliedDiscounts[sellerPubkey]}% discount
                                  applied to all items from this seller!
                                </p>
                              )}
                            </>
                          )}
                        </div>
                        {(() => {
                          const shopProfile =
                            shopContext.shopData.get(sellerPubkey);
                          const threshold =
                            shopProfile?.content?.freeShippingThreshold;
                          const thresholdCurrency =
                            shopProfile?.content?.freeShippingCurrency || "USD";
                          if (!threshold || threshold <= 0) return null;
                          const sellerSubtotal =
                            getSellerSubtotalInCurrency(sellerPubkey);
                          const progress = Math.min(
                            (sellerSubtotal / threshold) * 100,
                            100
                          );
                          const remaining = Math.max(
                            threshold - sellerSubtotal,
                            0
                          );
                          const isFreeShipping = sellerSubtotal >= threshold;
                          const sellerName = getSellerName(sellerPubkey);
                          return (
                            <div className="rounded-lg border-2 border-black bg-white p-4 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
                              <div className="mb-2 flex items-center gap-2">
                                <TruckIcon className="text-primary-blue h-5 w-5" />
                                {isFreeShipping ? (
                                  <p className="text-sm font-bold text-green-600">
                                    Free shipping from {sellerName}!
                                  </p>
                                ) : (
                                  <p className="text-sm font-bold text-black">
                                    You&apos;re {remaining.toFixed(2)}{" "}
                                    {thresholdCurrency} away from free shipping
                                    from {sellerName}!
                                  </p>
                                )}
                              </div>
                              <div className="h-3 w-full overflow-hidden rounded-full border border-black bg-gray-200">
                                <div
                                  className={`h-full rounded-full transition-all duration-500 ${
                                    isFreeShipping
                                      ? "bg-green-500"
                                      : "bg-primary-blue"
                                  }`}
                                  style={{ width: `${progress}%` }}
                                />
                              </div>
                              <div className="mt-2 flex items-center justify-between">
                                <p className="text-xs text-gray-500">
                                  {sellerSubtotal.toFixed(2)} /{" "}
                                  {threshold.toFixed(2)} {thresholdCurrency}
                                </p>
                                {!isFreeShipping && (
                                  <Button
                                    size="sm"
                                    className={
                                      BLUEBUTTONCLASSNAMES + " text-xs"
                                    }
                                    onClick={() =>
                                      router.push(
                                        `/marketplace/${getSellerNpub(
                                          sellerPubkey
                                        )}`
                                      )
                                    }
                                  >
                                    Shop More from {sellerName}
                                  </Button>
                                )}
                              </div>
                            </div>
                          );
                        })()}
                      </div>
                    )
                  )}
                </div>
                <div className="mt-6 space-y-4">
                  {Object.keys(productsBySeller).length > 1 && (
                    <div className="flex items-start rounded-md border-2 border-black bg-blue-50 p-4">
                      <InformationCircleIcon className="mr-3 h-5 w-5 flex-shrink-0 text-blue-600" />
                      <p className="text-sm text-black">
                        Only Bitcoin payments are supported for carts with
                        products from different merchants. To pay with credit,
                        debit, or other options, purchase from each merchant
                        separately.
                      </p>
                    </div>
                  )}
                  {hasSubscriptionStripeConflict && (
                    <div className="flex items-start rounded-md border-2 border-red-400 bg-red-50 p-4">
                      <ArrowPathIcon className="mr-3 h-5 w-5 flex-shrink-0 text-red-600" />
                      <div>
                        <p className="text-sm font-semibold text-red-700">
                          Checkout unavailable
                        </p>
                        <p className="mt-1 text-sm text-red-600">
                          Your cart contains subscription products that require
                          card payment, but{" "}
                          {uniqueSellerPubkeys.length <= 1
                            ? "this seller does not have Stripe enabled"
                            : "not all sellers in your cart have Stripe enabled"}
                          . Please remove the subscription products or disable
                          subscriptions to check out with Bitcoin.
                        </p>
                      </div>
                    </div>
                  )}
                  {hasActiveSubscription &&
                    !hasSubscriptionStripeConflict &&
                    uniqueSellerPubkeys.length > 1 && (
                      <div className="flex items-start rounded-md border-2 border-purple-400 bg-purple-50 p-4">
                        <ArrowPathIcon className="mr-3 h-5 w-5 flex-shrink-0 text-purple-600" />
                        <p className="text-sm text-purple-800">
                          Subscription items require card payment. All merchants
                          in your cart have Stripe enabled, so checkout will
                          proceed with card payment only.
                        </p>
                      </div>
                    )}
                  <div className="flex flex-col items-end gap-4">
                    <p className="text-2xl font-bold">
                      Subtotal ({products.length}{" "}
                      {products.length === 1 ? "item" : "items"}):{" "}
                      {cartCurrency &&
                      cartCurrency.toLowerCase() !== "sats" &&
                      cartCurrency.toLowerCase() !== "sat" ? (
                        <>
                          {subtotalNative} {cartCurrency}
                          <span className="ml-2 text-base font-normal text-gray-500">
                            ≈ {subtotal} sats
                          </span>
                        </>
                      ) : (
                        <>{subtotal} sats</>
                      )}
                    </p>
                    <Button
                      className={`${BLUEBUTTONCLASSNAMES} ${
                        hasSubscriptionStripeConflict
                          ? "cursor-not-allowed opacity-50"
                          : ""
                      }`}
                      onClick={toggleCheckout}
                      disabled={hasSubscriptionStripeConflict}
                      size="lg"
                    >
                      Proceed To Checkout
                    </Button>
                  </div>
                </div>
              </>
            ) : (
              <div className="flex min-h-[60vh] flex-col items-center justify-center rounded-md border-4 border-black bg-white py-16 shadow-[8px_8px_0px_0px_rgba(0,0,0,1)]">
                <div className="mb-8 flex items-center justify-center rounded-full border-4 border-black bg-gray-100 p-8">
                  <ShoppingBagIcon className="h-16 w-16 text-black" />
                </div>
                <h2 className="mb-4 text-center text-3xl font-bold text-black">
                  Your cart is empty . . .
                </h2>
                <p className="mb-6 max-w-md text-center text-black/70">
                  Go add some items to your cart!
                </p>
                <Button
                  className={BLUEBUTTONCLASSNAMES}
                  size="lg"
                  onClick={() =>
                    router.push(
                      sfSellerPubkey && sfShopSlug
                        ? `/shop/${sfShopSlug}`
                        : "/marketplace"
                    )
                  }
                >
                  Continue Shopping
                </Button>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="flex min-h-screen w-full bg-white text-black sm:items-center sm:justify-center">
          <div className="mx-auto flex w-full flex-col pt-20">
            <div className="flex flex-col items-center">
              <CartInvoiceCard
                products={products}
                quantities={quantities}
                shippingTypes={shippingTypes}
                totalCostsInSats={totalCostsInSats}
                subtotalCost={subtotal}
                appliedDiscounts={appliedDiscounts}
                discountCodes={discountCodes}
                affiliateMetaBySeller={affiliateMetaBySeller}
                shopProfiles={shopContext.shopData}
                onBackToCart={toggleCheckout}
                setInvoiceIsPaid={setInvoiceIsPaid}
                setInvoiceGenerationFailed={setInvoiceGenerationFailed}
                setCashuPaymentSent={setCashuPaymentSent}
                setCashuPaymentFailed={setCashuPaymentFailed}
                subscriptionSelections={subscriptionSelections}
              />
            </div>
          </div>
        </div>
      )}

      {/* Invoice Generation Failed Modal */}
      {invoiceGenerationFailed ? (
        <>
          <Modal
            backdrop="blur"
            isOpen={invoiceGenerationFailed}
            onClose={() => setInvoiceGenerationFailed(false)}
            classNames={{
              body: "py-6 bg-white",
              backdrop: "bg-[#292f46]/50 backdrop-opacity-60",
              header: "border-b-4 border-black bg-white rounded-t-md",
              footer: "border-t-4 border-black bg-white rounded-b-md",
              closeButton: "hover:bg-black/5 active:bg-white/10",
              wrapper: "items-center justify-center",
              base: "border-4 border-black shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] rounded-md",
            }}
            isDismissable={true}
            scrollBehavior={"normal"}
            placement={"center"}
            size="2xl"
          >
            <ModalContent>
              <ModalHeader className="flex items-center justify-center font-bold text-black">
                <XCircleIcon className="h-6 w-6 text-red-500" />
                <div className="ml-2">Invoice generation failed!</div>
              </ModalHeader>
              <ModalBody className="flex flex-col overflow-hidden text-black">
                <div className="flex items-center justify-center">
                  The price and/or currency set for this listing was invalid.
                </div>
              </ModalBody>
            </ModalContent>
          </Modal>
        </>
      ) : null}

      {/* Cashu Payment Failed Modal */}
      {cashuPaymentFailed ? (
        <>
          <Modal
            backdrop="blur"
            isOpen={cashuPaymentFailed}
            onClose={() => setCashuPaymentFailed(false)}
            classNames={{
              body: "py-6 bg-white",
              backdrop: "bg-[#292f46]/50 backdrop-opacity-60",
              header: "border-b-4 border-black bg-white rounded-t-md",
              footer: "border-t-4 border-black bg-white rounded-b-md",
              closeButton: "hover:bg-black/5 active:bg-white/10",
              wrapper: "items-center justify-center",
              base: "border-4 border-black shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] rounded-md",
            }}
            isDismissable={true}
            scrollBehavior={"normal"}
            placement={"center"}
            size="2xl"
          >
            <ModalContent>
              <ModalHeader className="flex items-center justify-center font-bold text-black">
                <XCircleIcon className="h-6 w-6 text-red-500" />
                <div className="ml-2">Purchase failed!</div>
              </ModalHeader>
              <ModalBody className="flex flex-col overflow-hidden text-black">
                <div className="flex items-center justify-center">
                  You didn&apos;t have enough balance in your wallet to pay.
                </div>
              </ModalBody>
            </ModalContent>
          </Modal>
        </>
      ) : null}
    </ProtectedRoute>
  );

  if (sfSellerPubkey) {
    return (
      <StorefrontThemeWrapper sellerPubkey={sfSellerPubkey}>
        {cartContent}
      </StorefrontThemeWrapper>
    );
  }

  return cartContent;
}
