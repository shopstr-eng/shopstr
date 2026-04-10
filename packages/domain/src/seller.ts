import { CATEGORIES } from "./constants";
import type { StorefrontConfig } from "./storefront";

export interface NostrEventRecord {
  id: string;
  pubkey: string;
  created_at: number;
  kind: number;
  tags: string[][];
  content: string;
  sig?: string;
}

export type SellerAuthMethod = "email" | "nsec";

export interface SellerSession {
  authMethod: SellerAuthMethod;
  pubkey: string;
  nsec: string;
  email?: string;
  relays: string[];
  writeRelays: string[];
  createdAt: number;
}

export interface SellerShopProfileContent {
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
  paymentMethodDiscounts?: Record<string, number>;
  storefront?: StorefrontConfig;
}

export interface SellerShopProfile {
  pubkey: string;
  content: SellerShopProfileContent;
  createdAt: number;
  notificationEmail?: string | null;
  rawEvent?: NostrEventRecord;
}

export interface StorefrontBasicsDraft {
  shopName: string;
  about: string;
  notificationEmail: string;
  shopSlug: string;
}

export interface StorefrontBasicsValidationErrors {
  shopName?: string;
  about?: string;
  notificationEmail?: string;
  shopSlug?: string;
}

export interface StorefrontSlugState {
  value: string;
  status: "idle" | "saving" | "saved" | "error";
  error?: string;
}

export interface SellerListingSummary {
  id: string;
  pubkey: string;
  createdAt: number;
  title: string;
  status: string;
  price: number | null;
  currency: string | null;
  categories: string[];
  primaryCategory: string | null;
  dTag?: string;
}

export interface StripeConnectStatus {
  hasAccount: boolean;
  accountId?: string;
  onboardingComplete: boolean;
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
}

export const DEFAULT_SELLER_RELAYS = [
  "wss://relay.damus.io",
  "wss://nos.lol",
  "wss://purplepag.es",
  "wss://relay.primal.net",
  "wss://relay.nostr.band",
] as const;

