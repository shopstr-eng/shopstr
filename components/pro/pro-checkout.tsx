import { useEffect, useState } from "react";
import QRCode from "qrcode";
import {
  CreditCardIcon,
  BoltIcon,
  BanknotesIcon,
  ArrowLeftIcon,
  CheckCircleIcon,
  ClipboardDocumentIcon,
} from "@heroicons/react/24/outline";
import { useProMembership } from "@/components/utility-components/pro-membership-context";
import StripeCardForm from "@/components/utility-components/stripe-card-form";
import {
  PRO_ANNUAL_PRICE_CENTS,
  PRO_MONTHLY_PRICE_CENTS,
  proPriceUsd,
  type ProTerm,
} from "@/utils/pro/constants";
import {
  BLACKBUTTONCLASSNAMES,
  BLUEBUTTONCLASSNAMES,
} from "@/utils/STATIC-VARIABLES";

type PayMethod = "card" | "bitcoin" | "fiat";

// Annual savings vs paying monthly for a year, e.g. $252 - $168 = $84 (~33%).
const ANNUAL_SAVINGS_PERCENT = Math.round(
  (1 - PRO_ANNUAL_PRICE_CENTS / (PRO_MONTHLY_PRICE_CENTS * 12)) * 100
);

interface ProCheckoutProps {
  /** Called once Pro is paid (card/bitcoin) or a manual fiat invoice is set up. */
  onComplete: (status: "paid" | "pending") => void;
  className?: string;
}

