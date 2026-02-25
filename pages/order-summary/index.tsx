import { useEffect, useState, useContext } from "react";
import { useRouter } from "next/router";
import { Button } from "@nextui-org/react";
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
import { SHOPSTRBUTTONCLASSNAMES } from "@/utils/STATIC-VARIABLES";
import { SignerContext } from "@/components/utility-components/nostr-context-provider";

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
  selectedBulkOption?: string;
  shippingAddress?: string;
  pickupLocation?: string;
  sellerPubkey?: string;
  subtotal?: string;
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
    selectedBulkOption?: string;
  }>;
}

export default function OrderSummary() {
  const router = useRouter();
  const [orderData, setOrderData] = useState<OrderSummaryData | null>(null);
  const [latestProducts, setLatestProducts] = useState<ProductData[]>([]);
  const { isLoggedIn } = useContext(SignerContext);
  const productContext = useContext(ProductContext);

  useEffect(() => {
    const stored = sessionStorage.getItem("orderSummary");
    if (stored) {
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
      const shuffled = products.sort(() => Math.random() - 0.5).slice(0, 4);
      setLatestProducts(shuffled);
    }
  }, [productContext.isLoading, productContext.productEvents, orderData]);

  const formatPaymentMethod = (method: string) => {
    const methods: Record<string, string> = {
      lightning: "Lightning Network",
      cashu: "Cashu eCash",
      ecash: "Cashu eCash",
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

  if (!orderData) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-light-bg dark:bg-dark-bg">
        <div className="text-center">
          <p className="text-lg text-gray-600 dark:text-gray-400">
            Loading order details...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-light-bg dark:bg-dark-bg">
      <div className="mx-auto max-w-4xl px-4 pb-8 pt-24 sm:px-6 lg:px-8">
        <div className="mb-8 rounded-lg border border-gray-200 bg-light-fg p-6 shadow-md dark:border-gray-700 dark:bg-dark-fg sm:p-8">
          <div className="mb-6 flex flex-col items-center border-b border-gray-200 pb-6 dark:border-gray-700">
            <div className="mb-3 flex h-16 w-16 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/30">
              <CheckCircleIcon className="h-10 w-10 text-green-600 dark:text-green-400" />
            </div>
            <h1 className="text-2xl font-bold text-light-text dark:text-dark-text sm:text-3xl">
              Order Confirmed!
            </h1>
            <p className="mt-2 text-center text-gray-600 dark:text-gray-400">
              The seller has been notified and will receive your order details.
            </p>
            {orderData.orderId && (
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                Order ID: {orderData.orderId.substring(0, 8)}...
              </p>
            )}
          </div>

          {orderData.isCart && orderData.cartItems ? (
            <div className="mb-6">
              <h2 className="mb-4 text-lg font-bold text-light-text dark:text-dark-text">
                Items Ordered
              </h2>
              <div className="space-y-4">
                {orderData.cartItems.map((item, index) => (
                  <div
                    key={index}
                    className="flex items-center gap-4 rounded-md border border-gray-200 p-3 dark:border-gray-700"
                  >
                    <img
                      src={item.image}
                      alt={item.title}
                      className="h-16 w-16 rounded-md object-cover"
                    />
                    <div className="flex-1">
                      <h3 className="font-semibold text-light-text dark:text-dark-text">
                        {item.title}
                      </h3>
                      <div className="flex flex-wrap gap-x-3 text-sm text-gray-500 dark:text-gray-400">
                        {item.quantity && item.quantity > 1 && (
                          <span>Qty: {item.quantity}</span>
                        )}
                        {item.selectedSize && (
                          <span>Size: {item.selectedSize}</span>
                        )}
                        {item.selectedVolume && (
                          <span>Volume: {item.selectedVolume}</span>
                        )}
                        {item.selectedBulkOption && (
                          <span>Bundle: {item.selectedBulkOption} units</span>
                        )}
                        {item.shipping && (
                          <span className="capitalize">{item.shipping}</span>
                        )}
                      </div>
                    </div>
                    <p className="font-bold text-light-text dark:text-dark-text">
                      {item.amount} {item.currency}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="mb-6">
              <h2 className="mb-4 text-lg font-bold text-light-text dark:text-dark-text">
                Product Details
              </h2>
              <div className="flex items-start gap-4 rounded-md border border-gray-200 p-4 dark:border-gray-700">
                {orderData.productImage && (
                  <img
                    src={orderData.productImage}
                    alt={orderData.productTitle}
                    className="h-24 w-24 rounded-md object-cover"
                  />
                )}
                <div className="flex-1">
                  <h3 className="text-lg font-semibold text-light-text dark:text-dark-text">
                    {orderData.productTitle}
                  </h3>
                  {orderData.selectedSize && (
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      Size: {orderData.selectedSize}
                    </p>
                  )}
                  {orderData.selectedVolume && (
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      Volume: {orderData.selectedVolume}
                    </p>
                  )}
                  {orderData.selectedBulkOption && (
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      Bundle: {orderData.selectedBulkOption} units
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}

          <div className="mb-6">
            <h2 className="mb-4 text-lg font-bold text-light-text dark:text-dark-text">
              Order Details
            </h2>
            <div className="rounded-md border border-gray-200 p-4 dark:border-gray-700">
              <div className="space-y-3">
                <div className="flex items-center justify-between border-b border-gray-100 pb-2 dark:border-gray-700">
                  <span className="text-gray-600 dark:text-gray-400">
                    Payment Method
                  </span>
                  <span className="font-semibold text-light-text dark:text-dark-text">
                    {formatPaymentMethod(orderData.paymentMethod)}
                  </span>
                </div>

                {orderData.isCart &&
                orderData.subtotal &&
                Number(orderData.subtotal) !== Number(orderData.amount) ? (
                  <>
                    <div className="flex items-center justify-between border-b border-gray-100 pb-2 dark:border-gray-700">
                      <span className="text-gray-600 dark:text-gray-400">
                        Subtotal
                      </span>
                      <span className="text-light-text dark:text-dark-text">
                        {Number(orderData.subtotal).toLocaleString()}{" "}
                        {orderData.currency}
                      </span>
                    </div>
                    <div className="flex items-center justify-between border-b border-gray-100 pb-2 dark:border-gray-700">
                      <span className="text-gray-600 dark:text-gray-400">
                        Shipping
                      </span>
                      <span className="text-light-text dark:text-dark-text">
                        {(
                          Number(orderData.amount) - Number(orderData.subtotal)
                        ).toLocaleString()}{" "}
                        {orderData.currency}
                      </span>
                    </div>
                  </>
                ) : orderData.shippingCost &&
                  Number(orderData.shippingCost) > 0 ? (
                  <>
                    <div className="flex items-center justify-between border-b border-gray-100 pb-2 dark:border-gray-700">
                      <span className="text-gray-600 dark:text-gray-400">
                        Subtotal
                      </span>
                      <span className="text-light-text dark:text-dark-text">
                        {(
                          Number(orderData.amount) -
                          Number(orderData.shippingCost)
                        ).toLocaleString()}{" "}
                        {orderData.currency}
                      </span>
                    </div>
                    <div className="flex items-center justify-between border-b border-gray-100 pb-2 dark:border-gray-700">
                      <span className="text-gray-600 dark:text-gray-400">
                        Shipping
                      </span>
                      <span className="text-light-text dark:text-dark-text">
                        {Number(orderData.shippingCost).toLocaleString()}{" "}
                        {orderData.currency}
                      </span>
                    </div>
                  </>
                ) : null}

                <div className="flex items-center justify-between pt-1">
                  <span className="text-lg font-bold text-light-text dark:text-dark-text">
                    Total
                  </span>
                  <span className="text-lg font-bold text-light-text dark:text-dark-text">
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
              <h2 className="mb-4 text-lg font-bold text-light-text dark:text-dark-text">
                Delivery Information
              </h2>
              <div className="space-y-3 rounded-md border border-gray-200 p-4 dark:border-gray-700">
                {orderData.shippingAddress && (
                  <div>
                    <p className="text-sm font-medium text-gray-500 dark:text-gray-400">
                      Shipping Address
                    </p>
                    <p className="text-light-text dark:text-dark-text">
                      {orderData.shippingAddress}
                    </p>
                  </div>
                )}
                {orderData.pickupLocation && (
                  <div>
                    <p className="text-sm font-medium text-gray-500 dark:text-gray-400">
                      Pickup Location
                    </p>
                    <p className="text-light-text dark:text-dark-text">
                      {orderData.pickupLocation}
                    </p>
                  </div>
                )}
                {orderData.isCart &&
                  orderData.cartItems?.some((i) => i.pickupLocation) && (
                    <div>
                      <p className="text-sm font-medium text-gray-500 dark:text-gray-400">
                        Pickup Locations
                      </p>
                      {orderData.cartItems
                        ?.filter((i) => i.pickupLocation)
                        .map((item, idx) => (
                          <p
                            key={idx}
                            className="text-light-text dark:text-dark-text"
                          >
                            <span className="text-gray-600 dark:text-gray-400">
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
              className={SHOPSTRBUTTONCLASSNAMES + " flex-1"}
              onClick={() => router.push("/marketplace")}
              size="lg"
              startContent={<ShoppingBagIcon className="h-5 w-5" />}
            >
              Continue Shopping
            </Button>
            {isLoggedIn && (
              <>
                <Button
                  className="flex-1 bg-gray-200 text-light-text dark:bg-gray-700 dark:text-dark-text"
                  onClick={() => router.push("/orders")}
                  size="lg"
                  startContent={
                    <ClipboardDocumentListIcon className="h-5 w-5" />
                  }
                >
                  Check Order Status
                </Button>
                <Button
                  className="flex-1 bg-gray-200 text-light-text dark:bg-gray-700 dark:text-dark-text"
                  onClick={() => router.push("/orders?isInquiry=true")}
                  size="lg"
                  startContent={<ChatBubbleLeftRightIcon className="h-5 w-5" />}
                >
                  Contact Merchant
                </Button>
              </>
            )}
          </div>
        </div>

        {latestProducts.length > 0 && (
          <div className="mt-10">
            <h2 className="mb-6 text-center text-2xl font-bold text-light-text dark:text-dark-text">
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
  );
}