const RESERVED_MARKETPLACE_TAGS = new Set(["MilkMarket", "FREEMILK", "SAVEBEEF"]);
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const STOREFRONT_PRODUCT_LAYOUTS = new Set(["grid", "list", "featured"]);
const STOREFRONT_LANDING_PAGE_STYLES = new Set([
  "classic",
  "hero",
  "minimal",
]);
const STOREFRONT_IMAGE_POSITIONS = new Set(["left", "right"]);
const STOREFRONT_SECTION_TYPES = new Set([
  "hero",
  "about",
  "story",
  "products",
  "testimonials",
  "faq",
  "ingredients",
  "comparison",
  "text",
  "image",
  "contact",
  "reviews",
]);
const STOREFRONT_SOCIAL_PLATFORMS = new Set([
  "instagram",
  "x",
  "facebook",
  "youtube",
  "tiktok",
  "telegram",
  "website",
  "email",
  "other",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function parseJsonContent(rawContent: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(rawContent) as unknown;
    if (!parsed || typeof parsed !== "object") {
      return null;
    }

    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
}

function getTagValues(event: NostrEventRecord, key: string): string[] {
  return event.tags
    .filter((tag) => tag[0] === key && typeof tag[1] === "string")
    .map((tag) => tag[1] as string);
}

function isValidNotificationEmail(email: string): boolean {
  if (!email.trim()) {
    return true;
  }

  return EMAIL_REGEX.test(email.trim());
}

export function normalizeStorefrontSlug(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 63)
    .replace(/^-|-$/g, "");
}

function normalizeStorefrontConfig(value: unknown): StorefrontConfig | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const colorScheme =
    isRecord(value.colorScheme) &&
    typeof value.colorScheme.primary === "string" &&
    typeof value.colorScheme.secondary === "string" &&
    typeof value.colorScheme.accent === "string" &&
    typeof value.colorScheme.background === "string" &&
    typeof value.colorScheme.text === "string"
      ? {
          primary: value.colorScheme.primary,
          secondary: value.colorScheme.secondary,
          accent: value.colorScheme.accent,
          background: value.colorScheme.background,
          text: value.colorScheme.text,
        }
      : undefined;

  const navLinks = Array.isArray(value.navLinks)
    ? value.navLinks
        .filter(isRecord)
        .map((link) => ({
          label: typeof link.label === "string" ? link.label : "",
          href: typeof link.href === "string" ? link.href : "",
          ...(typeof link.isPage === "boolean" ? { isPage: link.isPage } : {}),
        }))
        .filter((link) => link.label && link.href)
    : undefined;

  const footer = isRecord(value.footer)
    ? {
        ...(typeof value.footer.text === "string" ? { text: value.footer.text } : {}),
        ...(typeof value.footer.showPoweredBy === "boolean"
          ? { showPoweredBy: value.footer.showPoweredBy }
          : {}),
        ...(Array.isArray(value.footer.navLinks)
          ? {
              navLinks: value.footer.navLinks
                .filter(isRecord)
                .map((link) => ({
                  label: typeof link.label === "string" ? link.label : "",
                  href: typeof link.href === "string" ? link.href : "",
                  ...(typeof link.isPage === "boolean"
                    ? { isPage: link.isPage }
                    : {}),
                }))
                .filter((link) => link.label && link.href),
            }
          : {}),
        ...(Array.isArray(value.footer.socialLinks)
          ? {
              socialLinks: value.footer.socialLinks
                .filter(isRecord)
                .map((link) => ({
                  platform:
                    typeof link.platform === "string" &&
                    STOREFRONT_SOCIAL_PLATFORMS.has(link.platform)
                      ? (link.platform as
                          | "instagram"
                          | "x"
                          | "facebook"
                          | "youtube"
                          | "tiktok"
                          | "telegram"
                          | "website"
                          | "email"
                          | "other")
                      : "other",
                  url: typeof link.url === "string" ? link.url : "",
                  ...(typeof link.label === "string" ? { label: link.label } : {}),
                }))
                .filter((link) => link.url),
            }
          : {}),
        ...(isRecord(value.footer.policies)
          ? {
              policies: {
                ...(isRecord(value.footer.policies.returnPolicy) &&
                typeof value.footer.policies.returnPolicy.enabled === "boolean" &&
                typeof value.footer.policies.returnPolicy.content === "string"
                  ? {
                      returnPolicy: {
                        enabled: value.footer.policies.returnPolicy.enabled,
                        content: value.footer.policies.returnPolicy.content,
                      },
                    }
                  : {}),
                ...(isRecord(value.footer.policies.termsOfService) &&
                typeof value.footer.policies.termsOfService.enabled === "boolean" &&
                typeof value.footer.policies.termsOfService.content === "string"
                  ? {
                      termsOfService: {
                        enabled: value.footer.policies.termsOfService.enabled,
                        content: value.footer.policies.termsOfService.content,
                      },
                    }
                  : {}),
                ...(isRecord(value.footer.policies.privacyPolicy) &&
                typeof value.footer.policies.privacyPolicy.enabled === "boolean" &&
                typeof value.footer.policies.privacyPolicy.content === "string"
                  ? {
                      privacyPolicy: {
                        enabled: value.footer.policies.privacyPolicy.enabled,
                        content: value.footer.policies.privacyPolicy.content,
                      },
                    }
                  : {}),
                ...(isRecord(value.footer.policies.cancellationPolicy) &&
                typeof value.footer.policies.cancellationPolicy.enabled === "boolean" &&
                typeof value.footer.policies.cancellationPolicy.content === "string"
                  ? {
                      cancellationPolicy: {
                        enabled: value.footer.policies.cancellationPolicy.enabled,
                        content: value.footer.policies.cancellationPolicy.content,
                      },
                    }
                  : {}),
              },
            }
          : {}),
      }
    : undefined;

  const sections = Array.isArray(value.sections)
    ? value.sections
        .filter(isRecord)
        .map((section) => ({
          id: typeof section.id === "string" ? section.id : "",
          type:
            typeof section.type === "string" &&
            STOREFRONT_SECTION_TYPES.has(section.type)
              ? (section.type as
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
                  | "reviews")
              : "text",
          ...(typeof section.enabled === "boolean" ? { enabled: section.enabled } : {}),
          ...(typeof section.heading === "string" ? { heading: section.heading } : {}),
          ...(typeof section.subheading === "string"
            ? { subheading: section.subheading }
            : {}),
          ...(typeof section.body === "string" ? { body: section.body } : {}),
          ...(typeof section.image === "string" ? { image: section.image } : {}),
          ...(typeof section.imagePosition === "string" &&
          STOREFRONT_IMAGE_POSITIONS.has(section.imagePosition)
            ? { imagePosition: section.imagePosition as "left" | "right" }
            : {}),
          ...(typeof section.fullWidth === "boolean"
            ? { fullWidth: section.fullWidth }
            : {}),
          ...(typeof section.ctaText === "string" ? { ctaText: section.ctaText } : {}),
          ...(typeof section.ctaLink === "string" ? { ctaLink: section.ctaLink } : {}),
          ...(typeof section.overlayOpacity === "number"
            ? { overlayOpacity: section.overlayOpacity }
            : {}),
          ...(Array.isArray(section.items) ? { items: section.items } : {}),
          ...(Array.isArray(section.testimonials)
            ? { testimonials: section.testimonials }
            : {}),
          ...(Array.isArray(section.ingredientItems)
            ? { ingredientItems: section.ingredientItems }
            : {}),
          ...(Array.isArray(section.comparisonFeatures)
            ? { comparisonFeatures: section.comparisonFeatures }
            : {}),
          ...(Array.isArray(section.comparisonColumns)
            ? { comparisonColumns: section.comparisonColumns }
            : {}),
          ...(Array.isArray(section.timelineItems)
            ? { timelineItems: section.timelineItems }
            : {}),
          ...(typeof section.productLayout === "string" &&
          STOREFRONT_PRODUCT_LAYOUTS.has(section.productLayout)
            ? {
                productLayout: section.productLayout as
                  | "grid"
                  | "list"
                  | "featured",
              }
            : {}),
          ...(typeof section.productLimit === "number"
            ? { productLimit: section.productLimit }
            : {}),
          ...(typeof section.email === "string" ? { email: section.email } : {}),
          ...(typeof section.phone === "string" ? { phone: section.phone } : {}),
          ...(typeof section.address === "string"
            ? { address: section.address }
            : {}),
          ...(typeof section.caption === "string"
            ? { caption: section.caption }
            : {}),
        }))
        .filter((section) => section.id)
    : undefined;

  const pages = Array.isArray(value.pages)
    ? value.pages
        .filter(isRecord)
        .map((page) => ({
          id: typeof page.id === "string" ? page.id : "",
          title: typeof page.title === "string" ? page.title : "",
          slug: typeof page.slug === "string" ? page.slug : "",
          sections: Array.isArray(page.sections)
            ? page.sections.filter(isRecord).map((section) => ({
                id: typeof section.id === "string" ? section.id : "",
                type:
                  typeof section.type === "string" &&
                  STOREFRONT_SECTION_TYPES.has(section.type)
                    ? (section.type as
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
                        | "reviews")
                    : "text",
                ...(typeof section.heading === "string"
                  ? { heading: section.heading }
                  : {}),
                ...(typeof section.body === "string" ? { body: section.body } : {}),
              }))
            : [],
        }))
        .filter((page) => page.id && page.title && page.slug)
    : undefined;

  const normalized: StorefrontConfig = {
    ...(colorScheme ? { colorScheme } : {}),
    ...(typeof value.productLayout === "string" &&
    STOREFRONT_PRODUCT_LAYOUTS.has(value.productLayout)
      ? {
          productLayout: value.productLayout as
            | "grid"
            | "list"
            | "featured",
        }
      : {}),
    ...(typeof value.landingPageStyle === "string" &&
    STOREFRONT_LANDING_PAGE_STYLES.has(value.landingPageStyle)
      ? {
          landingPageStyle: value.landingPageStyle as
            | "classic"
            | "hero"
            | "minimal",
        }
      : {}),
    ...(typeof value.shopSlug === "string" ? { shopSlug: value.shopSlug } : {}),
    ...(typeof value.customDomain === "string"
      ? { customDomain: value.customDomain }
      : {}),
    ...(typeof value.fontHeading === "string"
      ? { fontHeading: value.fontHeading }
      : {}),
    ...(typeof value.fontBody === "string" ? { fontBody: value.fontBody } : {}),
    ...(sections && sections.length > 0 ? { sections } : {}),
    ...(pages && pages.length > 0 ? { pages } : {}),
    ...(footer && Object.keys(footer).length > 0 ? { footer } : {}),
    ...(navLinks && navLinks.length > 0 ? { navLinks } : {}),
    ...(typeof value.showCommunityPage === "boolean"
      ? { showCommunityPage: value.showCommunityPage }
      : {}),
    ...(typeof value.showWalletPage === "boolean"
      ? { showWalletPage: value.showWalletPage }
      : {}),
  };

  return Object.keys(normalized).length > 0 ? normalized : undefined;
}

