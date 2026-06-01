import { StorefrontSection, StorefrontColorScheme } from "@/utils/types/types";
import { ProductData } from "@/utils/parsers/product-parser-functions";
import SectionHero from "./sections/section-hero";
import SectionAbout from "./sections/section-about";
import SectionStory from "./sections/section-story";
import SectionProducts from "./sections/section-products";
import SectionTestimonials from "./sections/section-testimonials";
import SectionFaq from "./sections/section-faq";
import SectionIngredients from "./sections/section-ingredients";
import SectionComparison from "./sections/section-comparison";
import SectionText from "./sections/section-text";
import SectionImage from "./sections/section-image";
import SectionContact from "./sections/section-contact";
import SectionReviews from "./sections/section-reviews";

interface SectionRendererProps {
  section: StorefrontSection;
  colors: StorefrontColorScheme;
  shopName: string;
  shopPicture?: string;
  shopPubkey: string;
  products: ProductData[];
  isPreview?: boolean;
}

export default function SectionRenderer({
  section,
  colors,
  shopName,
  shopPicture,
  shopPubkey,
  products,
  isPreview,
}: SectionRendererProps) {
  if (section.enabled === false) return null;

  switch (section.type) {
    case "hero":
      return (
        <SectionHero
          section={section}
          colors={colors}
          shopName={shopName}
          shopPicture={shopPicture}
        />
      );
    case "about":
      return <SectionAbout section={section} colors={colors} />;
    case "story":
      return <SectionStory section={section} colors={colors} />;
    case "products":
      return (
        <SectionProducts
          section={section}
          colors={colors}
          products={products}
          isPreview={isPreview}
        />
      );
    case "testimonials":
      return <SectionTestimonials section={section} colors={colors} />;
    case "faq":
      return <SectionFaq section={section} colors={colors} />;
    case "ingredients":
      return <SectionIngredients section={section} colors={colors} />;
    case "comparison":
      return <SectionComparison section={section} colors={colors} />;
    case "text":
      return <SectionText section={section} colors={colors} />;
    case "image":
      return <SectionImage section={section} colors={colors} />;
    case "contact":
      return <SectionContact section={section} colors={colors} />;
    case "reviews":
      return (
        <SectionReviews
          section={section}
          colors={colors}
          shopPubkey={shopPubkey}
        />
      );
    default:
      return null;
  }
}
