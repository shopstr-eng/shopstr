import { useState, useEffect } from "react";
import {
  StorefrontColorScheme,
  StorefrontEmailPopup,
  PopupFlowStep,
} from "@/utils/types/types";
import { XMarkIcon } from "@heroicons/react/24/outline";
import { motion, AnimatePresence } from "framer-motion";
import { copyToClipboard } from "@/utils/clipboard";

interface StorefrontEmailPopupProps {
  config: StorefrontEmailPopup;
  colors: StorefrontColorScheme;
  shopPubkey: string;
  shopName: string;
  fontHeading?: string;
  fontBody?: string;
}

export default function StorefrontEmailPopupComponent({
  config,
  colors,
  shopPubkey,
  shopName,
  fontHeading,
  fontBody,
}: StorefrontEmailPopupProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [status, setStatus] = useState<
    "idle" | "submitting" | "success" | "error"
  >("idle");
  const [discountCode, setDiscountCode] = useState("");
  const [errorMsg, setErrorMsg] = useState("");

  const flowSteps = config.flowSteps || [];
  const hasFlow = flowSteps.length > 0;
  const [currentStepId, setCurrentStepId] = useState<string | null>(
    hasFlow ? flowSteps[0]!.id : null
  );
  const [flowCompleted, setFlowCompleted] = useState(!hasFlow);
  const [flowAnswers, setFlowAnswers] = useState<Record<string, string>>({});

  const s = config.style;
  const bg = s?.backgroundColor || colors.background;
  const text = s?.textColor || colors.text;
  const accent = s?.accentColor || colors.primary;
  const btnColor = s?.buttonColor || colors.primary;
  const btnText = s?.buttonTextColor || colors.secondary;
  const bgImage = s?.backgroundImage;
  const overlayOpacity = s?.overlayOpacity ?? 0.6;
  const useCustomFonts = s?.useCustomFonts ?? false;

  const fontStyles = useCustomFonts
    ? {
        fontFamily: fontBody
          ? `var(--font-body, '${fontBody}', sans-serif)`
          : undefined,
      }
    : {};
  const headingFontStyles = useCustomFonts
    ? {
        fontFamily: fontHeading
          ? `var(--font-heading, '${fontHeading}', sans-serif)`
          : undefined,
      }
    : {};

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

  const handleFlowAnswer = (step: PopupFlowStep, answerId: string) => {
    const answer = step.answers.find((a) => a.id === answerId);
    if (!answer) return;

    setFlowAnswers((prev) => ({ ...prev, [step.id]: answer.label }));

    if (answer.nextStepId) {
      const nextStep = flowSteps.find((s) => s.id === answer.nextStepId);
      if (nextStep) {
        setCurrentStepId(nextStep.id);
        return;
      }
    }

    setFlowCompleted(true);
    setCurrentStepId(null);
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
          flowAnswers:
            Object.keys(flowAnswers).length > 0 ? flowAnswers : undefined,
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

  const currentStep = currentStepId
    ? flowSteps.find((s) => s.id === currentStepId)
    : null;

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
            style={{ backgroundColor: bg, ...fontStyles }}
          >
            {bgImage && (
              <div
                className="absolute inset-0"
                style={{
                  backgroundImage: `url(${bgImage})`,
                  backgroundSize: "cover",
                  backgroundPosition: "center",
                  opacity: overlayOpacity,
                }}
              />
            )}

            <div className="relative z-10">
              <button
                onClick={handleDismiss}
                className="absolute top-3 right-3 z-10 rounded-full p-1 transition-colors hover:bg-black/10"
                style={{ color: text + "99" }}
              >
                <XMarkIcon className="h-5 w-5" />
              </button>

              <div
                className="px-6 py-4 text-center"
                style={{ backgroundColor: accent }}
              >
                <div
                  className="text-4xl font-bold"
                  style={{ color: btnText, ...headingFontStyles }}
                >
                  {config.discountPercentage}% OFF
                </div>
              </div>

              <div className="px-6 py-6">
                <AnimatePresence mode="wait">
                  {status === "success" ? (
                    <motion.div
                      key="success"
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -20 }}
                      className="text-center"
                    >
                      <div className="mb-3 text-3xl">&#127881;</div>
                      <h3
                        className="mb-2 text-lg font-bold"
                        style={{ color: text, ...headingFontStyles }}
                      >
                        You&apos;re In!
                      </h3>
                      <p
                        className="mb-4 text-sm"
                        style={{ color: text + "99" }}
                      >
                        {successMessage}
                      </p>
                      <div
                        className="mb-4 rounded-lg border-2 border-dashed px-4 py-3"
                        style={{
                          borderColor: accent,
                          backgroundColor: accent + "15",
                        }}
                      >
                        <p
                          className="mb-1 text-xs tracking-wider uppercase"
                          style={{ color: text + "77" }}
                        >
                          Your Code
                        </p>
                        <p
                          className="font-mono text-xl font-bold tracking-wider"
                          style={{ color: text }}
                        >
                          {discountCode}
                        </p>
                      </div>
                      <button
                        onClick={() => {
                          void copyToClipboard(discountCode);
                        }}
                        className="mb-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors"
                        style={{
                          backgroundColor: btnColor,
                          color: btnText,
                        }}
                      >
                        Copy Code
                      </button>
                      <button
                        onClick={handleDismiss}
                        className="mt-2 block w-full text-sm"
                        style={{ color: text + "77" }}
                      >
                        Continue Shopping
                      </button>
                    </motion.div>
                  ) : !flowCompleted && currentStep ? (
                    <motion.div
                      key={`step-${currentStep.id}`}
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -20 }}
                      className="text-center"
                    >
                      <h3
                        className="mb-5 text-lg font-bold"
                        style={{ color: text, ...headingFontStyles }}
                      >
                        {currentStep.question}
                      </h3>
                      <div className="space-y-2">
                        {currentStep.answers.map((answer) => (
                          <button
                            key={answer.id}
                            type="button"
                            onClick={() =>
                              handleFlowAnswer(currentStep, answer.id)
                            }
                            className="w-full rounded-lg px-4 py-3 text-sm font-semibold transition-all hover:opacity-90"
                            style={{
                              backgroundColor: btnColor,
                              color: btnText,
                            }}
                          >
                            {answer.label}
                          </button>
                        ))}
                      </div>
                      <button
                        onClick={handleDismiss}
                        className="mt-4 block w-full text-center text-xs"
                        style={{ color: text + "55" }}
                      >
                        No thanks
                      </button>
                    </motion.div>
                  ) : (
                    <motion.div
                      key="capture"
                      initial={{ opacity: 0, x: hasFlow ? 20 : 0 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -20 }}
                    >
                      <h3
                        className="mb-2 text-center text-lg font-bold"
                        style={{ color: text, ...headingFontStyles }}
                      >
                        {headline}
                      </h3>
                      <p
                        className="mb-5 text-center text-sm"
                        style={{ color: text + "99" }}
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
                          className="w-full rounded-lg border-2 px-4 py-3 text-sm transition-colors outline-none focus:ring-2"
                          style={{
                            borderColor: text + "22",
                            color: text,
                            backgroundColor: bg,
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
                            className="w-full rounded-lg border-2 px-4 py-3 text-sm transition-colors outline-none focus:ring-2"
                            style={{
                              borderColor: text + "22",
                              color: text,
                              backgroundColor: bg,
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
                            backgroundColor: btnColor,
                            color: btnText,
                          }}
                        >
                          {status === "submitting"
                            ? "Please wait..."
                            : buttonText}
                        </button>
                      </form>
                      <button
                        onClick={handleDismiss}
                        className="mt-3 block w-full text-center text-xs"
                        style={{ color: text + "55" }}
                      >
                        No thanks
                      </button>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
