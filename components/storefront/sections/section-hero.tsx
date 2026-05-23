import { StorefrontSection, StorefrontColorScheme } from "@/utils/types/types";
import { sanitizeUrl } from "@braintree/sanitize-url";
import { getNavTextColor } from "@/utils/storefront-colors";
import { sanitizeStorefrontSectionLink } from "@/utils/storefront-links";

interface SectionHeroProps {
  section: StorefrontSection;
  colors: StorefrontColorScheme;
  shopName: string;
  shopPicture?: string;
}

export default function SectionHero({
  section,
  colors,
  shopName,
  shopPicture,
}: SectionHeroProps) {
  // overlayOpacity is stored as an integer 0–90 (percent) by the section editor.
  // Convert to 0.0–0.9 decimal for CSS. Default 60 → 0.60 overlay = 40% image visible.
  const rawOpacity = section.overlayOpacity ?? 60;
  const overlayOpacity = Math.min(Math.max(rawOpacity, 0), 90) / 100;

  // Text sits on the secondary-colored background — use luminance-based contrast color.
  const heroTextColor = getNavTextColor(colors.secondary);

  return (
    <div
      className="relative overflow-hidden"
      style={{ backgroundColor: colors.secondary }}
    >
      {section.image && (
        <div className="absolute inset-0">
          <img
            src={sanitizeUrl(section.image)}
            alt=""
            className="h-full w-full object-cover"
            style={{ opacity: 1 - overlayOpacity }}
          />
          <div
            className="absolute inset-0"
            style={{
              background: `linear-gradient(to bottom, ${
                colors.secondary
              }${Math.round(overlayOpacity * 255)
                .toString(16)
                .padStart(2, "0")}, ${colors.secondary})`,
            }}
          />
        </div>
      )}

      <div className="relative mx-auto flex max-w-6xl flex-col items-center px-6 pt-28 pb-12 text-center md:pt-32 md:pb-16">
        {shopPicture && (
          <img
            src={sanitizeUrl(shopPicture)}
            alt={shopName}
            className="mb-6 h-24 w-24 rounded-full border-4 object-cover shadow-lg md:h-32 md:w-32"
            style={{ borderColor: colors.primary }}
          />
        )}

        <h1
          className="font-heading text-4xl font-bold md:text-5xl"
          style={{ color: heroTextColor }}
        >
          {section.heading || shopName}
        </h1>

        {section.subheading && (
          <p
            className="font-body mt-4 max-w-xl text-lg"
            style={{ color: heroTextColor + "CC" }}
          >
            {section.subheading}
          </p>
        )}

        {section.ctaText && (
          <a
            href={sanitizeStorefrontSectionLink(section.ctaLink)}
            className="mt-8 inline-block rounded-lg px-8 py-3 text-base font-bold transition-transform hover:-translate-y-0.5"
            style={{
              backgroundColor: colors.primary,
              color: colors.secondary,
            }}
          >
            {section.ctaText}
          </a>
        )}
      </div>
    </div>
  );
}
