import { StorefrontSection, StorefrontColorScheme } from "@/utils/types/types";
import { sanitizeUrl } from "@braintree/sanitize-url";
import FormattedText from "../formatted-text";

interface SectionIngredientsProps {
  section: StorefrontSection;
  colors: StorefrontColorScheme;
}

export default function SectionIngredients({
  section,
  colors,
}: SectionIngredientsProps) {
  const items = section.ingredientItems || [];

  return (
    <div className="mx-auto max-w-6xl px-4 py-16 md:px-6">
      {section.heading && (
        <FormattedText
          text={section.heading}
          as="h2"
          className="font-heading mb-4 text-center text-3xl font-bold"
          style={{ color: "var(--sf-text)" }}
        />
      )}
      {section.body && (
        <FormattedText
          text={section.body}
          as="p"
          className="font-body mx-auto mb-12 max-w-2xl text-center text-lg opacity-70"
        />
      )}
      {items.length > 0 && (
        <div className="grid grid-cols-2 gap-6 md:grid-cols-3 lg:grid-cols-4">
          {items.map((item, idx) => (
            <div
              key={idx}
              className="flex flex-col items-center rounded-xl border p-6 text-center"
              style={{ borderColor: colors.primary + "22" }}
            >
              {item.image ? (
                <img
                  src={sanitizeUrl(item.image)}
                  alt={item.name}
                  className="mb-4 h-20 w-20 rounded-full object-cover"
                />
              ) : (
                <div
                  className="mb-4 flex h-20 w-20 items-center justify-center rounded-full text-3xl"
                  style={{
                    backgroundColor: colors.primary + "22",
                    color: colors.primary,
                  }}
                >
                  {item.emoji || "✦"}
                </div>
              )}
              <h3 className="font-heading text-base font-bold">{item.name}</h3>
              {item.description && (
                <FormattedText
                  text={item.description}
                  as="p"
                  className="font-body mt-2 text-sm opacity-60"
                />
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
