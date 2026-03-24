import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { XMarkIcon, TruckIcon } from "@heroicons/react/24/outline";
import { ShopProfile } from "@/utils/types/types";
import { ProductData } from "@/utils/parsers/product-parser-functions";

interface SellerProgress {
  sellerPubkey: string;
  sellerName: string;
  currentTotal: number;
  threshold: number;
  currency: string;
  percentage: number;
  amountAway: number;
}

export default function FreeShippingNotification({
  isVisible,
  onClose,
  shopData,
  cart,
}: {
  isVisible: boolean;
  onClose: () => void;
  shopData: Map<string, ShopProfile>;
  cart: ProductData[];
}) {
  const [sellerProgresses, setSellerProgresses] = useState<SellerProgress[]>(
    []
  );

  useEffect(() => {
    if (!isVisible) return;

    const sellerTotals = new Map<string, number>();
    for (const item of cart) {
      const effectivePrice =
        item.bulkPrice ?? item.volumePrice ?? item.weightPrice ?? item.price;
      const prev = sellerTotals.get(item.pubkey) || 0;
      sellerTotals.set(item.pubkey, prev + effectivePrice);
    }

    const progresses: SellerProgress[] = [];
    for (const [pubkey, total] of sellerTotals.entries()) {
      const shop = shopData.get(pubkey);
      if (
        shop &&
        shop.content.freeShippingThreshold &&
        shop.content.freeShippingThreshold > 0
      ) {
        const threshold = shop.content.freeShippingThreshold;
        const currency = shop.content.freeShippingCurrency || "USD";
        const percentage = Math.min((total / threshold) * 100, 100);
        const amountAway = Math.max(threshold - total, 0);
        progresses.push({
          sellerPubkey: pubkey,
          sellerName: shop.content.name || "",
          currentTotal: total,
          threshold,
          currency,
          percentage,
          amountAway,
        });
      }
    }

    setSellerProgresses(progresses);
  }, [isVisible, shopData, cart]);

  useEffect(() => {
    if (!isVisible) return;
    const timer = setTimeout(() => {
      onClose();
    }, 6000);
    return () => clearTimeout(timer);
  }, [isVisible, onClose]);

  if (sellerProgresses.length === 0 && isVisible) {
    return null;
  }

  return (
    <AnimatePresence>
      {isVisible && sellerProgresses.length > 0 && (
        <motion.div
          initial={{ opacity: 0, x: 50, y: -10 }}
          animate={{ opacity: 1, x: 0, y: 0 }}
          exit={{ opacity: 0, x: 50, y: -10 }}
          transition={{ type: "spring", stiffness: 300, damping: 25 }}
          className="fixed right-4 top-20 z-50 w-80 rounded-md border-2 border-black bg-white p-4 shadow-neo"
        >
          <div className="mb-2 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <TruckIcon className="h-5 w-5 text-black" />
              <span className="text-sm font-bold text-black">
                Free Shipping Progress
              </span>
            </div>
            <button
              onClick={onClose}
              className="rounded-md p-0.5 transition-colors hover:bg-gray-100"
            >
              <XMarkIcon className="h-4 w-4 text-black" />
            </button>
          </div>
          <div className="space-y-3">
            {sellerProgresses.map((progress) => (
              <div key={progress.sellerPubkey}>
                {progress.sellerName && (
                  <p className="mb-1 text-xs font-semibold text-black">
                    {progress.sellerName}
                  </p>
                )}
                {progress.amountAway > 0 ? (
                  <p className="mb-1 text-xs text-gray-600">
                    ${progress.amountAway.toFixed(2)} {progress.currency} away
                    from free shipping!
                  </p>
                ) : (
                  <p className="mb-1 text-xs font-bold text-green-600">
                    Free shipping unlocked!
                  </p>
                )}
                <div className="h-2 w-full overflow-hidden rounded-full border border-black bg-gray-200">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${progress.percentage}%` }}
                    transition={{ duration: 0.5, ease: "easeOut" }}
                    className={`h-full rounded-full ${
                      progress.percentage >= 100
                        ? "bg-green-500"
                        : "bg-primary-blue"
                    }`}
                  />
                </div>
              </div>
            ))}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