// Shared Pro checkout used by the /pro upgrade page and the onboarding plan
// step. It only consumes the billing engine's membership hook + endpoints; it
// never talks to Stripe/Lightning directly beyond the shared StripeCardForm.
export default function ProCheckout({
  onComplete,
  className,
}: ProCheckoutProps) {
  const {
    startStripeSubscription,
    syncStripe,
    createManualInvoice,
    verifyManualInvoice,
  } = useProMembership();

  const [term, setTerm] = useState<ProTerm>("yearly");
  const [method, setMethod] = useState<PayMethod | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Card
  const [clientSecret, setClientSecret] = useState<string | null>(null);

  // Bitcoin / fiat manual invoice
  const [invoice, setInvoice] = useState<any | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string>("");
  const [copied, setCopied] = useState(false);

  const monthly = proPriceUsd("monthly");
  const yearly = proPriceUsd("yearly");

  const resetMethod = () => {
    setMethod(null);
    setClientSecret(null);
    setInvoice(null);
    setQrDataUrl("");
    setError(null);
  };

  const handleCard = async () => {
    setLoading(true);
    setError(null);
    try {
      const { clientSecret: cs } = await startStripeSubscription(term);
      if (!cs) {
        throw new Error("Could not start the card subscription. Try again.");
      }
      setClientSecret(cs);
      setMethod("card");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  };

  const handleManual = async (m: "bitcoin" | "fiat") => {
    setLoading(true);
    setError(null);
    try {
      const data = await createManualInvoice(term, m);
      setInvoice(data);
      setMethod(m);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  };

  // Generate a QR for the Bitcoin (Lightning) invoice.
  useEffect(() => {
    if (method === "bitcoin" && invoice?.bolt11) {
      QRCode.toDataURL(invoice.bolt11, { width: 240, margin: 1 })
        .then(setQrDataUrl)
        .catch(() => setQrDataUrl(""));
    }
  }, [method, invoice]);

  // Poll the Bitcoin invoice until it's paid.
  useEffect(() => {
    if (method !== "bitcoin" || !invoice?.invoiceId) return;
    let active = true;
    const poll = setInterval(async () => {
      try {
        const data = await verifyManualInvoice(invoice.invoiceId);
        if (active && data?.paid) {
          clearInterval(poll);
          onComplete("paid");
        }
      } catch {
        // Keep polling; transient errors are expected while unpaid.
      }
    }, 4000);
    return () => {
      active = false;
      clearInterval(poll);
    };
  }, [method, invoice, verifyManualInvoice, onComplete]);

  const handleCardSuccess = async () => {
    setLoading(true);
    try {
      await syncStripe();
      onComplete("paid");
    } catch {
      // Even if the immediate sync fails, the webhook will reconcile — let
      // them proceed rather than blocking on a transient error.
      onComplete("paid");
    } finally {
      setLoading(false);
    }
  };

  const copyBolt11 = async () => {
    try {
      await navigator.clipboard.writeText(invoice?.bolt11 || "");
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard unavailable */
    }
  };

  // ── Card payment view ──────────────────────────────────────────────────────
  if (method === "card" && clientSecret) {
    return (
      <div className={className}>
        <button
          type="button"
          onClick={resetMethod}
          className="mb-3 flex items-center gap-1 text-sm font-bold text-black underline"
        >
          <ArrowLeftIcon className="h-4 w-4" /> Choose a different method
        </button>
        <StripeCardForm
          clientSecret={clientSecret}
          onPaymentSuccess={handleCardSuccess}
          onPaymentError={(e) => setError(e)}
          onCancel={resetMethod}
        />
        {error && (
          <p className="mt-3 text-center text-sm font-bold text-red-600">
            {error}
          </p>
        )}
      </div>
    );
  }

  // ── Bitcoin (Lightning) view ───────────────────────────────────────────────
  if (method === "bitcoin" && invoice) {
    return (
      <div className={className}>
        <button
          type="button"
          onClick={resetMethod}
          className="mb-3 flex items-center gap-1 text-sm font-bold text-black underline"
        >
          <ArrowLeftIcon className="h-4 w-4" /> Choose a different method
        </button>
        <div className="shadow-neo flex flex-col items-center rounded-md border-2 border-black bg-white p-6">
          <h3 className="mb-1 text-lg font-bold text-black">
            Pay {invoice.amountSats?.toLocaleString()} sats
          </h3>
          <p className="mb-4 text-center text-sm text-zinc-600">
            Scan with a Lightning wallet. Pro activates automatically once paid.
          </p>
          {qrDataUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={qrDataUrl}
              alt="Lightning invoice QR code"
              className="rounded-md border-2 border-black"
              width={240}
              height={240}
            />
          ) : (
            <div className="flex h-[240px] w-[240px] items-center justify-center">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-200 border-t-black" />
            </div>
          )}
          <button
            type="button"
            onClick={copyBolt11}
            className="mt-4 flex items-center gap-2 text-sm font-bold text-black underline"
          >
            <ClipboardDocumentIcon className="h-4 w-4" />
            {copied ? "Copied!" : "Copy invoice"}
          </button>
          <div className="mt-4 flex items-center gap-2 text-sm font-medium text-zinc-600">
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-gray-300 border-t-black" />
            Waiting for payment…
          </div>
        </div>
      </div>
    );
  }

  // ── Manual fiat view ───────────────────────────────────────────────────────
  if (method === "fiat" && invoice) {
    const handles = (invoice.fiatHandles || "").trim();
    return (
      <div className={className}>
        <button
          type="button"
          onClick={resetMethod}
          className="mb-3 flex items-center gap-1 text-sm font-bold text-black underline"
        >
          <ArrowLeftIcon className="h-4 w-4" /> Choose a different method
        </button>
        <div className="shadow-neo rounded-md border-2 border-black bg-white p-6">
          <div className="mb-3 flex items-center gap-2">
            <CheckCircleIcon className="h-6 w-6 text-green-600" />
            <h3 className="text-lg font-bold text-black">
              Invoice created — ${invoice.amountUsd}
            </h3>
          </div>
          <p className="mb-4 text-sm text-zinc-700">
            {invoice.note ||
              "After paying, the Milk Market team will confirm your payment and activate Pro."}
          </p>
          {handles ? (
            <div className="rounded-md border-2 border-black bg-gray-50 p-4">
              <p className="mb-1 text-xs font-bold tracking-wide text-zinc-500 uppercase">
                Send payment to
              </p>
              <p className="font-mono text-sm break-words text-black">
                {handles}
              </p>
            </div>
          ) : (
            <p className="text-sm text-zinc-600">
              Contact the Milk Market team to arrange payment.
            </p>
          )}
          <p className="mt-4 text-xs text-zinc-500">
            Pro features unlock as soon as your payment is confirmed.
          </p>
          <button
            type="button"
            onClick={() => onComplete("pending")}
            className={`${BLUEBUTTONCLASSNAMES} mt-4 w-full justify-center`}
          >
            I&apos;ve sent payment &mdash; continue
          </button>
        </div>
      </div>
    );
  }

  // ── Plan + method selection ────────────────────────────────────────────────
  return (
    <div className={className}>
      {/* Term toggle */}
      <div className="shadow-neo mb-5 flex rounded-md border-2 border-black bg-white p-1">
        <button
          type="button"
          onClick={() => setTerm("monthly")}
          className={`flex-1 rounded-[4px] px-4 py-2 text-sm font-bold transition-colors ${
            term === "monthly" ? "bg-black text-white" : "text-black"
          }`}
        >
          Monthly · ${monthly}/mo
        </button>
        <button
          type="button"
          onClick={() => setTerm("yearly")}
          className={`flex-1 rounded-[4px] px-4 py-2 text-sm font-bold transition-colors ${
            term === "yearly" ? "bg-black text-white" : "text-black"
          }`}
        >
          Yearly · ${yearly}/yr
          <span className="ml-1 text-xs font-bold text-green-600">
            Save {ANNUAL_SAVINGS_PERCENT}%
          </span>
        </button>
      </div>

      {error && (
        <p className="mb-4 text-center text-sm font-bold text-red-600">
          {error}
        </p>
      )}

      <div className="flex flex-col gap-3">
        <button
          type="button"
          onClick={handleCard}
          disabled={loading}
          className={`${BLUEBUTTONCLASSNAMES} w-full justify-center disabled:opacity-50`}
        >
          <CreditCardIcon className="mr-2 h-5 w-5" />
          Pay with card
        </button>
        <button
          type="button"
          onClick={() => handleManual("bitcoin")}
          disabled={loading}
          className={`${BLACKBUTTONCLASSNAMES} w-full justify-center disabled:opacity-50`}
        >
          <BoltIcon className="mr-2 h-5 w-5" />
          Pay with Bitcoin (Lightning)
        </button>
        <button
          type="button"
          onClick={() => handleManual("fiat")}
          disabled={loading}
          className="shadow-neo flex w-full items-center justify-center rounded-md border-2 border-black bg-white px-4 py-2 font-bold text-black transition-transform hover:-translate-y-0.5 disabled:opacity-50"
        >
          <BanknotesIcon className="mr-2 h-5 w-5" />
          Request a manual invoice
        </button>
      </div>

      {loading && (
        <div className="mt-4 flex items-center justify-center gap-2 text-sm font-medium text-zinc-600">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-gray-300 border-t-black" />
          Setting up checkout…
        </div>
      )}
    </div>
  );
}
