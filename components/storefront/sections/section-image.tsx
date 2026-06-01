import { StorefrontSection, StorefrontColorScheme } from "@/utils/types/types";
import { sanitizeUrl } from "@braintree/sanitize-url";

interface SectionImageProps {
  section: StorefrontSection;
  colors?: StorefrontColorScheme;
}

export default function SectionImage({ section }: SectionImageProps) {
  if (!section.image) return null;

  return (
    <div
      className={`${
        section.fullWidth ? "w-full" : "mx-auto max-w-6xl px-4 py-16 md:px-6"
      }`}
    >
      <img
        src={sanitizeUrl(section.image)}
        alt={section.heading || section.caption || ""}
        className={`${
          section.fullWidth ? "w-full" : "w-full rounded-xl shadow-lg"
        } object-cover`}
        style={{ maxHeight: section.fullWidth ? "500px" : "400px" }}
      />
      {section.caption && (
        <p
          className="font-body mt-3 text-center text-sm opacity-60"
          style={{ color: "var(--sf-text)" }}
        >
          {section.caption}
        </p>
      )}
    </div>
  );
}