export function createEmptyStorefrontBasicsDraft(): StorefrontBasicsDraft {
  return {
    shopName: "",
    about: "",
    notificationEmail: "",
    shopSlug: "",
  };
}

export function validateStorefrontBasicsDraft(
  draft: StorefrontBasicsDraft
): StorefrontBasicsValidationErrors {
  const errors: StorefrontBasicsValidationErrors = {};

  if (!draft.shopName.trim()) {
    errors.shopName = "Shop name is required.";
  } else if (draft.shopName.trim().length > 50) {
    errors.shopName = "Shop name must be 50 characters or fewer.";
  }

  if (draft.about.trim().length > 500) {
    errors.about = "About must be 500 characters or fewer.";
  }

  if (!isValidNotificationEmail(draft.notificationEmail)) {
    errors.notificationEmail = "Enter a valid email address.";
  }

  const normalizedSlug = normalizeStorefrontSlug(draft.shopSlug);
  if (draft.shopSlug.trim() && normalizedSlug.length < 2) {
    errors.shopSlug = "Shop slug must be at least 2 characters.";
  }

  return errors;
}

export function buildSellerShopProfileContent(params: {
  existingContent?: SellerShopProfileContent;
  draft: StorefrontBasicsDraft;
  pubkey: string;
}): SellerShopProfileContent {
  const normalizedSlug = normalizeStorefrontSlug(params.draft.shopSlug);
  const existingStorefront = params.existingContent?.storefront;
  const nextStorefront: StorefrontConfig | undefined = existingStorefront
    ? {
        ...existingStorefront,
        shopSlug: normalizedSlug || undefined,
      }
    : normalizedSlug
      ? {
          shopSlug: normalizedSlug,
        }
      : undefined;

  return {
    name: params.draft.shopName.trim(),
    about: params.draft.about.trim(),
    ui: {
      picture: params.existingContent?.ui.picture ?? "",
      banner: params.existingContent?.ui.banner ?? "",
      theme: params.existingContent?.ui.theme ?? "",
      darkMode: params.existingContent?.ui.darkMode ?? false,
    },
    merchants:
      params.existingContent?.merchants.length &&
      params.existingContent.merchants.length > 0
        ? params.existingContent.merchants
        : [params.pubkey],
    freeShippingThreshold: params.existingContent?.freeShippingThreshold,
    freeShippingCurrency: params.existingContent?.freeShippingCurrency,
    paymentMethodDiscounts: params.existingContent?.paymentMethodDiscounts,
    storefront: nextStorefront,
  };
}

