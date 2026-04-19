import { StorefrontSection, StorefrontColorScheme } from "@/utils/types/types";
import { sanitizeUrl } from "@braintree/sanitize-url";

interface SectionImageProps {
  section: StorefrontSection;
  colors: StorefrontColorScheme;
}

export default function SectionImage({ section }: SectionImageProps) {
  if (!section.image) return null;

  return (
    <div
      className={
        section.fullWidth ? "" : "mx-auto max-w-6xl px-4 py-16 md:px-6"
      }
    >
      <figure>
        <img
          src={sanitizeUrl(section.image)}
          alt={section.caption || section.heading || ""}
          className={`w-full object-cover ${
            section.fullWidth ? "" : "rounded-xl shadow-lg"
          }`}
          style={
            section.fullWidth ? { maxHeight: "500px" } : { maxHeight: "600px" }
          }
        />
        {section.caption && (
          <figcaption
            className="mt-3 text-center text-sm opacity-50"
            style={section.fullWidth ? { padding: "0 1.5rem" } : {}}
          >
            {section.caption}
          </figcaption>
        )}
      </figure>
    </div>
  );
}
