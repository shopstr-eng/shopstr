import {
  StorefrontColorScheme,
  StorefrontFooter,
  StorefrontFooterColors,
  StorefrontPolicies,
} from "@/utils/types/types";
import Link from "next/link";
import {
  POLICY_LABELS,
  POLICY_SLUGS,
  getDefaultPolicies,
} from "@/utils/storefront-policies";
import {
  isExternalStorefrontHref,
  sanitizeStorefrontNavHref,
  sanitizeStorefrontSocialLink,
} from "@/utils/storefront-links";

interface StorefrontFooterProps {
  footer: StorefrontFooter;
  colors: StorefrontColorScheme;
  footerColors?: StorefrontFooterColors;
  shopName: string;
  shopSlug: string;
}

const SOCIAL_IMAGE_ICONS: Record<string, string> = {
  instagram: "/instagram-icon.png",
  x: "/x-logo-black.png",
  youtube: "/youtube-icon.png",
  tiktok: "/tiktok-icon.png",
  telegram: "/telegram-icon.png",
  facebook: "/facebook-icon.png",
};

const SOCIAL_EMOJI_ICONS: Record<string, string> = {
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
  footerColors,
  shopName,
  shopSlug,
}: StorefrontFooterProps) {
  const socialLinks = footer.socialLinks || [];
  const navLinks = footer.navLinks || [];
  const showPoweredBy = footer.showPoweredBy !== false;

  const bg = footerColors?.background || colors.secondary;
  const text = footerColors?.text || colors.background;
  const accent = footerColors?.accent || colors.primary;

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
        backgroundColor: bg,
        borderColor: accent + "22",
        color: text,
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
                const href = sanitizeStorefrontNavHref(link, shopSlug);

                if (isExternalStorefrontHref(href)) {
                  return (
                    <a
                      key={idx}
                      href={href}
                      target={href.startsWith("http") ? "_blank" : undefined}
                      rel={
                        href.startsWith("http")
                          ? "noopener noreferrer"
                          : undefined
                      }
                      className="font-body text-sm opacity-60 transition-opacity hover:opacity-100"
                      style={{ color: text }}
                    >
                      {link.label}
                    </a>
                  );
                }

                return (
                  <Link
                    key={idx}
                    href={href}
                    className="font-body text-sm opacity-60 transition-opacity hover:opacity-100"
                    style={{ color: text }}
                  >
                    {link.label}
                  </Link>
                );
              })}
            </div>
          )}

          {socialLinks.length > 0 && (
            <div className="flex gap-4">
              {socialLinks.map((social, idx) => {
                const href = sanitizeStorefrontSocialLink(social.url);

                return (
                  <a
                    key={idx}
                    href={href}
                    target={href.startsWith("http") ? "_blank" : undefined}
                    rel={
                      href.startsWith("http")
                        ? "noopener noreferrer"
                        : undefined
                    }
                    className="flex h-10 w-10 items-center justify-center rounded-full text-lg transition-transform hover:scale-110"
                    style={{
                      backgroundColor: accent + "22",
                      color: accent,
                    }}
                    title={social.label || social.platform}
                  >
                    {SOCIAL_IMAGE_ICONS[social.platform] ? (
                      <img
                        src={SOCIAL_IMAGE_ICONS[social.platform]}
                        alt={social.label || social.platform}
                        className="h-5 w-5 object-contain"
                      />
                    ) : (
                      SOCIAL_EMOJI_ICONS[social.platform] ||
                      SOCIAL_EMOJI_ICONS.other
                    )}
                  </a>
                );
              })}
            </div>
          )}
        </div>

        {enabledPolicies.length > 0 && (
          <div
            className="mt-8 flex flex-wrap justify-center gap-x-6 gap-y-2 border-t pt-6"
            style={{ borderColor: text + "11" }}
          >
            {enabledPolicies.map((key) => (
              <Link
                key={key}
                href={`/stall/${shopSlug}/${POLICY_SLUGS[key]}`}
                className="font-body text-xs opacity-40 transition-opacity hover:opacity-80"
                style={{ color: text }}
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
              enabledPolicies.length > 0 ? {} : { borderColor: text + "11" }
            }
          >
            Powered by{" "}
            <Link href="/" className="underline" style={{ color: accent }}>
              Milk Market
            </Link>
          </div>
        )}
      </div>
    </footer>
  );
}