export function parseSellerShopProfileEvent(
  event: NostrEventRecord
): SellerShopProfile | null {
  if (event.kind !== 30019) {
    return null;
  }

  const parsed = parseJsonContent(event.content);
  if (!parsed) {
    return null;
  }

  const ui = isRecord(parsed.ui) ? parsed.ui : undefined;
  const storefront = normalizeStorefrontConfig(parsed.storefront);
  const merchants = Array.isArray(parsed.merchants)
    ? parsed.merchants.filter((value): value is string => typeof value === "string")
    : [];

  return {
    pubkey: event.pubkey,
    createdAt: event.created_at,
    rawEvent: event,
    content: {
      name: typeof parsed.name === "string" ? parsed.name : "",
      about: typeof parsed.about === "string" ? parsed.about : "",
      ui: {
        picture: typeof ui?.picture === "string" ? ui.picture : "",
        banner: typeof ui?.banner === "string" ? ui.banner : "",
        theme: typeof ui?.theme === "string" ? ui.theme : "",
        darkMode: ui?.darkMode === true,
      },
      merchants: merchants.length > 0 ? merchants : [event.pubkey],
      freeShippingThreshold:
        typeof parsed.freeShippingThreshold === "number"
          ? parsed.freeShippingThreshold
          : undefined,
      freeShippingCurrency:
        typeof parsed.freeShippingCurrency === "string"
          ? parsed.freeShippingCurrency
          : undefined,
      paymentMethodDiscounts:
        parsed.paymentMethodDiscounts &&
        typeof parsed.paymentMethodDiscounts === "object" &&
        !Array.isArray(parsed.paymentMethodDiscounts)
          ? (parsed.paymentMethodDiscounts as Record<string, number>)
          : undefined,
      storefront,
    },
  };
}

