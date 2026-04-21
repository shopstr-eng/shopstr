import { StorefrontSection, StorefrontColorScheme } from "@/utils/types/types";
import { ProductData } from "@/utils/parsers/product-parser-functions";

interface Props {
  section: StorefrontSection;
  colors: StorefrontColorScheme;
  product: ProductData;
}

export default function SectionProductGallery({
  section,
  colors,
  product,
}: Props) {
  const productImages =
    section.useProductImages !== false ? product.images || [] : [];
  const extra = section.galleryImages || [];
  const images = [...productImages.slice(1), ...extra];

  if (images.length === 0) return null;

  const heading = section.heading;

  return (
    <div
      className="px-4 py-12 md:px-6"
      style={{ backgroundColor: colors.secondary + "06" }}
    >
      <div className="mx-auto max-w-6xl">
        {heading && (
          <h2
            className="font-heading mb-6 text-2xl font-bold md:text-3xl"
            style={{ color: colors.text }}
          >
            {heading}
          </h2>
        )}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3">
          {images.map((src, idx) => (
            <div
              key={`${src}-${idx}`}
              className="aspect-square overflow-hidden rounded-lg border-2"
              style={{ borderColor: colors.text + "20" }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={src}
                alt={`${product.title} gallery ${idx + 1}`}
                className="h-full w-full object-cover transition-transform hover:scale-105"
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
