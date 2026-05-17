import { StorefrontColorScheme } from "@/utils/types/types";
import dynamic from "next/dynamic";

const Orders = dynamic(() => import("@/pages/orders"), { ssr: false });

interface StorefrontOrdersProps {
  colors: StorefrontColorScheme;
}

export default function StorefrontOrders({ colors }: StorefrontOrdersProps) {
  return (
    <div
      className="min-h-screen"
      style={{ backgroundColor: colors.background }}
    >
      <Orders />
    </div>
  );
}
