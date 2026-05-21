import { createContext, useContext } from "react";

type CustomDomainState = {
  isCustomDomain: boolean;
  isResolved: boolean;
};

const CustomDomainContext = createContext<CustomDomainState>({
  isCustomDomain: false,
  isResolved: false,
});

export function CustomDomainProvider({
  value,
  isResolved,
  children,
}: {
  value: boolean;
  isResolved: boolean;
  children: React.ReactNode;
}) {
  return (
    <CustomDomainContext.Provider value={{ isCustomDomain: value, isResolved }}>
      {children}
    </CustomDomainContext.Provider>
  );
}

export function useIsCustomDomain(): boolean {
  return useContext(CustomDomainContext).isCustomDomain;
}

export function useIsCustomDomainResolved(): boolean {
  return useContext(CustomDomainContext).isResolved;
}

/**
 * Strip a leading `/stall/<shopSlug>` prefix when rendering on a custom
 * domain so seller-configured nav/footer links resolve to the root
 * (e.g. `/about`, `/orders`, `/policies/returns`) instead of leaking the
 * platform's stall namespace into the seller's URLs.
 *
 * No-op on milk.market (isCustomDomain=false) and when the href doesn't
 * start with the stall prefix.
 */
export function applyCustomDomainHref(
  href: string,
  shopSlug: string | null | undefined,
  isCustomDomain: boolean
): string {
  if (!isCustomDomain || !href) return href;
  if (!shopSlug) return href;
  const prefix = `/stall/${shopSlug}`;
  if (href === prefix) return "/";
  if (href.startsWith(prefix + "/")) {
    const rest = href.slice(prefix.length);
    return rest || "/";
  }
  if (href.startsWith(prefix + "?") || href.startsWith(prefix + "#")) {
    return "/" + href.slice(prefix.length);
  }
  return href;
}
