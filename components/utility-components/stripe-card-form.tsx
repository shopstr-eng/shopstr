import { useState, useEffect } from "react";
import { loadStripe, Stripe } from "@stripe/stripe-js";
import {
  Elements,
  PaymentElement,
  useStripe,
  useElements,
} from "@stripe/react-stripe-js";
import { CreditCardIcon } from "@heroicons/react/24/outline";

function CheckoutForm({
  onPaymentSuccess,
  onPaymentError,
  onCancel,
}: {
  onPaymentSuccess: (paymentIntentId: string) => void;
  onPaymentError: (error: string) => void;
  onCancel: () => void;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!stripe || !elements) {
      return;
    }

    setIsProcessing(true);
    setErrorMessage(null);

    const { error, paymentIntent } = await stripe.confirmPayment({
      elements,
      redirect: "if_required",
    });

    if (error) {
      setErrorMessage(error.message || "Payment failed. Please try again.");
      onPaymentError(error.message || "Payment failed");
      setIsProcessing(false);
    } else if (paymentIntent && paymentIntent.status === "succeeded") {
      onPaymentSuccess(paymentIntent.id);
    } else {
      setErrorMessage("Payment was not completed. Please try again.");
      setIsProcessing(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="w-full">
      <div className="rounded-md border-2 border-black bg-white p-4 shadow-neo">
        <PaymentElement
          options={{
            layout: "tabs",
          }}
        />
      </div>

      {errorMessage && (
        <div className="mt-3 rounded-md border-2 border-red-500 bg-red-50 px-4 py-3 text-sm font-bold text-red-600 shadow-neo">
          {errorMessage}
        </div>
      )}

      <button
        type="submit"
        disabled={!stripe || !elements || isProcessing}
        className="mt-4 flex w-full transform items-center justify-center gap-2 rounded-md border-2 border-black bg-black px-4 py-3 font-bold text-white shadow-neo transition-transform hover:-translate-y-0.5 active:translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0"
      >
        {isProcessing ? (
          <>
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent"></div>
            Processing payment...
          </>
        ) : (
          <>
            <CreditCardIcon className="h-5 w-5" />
            Pay now
          </>
        )}
      </button>

      <button
        type="button"
        onClick={onCancel}
        className="mt-3 w-full text-center text-sm font-bold text-black underline hover:text-gray-700"
      >
        Cancel and return to checkout
      </button>
    </form>
  );
}

export default function StripeCardForm({
  clientSecret,
  connectedAccountId,
  onPaymentSuccess,
  onPaymentError,
  onCancel,
}: {
  clientSecret: string;
  connectedAccountId?: string | null;
  onPaymentSuccess: (paymentIntentId: string) => void;
  onPaymentError: (error: string) => void;
  onCancel: () => void;
}) {
  const [stripeInstance, setStripeInstance] = useState<Stripe | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const initStripe = async () => {
      const key = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || "";
      const instance = await loadStripe(key, {
        ...(connectedAccountId ? { stripeAccount: connectedAccountId } : {}),
      });
      setStripeInstance(instance);
      setLoading(false);
    };
    initStripe();
  }, [connectedAccountId]);

  if (loading || !stripeInstance) {
    return (
      <div className="flex w-full flex-col items-center justify-center rounded-md border-2 border-black bg-white py-8 shadow-neo">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-200 border-t-black"></div>
        <p className="mt-3 text-sm font-bold text-black">
          Loading payment form...
        </p>
      </div>
    );
  }

  return (
    <div className="w-full">
      <Elements
        stripe={stripeInstance}
        options={{
          clientSecret,
          appearance: {
            theme: "flat",
            variables: {
              colorPrimary: "#000000",
              colorBackground: "#ffffff",
              colorText: "#000000",
              colorDanger: "#dc2626",
              fontFamily: "Poppins, sans-serif",
              spacingUnit: "4px",
              borderRadius: "6px",
              fontSizeBase: "15px",
              fontWeightNormal: "500",
            },
            rules: {
              ".Input": {
                border: "2px solid #000000",
                boxShadow: "4px 4px 0px #000000",
                padding: "10px 12px",
                backgroundColor: "#ffffff",
                transition: "transform 0.1s ease",
              },
              ".Input:focus": {
                border: "2px solid #000000",
                boxShadow: "4px 4px 0px #000000",
                outline: "none",
              },
              ".Label": {
                fontWeight: "700",
                fontSize: "14px",
                marginBottom: "6px",
                color: "#000000",
              },
              ".Tab": {
                borderRadius: "6px",
                border: "2px solid #000000",
                boxShadow: "4px 4px 0px #000000",
                fontWeight: "700",
                backgroundColor: "#ffffff",
              },
              ".Tab:hover": {
                backgroundColor: "#f9f9f9",
              },
              ".Tab--selected": {
                borderColor: "#000000",
                backgroundColor: "#FFD23F",
                boxShadow: "4px 4px 0px #000000",
                color: "#000000",
              },
              ".Tab--selected:hover": {
                backgroundColor: "#FFD23F",
              },
              ".TabIcon--selected": {
                fill: "#000000",
              },
              ".Block": {
                border: "2px solid #000000",
                boxShadow: "4px 4px 0px #000000",
                borderRadius: "6px",
                backgroundColor: "#ffffff",
              },
              ".CheckboxInput": {
                border: "2px solid #000000",
                borderRadius: "4px",
              },
              ".CheckboxInput--checked": {
                backgroundColor: "#000000",
                borderColor: "#000000",
              },
            },
          },
        }}
      >
        <CheckoutForm
          onPaymentSuccess={onPaymentSuccess}
          onPaymentError={onPaymentError}
          onCancel={onCancel}
        />
      </Elements>
    </div>
  );
}
