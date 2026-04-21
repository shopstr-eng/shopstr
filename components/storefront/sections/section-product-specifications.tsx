import { StorefrontSection, StorefrontColorScheme } from "@/utils/types/types";
import { ProductData } from "@/utils/parsers/product-parser-functions";

interface Props {
  section: StorefrontSection;
  colors: StorefrontColorScheme;
  product: ProductData;
}

export default function SectionProductSpecifications({
  section,
  colors,
  product,
}: Props) {
  const customSpecs = section.specifications || [];
  const autoSpecs: { label: string; value: string }[] = [];
  const mergeAutoSpecs = section.mergeAutoSpecs === true;

  if (product.condition) {
    autoSpecs.push({ label: "Condition", value: product.condition });
  }
  if (product.location) {
    autoSpecs.push({ label: "Location", value: product.location });
  }
  if (product.categories && product.categories.length > 0) {
    autoSpecs.push({
      label: "Categories",
      value: product.categories.join(", "),
    });
  }
  if (product.sizes && product.sizes.length > 0) {
    autoSpecs.push({ label: "Sizes", value: product.sizes.join(", ") });
  }
  if (product.weights && product.weights.length > 0) {
    autoSpecs.push({ label: "Weights", value: product.weights.join(", ") });
  }
  if (product.volumes && product.volumes.length > 0) {
    autoSpecs.push({ label: "Volumes", value: product.volumes.join(", ") });
  }

  let specs: { label: string; value: string }[];
  if (customSpecs.length === 0) {
    specs = autoSpecs;
  } else if (mergeAutoSpecs) {
    const customLabels = new Set(
      customSpecs.map((s) => s.label.trim().toLowerCase())
    );
    const extras = autoSpecs.filter(
      (s) => !customLabels.has(s.label.trim().toLowerCase())
    );
    specs = [...customSpecs, ...extras];
  } else {
    specs = customSpecs;
  }
  if (specs.length === 0) return null;

  const heading = section.heading || "Specifications";

  return (
    <div
      className="px-4 py-12 md:px-6"
      style={{ backgroundColor: colors.secondary + "08" }}
    >
      <div className="mx-auto max-w-4xl">
        <h2
          className="font-heading mb-6 text-2xl font-bold md:text-3xl"
          style={{ color: colors.text }}
        >
          {heading}
        </h2>
        <dl
          className="grid grid-cols-1 overflow-hidden rounded-lg border-2 sm:grid-cols-2"
          style={{ borderColor: colors.text + "20" }}
        >
          {specs.map((spec, idx) => (
            <div
              key={`${spec.label}-${idx}`}
              className="flex flex-col gap-1 p-4"
              style={{
                borderBottom: `1px solid ${colors.text}10`,
                backgroundColor:
                  idx % 2 === 0 ? "transparent" : colors.secondary + "06",
              }}
            >
              <dt
                className="font-body text-xs font-semibold tracking-wide uppercase opacity-60"
                style={{ color: colors.text }}
              >
                {spec.label}
              </dt>
              <dd
                className="font-body text-base"
                style={{ color: colors.text }}
              >
                {spec.value}
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  );
}
