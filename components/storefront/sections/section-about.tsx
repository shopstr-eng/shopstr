import { StorefrontSection, StorefrontColorScheme } from "@/utils/types/types";
import { sanitizeUrl } from "@braintree/sanitize-url";
import FormattedText from "../formatted-text";

interface SectionAboutProps {
  section: StorefrontSection;
  colors: StorefrontColorScheme;
}

export default function SectionAbout({ section }: SectionAboutProps) {
  const imagePos = section.imagePosition || "right";

  return (
    <div className="mx-auto max-w-6xl px-4 py-16 md:px-6">
      {section.heading && (
        <FormattedText
          text={section.heading}
          as="h2"
          className="font-heading mb-8 text-3xl font-bold"
          style={{ color: "var(--sf-text)" }}
        />
      )}
      <div
        className={`flex flex-col gap-8 md:flex-row md:items-center ${
          imagePos === "left" ? "md:flex-row-reverse" : ""
        }`}
      >
        <div className="flex-1">
          {section.body && (
            <FormattedText
              text={section.body}
              as="p"
              className="font-body text-lg leading-relaxed whitespace-pre-line opacity-80"
            />
          )}
        </div>
        {section.image && (
          <div className="flex-1">
            <img
              src={sanitizeUrl(section.image)}
              alt={section.heading || "About"}
              className="w-full rounded-xl object-cover shadow-lg"
              style={{ maxHeight: "400px" }}
            />
          </div>
        )}
      </div>
    </div>
  );
}
