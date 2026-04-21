import { StorefrontSection, StorefrontColorScheme } from "@/utils/types/types";
import { ProductData } from "@/utils/parsers/product-parser-functions";
import FormattedText from "../formatted-text";

interface Props {
  section: StorefrontSection;
  colors: StorefrontColorScheme;
  product: ProductData;
}

export default function SectionProductDescription({
  section,
  colors,
  product,
}: Props) {
  const heading = section.heading || "About this product";
  const body = section.body || product.summary;
  if (!body) return null;
  return (
    <div className="mx-auto max-w-4xl px-4 py-12 md:px-6">
      <h2
        className="font-heading mb-4 text-2xl font-bold md:text-3xl"
        style={{ color: colors.text }}
      >
        {heading}
      </h2>
      <FormattedText
        text={body}
        as="div"
        className="font-body text-base leading-relaxed whitespace-pre-line opacity-80 md:text-lg"
      />
    </div>
  );
}
