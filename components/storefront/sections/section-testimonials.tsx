import { StorefrontSection, StorefrontColorScheme } from "@/utils/types/types";
import { sanitizeUrl } from "@braintree/sanitize-url";

interface SectionTestimonialsProps {
  section: StorefrontSection;
  colors: StorefrontColorScheme;
}

export default function SectionTestimonials({
  section,
  colors,
}: SectionTestimonialsProps) {
  const testimonials = section.testimonials || [];

  if (testimonials.length === 0) return null;

  return (
    <div
      className="px-4 py-16 md:px-6"
      style={{ backgroundColor: colors.secondary + "08" }}
    >
      <div className="mx-auto max-w-6xl">
        {section.heading && (
          <h2
            className="font-heading mb-12 text-center text-3xl font-bold"
            style={{ color: "var(--sf-text)" }}
          >
            {section.heading}
          </h2>
        )}
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
          {testimonials.map((t, idx) => (
            <div
              key={idx}
              className="rounded-xl border p-6"
              style={{
                borderColor: colors.primary + "22",
                backgroundColor: colors.background,
              }}
            >
              {t.rating && (
                <div className="mb-3 flex gap-1">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <span
                      key={i}
                      style={{
                        color:
                          i < t.rating! ? colors.primary : colors.text + "22",
                      }}
                    >
                      ★
                    </span>
                  ))}
                </div>
              )}
              <p className="font-body mb-4 italic opacity-80">
                &ldquo;{t.quote}&rdquo;
              </p>
              <div className="flex items-center gap-3">
                {t.image && (
                  <img
                    src={sanitizeUrl(t.image)}
                    alt={t.author}
                    className="h-10 w-10 rounded-full object-cover"
                  />
                )}
                <span className="font-heading text-sm font-bold">
                  {t.author}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
