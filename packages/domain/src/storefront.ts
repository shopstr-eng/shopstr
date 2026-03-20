export interface StorefrontColorScheme {
  primary: string;
  secondary: string;
  accent: string;
  background: string;
  text: string;
}

export interface StorefrontSocialLink {
  platform:
    | "instagram"
    | "x"
    | "facebook"
    | "youtube"
    | "tiktok"
    | "telegram"
    | "website"
    | "email"
    | "other";
  url: string;
  label?: string;
}

export interface StorefrontNavLink {
  label: string;
  href: string;
  isPage?: boolean;
}

export interface StorefrontPolicy {
  enabled: boolean;
  content: string;
}

export interface StorefrontPolicies {
  returnPolicy?: StorefrontPolicy;
  termsOfService?: StorefrontPolicy;
  privacyPolicy?: StorefrontPolicy;
  cancellationPolicy?: StorefrontPolicy;
}

export interface StorefrontFooter {
  text?: string;
  socialLinks?: StorefrontSocialLink[];
  navLinks?: StorefrontNavLink[];
  showPoweredBy?: boolean;
  policies?: StorefrontPolicies;
}

export interface StorefrontTestimonial {
  quote: string;
  author: string;
  image?: string;
  rating?: number;
}

export interface StorefrontFaqItem {
  question: string;
  answer: string;
}

export interface StorefrontIngredientItem {
  name: string;
  description?: string;
  image?: string;
}

export interface StorefrontComparisonColumn {
  heading: string;
  values: string[];
}

export interface StorefrontTimelineItem {
  year?: string;
  heading: string;
  body: string;
  image?: string;
}

export type StorefrontSectionType =
  | "hero"
  | "about"
  | "story"
  | "products"
  | "testimonials"
  | "faq"
  | "ingredients"
  | "comparison"
  | "text"
  | "image"
  | "contact"
  | "reviews";

export interface StorefrontSection {
  id: string;
  type: StorefrontSectionType;
  enabled?: boolean;
  heading?: string;
  subheading?: string;
  body?: string;
  image?: string;
  imagePosition?: "left" | "right";
  fullWidth?: boolean;
  ctaText?: string;
  ctaLink?: string;
  overlayOpacity?: number;
  items?: StorefrontFaqItem[];
  testimonials?: StorefrontTestimonial[];
  ingredientItems?: StorefrontIngredientItem[];
  comparisonFeatures?: string[];
  comparisonColumns?: StorefrontComparisonColumn[];
  timelineItems?: StorefrontTimelineItem[];
  productLayout?: "grid" | "list" | "featured";
  productLimit?: number;
  email?: string;
  phone?: string;
  address?: string;
  caption?: string;
}

export interface StorefrontPage {
  id: string;
  title: string;
  slug: string;
  sections: StorefrontSection[];
}

export interface StorefrontConfig {
  colorScheme?: StorefrontColorScheme;
  productLayout?: "grid" | "list" | "featured";
  landingPageStyle?: "classic" | "hero" | "minimal";
  shopSlug?: string;
  customDomain?: string;
  fontHeading?: string;
  fontBody?: string;
  sections?: StorefrontSection[];
  pages?: StorefrontPage[];
  footer?: StorefrontFooter;
  navLinks?: StorefrontNavLink[];
  showCommunityPage?: boolean;
  showWalletPage?: boolean;
}
