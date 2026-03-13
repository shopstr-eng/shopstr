import {
  StorefrontColorScheme,
  StorefrontFooter,
  StorefrontPolicies,
} from "@/utils/types/types";
import Link from "next/link";
import {
  POLICY_LABELS,
  POLICY_SLUGS,
  getDefaultPolicies,
} from "@/utils/storefront-policies";

interface StorefrontFooterProps {
  footer: StorefrontFooter;
  colors: StorefrontColorScheme;
  shopName: string;
  shopSlug: string;
}

const SOCIAL_ICONS: Record<string, string> = {
  instagram: "📷",
  x: "𝕏",
  facebook: "📘",
  youtube: "▶",
  tiktok: "♪",
  telegram: "✈",
  website: "🌐",
  email: "✉",
  other: "🔗",
};

const POLICY_KEYS: (keyof StorefrontPolicies)[] = [
  "returnPolicy",
  "termsOfService",
  "privacyPolicy",
  "cancellationPolicy",
];

export default function StorefrontFooterComponent({
  footer,
  colors,
  shopName,
  shopSlug,
}: StorefrontFooterProps) {
  const socialLinks = footer.socialLinks || [];
  const navLinks = footer.navLinks || [];
  const showPoweredBy = footer.showPoweredBy !== false;

  const policies = footer.policies || {};
  const defaults = getDefaultPolicies(shopName);

  const enabledPolicies = POLICY_KEYS.filter((key) => {
    const policy = policies[key] || defaults[key];
    return policy && policy.enabled;
  });

  return (
    <footer
      className="border-t px-4 py-12 md:px-6"
      style={{
        backgroundColor: colors.secondary,
        borderColor: colors.primary + "22",
        color: colors.background,
      }}
    >
      <div className="mx-auto max-w-6xl">
        <div className="flex flex-col items-center gap-8 md:flex-row md:items-start md:justify-between">
          <div className="text-center md:text-left">
            <h3 className="font-heading text-lg font-bold">{shopName}</h3>
            {footer.text && (
              <p className="font-body mt-2 max-w-sm text-sm opacity-60">
                {footer.text}
              </p>
            )}
          </div>

          {navLinks.length > 0 && (
            <div className="flex flex-wrap justify-center gap-x-6 gap-y-2">
              {navLinks.map((link, idx) => {
                const href = link.isPage
                  ? `/shop/${shopSlug}/${link.href}`
                  : link.href;
                return (
                  <Link
                    key={idx}
                    href={href}
                    className="font-body text-sm opacity-60 transition-opacity hover:opacity-100"
                    style={{ color: colors.background }}
                  >
                    {link.label}
                  </Link>
                );
              })}
            </div>
          )}

          {socialLinks.length > 0 && (
            <div className="flex gap-4">
              {socialLinks.map((social, idx) => (
                <a
                  key={idx}
                  href={social.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex h-10 w-10 items-center justify-center rounded-full text-lg transition-transform hover:scale-110"
                  style={{
                    backgroundColor: colors.primary + "22",
                    color: colors.primary,
                  }}
                  title={social.label || social.platform}
                >
                  {SOCIAL_ICONS[social.platform] || SOCIAL_ICONS.other}
                </a>
              ))}
            </div>
          )}
        </div>

        {enabledPolicies.length > 0 && (
          <div
            className="mt-8 flex flex-wrap justify-center gap-x-6 gap-y-2 border-t pt-6"
            style={{ borderColor: colors.background + "11" }}
          >
            {enabledPolicies.map((key) => (
              <Link
                key={key}
                href={`/shop/${shopSlug}/${POLICY_SLUGS[key]}`}
                className="font-body text-xs opacity-40 transition-opacity hover:opacity-80"
                style={{ color: colors.background }}
              >
                {POLICY_LABELS[key]}
              </Link>
            ))}
          </div>
        )}

        {showPoweredBy && (
          <div
            className={`${
              enabledPolicies.length > 0 ? "mt-4" : "mt-8 border-t pt-6"
            } text-center text-sm opacity-40`}
            style={
              enabledPolicies.length > 0
                ? {}
                : { borderColor: colors.background + "11" }
            }
          >
            Powered by{" "}
            <Link
              href="/"
              className="underline"
              style={{ color: colors.primary }}
            >
              Milk Market
            </Link>
          </div>
        )}
      </div>
    </footer>
  );
}
