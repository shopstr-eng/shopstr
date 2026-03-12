import { StorefrontColorScheme } from "@/utils/types/types";
import { sanitizeUrl } from "@braintree/sanitize-url";

interface StorefrontHeroProps {
  shopName: string;
  shopAbout: string;
  bannerUrl: string;
  pictureUrl: string;
  colors: StorefrontColorScheme;
  productCount: number;
  reviewCount: number;
}

export default function StorefrontHero({
  shopName,
  shopAbout,
  bannerUrl,
  pictureUrl,
  colors,
  productCount,
  reviewCount,
}: StorefrontHeroProps) {
  return (
    <div className="relative overflow-hidden" style={{ backgroundColor: colors.secondary }}>
      {bannerUrl && (
        <div className="absolute inset-0">
          <img
            src={sanitizeUrl(bannerUrl)}
            alt=""
            className="h-full w-full object-cover opacity-30"
          />
          <div className="absolute inset-0" style={{ background: `linear-gradient(to bottom, ${colors.secondary}99, ${colors.secondary})` }} />
        </div>
      )}

      <div className="relative mx-auto flex max-w-6xl flex-col items-center px-6 pb-12 pt-28 text-center md:pb-16 md:pt-32">
        {pictureUrl && (
          <img
            src={sanitizeUrl(pictureUrl)}
            alt={shopName}
            className="mb-6 h-24 w-24 rounded-full border-4 object-cover shadow-lg md:h-32 md:w-32"
            style={{ borderColor: colors.primary }}
          />
        )}

        <h1
          className="text-4xl font-bold md:text-5xl"
          style={{ color: colors.background }}
        >
          {shopName}
        </h1>

        {shopAbout && (
          <p
            className="mt-4 max-w-xl text-lg"
            style={{ color: colors.background + "CC" }}
          >
            {shopAbout}
          </p>
        )}

        <div className="mt-6 flex items-center gap-6 text-sm" style={{ color: colors.background + "99" }}>
          <span className="flex items-center gap-1">
            <span className="text-lg font-bold" style={{ color: colors.primary }}>{productCount}</span> products
          </span>
          {reviewCount > 0 && (
            <span className="flex items-center gap-1">
              <span className="text-lg font-bold" style={{ color: colors.primary }}>{reviewCount}</span> reviews
            </span>
          )}
        </div>

        <a
          href="#products"
          className="mt-8 inline-block rounded-lg px-8 py-3 text-base font-bold transition-transform hover:-translate-y-0.5"
          style={{
            backgroundColor: colors.primary,
            color: colors.secondary,
          }}
        >
          Browse Products
        </a>
      </div>
    </div>
  );
}
