import { Chip } from "@heroui/react";

interface ProBadgeProps {
  size?: "sm" | "md" | "lg";
  variant?: "trial" | "active";
  className?: string;
}

// Small "Pro" marker. Use `variant="trial"` to signal a trialing seller.
export default function ProBadge({
  size = "sm",
  variant = "active",
  className,
}: ProBadgeProps) {
  return (
    <Chip
      size={size}
      color={variant === "trial" ? "warning" : "success"}
      variant="flat"
      className={className}
    >
      {variant === "trial" ? "Pro trial" : "Pro"}
    </Chip>
  );
}
