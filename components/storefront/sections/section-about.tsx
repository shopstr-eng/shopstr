import { StorefrontSection, StorefrontColorScheme } from "@/utils/types/types";
import { sanitizeUrl } from "@braintree/sanitize-url";

interface SectionAboutProps {
  section: StorefrontSection;
  colors: StorefrontColorScheme;
}

export default function SectionAbout({ section, colors }: SectionAboutProps) {
  const imageOnRight = section.imagePosition !== "left";

  return (
    <div className="mx-auto max-w-6xl px-4 py-16 md:px-6">
      {section.heading && (
        <h2
          className="font-heading mb-8 text-center text-3xl font-bold md:text-left"
          style={{ color: "var(--sf-text)" }}
        >
          {section.heading}
        </h2>
      )}
      <div
        className={`flex flex-col gap-8 md:flex-row ${
          imageOnRight ? "" : "md:flex-row-reverse"
        } items-center`}
      >
        {section.image && (
          <div className="w-full md:w-1/2">
            <img
              src={sanitizeUrl(section.image)}
              alt={section.heading || "About"}
              className="w-full rounded-xl object-cover shadow-md"
              style={{ maxHeight: "400px" }}
            />
          </div>
        )}
        <div className={`w-full ${section.image ? "md:w-1/2" : ""}`}>
          {section.body && (
            <p className="font-body whitespace-pre-line text-lg leading-relaxed opacity-80">
              {section.body}
            </p>
          )}
          {section.ctaText && (
            <a
              href={section.ctaLink || "#products"}
              className="mt-6 inline-block rounded-lg px-6 py-3 font-bold transition-transform hover:-translate-y-0.5"
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
    </div>
  );
}
