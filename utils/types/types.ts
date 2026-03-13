import { Event } from "nostr-tools";

export type ItemType = "products" | "profiles" | "chats" | "communities";

type ProductFormValue = [key: string, ...values: string[]];
export type ProductFormValues = ProductFormValue[];

export interface NostrEvent extends Event {}

export interface NostrMessageEvent extends NostrEvent {
  read: boolean;
  wrappedEventId?: string;
}

export interface ChatObject {
  unreadCount: number;
  decryptedChat: NostrMessageEvent[];
}

export interface CommunityRelays {
  approvals: string[]; // relays to publish/fetch approvals
  requests: string[]; // relays to publish/fetch post requests
  metadata: string[]; // relays for community author metadata (profile)
  all: string[]; // flattened list of all relays declared
}

export interface Community {
  id: string; // community definition event id
  kind: number;
  pubkey: string; // author pubkey
  createdAt: number;
  d: string; // identifier (a-tag identifier)
  name: string;
  description: string;
  image: string;
  moderators: string[];
  relays: CommunityRelays;
  // backward compatibility: keep a simple relays array optional
  relaysList?: string[];
}

export interface CommunityPost extends NostrEvent {
  // Augmented by fetchCommunityPosts: optional approval metadata
  approved?: boolean;
  approvalEventId?: string;
  approvedBy?: string;
}

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

export interface ShopProfile {
  pubkey: string;
  content: {
    name: string;
    about: string;
    ui: {
      picture: string;
      banner: string;
      theme: string;
      darkMode: boolean;
    };
    merchants: string[];
    freeShippingThreshold?: number;
    freeShippingCurrency?: string;
    paymentMethodDiscounts?: { [method: string]: number };
    storefront?: StorefrontConfig;
  };
  created_at: number;
  event?: NostrEvent;
}

export interface ProfileData {
  pubkey: string;
  content: {
    name?: string;
    picture?: string;
    about?: string;
    banner?: string;
    lud16?: string;
    nip05?: string;
    payment_preference?: string;
    fiat_options?: string[];
    shopstr_donation?: number;
  };
  created_at: number;
}

export interface Transaction {
  type: number;
  amount: number;
  date: number;
}

export type FiatOptionsType = {
  [key: string]: string;
};

export interface ShippingFormData {
  Name: string;
  Address: string;
  Unit?: string;
  City: string;
  "Postal Code": string;
  "State/Province": string;
  Country: string;
  Required?: string;
}

export interface ContactFormData {
  Contact: string;
  "Contact Type": string;
  Instructions: string;
  Required?: string;
}

export interface CombinedFormData {
  Name: string;
  Address: string;
  Unit?: string;
  City: string;
  "Postal Code": string;
  "State/Province": string;
  Country: string;
  Contact: string;
  "Contact Type": string;
  Instructions: string;
  Required?: string;
}

declare global {
  interface Window {
    // For NIP-07 browser extensions
    nostr: {
      getPublicKey: () => Promise<string>;
      signEvent: (event: any) => Promise<any>;
      nip44: {
        encrypt: (pubkey: string, plainText: string) => Promise<string>;
        decrypt: (pubkey: string, cipherText: string) => Promise<string>;
      };
    };
    // For WebLN (which Alby SDK also polyfills)
    webln: any;
  }
}
