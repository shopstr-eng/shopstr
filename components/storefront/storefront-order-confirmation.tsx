import { useEffect, useState, useContext, useMemo } from "react";
import { useRouter } from "next/router";
import {
  CheckCircleIcon,
  ShoppingBagIcon,
  ClipboardDocumentListIcon,
} from "@heroicons/react/24/outline";
import { StorefrontColorScheme } from "@/utils/types/types";
import { SignerContext } from "@/components/utility-components/nostr-context-provider";
import { ProductContext } from "@/utils/context/context";
import parseTags, {
  ProductData,
} from "@/utils/parsers/product-parser-functions";
import { nip19 } from "nostr-tools";
import ProductCard from "@/components/utility-components/product-card";

interface OrderSummaryData {
  productTitle: string;
  productImage: string;
  amount: string;
  currency: string;
  paymentMethod: string;
  orderId: string;
  shippingCost?: string;
  selectedSize?: string;
  selectedVolume?: string;
  selectedWeight?: string;
  selectedBulkOption?: string;
  buyerEmail?: string;
  shippingAddress?: string;
  pickupLocation?: string;
  sellerPubkey?: string;
  subtotal?: string;
  freeShippingApplied?: boolean;
  originalShippingCost?: string;
  isSubscription?: boolean;
  isCart?: boolean;
  cartItems?: Array<{
    title: string;
    image: string;
    amount: string;
    currency: string;
    quantity?: number;
    shipping?: string;
    pickupLocation?: string;
    selectedSize?: string;
    selectedVolume?: string;
    selectedWeight?: string;
    selectedBulkOption?: string;
  }>;
}

interface StorefrontOrderConfirmationProps {
  colors: StorefrontColorScheme;
  shopName: string;
  shopSlug: string;
  shopPubkey: string;
}

