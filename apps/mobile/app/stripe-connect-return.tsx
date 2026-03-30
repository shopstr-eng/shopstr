import { useEffect } from "react";
import { useLocalSearchParams, useRouter, type Href } from "expo-router";

import { ScreenScrollView, ScreenTitle } from "@/components/seller-ui";

export default function StripeConnectReturnScreen() {
  const router = useRouter();
  const { refresh, success } = useLocalSearchParams<{
    refresh?: string;
    success?: string;
  }>();

  useEffect(() => {
    const nextStatus =
      refresh === "true"
        ? "refresh"
        : success === "true"
          ? "success"
          : "";
    const target = nextStatus
      ? `/?stripeConnectStatus=${nextStatus}`
      : "/";

    router.replace(target as Href);
  }, [refresh, router, success]);

  return (
    <ScreenScrollView>
      <ScreenTitle
        eyebrow="Stripe Connect"
        title="Returning to seller dashboard"
        description="Milk Market is handing control back to the native seller workspace."
      />
    </ScreenScrollView>
  );
}
