import { StorefrontSection, StorefrontColorScheme } from "@/utils/types/types";
import { sanitizeUrl } from "@braintree/sanitize-url";

interface SectionStoryProps {
  section: StorefrontSection;
  colors: StorefrontColorScheme;
}

export default function SectionStory({ section, colors }: SectionStoryProps) {
  return (
    <div className="mx-auto max-w-6xl px-4 py-16 md:px-6">
      {section.heading && (
        <h2
          className="font-heading mb-4 text-center text-3xl font-bold"
          style={{ color: "var(--sf-text)" }}
        >
          {section.heading}
        </h2>
      )}
      {section.body && (
        <p className="font-body mx-auto mb-12 max-w-2xl whitespace-pre-line text-center text-lg opacity-70">
          {section.body}
        </p>
      )}

      {section.timelineItems && section.timelineItems.length > 0 && (
        <div className="relative">
          <div
            className="absolute bottom-0 left-4 top-0 w-0.5 md:left-1/2 md:-translate-x-1/2"
            style={{ backgroundColor: colors.primary + "33" }}
          />
          <div className="space-y-12">
            {section.timelineItems.map((item, idx) => (
              <div
                key={idx}
                className={`relative flex flex-col md:flex-row ${
                  idx % 2 === 0 ? "" : "md:flex-row-reverse"
                }`}
              >
                <div className="absolute left-4 top-2 z-10 md:left-1/2 md:-translate-x-1/2">
                  <div
                    className="h-4 w-4 rounded-full border-4"
                    style={{
                      borderColor: colors.primary,
                      backgroundColor: colors.background,
                    }}
                  />
                </div>
                <div
                  className={`ml-12 md:ml-0 md:w-1/2 ${
                    idx % 2 === 0 ? "md:pr-12 md:text-right" : "md:pl-12"
                  }`}
                >
                  {item.year && (
                    <span
                      className="mb-1 inline-block text-sm font-bold uppercase tracking-wider"
                      style={{ color: colors.accent }}
                    >
                      {item.year}
                    </span>
                  )}
                  <h3 className="font-heading text-xl font-bold">
                    {item.heading}
                  </h3>
                  <p className="font-body mt-2 opacity-70">{item.body}</p>
                  {item.image && (
                    <img
                      src={sanitizeUrl(item.image)}
                      alt={item.heading}
                      className="mt-4 rounded-lg object-cover shadow"
                      style={{ maxHeight: "200px" }}
                    />
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