export default function StorefrontOrderConfirmation({
  colors,
  shopName,
  shopSlug,
  shopPubkey,
}: StorefrontOrderConfirmationProps) {
  const router = useRouter();
  const { isLoggedIn } = useContext(SignerContext);
  const productContext = useContext(ProductContext);
  const [orderData, setOrderData] = useState<OrderSummaryData | null>(null);

  useEffect(() => {
    const stored = sessionStorage.getItem("orderSummary");
    if (stored) {
      try {
        setOrderData(JSON.parse(stored));
      } catch {
        router.push(`/shop/${shopSlug}`);
      }
    } else {
      router.push(`/shop/${shopSlug}`);
    }
  }, [router, shopSlug]);

  const sellerProducts = useMemo(() => {
    if (!productContext.productEvents) return [];
    const products: ProductData[] = [];
    for (const event of productContext.productEvents) {
      try {
        const parsed = parseTags(event);
        if (
          parsed &&
          parsed.pubkey === shopPubkey &&
          parsed.title &&
          parsed.images.length > 0
        ) {
          products.push(parsed);
        }
      } catch {}
    }
    for (let i = products.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [products[i], products[j]] = [products[j], products[i]];
    }
    return products.slice(0, 4);
  }, [productContext.productEvents, shopPubkey]);

  const formatPaymentMethod = (method: string) => {
    const methods: Record<string, string> = {
      lightning: "Lightning Network",
      cashu: "Cashu eCash",
      nwc: "Nostr Wallet Connect",
      stripe: "Credit Card (Stripe)",
      cash: "Cash",
      fiat: "Fiat Payment",
    };
    return methods[method] || method;
  };

  const getProductHref = (product: ProductData) => {
    try {
      const naddr = nip19.naddrEncode({
        identifier: product.d as string,
        pubkey: product.pubkey,
        kind: 30402,
      });
      return `/listing/${naddr}`;
    } catch {
      return null;
    }
  };

  const homeHref = `/shop/${shopSlug}`;
  const ordersHref = `/shop/${shopSlug}/orders`;

  if (!orderData) {
    return (
      <div
        className="flex min-h-screen items-center justify-center"
        style={{ backgroundColor: colors.background }}
      >
        <p style={{ color: colors.text + "99" }}>Loading order details...</p>
      </div>
    );
  }

  return (
    <div
      className="min-h-screen"
      style={{ backgroundColor: colors.background }}
    >
      <div className="mx-auto max-w-4xl px-4 pb-8 pt-10 sm:px-6 lg:px-8">
        <div
          className="mb-8 rounded-lg border-2 p-6 sm:p-8"
          style={{
            borderColor: colors.primary,
            backgroundColor: colors.background,
          }}
        >
          <div
            className="mb-6 flex flex-col items-center border-b pb-6"
            style={{ borderColor: colors.primary + "33" }}
          >
            <div
              className="mb-3 flex h-16 w-16 items-center justify-center rounded-full"
              style={{ backgroundColor: colors.primary + "22" }}
            >
              <CheckCircleIcon
                className="h-10 w-10"
                style={{ color: colors.primary }}
              />
            </div>
            <h1
              className="font-heading text-2xl font-bold sm:text-3xl"
              style={{ color: colors.text }}
            >
              Order Confirmed!
            </h1>
            <p
              className="mt-2 text-center"
              style={{ color: colors.text + "99" }}
            >
              {shopName} has been notified and will receive your order details.
            </p>
            {orderData.orderId && (
              <p className="mt-1 text-sm" style={{ color: colors.text + "77" }}>
                Order ID: {orderData.orderId.substring(0, 8)}...
              </p>
            )}
          </div>

          {orderData.isCart && orderData.cartItems ? (
            <div className="mb-6">
              <h2
                className="font-heading mb-4 text-lg font-bold"
                style={{ color: colors.text }}
              >
                Items Ordered
              </h2>
              <div className="space-y-4">
                {orderData.cartItems.map((item, index) => (
                  <div
                    key={index}
                    className="flex items-center gap-4 rounded-md border p-3"
                    style={{ borderColor: colors.text + "22" }}
                  >
                    <img
                      src={item.image}
                      alt={item.title}
                      className="h-16 w-16 rounded-md object-cover"
                    />
                    <div className="flex-1">
                      <h3
                        className="font-semibold"
                        style={{ color: colors.text }}
                      >
                        {item.title}
                      </h3>
                      <div
                        className="flex flex-wrap gap-x-3 text-sm"
                        style={{ color: colors.text + "88" }}
                      >
                        {item.quantity && item.quantity > 1 && (
                          <span>Qty: {item.quantity}</span>
                        )}
                        {item.selectedSize && (
                          <span>Size: {item.selectedSize}</span>
                        )}
                        {item.selectedVolume && (
                          <span>Volume: {item.selectedVolume}</span>
                        )}
                        {item.selectedWeight && (
                          <span>Weight: {item.selectedWeight}</span>
                        )}
                        {item.selectedBulkOption && (
                          <span>Bundle: {item.selectedBulkOption} units</span>
                        )}
                        {item.shipping && (
                          <span className="capitalize">{item.shipping}</span>
                        )}
                      </div>
                    </div>
                    <p className="font-bold" style={{ color: colors.text }}>
                      {item.amount} {item.currency}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="mb-6">
              <h2
                className="font-heading mb-4 text-lg font-bold"
                style={{ color: colors.text }}
              >
                Product Details
              </h2>
              <div
                className="flex items-start gap-4 rounded-md border p-4"
                style={{ borderColor: colors.text + "22" }}
              >
                {orderData.productImage && (
                  <img
                    src={orderData.productImage}
                    alt={orderData.productTitle}
                    className="h-24 w-24 rounded-md object-cover"
                  />
                )}
                <div className="flex-1">
                  <h3
                    className="text-lg font-semibold"
                    style={{ color: colors.text }}
                  >
                    {orderData.productTitle}
                  </h3>
                  {orderData.selectedSize && (
                    <p
                      className="text-sm"
                      style={{ color: colors.text + "88" }}
                    >
                      Size: {orderData.selectedSize}
                    </p>
                  )}
                  {orderData.selectedVolume && (
                    <p
                      className="text-sm"
                      style={{ color: colors.text + "88" }}
                    >
                      Volume: {orderData.selectedVolume}
                    </p>
                  )}
                  {orderData.selectedWeight && (
                    <p
                      className="text-sm"
                      style={{ color: colors.text + "88" }}
                    >
                      Weight: {orderData.selectedWeight}
                    </p>
                  )}
                  {orderData.selectedBulkOption && (
                    <p
                      className="text-sm"
                      style={{ color: colors.text + "88" }}
                    >
                      Bundle: {orderData.selectedBulkOption} units
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}

          <div className="mb-6">
            <h2
              className="font-heading mb-4 text-lg font-bold"
              style={{ color: colors.text }}
            >
              Order Details
            </h2>
            <div
              className="rounded-md border p-4"
              style={{ borderColor: colors.text + "22" }}
            >
              <div className="space-y-3">
                <div
                  className="flex items-center justify-between border-b pb-2"
                  style={{ borderColor: colors.text + "11" }}
                >
                  <span style={{ color: colors.text + "99" }}>
                    Payment Method
                  </span>
                  <span
                    className="font-semibold"
                    style={{ color: colors.text }}
                  >
                    {formatPaymentMethod(orderData.paymentMethod)}
                  </span>
                </div>
                <div className="flex items-center justify-between pt-1">
                  <span
                    className="text-lg font-bold"
                    style={{ color: colors.text }}
                  >
                    Total
                  </span>
                  <span
                    className="text-lg font-bold"
                    style={{ color: colors.text }}
                  >
                    {Number(orderData.amount).toLocaleString()}{" "}
                    {orderData.currency}
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
            <button
              onClick={() => router.push(homeHref)}
              className="flex flex-1 items-center justify-center gap-2 rounded-lg px-6 py-3 font-bold transition-opacity hover:opacity-90"
              style={{
                backgroundColor: colors.primary,
                color: colors.secondary,
              }}
            >
              <ShoppingBagIcon className="h-5 w-5" />
              Continue Shopping
            </button>
            {isLoggedIn && (
              <button
                onClick={() => router.push(ordersHref)}
                className="flex flex-1 items-center justify-center gap-2 rounded-lg border-2 px-6 py-3 font-bold transition-opacity hover:opacity-90"
                style={{
                  borderColor: colors.primary,
                  color: colors.text,
                  backgroundColor: "transparent",
                }}
              >
                <ClipboardDocumentListIcon className="h-5 w-5" />
                Check Order Status
              </button>
            )}
          </div>
        </div>

        {sellerProducts.length > 0 && (
          <div className="mt-8">
            <h2
              className="font-heading mb-6 text-2xl font-bold"
              style={{ color: colors.text }}
            >
              You might also like
            </h2>
            <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
              {sellerProducts.map((product) => {
                const href = getProductHref(product);
                if (!href) return null;
                return (
                  <ProductCard
                    key={product.id || product.d}
                    productData={product}
                    href={href}
                  />
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
