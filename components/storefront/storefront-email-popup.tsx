import { useState, useEffect } from "react";
import {
  StorefrontColorScheme,
  StorefrontEmailPopup,
} from "@/utils/types/types";
import { XMarkIcon } from "@heroicons/react/24/outline";
import { motion, AnimatePresence } from "framer-motion";

interface StorefrontEmailPopupProps {
  config: StorefrontEmailPopup;
  colors: StorefrontColorScheme;
  shopPubkey: string;
  shopName: string;
}

export default function StorefrontEmailPopupComponent({
  config,
  colors,
  shopPubkey,
  shopName,
}: StorefrontEmailPopupProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [status, setStatus] = useState<
    "idle" | "submitting" | "success" | "error"
  >("idle");
  const [discountCode, setDiscountCode] = useState("");
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    const storageKey = `popup_dismissed_${shopPubkey}`;
    const dismissed = localStorage.getItem(storageKey);
    if (dismissed) return;

    const timer = setTimeout(() => {
      setIsVisible(true);
    }, 3000);

    return () => clearTimeout(timer);
  }, [shopPubkey]);

  const handleDismiss = () => {
    setIsVisible(false);
    localStorage.setItem(`popup_dismissed_${shopPubkey}`, "1");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;

    if (config.requirePhone && !phone) {
      setErrorMsg("Phone number is required");
      return;
    }

    setStatus("submitting");
    setErrorMsg("");

    try {
      const res = await fetch("/api/storefront/popup-capture", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sellerPubkey: shopPubkey,
          email,
          phone: phone || undefined,
          discountPercentage: config.discountPercentage,
          shopName,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setErrorMsg(data.error || "Something went wrong");
        setStatus("error");
        return;
      }

      setDiscountCode(data.discountCode);
      setStatus("success");
      localStorage.setItem(`popup_dismissed_${shopPubkey}`, "1");
    } catch {
      setErrorMsg("Something went wrong. Please try again.");
      setStatus("error");
    }
  };

  const headline =
    config.headline || `Get ${config.discountPercentage}% Off Your First Order`;
  const subtext =
    config.subtext || "Sign up to receive an exclusive discount code.";
  const buttonText = config.buttonText || "Get My Discount";
  const successMessage =
    config.successMessage || "Check your email for your discount code!";

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
          style={{ backgroundColor: "rgba(0,0,0,0.5)" }}
          onClick={(e) => {
            if (e.target === e.currentTarget) handleDismiss();
          }}
        >
          <motion.div
            initial={{ scale: 0.9, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.9, opacity: 0, y: 20 }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            className="relative w-full max-w-md overflow-hidden rounded-2xl shadow-2xl"
            style={{ backgroundColor: colors.background }}
          >
            <button
              onClick={handleDismiss}
              className="absolute right-3 top-3 z-10 rounded-full p-1 transition-colors hover:bg-black/10"
              style={{ color: colors.text + "99" }}
            >
              <XMarkIcon className="h-5 w-5" />
            </button>

            <div
              className="px-6 py-4 text-center"
              style={{ backgroundColor: colors.primary }}
            >
              <div
                className="text-4xl font-bold"
                style={{ color: colors.secondary }}
              >
                {config.discountPercentage}% OFF
              </div>
            </div>

            <div className="px-6 py-6">
              {status === "success" ? (
                <div className="text-center">
                  <div className="mb-3 text-3xl">&#127881;</div>
                  <h3
                    className="mb-2 text-lg font-bold"
                    style={{ color: colors.text }}
                  >
                    You&apos;re In!
                  </h3>
                  <p
                    className="mb-4 text-sm"
                    style={{ color: colors.text + "99" }}
                  >
                    {successMessage}
                  </p>
                  <div
                    className="mb-4 rounded-lg border-2 border-dashed px-4 py-3"
                    style={{
                      borderColor: colors.primary,
                      backgroundColor: colors.primary + "15",
                    }}
                  >
                    <p
                      className="mb-1 text-xs uppercase tracking-wider"
                      style={{ color: colors.text + "77" }}
                    >
                      Your Code
                    </p>
                    <p
                      className="font-mono text-xl font-bold tracking-wider"
                      style={{ color: colors.text }}
                    >
                      {discountCode}
                    </p>
                  </div>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(discountCode);
                    }}
                    className="mb-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors"
                    style={{
                      backgroundColor: colors.secondary,
                      color: colors.background,
                    }}
                  >
                    Copy Code
                  </button>
                  <button
                    onClick={handleDismiss}
                    className="mt-2 block w-full text-sm"
                    style={{ color: colors.text + "77" }}
                  >
                    Continue Shopping
                  </button>
                </div>
              ) : (
                <>
                  <h3
                    className="mb-2 text-center text-lg font-bold"
                    style={{ color: colors.text }}
                  >
                    {headline}
                  </h3>
                  <p
                    className="mb-5 text-center text-sm"
                    style={{ color: colors.text + "99" }}
                  >
                    {subtext}
                  </p>
                  <form onSubmit={handleSubmit} className="space-y-3">
                    <input
                      type="email"
                      placeholder="Enter your email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      className="w-full rounded-lg border-2 px-4 py-3 text-sm outline-none transition-colors focus:ring-2"
                      style={{
                        borderColor: colors.text + "22",
                        color: colors.text,
                        backgroundColor: colors.background,
                      }}
                    />
                    {config.collectPhone && (
                      <input
                        type="tel"
                        placeholder={
                          config.requirePhone
                            ? "Enter your phone number"
                            : "Phone number (optional)"
                        }
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        required={config.requirePhone}
                        className="w-full rounded-lg border-2 px-4 py-3 text-sm outline-none transition-colors focus:ring-2"
                        style={{
                          borderColor: colors.text + "22",
                          color: colors.text,
                          backgroundColor: colors.background,
                        }}
                      />
                    )}
                    {errorMsg && (
                      <p className="text-center text-sm text-red-500">
                        {errorMsg}
                      </p>
                    )}
                    <button
                      type="submit"
                      disabled={status === "submitting"}
                      className="w-full rounded-lg px-4 py-3 text-sm font-bold transition-all hover:opacity-90 disabled:opacity-50"
                      style={{
                        backgroundColor: colors.primary,
                        color: colors.secondary,
                      }}
                    >
                      {status === "submitting" ? "Please wait..." : buttonText}
                    </button>
                  </form>
                  <button
                    onClick={handleDismiss}
                    className="mt-3 block w-full text-center text-xs"
                    style={{ color: colors.text + "55" }}
                  >
                    No thanks
                  </button>
                </>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
