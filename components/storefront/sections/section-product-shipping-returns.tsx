import { StorefrontSection, StorefrontColorScheme } from "@/utils/types/types";
import { ProductData } from "@/utils/parsers/product-parser-functions";
import FormattedText from "../formatted-text";

interface Props {
  section: StorefrontSection;
  colors: StorefrontColorScheme;
  product: ProductData;
}

export default function SectionProductShippingReturns({
  section,
  colors,
  product,
}: Props) {
  const shipping =
    section.shippingInfo ||
    (product.shippingType
      ? `${product.shippingType}${
          product.shippingCost
            ? ` — ${product.shippingCost} ${product.currency}`
            : ""
        }`
      : "");
  const returns = section.returnsInfo || "";

  if (!shipping && !returns) return null;

  const heading = section.heading || "Shipping & Returns";

  return (
    <div className="mx-auto max-w-4xl px-4 py-12 md:px-6">
      <h2
        className="font-heading mb-6 text-2xl font-bold md:text-3xl"
        style={{ color: colors.text }}
      >
        {heading}
      </h2>
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        {shipping && (
          <div
            className="rounded-lg border-2 p-5"
            style={{ borderColor: colors.text + "20" }}
          >
            <h3
              className="font-heading mb-2 text-lg font-bold"
              style={{ color: colors.text }}
            >
              Shipping
            </h3>
            <FormattedText
              text={shipping}
              as="div"
              className="font-body text-sm leading-relaxed whitespace-pre-line opacity-80"
            />
            {product.pickupLocations && product.pickupLocations.length > 0 && (
              <div className="mt-3">
                <p
                  className="font-body text-xs font-semibold uppercase opacity-60"
                  style={{ color: colors.text }}
                >
                  Pickup locations
                </p>
                <ul
                  className="mt-1 list-disc pl-5 text-sm opacity-80"
                  style={{ color: colors.text }}
                >
                  {product.pickupLocations.map((loc) => (
                    <li key={loc}>{loc}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
        {returns && (
          <div
            className="rounded-lg border-2 p-5"
            style={{ borderColor: colors.text + "20" }}
          >
            <h3
              className="font-heading mb-2 text-lg font-bold"
              style={{ color: colors.text }}
            >
              Returns & Exchanges
            </h3>
            <FormattedText
              text={returns}
              as="div"
              className="font-body text-sm leading-relaxed whitespace-pre-line opacity-80"
            />
          </div>
        )}
      </div>
    </div>
  );
}