export function selectSellerShopProfile(
  events: NostrEventRecord[],
  pubkey: string
): SellerShopProfile | null {
  const matches = events
    .filter((event) => event.pubkey === pubkey)
    .map(parseSellerShopProfileEvent)
    .filter((profile): profile is SellerShopProfile => profile !== null)
    .sort((left, right) => right.createdAt - left.createdAt);

  return matches[0] ?? null;
}

export function withNotificationEmail(
  profile: SellerShopProfile | null,
  notificationEmail: string | null | undefined
): SellerShopProfile | null {
  if (!profile) {
    return null;
  }

  return {
    ...profile,
    notificationEmail: notificationEmail ?? null,
  };
}

export function buildSellerListingSummary(
  event: NostrEventRecord
): SellerListingSummary | null {
  if (event.kind !== 30402) {
    return null;
  }

  const title = getTagValues(event, "title")[0] ?? "Untitled listing";
  const status = getTagValues(event, "status")[0] ?? "active";
  const dTag = getTagValues(event, "d")[0];

  const priceTag = event.tags.find((tag) => tag[0] === "price");
  const price =
    priceTag && typeof priceTag[1] === "string" && !Number.isNaN(Number(priceTag[1]))
      ? Number(priceTag[1])
      : null;
  const currency =
    priceTag && typeof priceTag[2] === "string" ? priceTag[2] : null;

  const categories = getTagValues(event, "t").filter(
    (tag) => !RESERVED_MARKETPLACE_TAGS.has(tag)
  );
  const categoryFromKnownSet =
    categories.find((category) => CATEGORIES.includes(category)) ?? null;

  return {
    id: event.id,
    pubkey: event.pubkey,
    createdAt: event.created_at,
    title,
    status,
    price,
    currency,
    categories,
    primaryCategory: categoryFromKnownSet ?? categories[0] ?? null,
    dTag,
  };
}

export function selectSellerListingSummaries(
  events: NostrEventRecord[],
  pubkey: string
): SellerListingSummary[] {
  return events
    .filter((event) => event.pubkey === pubkey)
    .map(buildSellerListingSummary)
    .filter((listing): listing is SellerListingSummary => listing !== null)
    .sort((left, right) => right.createdAt - left.createdAt);
}
