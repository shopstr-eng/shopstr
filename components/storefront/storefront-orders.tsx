import { useContext } from "react";
import { StorefrontColorScheme } from "@/utils/types/types";
import { SignerContext } from "@/components/utility-components/nostr-context-provider";
import OrdersDashboard from "@/components/messages/orders-dashboard";
interface StorefrontOrdersProps {
  colors: StorefrontColorScheme;
  shopPubkey: string;
}

export default function StorefrontOrders({
  colors,
  shopPubkey,
}: StorefrontOrdersProps) {
  const { isLoggedIn } = useContext(SignerContext);

  if (!isLoggedIn) {
    return (
      <div className="py-24 text-center">
        <h2
          className="font-heading text-2xl font-bold"
          style={{ color: colors.text }}
        >
          Sign in to view your orders
        </h2>
        <p className="mt-2 text-sm" style={{ color: colors.text + "99" }}>
          You need to be signed in to see your order history.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-8" style={{ color: colors.text }}>
      <h2
        className="font-heading mb-6 text-2xl font-bold"
        style={{ color: colors.text }}
      >
        Your Orders
      </h2>
      <div
        className="storefront-orders-themed"
        style={
          {
            "--sf-primary": colors.primary,
            "--sf-secondary": colors.secondary,
            "--sf-accent": colors.accent,
            "--sf-bg": colors.background,
            "--sf-text": colors.text,
          } as React.CSSProperties
        }
      >
        <OrdersDashboard filterBySellerPubkey={shopPubkey} />
      </div>
    </div>
  );
}
