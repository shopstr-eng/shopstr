import { useEffect, useRef, useState, useContext } from "react";
import { useRouter } from "next/router";
import { Button } from "@heroui/react";
import {
  CheckCircleIcon,
  ShoppingBagIcon,
  ClipboardDocumentListIcon,
  ChatBubbleLeftRightIcon,
  ArrowPathIcon,
} from "@heroicons/react/24/outline";
import { nip19 } from "nostr-tools";
import { ProductContext } from "@/utils/context/context";
import parseTags, {
  ProductData,
} from "@/utils/parsers/product-parser-functions";
import ProductCard from "@/components/utility-components/product-card";
import {
  BLUEBUTTONCLASSNAMES,
  WHITEBUTTONCLASSNAMES,
} from "@/utils/STATIC-VARIABLES";
import ProtectedRoute from "@/components/utility-components/protected-route";
import { resolveExplicitPaymentMethod } from "@/utils/messages/order-message-utils";

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

export default function OrderSummary() {
  const router = useRouter();
  const [orderData, setOrderData] = useState<OrderSummaryData | null>(null);
  const [latestProducts, setLatestProducts] = useState<ProductData[]>([]);
  const productContext = useContext(ProductContext);

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
        setOrderData(JSON.parse(stored));
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
    const resolved = resolveExplicitPaymentMethod(method);
    const summaryLabels: Record<string, string> = {
      Lightning: "Lightning Network",
      Cashu: "Cashu eCash",
      NWC: "Nostr Wallet Connect",
      Card: "Credit Card (Stripe)",
    };
    return summaryLabels[resolved] || resolved;
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
        <div className="flex min-h-screen w-full items-center justify-center overflow-x-hidden bg-white">
          <div className="text-center">
            <p className="text-lg text-gray-600">Loading order details...</p>
          </div>
        </div>
      </ProtectedRoute>
    );
  }

  return (
    <ProtectedRoute>
      <div className="min-h-screen w-full overflow-x-hidden bg-white">
        <div className="mx-auto max-w-4xl px-4 pt-24 pb-8 sm:px-6 lg:px-8">
          <div className="shadow-neo mb-8 rounded-lg border-4 border-black bg-white p-6 sm:p-8">
            <div className="mb-6 flex flex-col items-center border-b-2 border-gray-200 pb-6">
              <div className="mb-3 flex h-16 w-16 items-center justify-center rounded-full border-2 border-black bg-green-100">
                <CheckCircleIcon className="h-10 w-10 text-green-600" />
              </div>
              <h1 className="text-2xl font-bold text-black sm:text-3xl">
                Order Confirmed!
              </h1>
              <p className="mt-2 text-center text-gray-600">
                The seller has been notified and will receive your order
                details.
              </p>
              {orderData.orderId && (
                <p className="mt-1 text-sm text-gray-500">
                  Order ID: {orderData.orderId.substring(0, 8)}...
                </p>
              )}
            </div>

            {orderData.isCart && orderData.cartItems ? (
              <div className="mb-6">
                <h2 className="mb-4 text-lg font-bold text-black">
                  Items Ordered
                </h2>
                <div className="space-y-4">
                  {orderData.cartItems.map((item, index) => (
                    <div
                      key={index}
                      className="flex items-center gap-4 rounded-md border-2 border-gray-200 p-3"
                    >
                      <img
                        src={item.image}
                        alt={item.title}
                        className="h-16 w-16 rounded-md border-2 border-black object-cover"
                      />
                      <div className="flex-1">
                        <h3 className="font-semibold text-black">
                          {item.title}
                        </h3>
                        <div className="flex flex-wrap gap-x-3 text-sm text-gray-500">
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
                      <p className="font-bold text-black">
                        {item.amount} {item.currency}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="mb-6">
                <h2 className="mb-4 text-lg font-bold text-black">
                  Product Details
                </h2>
                <div className="flex items-start gap-4 rounded-md border-2 border-gray-200 p-4">
                  {orderData.productImage && (
                    <img
                      src={orderData.productImage}
                      alt={orderData.productTitle}
                      className="h-24 w-24 rounded-md border-2 border-black object-cover"
                    />
                  )}
                  <div className="flex-1">
                    <h3 className="text-lg font-semibold text-black">
                      {orderData.productTitle}
                    </h3>
                    {orderData.selectedSize && (
                      <p className="text-sm text-gray-600">
                        Size: {orderData.selectedSize}
                      </p>
                    )}
                    {orderData.selectedVolume && (
                      <p className="text-sm text-gray-600">
                        Volume: {orderData.selectedVolume}
                      </p>
                    )}
                    {orderData.selectedWeight && (
                      <p className="text-sm text-gray-600">
                        Weight: {orderData.selectedWeight}
                      </p>
                    )}
                    {orderData.selectedBulkOption && (
                      <p className="text-sm text-gray-600">
                        Bundle: {orderData.selectedBulkOption} units
                      </p>
                    )}
                  </div>
                </div>
              </div>
            )}

            <div className="mb-6">
              <h2 className="mb-4 text-lg font-bold text-black">
                Order Details
              </h2>
              <div className="rounded-md border-2 border-gray-200 p-4">
                <div className="space-y-3">
                  <div className="flex items-center justify-between border-b border-gray-100 pb-2">
                    <span className="text-gray-600">Payment Method</span>
                    <span className="font-semibold text-black">
                      {formatPaymentMethod(orderData.paymentMethod)}
                    </span>
                  </div>

                  {orderData.isCart &&
                  orderData.subtotal &&
                  Number(orderData.subtotal) !== Number(orderData.amount) ? (
                    <>
                      <div className="flex items-center justify-between border-b border-gray-100 pb-2">
                        <span className="text-gray-600">Subtotal</span>
                        <span className="text-black">
                          {Number(orderData.subtotal).toLocaleString()}{" "}
                          {orderData.currency}
                        </span>
                      </div>
                      <div className="flex items-center justify-between border-b border-gray-100 pb-2">
                        <span className="text-gray-600">Shipping</span>
                        {orderData.freeShippingApplied ? (
                          <span className="flex items-center gap-2">
                            {orderData.originalShippingCost && (
                              <span className="text-gray-400 line-through">
                                {Number(
                                  orderData.originalShippingCost
                                ).toLocaleString()}{" "}
                                {orderData.currency}
                              </span>
                            )}
                            <span className="text-black">
                              0 {orderData.currency} (Free Shipping)
                            </span>
                            <span className="rounded-full border border-green-300 bg-green-100 px-2 py-0.5 text-xs font-semibold text-green-700">
                              Free
                            </span>
                          </span>
                        ) : (
                          <span className="text-black">
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
                      <div className="flex items-center justify-between border-b border-gray-100 pb-2">
                        <span className="text-gray-600">Subtotal</span>
                        <span className="text-black">
                          {Number(orderData.amount).toLocaleString()}{" "}
                          {orderData.currency}
                        </span>
                      </div>
                      <div className="flex items-center justify-between border-b border-gray-100 pb-2">
                        <span className="text-gray-600">Shipping</span>
                        <span className="flex items-center gap-2">
                          {orderData.originalShippingCost && (
                            <span className="text-gray-400 line-through">
                              {Number(
                                orderData.originalShippingCost
                              ).toLocaleString()}{" "}
                              {orderData.currency}
                            </span>
                          )}
                          <span className="text-black">
                            0 {orderData.currency} (Free Shipping)
                          </span>
                          <span className="rounded-full border border-green-300 bg-green-100 px-2 py-0.5 text-xs font-semibold text-green-700">
                            Free
                          </span>
                        </span>
                      </div>
                    </>
                  ) : orderData.shippingCost &&
                    Number(orderData.shippingCost) > 0 ? (
                    <>
                      <div className="flex items-center justify-between border-b border-gray-100 pb-2">
                        <span className="text-gray-600">Subtotal</span>
                        <span className="text-black">
                          {(
                            Number(orderData.amount) -
                            Number(orderData.shippingCost)
                          ).toLocaleString()}{" "}
                          {orderData.currency}
                        </span>
                      </div>
                      <div className="flex items-center justify-between border-b border-gray-100 pb-2">
                        <span className="text-gray-600">Shipping</span>
                        <span className="text-black">
                          {Number(orderData.shippingCost).toLocaleString()}{" "}
                          {orderData.currency}
                        </span>
                      </div>
                    </>
                  ) : null}

                  <div className="flex items-center justify-between pt-1">
                    <span className="text-lg font-bold text-black">Total</span>
                    <span className="text-lg font-bold text-black">
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
                <h2 className="mb-4 text-lg font-bold text-black">
                  Delivery Information
                </h2>
                <div className="space-y-3 rounded-md border-2 border-gray-200 p-4">
                  {orderData.shippingAddress && (
                    <div>
                      <p className="text-sm font-medium text-gray-500">
                        Shipping Address
                      </p>
                      <p className="text-black">{orderData.shippingAddress}</p>
                    </div>
                  )}
                  {orderData.pickupLocation && (
                    <div>
                      <p className="text-sm font-medium text-gray-500">
                        Pickup Location
                      </p>
                      <p className="text-black">{orderData.pickupLocation}</p>
                    </div>
                  )}
                  {orderData.isCart &&
                    orderData.cartItems?.some((i) => i.pickupLocation) && (
                      <div>
                        <p className="text-sm font-medium text-gray-500">
                          Pickup Locations
                        </p>
                        {orderData.cartItems
                          ?.filter((i) => i.pickupLocation)
                          .map((item, idx) => (
                            <p key={idx} className="text-black">
                              <span className="text-gray-600">
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

            {orderData.buyerEmail && (
              <div className="mb-6 rounded-md border-2 border-blue-200 bg-blue-50 p-4">
                <p className="text-sm text-blue-800">
                  Order updates will be sent to{" "}
                  <span className="font-semibold">{orderData.buyerEmail}</span>
                </p>
              </div>
            )}

            <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
              <Button
                className={BLUEBUTTONCLASSNAMES + " flex-1"}
                onClick={() => router.push("/marketplace")}
                size="lg"
                startContent={<ShoppingBagIcon className="h-5 w-5" />}
              >
                Continue Shopping
              </Button>
              <Button
                className={WHITEBUTTONCLASSNAMES + " flex-1"}
                onClick={() => router.push("/orders")}
                size="lg"
                startContent={<ClipboardDocumentListIcon className="h-5 w-5" />}
              >
                Check Order Status
              </Button>
              <Button
                className={WHITEBUTTONCLASSNAMES + " flex-1"}
                onClick={() => router.push("/orders?isInquiry=true")}
                size="lg"
                startContent={<ChatBubbleLeftRightIcon className="h-5 w-5" />}
              >
                Contact Merchant
              </Button>
              {orderData.isSubscription && (
                <Button
                  className={WHITEBUTTONCLASSNAMES + " flex-1"}
                  onClick={() => router.push("/orders?tab=subscriptions")}
                  size="lg"
                  startContent={<ArrowPathIcon className="h-5 w-5" />}
                >
                  Manage Subscription
                </Button>
              )}
            </div>
          </div>

          {latestProducts.length > 0 && (
            <div className="mt-10">
              <h2 className="mb-6 text-center text-2xl font-bold text-black">
                More From the Marketplace
              </h2>
              <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
                {latestProducts.map((product) => (
                  <div
                    key={product.id}
                    className="shadow-neo overflow-hidden rounded-lg border-4 border-black transition-transform hover:-translate-y-1"
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
    </ProtectedRoute>
  );
}
