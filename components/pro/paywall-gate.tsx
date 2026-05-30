import type { ReactNode } from "react";
import { useProMembership } from "@/components/utility-components/pro-membership-context";
import UpgradeBanner from "@/components/pro/upgrade-banner";

interface PaywallGateProps {
  children: ReactNode;
  /** Feature name used in the fallback banner copy. */
  feature?: string;
  /** Custom node to render instead of the default upgrade banner. */
  fallback?: ReactNode;
  /** Render nothing (instead of a banner) when the seller isn't entitled. */
  hideWhenLocked?: boolean;
  /** Render children while the status is still loading (default: false). */
  showWhileLoading?: boolean;
}

// Wraps Pro-only UI. Renders children only for entitled sellers; otherwise
// shows the upgrade banner (or a custom fallback / nothing).
export default function PaywallGate({
  children,
  feature,
  fallback,
  hideWhenLocked = false,
  showWhileLoading = false,
}: PaywallGateProps) {
  const { membership, loading } = useProMembership();

  if (loading) {
    return showWhileLoading ? <>{children}</> : null;
  }

  if (membership.isPro) {
    return <>{children}</>;
  }

  if (hideWhenLocked) return null;
  if (fallback !== undefined) return <>{fallback}</>;
  return <UpgradeBanner feature={feature} />;
}
