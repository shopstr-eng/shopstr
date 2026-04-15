import { StorefrontSection, StorefrontColorScheme } from "@/utils/types/types";
import { sanitizeUrl } from "@braintree/sanitize-url";
import FormattedText from "../formatted-text";

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
  const overlayOpacity = section.overlayOpacity ?? 0.6;

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

        <FormattedText
          text={section.heading || shopName}
          as="h1"
          className="font-heading text-4xl font-bold md:text-5xl"
          style={{ color: colors.background }}
        />

        {section.subheading && (
          <FormattedText
            text={section.subheading}
            as="p"
            className="font-body mt-4 max-w-xl text-lg"
            style={{ color: colors.background + "CC" }}
          />
        )}

        {section.ctaText && (
          <a
            href={section.ctaLink || "#products"}
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
