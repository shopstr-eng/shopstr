export interface StorefrontColorScheme {
  primary: string;
  secondary: string;
  accent: string;
  background: string;
  text: string;
}

export interface StorefrontNavColors {
  background: string;
  text: string;
  accent: string;
}

export interface StorefrontFooterColors {
  background: string;
  text: string;
  accent: string;
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
  emoji?: string;
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
  | "reviews"
  | "product_description"
  | "product_specifications"
  | "product_shipping_returns"
  | "product_gallery"
  | "related_products";

export interface StorefrontSpecificationItem {
  label: string;
  value: string;
}

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
  productIds?: string[];
  heroProductId?: string;
  email?: string;
  phone?: string;
  address?: string;
  caption?: string;
  reviewOrder?: string[];
  specifications?: StorefrontSpecificationItem[];
  shippingInfo?: string;
  returnsInfo?: string;
  galleryImages?: string[];
  useProductImages?: boolean;
  excludeCurrentProduct?: boolean;
  mergeAutoSpecs?: boolean;
}

export interface StorefrontProductPageConfig {
  sections?: StorefrontSection[];
  themeOverrides?: Partial<StorefrontColorScheme>;
  ogImage?: string;
  metaTitle?: string;
  metaDescription?: string;
}

export interface StorefrontPage {
  id: string;
  title: string;
  slug: string;
  sections: StorefrontSection[];
}

export interface PopupFlowStep {
  id: string;
  question: string;
  answers: PopupFlowAnswer[];
}

export interface PopupFlowAnswer {
  id: string;
  label: string;
  nextStepId?: string;
}

export interface PopupStyle {
  backgroundColor?: string;
  textColor?: string;
  accentColor?: string;
  buttonColor?: string;
  buttonTextColor?: string;
  backgroundImage?: string;
  overlayOpacity?: number;
  useCustomFonts?: boolean;
}

export interface StorefrontEmailPopup {
  enabled: boolean;
  discountPercentage: number;
  headline?: string;
  subtext?: string;
  collectPhone?: boolean;
  requirePhone?: boolean;
  buttonText?: string;
  successMessage?: string;
  style?: PopupStyle;
  flowSteps?: PopupFlowStep[];
}

export interface StorefrontSeoMeta {
  metaTitle?: string;
  metaDescription?: string;
  ogImage?: string;
  keywords?: string;
  locale?: string;
  locationRegion?: string;
  locationCity?: string;
  autoGenerate?: boolean;
}

export interface StorefrontConfig {
  colorScheme?: StorefrontColorScheme;
  productLayout?: "grid" | "list" | "featured";
  landingPageStyle?: "classic" | "hero" | "minimal";
  shopSlug?: string;
  customDomain?: string;
  fontHeading?: string;
  fontBody?: string;
  customFontHeadingUrl?: string;
  customFontHeadingName?: string;
  customFontBodyUrl?: string;
  customFontBodyName?: string;
  sections?: StorefrontSection[];
  pages?: StorefrontPage[];
  footer?: StorefrontFooter;
  navLinks?: StorefrontNavLink[];
  showCommunityPage?: boolean;
  showWalletPage?: boolean;
  emailPopup?: StorefrontEmailPopup;
  navColors?: StorefrontNavColors;
  footerColors?: StorefrontFooterColors;
  seoMeta?: StorefrontSeoMeta;
  productPageDefaults?: StorefrontSection[];
}
