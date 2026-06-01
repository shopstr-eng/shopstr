import { useEffect, useRef, useState, useContext } from "react";
import { useRouter } from "next/router";
import { Button } from "@heroui/react";
import StorefrontThemeWrapper from "@/components/storefront/storefront-theme-wrapper";
import {
  CheckCircleIcon,
  ShoppingBagIcon,
  ClipboardDocumentListIcon,
  ChatBubbleLeftRightIcon,
} from "@heroicons/react/24/outline";
import { nip19 } from "nostr-tools";
import { ProductContext } from "@/utils/context/context";
import parseTags, {
  ProductData,
} from "@/utils/parsers/product-parser-functions";
import ProductCard from "@/components/utility-components/product-card";
import { NEO_BTN } from "@/utils/STATIC-VARIABLES";
import ProtectedRoute from "@/components/utility-components/protected-route";

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
  shippingAddress?: string;
  pickupLocation?: string;
  sellerPubkey?: string;
  subtotal?: string;
  freeShippingApplied?: boolean;
  originalShippingCost?: string;
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

export default function OrderSummary() {
  const router = useRouter();
  const [orderData, setOrderData] = useState<OrderSummaryData | null>(null);
  const [latestProducts, setLatestProducts] = useState<ProductData[]>([]);
  const [sfSellerPubkey, setSfSellerPubkey] = useState("");
  const [sfShopSlug, setSfShopSlug] = useState("");
  const productContext = useContext(ProductContext);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const pk =
        sessionStorage.getItem("sf_seller_pubkey") ||
        localStorage.getItem("sf_seller_pubkey");
      if (pk) setSfSellerPubkey(pk);
      const slug =
        sessionStorage.getItem("sf_shop_slug") ||
        localStorage.getItem("sf_shop_slug");
      if (slug) setSfShopSlug(slug);
    }
  }, []);

  // Guard against React 18 strict-mode double-invocation. The effect both
  // consumes (removes) the sessionStorage entry and drives a fallback
  // redirect — without this guard, the second invocation sees the entry
  // gone and bounces the user to /marketplace immediately after we just
  // arrived from a successful checkout.
  const hasConsumedOrderRef = useRef(false);
  useEffect(() => {
    if (hasConsumedOrderRef.current) return;
    const stored = sessionStorage.getItem("orderSummary");
    if (stored) {
      hasConsumedOrderRef.current = true;
      try {
        const data = JSON.parse(stored);
        setOrderData(data);
        sessionStorage.removeItem("orderSummary");
        if (data.sellerPubkey && !sfSellerPubkey) {
          setSfSellerPubkey(data.sellerPubkey);
        }
      } catch {
        router.push("/marketplace");
      }
    } else {
      router.push("/marketplace");
    }
  }, [router]);

  useEffect(() => {
    if (!productContext.isLoading && productContext.productEvents) {
      const products: ProductData[] = [];
      for (const event of productContext.productEvents) {
        try {
          const parsed = parseTags(event);
          if (parsed && parsed.title && parsed.images.length > 0) {
            products.push(parsed);
          }
        } catch {}
      }
      for (let i = products.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        const current = products[i];
        const random = products[j];
        if (!current || !random) continue;
        products[i] = random;
        products[j] = current;
      }
      const shuffled = products.slice(0, 4);
      setLatestProducts(shuffled);
    }
  }, [productContext.isLoading, productContext.productEvents, orderData]);

  const formatPaymentMethod = (method: string) => {
    const methods: Record<string, string> = {
      lightning: "Lightning Network",
      cashu: "Cashu eCash",
      ecash: "Cashu eCash",
      nwc: "Nostr Wallet Connect",
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

  if (!orderData) {
    return (
      <ProtectedRoute>
        <StorefrontThemeWrapper sellerPubkey={sfSellerPubkey}>
          <div className="relative flex min-h-screen items-center justify-center bg-[#111] text-white">
            <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] [mask-image:radial-gradient(ellipse_70%_55%_at_50%_0%,#000_65%,transparent_100%)] bg-[size:24px_24px]" />
            <div className="relative z-10 text-center">
              <p className="text-lg font-bold text-zinc-400">
                Loading order details...
              </p>
            </div>
          </div>
        </StorefrontThemeWrapper>
      </ProtectedRoute>
    );
  }

  return (
    <ProtectedRoute>
      <StorefrontThemeWrapper sellerPubkey={sfSellerPubkey}>
        <div className="relative min-h-screen bg-[#111] text-white selection:bg-yellow-400 selection:text-white">
          <div className="pointer-events-none absolute inset-0 z-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] [mask-image:radial-gradient(ellipse_70%_55%_at_50%_0%,#000_65%,transparent_100%)] bg-[size:24px_24px]" />
          <div className="relative z-10 mx-auto max-w-5xl px-4 pt-24 pb-12 sm:px-6 lg:px-8">
            <div className="mb-8 rounded-2xl border border-zinc-800 bg-[#161616] p-6 shadow-2xl shadow-black/30 sm:p-8">
              <div className="mb-6 flex flex-col items-center border-b border-zinc-800 pb-6">
                <div className="mb-3 flex h-16 w-16 items-center justify-center rounded-full border border-green-400/40 bg-green-400/10">
                  <CheckCircleIcon className="h-10 w-10 text-green-400" />
                </div>
                <h1 className="text-3xl font-black tracking-tight text-white uppercase sm:text-4xl">
                  Order Confirmed!
                </h1>
                <p className="mt-2 text-center text-zinc-400">
                  The seller has been notified and will receive your order
                  details.
                </p>
                {orderData.orderId && (
                  <p className="mt-1 text-sm text-zinc-500">
                    Order ID: {orderData.orderId.substring(0, 8)}...
                  </p>
                )}
              </div>

              {orderData.isCart && orderData.cartItems ? (
                <div className="mb-6">
                  <h2 className="mb-4 text-xl font-black tracking-tight text-white uppercase">
                    Items Ordered
                  </h2>
                  <div className="space-y-4">
                    {orderData.cartItems.map((item, index) => (
                      <div
                        key={index}
                        className="flex items-center gap-4 rounded-xl border border-zinc-800 bg-[#111] p-3"
                      >
                        <img
                          src={item.image}
                          alt={item.title}
                          className="h-16 w-16 rounded-md object-cover"
                        />
                        <div className="flex-1">
                          <h3 className="font-bold text-white">{item.title}</h3>
                          <div className="flex flex-wrap gap-x-3 text-sm text-zinc-500">
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
                              <span>
                                Bundle: {item.selectedBulkOption} units
                              </span>
                            )}
                            {item.shipping && (
                              <span className="capitalize">
                                {item.shipping}
                              </span>
                            )}
                          </div>
                        </div>
                        <p className="font-black text-white">
                          {item.amount} {item.currency}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="mb-6">
                  <h2 className="mb-4 text-xl font-black tracking-tight text-white uppercase">
                    Product Details
                  </h2>
                  <div className="flex items-start gap-4 rounded-xl border border-zinc-800 bg-[#111] p-4">
                    {orderData.productImage && (
                      <img
                        src={orderData.productImage}
                        alt={orderData.productTitle}
                        className="h-24 w-24 rounded-md object-cover"
                      />
                    )}
                    <div className="flex-1">
                      <h3 className="text-lg font-black text-white">
                        {orderData.productTitle}
                      </h3>
                      {orderData.selectedSize && (
                        <p className="text-sm text-zinc-400">
                          Size: {orderData.selectedSize}
                        </p>
                      )}
                      {orderData.selectedVolume && (
                        <p className="text-sm text-zinc-400">
                          Volume: {orderData.selectedVolume}
                        </p>
                      )}
                      {orderData.selectedWeight && (
                        <p className="text-sm text-zinc-400">
                          Weight: {orderData.selectedWeight}
                        </p>
                      )}
                      {orderData.selectedBulkOption && (
                        <p className="text-sm text-zinc-400">
                          Bundle: {orderData.selectedBulkOption} units
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              )}

              <div className="mb-6">
                <h2 className="mb-4 text-xl font-black tracking-tight text-white uppercase">
                  Order Details
                </h2>
                <div className="rounded-xl border border-zinc-800 bg-[#111] p-4">
                  <div className="space-y-3">
                    <div className="flex items-center justify-between border-b border-zinc-800 pb-2">
                      <span className="text-zinc-400">Payment Method</span>
                      <span className="font-bold text-white">
                        {formatPaymentMethod(orderData.paymentMethod)}
                      </span>
                    </div>

                    {orderData.isCart &&
                    orderData.subtotal &&
                    Number(orderData.subtotal) !== Number(orderData.amount) ? (
                      <>
                        <div className="flex items-center justify-between border-b border-zinc-800 pb-2">
                          <span className="text-zinc-400">Subtotal</span>
                          <span className="text-white">
                            {Number(orderData.subtotal).toLocaleString()}{" "}
                            {orderData.currency}
                          </span>
                        </div>
                        <div className="flex items-center justify-between border-b border-zinc-800 pb-2">
                          <span className="text-zinc-400">Shipping</span>
                          {orderData.freeShippingApplied ? (
                            <span className="flex items-center gap-2">
                              {orderData.originalShippingCost && (
                                <span className="text-zinc-600 line-through">
                                  {Number(
                                    orderData.originalShippingCost
                                  ).toLocaleString()}{" "}
                                  {orderData.currency}
                                </span>
                              )}
                              <span className="text-white">
                                0 (Free Shipping)
                              </span>
                              <span className="rounded-full border border-green-400/30 bg-green-400/10 px-2 py-0.5 text-xs font-black text-green-300 uppercase">
                                Free
                              </span>
                            </span>
                          ) : (
                            <span className="text-white">
                              {(
                                Number(orderData.amount) -
                                Number(orderData.subtotal)
                              ).toLocaleString()}{" "}
                              {orderData.currency}
                            </span>
                          )}
                        </div>
                      </>
                    ) : orderData.freeShippingApplied ? (
                      <>
                        <div className="flex items-center justify-between border-b border-zinc-800 pb-2">
                          <span className="text-zinc-400">Subtotal</span>
                          <span className="text-white">
                            {Number(orderData.amount).toLocaleString()}{" "}
                            {orderData.currency}
                          </span>
                        </div>
                        <div className="flex items-center justify-between border-b border-zinc-800 pb-2">
                          <span className="text-zinc-400">Shipping</span>
                          <span className="flex items-center gap-2">
                            {orderData.originalShippingCost && (
                              <span className="text-zinc-600 line-through">
                                {Number(
                                  orderData.originalShippingCost
                                ).toLocaleString()}{" "}
                                {orderData.currency}
                              </span>
                            )}
                            <span className="text-white">
                              0 (Free Shipping)
                            </span>
                            <span className="rounded-full border border-green-400/30 bg-green-400/10 px-2 py-0.5 text-xs font-black text-green-300 uppercase">
                              Free
                            </span>
                          </span>
                        </div>
                      </>
                    ) : orderData.shippingCost &&
                      Number(orderData.shippingCost) > 0 ? (
                      <>
                        <div className="flex items-center justify-between border-b border-zinc-800 pb-2">
                          <span className="text-zinc-400">Subtotal</span>
                          <span className="text-white">
                            {(
                              Number(orderData.amount) -
                              Number(orderData.shippingCost)
                            ).toLocaleString()}{" "}
                            {orderData.currency}
                          </span>
                        </div>
                        <div className="flex items-center justify-between border-b border-zinc-800 pb-2">
                          <span className="text-zinc-400">Shipping</span>
                          <span className="text-white">
                            {Number(orderData.shippingCost).toLocaleString()}{" "}
                            {orderData.currency}
                          </span>
                        </div>
                      </>
                    ) : null}

                    <div className="flex items-center justify-between pt-1">
                      <span className="text-lg font-bold text-white">
                        Total
                      </span>
                      <span className="text-lg font-bold text-white">
                        {Number(orderData.amount).toLocaleString()}{" "}
                        {orderData.currency}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {(orderData.shippingAddress ||
                orderData.pickupLocation ||
                (orderData.isCart &&
                  orderData.cartItems?.some((i) => i.pickupLocation))) && (
                <div className="mb-6">
                  <h2 className="mb-4 text-xl font-black tracking-tight text-white uppercase">
                    Delivery Information
                  </h2>
                  <div className="space-y-3 rounded-xl border border-zinc-800 bg-[#111] p-4">
                    {orderData.shippingAddress && (
                      <div>
                        <p className="text-sm font-medium text-zinc-500">
                          Shipping Address
                        </p>
                        <p className="text-white">
                          {orderData.shippingAddress}
                        </p>
                      </div>
                    )}
                    {orderData.pickupLocation && (
                      <div>
                        <p className="text-sm font-medium text-zinc-500">
                          Pickup Location
                        </p>
                        <p className="text-white">{orderData.pickupLocation}</p>
                      </div>
                    )}
                    {orderData.isCart &&
                      orderData.cartItems?.some((i) => i.pickupLocation) && (
                        <div>
                          <p className="text-sm font-medium text-zinc-500">
                            Pickup Locations
                          </p>
                          {orderData.cartItems
                            ?.filter((i) => i.pickupLocation)
                            .map((item, idx) => (
                              <p key={idx} className="text-white">
                                <span className="text-zinc-400">
                                  {item.title}:
                                </span>{" "}
                                {item.pickupLocation}
                              </p>
                            ))}
                        </div>
                      )}
                  </div>
                </div>
              )}

              <div className="flex flex-col gap-3 sm:flex-row">
                <Button
                  className={`${NEO_BTN} flex-1`}
                  onClick={() =>
                    router.push(
                      sfShopSlug ? `/shop/${sfShopSlug}` : "/marketplace"
                    )
                  }
                  size="lg"
                  startContent={<ShoppingBagIcon className="h-5 w-5" />}
                >
                  Continue Shopping
                </Button>
                <Button
                  className="flex-1 bg-gray-200 text-white"
                  onClick={() => router.push("/orders")}
                  size="lg"
                  startContent={
                    <ClipboardDocumentListIcon className="h-5 w-5" />
                  }
                >
                  Check Order Status
                </Button>
                <Button
                  className="flex-1 bg-gray-200 text-white"
                  onClick={() => {
                    const npub = orderData?.sellerPubkey
                      ? nip19.npubEncode(orderData.sellerPubkey)
                      : null;
                    router.push(
                      npub
                        ? `/orders?pk=${npub}&isInquiry=true`
                        : "/orders?isInquiry=true"
                    );
                  }}
                  size="lg"
                  startContent={<ChatBubbleLeftRightIcon className="h-5 w-5" />}
                >
                  Contact Merchant
                </Button>
              </div>
            </div>

            {latestProducts.length > 0 && (
              <div className="mt-10">
                <h2 className="mb-6 text-center text-2xl font-bold text-white">
                  More From the Marketplace
                </h2>
                <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
                  {latestProducts.map((product) => (
                    <div
                      key={product.id}
                      className="overflow-hidden rounded-lg transition-transform hover:-translate-y-1"
                    >
                      <ProductCard
                        productData={product}
                        href={getProductHref(product)}
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </StorefrontThemeWrapper>
    </ProtectedRoute>
  );
}
