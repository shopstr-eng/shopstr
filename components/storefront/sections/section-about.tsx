import { StorefrontSection, StorefrontColorScheme } from "@/utils/types/types";
import { sanitizeUrl } from "@braintree/sanitize-url";

interface SectionAboutProps {
  section: StorefrontSection;
  colors: StorefrontColorScheme;
}

export default function SectionAbout({ section, colors }: SectionAboutProps) {
  const imagePos = section.imagePosition || "right";

  return (
    <div className="mx-auto max-w-6xl px-4 py-16 md:px-6">
      {section.heading && (
        <h2
          className="font-heading mb-8 text-3xl font-bold"
          style={{ color: "var(--sf-text)" }}
        >
          {section.heading}
        </h2>
      )}
      <div
        className={`flex flex-col gap-8 md:flex-row md:items-center ${
          imagePos === "left" ? "md:flex-row-reverse" : ""
        }`}
      >
        <div className="flex-1">
          {section.body && (
            <p className="font-body whitespace-pre-line text-lg leading-relaxed opacity-80">
              {section.body}
            </p>
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
