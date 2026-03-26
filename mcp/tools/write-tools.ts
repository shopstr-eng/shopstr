import { z } from "zod/v4";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  McpNostrSigner,
  McpRelayManager,
  signAndPublishEvent,
} from "@/utils/mcp/nostr-signing";
import { ApiKeyRecord, getAgentSigner } from "@/utils/mcp/auth";
import { EventTemplate } from "nostr-tools";
import {
  cacheEvent,
  getSubscriptionsBySellerPubkey,
  createEmailFlow,
  getEmailFlows,
  getEmailFlow,
  updateEmailFlow,
  deleteEmailFlow,
  createFlowStep,
  getFlowSteps,
  updateFlowStep,
  deleteFlowStep,
  getFlowEnrollments,
  getDbPool,
} from "@/utils/db/db-service";
import { getDefaultFlowSteps } from "@/utils/email/flow-email-templates";
import { v4 as uuidv4 } from "uuid";
import { registerTool } from "./register-tool";

function noSignerError() {
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify({
          error:
            "No signing key configured. Set your nsec via the /api/mcp/set-nsec endpoint or during onboarding to use write tools.",
        }),
      },
    ],
    isError: true,
  };
}

function permissionError() {
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify({
          error:
            "Insufficient permissions. This action requires a full_access API key.",
        }),
      },
    ],
    isError: true,
  };
}

function successResponse(data: any, startTime: number) {
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(
          {
            success: true,
            ...data,
            _meta: {
              responseTimeMs: Date.now() - startTime,
              dataSource: "live",
            },
          },
          null,
          2
        ),
      },
    ],
  };
}

function errorResponse(message: string, details: string, startTime: number) {
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify({
          error: message,
          details,
          _meta: {
            responseTimeMs: Date.now() - startTime,
            dataSource: "live",
          },
        }),
      },
    ],
    isError: true,
  };
}

async function getSigner(apiKey: ApiKeyRecord): Promise<McpNostrSigner | null> {
  const result = await getAgentSigner(apiKey);
  if (!result) return null;
  return result.signer as McpNostrSigner;
}

export function registerWriteTools(server: McpServer, apiKey: ApiKeyRecord) {
  const baseUrl = `http://localhost:${process.env.PORT || 5000}`;

  registerTool(server,
    "set_user_profile",
    "Create or update your Nostr user profile (kind 0). Sets metadata like name, about, picture, lightning address, etc.",
    {
      name: z.string().optional().describe("Display name"),
      display_name: z.string().optional().describe("Full display name"),
      about: z.string().optional().describe("Bio/description"),
      picture: z.string().optional().describe("Profile picture URL"),
      banner: z.string().optional().describe("Banner image URL"),
      lud16: z
        .string()
        .optional()
        .describe("Lightning address (e.g. user@getalby.com)"),
      nip05: z
        .string()
        .optional()
        .describe("NIP-05 identifier (e.g. user@domain.com)"),
      website: z.string().optional().describe("Website URL"),
      fiat_options: z
        .record(z.string(), z.string())
        .optional()
        .describe(
          "Fiat payment handles — object mapping method names (venmo, cashapp, zelle, etc.) to usernames/handles"
        ),
      payment_preference: z
        .enum(["ecash", "lightning", "fiat"])
        .optional()
        .describe("Preferred payment method (ecash, lightning, or fiat)"),
    },
    async (params) => {
      const startTime = Date.now();
      if (apiKey.permissions !== "full_access") return permissionError();
      const signer = await getSigner(apiKey);
      if (!signer) return noSignerError();

      try {
        const content: Record<string, any> = {};
        if (params.name) content.name = params.name;
        if (params.display_name) content.display_name = params.display_name;
        if (params.about) content.about = params.about;
        if (params.picture) content.picture = params.picture;
        if (params.banner) content.banner = params.banner;
        if (params.lud16) content.lud16 = params.lud16;
        if (params.nip05) content.nip05 = params.nip05;
        if (params.website) content.website = params.website;
        if (params.fiat_options) content.fiat_options = params.fiat_options;
        if (params.payment_preference)
          content.payment_preference = params.payment_preference;

        const eventTemplate: EventTemplate = {
          created_at: Math.floor(Date.now() / 1000),
          content: JSON.stringify(content),
          kind: 0,
          tags: [],
        };

        const signedEvent = await signAndPublishEvent(signer, eventTemplate);
        return successResponse(
          {
            eventId: signedEvent.id,
            pubkey: signedEvent.pubkey,
            profile: content,
          },
          startTime
        );
      } catch (error) {
        return errorResponse(
          "Failed to set user profile",
          error instanceof Error ? error.message : "Unknown error",
          startTime
        );
      }
    }
  );

  registerTool(server,
    "set_shop_profile",
    "Create or update your shop profile (kind 30019). Sets shop metadata like name, about, picture, banner, and settings.",
    {
      name: z.string().optional().describe("Shop name"),
      about: z.string().optional().describe("Shop description"),
      picture: z.string().optional().describe("Shop logo URL"),
      banner: z.string().optional().describe("Shop banner image URL"),
      theme: z.string().optional().describe("Shop theme color"),
      darkMode: z.boolean().optional().describe("Enable dark mode for shop"),
      freeShippingThreshold: z
        .number()
        .optional()
        .describe("Minimum order amount for free shipping"),
      freeShippingCurrency: z
        .string()
        .optional()
        .describe("Currency for free shipping threshold"),
      merchants: z
        .array(z.string())
        .optional()
        .describe("Array of merchant pubkeys associated with this shop"),
      paymentMethodDiscounts: z
        .record(z.string(), z.number())
        .optional()
        .describe(
          "Per-method discount percentages — object mapping method keys (bitcoin, stripe, venmo, cash, etc.) to discount percentages"
        ),
      storefrontColorScheme: z
        .object({
          primary: z.string().describe("Primary color hex (e.g. '#4a7c59')"),
          secondary: z.string().describe("Secondary color hex"),
          accent: z.string().describe("Accent color hex"),
          background: z.string().describe("Background color hex"),
          text: z.string().describe("Text color hex"),
        })
        .optional()
        .describe("Custom color scheme for the seller's storefront page"),
      storefrontProductLayout: z
        .enum(["grid", "list", "featured"])
        .optional()
        .describe(
          "Product layout style for the storefront: grid, list, or featured"
        ),
      storefrontLandingPageStyle: z
        .enum(["classic", "hero", "minimal"])
        .optional()
        .describe(
          "Landing page style for the storefront: classic, hero, or minimal"
        ),
      shopSlug: z
        .string()
        .optional()
        .describe(
          "URL slug for the storefront (e.g. 'fresh-farm' for milk.market/shop/fresh-farm). Must be lowercase alphanumeric with hyphens."
        ),
      storefrontFontHeading: z
        .string()
        .optional()
        .describe("Google Font name for headings (e.g. 'Playfair Display')"),
      storefrontFontBody: z
        .string()
        .optional()
        .describe("Google Font name for body text (e.g. 'Inter')"),
      storefrontSections: z
        .array(
          z.object({
            id: z.string().describe("Unique section ID"),
            type: z
              .enum([
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
              ])
              .describe("Section type"),
            enabled: z
              .boolean()
              .optional()
              .describe("Whether section is visible"),
            heading: z.string().optional().describe("Section heading"),
            subheading: z.string().optional().describe("Section subheading"),
            body: z.string().optional().describe("Section body text"),
            image: z.string().optional().describe("Section image URL"),
            imagePosition: z
              .enum(["left", "right"])
              .optional()
              .describe("Image position for about sections"),
            fullWidth: z
              .boolean()
              .optional()
              .describe("Full-width toggle for image sections"),
            ctaText: z
              .string()
              .optional()
              .describe("Call-to-action button text"),
            ctaLink: z
              .string()
              .optional()
              .describe("Call-to-action button link"),
            overlayOpacity: z
              .number()
              .optional()
              .describe("Hero overlay opacity 0-1"),
            items: z
              .array(z.object({ question: z.string(), answer: z.string() }))
              .optional()
              .describe("FAQ items"),
            testimonials: z
              .array(
                z.object({
                  quote: z.string(),
                  author: z.string(),
                  image: z.string().optional(),
                  rating: z.number().optional(),
                })
              )
              .optional()
              .describe("Testimonial items"),
            ingredientItems: z
              .array(
                z.object({
                  name: z.string(),
                  description: z.string().optional(),
                  image: z.string().optional(),
                })
              )
              .optional()
              .describe("Ingredient items"),
            comparisonFeatures: z
              .array(z.string())
              .optional()
              .describe("Comparison row labels"),
            comparisonColumns: z
              .array(
                z.object({ heading: z.string(), values: z.array(z.string()) })
              )
              .optional()
              .describe("Comparison columns"),
            timelineItems: z
              .array(
                z.object({
                  year: z.string().optional(),
                  heading: z.string(),
                  body: z.string(),
                  image: z.string().optional(),
                })
              )
              .optional()
              .describe("Timeline items for story sections"),
            productLayout: z
              .enum(["grid", "list", "featured"])
              .optional()
              .describe("Product layout for product sections"),
            productLimit: z
              .number()
              .optional()
              .describe("Max products to show"),
            email: z.string().optional().describe("Contact email"),
            phone: z.string().optional().describe("Contact phone"),
            address: z.string().optional().describe("Contact address"),
            caption: z.string().optional().describe("Image caption"),
          })
        )
        .optional()
        .describe(
          "Ordered array of homepage sections for the section-based page builder"
        ),
      storefrontPages: z
        .array(
          z.object({
            id: z.string().describe("Page ID"),
            title: z.string().describe("Page title"),
            slug: z.string().describe("URL slug for the page"),
            sections: z
              .array(z.any())
              .describe(
                "Array of sections (same schema as storefrontSections)"
              ),
          })
        )
        .optional()
        .describe("Additional storefront pages (About, Contact, etc.)"),
      storefrontFooter: z
        .object({
          text: z.string().optional().describe("Footer text"),
          socialLinks: z
            .array(
              z.object({
                platform: z.enum([
                  "instagram",
                  "x",
                  "facebook",
                  "youtube",
                  "tiktok",
                  "telegram",
                  "website",
                  "email",
                  "other",
                ]),
                url: z.string(),
                label: z.string().optional(),
              })
            )
            .optional()
            .describe("Social media links"),
          navLinks: z
            .array(
              z.object({
                label: z.string(),
                href: z.string(),
                isPage: z.boolean().optional(),
              })
            )
            .optional()
            .describe("Footer navigation links"),
          showPoweredBy: z
            .boolean()
            .optional()
            .describe("Show 'Powered by Milk Market' in footer"),
        })
        .optional()
        .describe("Footer configuration"),
      storefrontNavLinks: z
        .array(
          z.object({
            label: z.string(),
            href: z.string(),
            isPage: z.boolean().optional(),
          })
        )
        .optional()
        .describe("Top navigation bar links"),
      showCommunityPage: z
        .boolean()
        .optional()
        .describe(
          "Enable a community page on the storefront. When true, a 'Community' link is auto-added to the nav and /shop/{slug}/community shows the seller's community feed."
        ),
      showWalletPage: z
        .boolean()
        .optional()
        .describe(
          "Enable a Bitcoin wallet page on the storefront for Cashu ecash payments. When true, a 'Wallet' link is auto-added to the nav and /shop/{slug}/wallet shows the wallet UI."
        ),
    },
    async (params) => {
      const startTime = Date.now();
      if (apiKey.permissions !== "full_access") return permissionError();
      const signer = await getSigner(apiKey);
      if (!signer) return noSignerError();

      try {
        const pubkey = signer.getPubKey();
        const content: Record<string, any> = {};
        if (params.name) content.name = params.name;
        if (params.about) content.about = params.about;
        if (params.merchants) content.merchants = params.merchants;
        if (params.paymentMethodDiscounts)
          content.paymentMethodDiscounts = params.paymentMethodDiscounts;
        const ui: Record<string, any> = {};
        if (params.picture) ui.picture = params.picture;
        if (params.banner) ui.banner = params.banner;
        if (params.theme) ui.theme = params.theme;
        if (params.darkMode !== undefined) ui.darkMode = params.darkMode;
        if (Object.keys(ui).length > 0) content.ui = ui;
        if (params.freeShippingThreshold)
          content.freeShippingThreshold = params.freeShippingThreshold;
        if (params.freeShippingCurrency)
          content.freeShippingCurrency = params.freeShippingCurrency;

        const storefront: Record<string, any> = {};
        if (params.storefrontColorScheme)
          storefront.colorScheme = params.storefrontColorScheme;
        if (params.storefrontProductLayout)
          storefront.productLayout = params.storefrontProductLayout;
        if (params.storefrontLandingPageStyle)
          storefront.landingPageStyle = params.storefrontLandingPageStyle;
        if (params.shopSlug) storefront.shopSlug = params.shopSlug;
        if (params.storefrontFontHeading)
          storefront.fontHeading = params.storefrontFontHeading;
        if (params.storefrontFontBody)
          storefront.fontBody = params.storefrontFontBody;
        if (params.storefrontSections)
          storefront.sections = params.storefrontSections;
        if (params.storefrontPages) storefront.pages = params.storefrontPages;
        if (params.storefrontFooter)
          storefront.footer = params.storefrontFooter;
        if (params.storefrontNavLinks)
          storefront.navLinks = params.storefrontNavLinks;
        if (params.showCommunityPage !== undefined)
          storefront.showCommunityPage = params.showCommunityPage;
        if (params.showWalletPage !== undefined)
          storefront.showWalletPage = params.showWalletPage;
        if (Object.keys(storefront).length > 0) content.storefront = storefront;

        const eventTemplate: EventTemplate = {
          created_at: Math.floor(Date.now() / 1000),
          content: JSON.stringify(content),
          kind: 30019,
          tags: [["d", pubkey]],
        };

        const signedEvent = await signAndPublishEvent(signer, eventTemplate);
        await cacheEvent(signedEvent).catch(console.error);

        return successResponse(
          {
            eventId: signedEvent.id,
            pubkey: signedEvent.pubkey,
            shopProfile: content,
          },
          startTime
        );
      } catch (error) {
        return errorResponse(
          "Failed to set shop profile",
          error instanceof Error ? error.message : "Unknown error",
          startTime
        );
      }
    }
  );

  registerTool(server,
    "register_shop_slug",
    "Register, update, or delete your shop's URL slug for the storefront. The slug becomes part of your shop URL (e.g. milk.market/shop/your-slug). Slug must be lowercase alphanumeric with hyphens, 3-50 characters. Reserved words (shop, admin, api, etc.) are not allowed. To delete, set action to 'delete'.",
    {
      slug: z
        .string()
        .optional()
        .describe(
          "URL slug for the storefront (e.g. 'fresh-farm'). Must be lowercase, alphanumeric with hyphens, 3-50 characters. Required for register/update, not needed for delete."
        ),
      action: z
        .enum(["register", "delete"])
        .optional()
        .describe(
          "Action to perform: 'register' (default) to create/update the slug, 'delete' to remove the slug and any associated custom domain."
        ),
    },
    async (params) => {
      const startTime = Date.now();
      if (apiKey.permissions !== "full_access") return permissionError();
      const signer = await getSigner(apiKey);
      if (!signer) return noSignerError();

      try {
        const pubkey = signer.getPubKey();

        if (params.action === "delete") {
          const dbPool = getDbPool();
          await dbPool.query("DELETE FROM shop_slugs WHERE pubkey = $1", [
            pubkey,
          ]);
          await dbPool.query("DELETE FROM custom_domains WHERE pubkey = $1", [
            pubkey,
          ]);
          return successResponse({ deleted: true, pubkey }, startTime);
        }

        if (!params.slug) {
          return errorResponse(
            "Missing slug",
            "A slug is required when registering. Provide a slug or set action to 'delete'.",
            startTime
          );
        }

        const slug = params.slug.toLowerCase().trim();

        const slugRegex = /^[a-z0-9][a-z0-9-]*[a-z0-9]$/;
        if (slug.length < 3 || slug.length > 50 || !slugRegex.test(slug)) {
          return errorResponse(
            "Invalid slug",
            "Slug must be 3-50 characters, lowercase alphanumeric with hyphens, and cannot start or end with a hyphen.",
            startTime
          );
        }

        const reserved = [
          "shop",
          "admin",
          "api",
          "www",
          "mail",
          "ftp",
          "app",
          "dashboard",
          "settings",
          "marketplace",
          "login",
          "signup",
          "auth",
          "checkout",
          "orders",
          "cart",
          "help",
          "support",
          "about",
          "contact",
          "blog",
          "news",
          "terms",
          "privacy",
          "legal",
        ];
        if (reserved.includes(slug)) {
          return errorResponse(
            "Reserved slug",
            `The slug '${slug}' is reserved and cannot be used.`,
            startTime
          );
        }

        const dbPool = getDbPool();
        const existing = await dbPool.query(
          "SELECT pubkey FROM shop_slugs WHERE slug = $1 AND pubkey != $2",
          [slug, pubkey]
        );

        if (existing.rows.length > 0 && existing.rows[0].pubkey !== pubkey) {
          return errorResponse(
            "Slug taken",
            `The slug '${slug}' is already registered to another seller.`,
            startTime
          );
        }

        await dbPool.query(
          `INSERT INTO shop_slugs (pubkey, slug, created_at)
           VALUES ($1, $2, NOW())
           ON CONFLICT (pubkey) DO UPDATE SET slug = $2`,
          [pubkey, slug]
        );

        return successResponse(
          {
            slug,
            storefrontUrl: `/shop/${slug}`,
            pubkey,
          },
          startTime
        );
      } catch (error) {
        return errorResponse(
          "Failed to register shop slug",
          error instanceof Error ? error.message : "Unknown error",
          startTime
        );
      }
    }
  );

  registerTool(server,
    "create_product_listing",
    "Publish a new product listing (kind 30402) to the marketplace. Creates a classified listing with title, description, price, images, categories, shipping options, and more.",
    {
      title: z.string().describe("Product title/name"),
      description: z.string().describe("Product description"),
      price: z.string().describe("Price amount as string"),
      currency: z.string().describe("Currency (e.g. 'USD', 'sats', 'BTC')"),
      images: z
        .array(z.string())
        .optional()
        .describe("Array of image URLs for the product"),
      categories: z
        .array(z.string())
        .optional()
        .describe("Array of category tags"),
      location: z.string().optional().describe("Product location"),
      shippingOption: z
        .string()
        .optional()
        .describe(
          "Shipping type: 'N/A', 'Free', 'Added Cost', 'Pickup', 'Free/Pickup'"
        ),
      shippingCost: z
        .string()
        .optional()
        .describe("Shipping cost as string (default '0')"),
      quantity: z.string().optional().describe("Available quantity"),
      condition: z
        .string()
        .optional()
        .describe("Item condition (e.g. 'new', 'used')"),
      status: z
        .string()
        .optional()
        .describe("Listing status (e.g. 'active', 'draft')"),
      sizes: z
        .array(z.object({ size: z.string(), quantity: z.string() }))
        .optional()
        .describe("Size options with quantities"),
      volumes: z
        .array(z.object({ volume: z.string(), price: z.string() }))
        .optional()
        .describe("Volume/variant options with prices"),
      bulk: z
        .array(z.object({ units: z.string(), price: z.string() }))
        .optional()
        .describe("Bulk/bundle pricing tiers (e.g. 5 units for $100)"),
      weights: z
        .array(z.object({ weight: z.string(), price: z.string() }))
        .optional()
        .describe(
          "Weight options with prices (e.g. [{weight: '1lb', price: '10'}, {weight: '5lb', price: '45'}])"
        ),
      herdshareAgreement: z
        .string()
        .optional()
        .describe("URL to a herdshare agreement PDF"),
      requiredCustomerInfo: z
        .string()
        .optional()
        .describe("Required buyer info (e.g. 'Email required')"),
      pickupLocations: z
        .array(z.string())
        .optional()
        .describe("Pickup location addresses"),
      expiration: z
        .string()
        .optional()
        .describe("Expiration date (ISO 8601 format)"),
      dTag: z
        .string()
        .optional()
        .describe(
          "Custom d-tag identifier. If omitted, one is generated from the title."
        ),
      subscriptionEnabled: z
        .boolean()
        .optional()
        .describe("Enable subscription purchasing for this product"),
      subscriptionDiscount: z
        .string()
        .optional()
        .describe("Discount percentage for subscribers (e.g. '10' for 10%)"),
      subscriptionFrequencies: z
        .array(z.string())
        .optional()
        .describe(
          "Available subscription frequencies (e.g. ['weekly', 'monthly', 'quarterly'])"
        ),
    },
    async (params) => {
      const startTime = Date.now();
      if (apiKey.permissions !== "full_access") return permissionError();
      const signer = await getSigner(apiKey);
      if (!signer) return noSignerError();

      try {
        const pubkey = signer.getPubKey();
        const { createHash } = await import("crypto");
        const dTag =
          params.dTag ||
          createHash("sha256")
            .update(params.title + Date.now())
            .digest("hex")
            .substring(0, 16);

        const tags: string[][] = [
          ["d", dTag],
          ["alt", `Product listing: ${params.title}`],
          ["title", params.title],
          ["summary", params.description],
          ["price", params.price, params.currency],
          ["location", params.location || ""],
          [
            "shipping",
            params.shippingOption || "N/A",
            params.shippingCost || "0",
            params.currency,
          ],
        ];

        if (params.images) {
          for (const img of params.images) {
            tags.push(["image", img]);
          }
        }

        if (params.categories) {
          for (const cat of params.categories) {
            tags.push(["t", cat]);
          }
        }
        tags.push(["t", "MilkMarket"]);

        if (params.quantity) {
          tags.push(["quantity", params.quantity]);
        }

        if (params.sizes) {
          for (const s of params.sizes) {
            tags.push(["size", s.size, s.quantity]);
          }
        }

        if (params.volumes) {
          for (const v of params.volumes) {
            tags.push(["volume", v.volume, v.price]);
          }
        }

        if (params.bulk) {
          for (const b of params.bulk) {
            tags.push(["bulk", b.units, b.price]);
          }
        }

        if (params.weights) {
          for (const w of params.weights) {
            tags.push(["weight", w.weight, w.price]);
          }
        }

        if (params.herdshareAgreement) {
          tags.push(["herdshare_agreement", params.herdshareAgreement]);
        }

        if (params.requiredCustomerInfo) {
          tags.push(["required_customer_info", params.requiredCustomerInfo]);
        }

        if (params.condition) {
          tags.push(["condition", params.condition]);
        }

        if (params.status) {
          tags.push(["status", params.status]);
        }

        if (params.expiration) {
          const unixTime = Math.floor(
            new Date(params.expiration).getTime() / 1000
          );
          tags.push(["valid_until", unixTime.toString()]);
        }

        if (params.pickupLocations) {
          for (const loc of params.pickupLocations) {
            tags.push(["pickup_location", loc.trim()]);
          }
        }

        if (params.subscriptionEnabled) {
          tags.push(["subscription", "true"]);
          if (params.subscriptionDiscount) {
            tags.push(["subscription_discount", params.subscriptionDiscount]);
          }
          if (
            params.subscriptionFrequencies &&
            params.subscriptionFrequencies.length > 0
          ) {
            tags.push([
              "subscription_frequency",
              ...params.subscriptionFrequencies,
            ]);
          }
        }

        const created_at = Math.floor(Date.now() / 1000);
        tags.push(["published_at", String(created_at)]);

        const eventTemplate: EventTemplate = {
          created_at,
          kind: 30402,
          tags,
          content: params.description,
        };

        const signedEvent = await signAndPublishEvent(signer, eventTemplate);

        const handlerDTag = uuidv4();
        const origin =
          process.env.NEXT_PUBLIC_BASE_URL || "https://milk.market";

        const handlerEvent: EventTemplate = {
          kind: 31990,
          tags: [
            ["d", handlerDTag],
            ["k", "30402"],
            ["web", `${origin}/marketplace/<bech-32>`, "npub"],
            ["web", `${origin}/listing/<bech-32>`, "naddr"],
          ],
          content: "",
          created_at: Math.floor(Date.now() / 1000),
        };

        const recEvent: EventTemplate = {
          kind: 31989,
          tags: [
            ["d", "30402"],
            ["a", `31990:${pubkey}:${handlerDTag}`, "", "web"],
          ],
          content: "",
          created_at: Math.floor(Date.now() / 1000),
        };

        await signAndPublishEvent(signer, recEvent).catch(console.error);
        await signAndPublishEvent(signer, handlerEvent).catch(console.error);

        return successResponse(
          {
            eventId: signedEvent.id,
            pubkey: signedEvent.pubkey,
            dTag,
            listing: {
              title: params.title,
              price: params.price,
              currency: params.currency,
              categories: params.categories || [],
            },
          },
          startTime
        );
      } catch (error) {
        return errorResponse(
          "Failed to create product listing",
          error instanceof Error ? error.message : "Unknown error",
          startTime
        );
      }
    }
  );

  registerTool(server,
    "update_product_listing",
    "Update an existing product listing by publishing a new event with the same d-tag. All fields are optional — only provided fields will be included.",
    {
      dTag: z.string().describe("The d-tag of the listing to update"),
      title: z.string().optional().describe("Updated product title"),
      description: z
        .string()
        .optional()
        .describe("Updated product description"),
      price: z.string().optional().describe("Updated price"),
      currency: z.string().optional().describe("Updated currency"),
      images: z.array(z.string()).optional().describe("Updated image URLs"),
      categories: z.array(z.string()).optional().describe("Updated categories"),
      location: z.string().optional().describe("Updated location"),
      shippingOption: z.string().optional().describe("Updated shipping type"),
      shippingCost: z.string().optional().describe("Updated shipping cost"),
      quantity: z.string().optional().describe("Updated quantity"),
      condition: z.string().optional().describe("Updated condition"),
      status: z.string().optional().describe("Updated status"),
      sizes: z
        .array(z.object({ size: z.string(), quantity: z.string() }))
        .optional()
        .describe("Updated size options with quantities"),
      volumes: z
        .array(z.object({ volume: z.string(), price: z.string() }))
        .optional()
        .describe("Updated volume/variant options with prices"),
      bulk: z
        .array(z.object({ units: z.string(), price: z.string() }))
        .optional()
        .describe("Updated bulk/bundle pricing tiers"),
      weights: z
        .array(z.object({ weight: z.string(), price: z.string() }))
        .optional()
        .describe("Updated weight options with prices"),
      herdshareAgreement: z
        .string()
        .optional()
        .describe("Updated URL to a herdshare agreement PDF"),
      requiredCustomerInfo: z
        .string()
        .optional()
        .describe("Updated required buyer info (e.g. 'Email required')"),
      pickupLocations: z
        .array(z.string())
        .optional()
        .describe("Updated pickup location addresses"),
      expiration: z
        .string()
        .optional()
        .describe("Updated expiration date (ISO 8601 format)"),
      subscriptionEnabled: z
        .boolean()
        .optional()
        .describe("Enable or disable subscription purchasing for this product"),
      subscriptionDiscount: z
        .string()
        .optional()
        .describe("Discount percentage for subscribers (e.g. '10' for 10%)"),
      subscriptionFrequencies: z
        .array(z.string())
        .optional()
        .describe(
          "Available subscription frequencies (e.g. ['weekly', 'monthly', 'quarterly'])"
        ),
    },
    async (params) => {
      const startTime = Date.now();
      if (apiKey.permissions !== "full_access") return permissionError();
      const signer = await getSigner(apiKey);
      if (!signer) return noSignerError();

      try {
        const tags: string[][] = [["d", params.dTag]];

        if (params.title) {
          tags.push(["alt", `Product listing: ${params.title}`]);
          tags.push(["title", params.title]);
        }
        if (params.description) {
          tags.push(["summary", params.description]);
        }
        if (params.price && params.currency) {
          tags.push(["price", params.price, params.currency]);
        }
        if (params.location) {
          tags.push(["location", params.location]);
        }
        if (params.shippingOption) {
          tags.push([
            "shipping",
            params.shippingOption,
            params.shippingCost || "0",
            params.currency || "",
          ]);
        }
        if (params.images) {
          for (const img of params.images) {
            tags.push(["image", img]);
          }
        }
        if (params.categories) {
          for (const cat of params.categories) {
            tags.push(["t", cat]);
          }
          tags.push(["t", "MilkMarket"]);
        }
        if (params.quantity) {
          tags.push(["quantity", params.quantity]);
        }
        if (params.condition) {
          tags.push(["condition", params.condition]);
        }
        if (params.status) {
          tags.push(["status", params.status]);
        }
        if (params.sizes) {
          for (const s of params.sizes) {
            tags.push(["size", s.size, s.quantity]);
          }
        }
        if (params.volumes) {
          for (const v of params.volumes) {
            tags.push(["volume", v.volume, v.price]);
          }
        }
        if (params.bulk) {
          for (const b of params.bulk) {
            tags.push(["bulk", b.units, b.price]);
          }
        }
        if (params.weights) {
          for (const w of params.weights) {
            tags.push(["weight", w.weight, w.price]);
          }
        }
        if (params.herdshareAgreement) {
          tags.push(["herdshare_agreement", params.herdshareAgreement]);
        }
        if (params.requiredCustomerInfo) {
          tags.push(["required_customer_info", params.requiredCustomerInfo]);
        }
        if (params.pickupLocations) {
          for (const loc of params.pickupLocations) {
            tags.push(["pickup_location", loc.trim()]);
          }
        }
        if (params.expiration) {
          const unixTime = Math.floor(
            new Date(params.expiration).getTime() / 1000
          );
          tags.push(["valid_until", unixTime.toString()]);
        }

        if (params.subscriptionEnabled) {
          tags.push(["subscription", "true"]);
          if (params.subscriptionDiscount) {
            tags.push(["subscription_discount", params.subscriptionDiscount]);
          }
          if (
            params.subscriptionFrequencies &&
            params.subscriptionFrequencies.length > 0
          ) {
            tags.push([
              "subscription_frequency",
              ...params.subscriptionFrequencies,
            ]);
          }
        }

        const created_at = Math.floor(Date.now() / 1000);
        tags.push(["published_at", String(created_at)]);

        const eventTemplate: EventTemplate = {
          created_at,
          kind: 30402,
          tags,
          content: params.description || "",
        };

        const signedEvent = await signAndPublishEvent(signer, eventTemplate);

        return successResponse(
          {
            eventId: signedEvent.id,
            pubkey: signedEvent.pubkey,
            dTag: params.dTag,
            updated: true,
          },
          startTime
        );
      } catch (error) {
        return errorResponse(
          "Failed to update product listing",
          error instanceof Error ? error.message : "Unknown error",
          startTime
        );
      }
    }
  );

  registerTool(server,
    "delete_listing",
    "Delete a product listing or any Nostr event by publishing a deletion event (kind 5).",
    {
      eventIds: z.array(z.string()).describe("Array of event IDs to delete"),
      reason: z.string().optional().describe("Reason for deletion"),
    },
    async (params) => {
      const startTime = Date.now();
      if (apiKey.permissions !== "full_access") return permissionError();
      const signer = await getSigner(apiKey);
      if (!signer) return noSignerError();

      try {
        const eventTemplate: EventTemplate = {
          kind: 5,
          content: params.reason || "Deletion request",
          tags: params.eventIds.map((id: string) => ["e", id]),
          created_at: Math.floor(Date.now() / 1000),
        };

        const signedEvent = await signAndPublishEvent(signer, eventTemplate);

        return successResponse(
          {
            eventId: signedEvent.id,
            deletedEventIds: params.eventIds,
          },
          startTime
        );
      } catch (error) {
        return errorResponse(
          "Failed to delete listing",
          error instanceof Error ? error.message : "Unknown error",
          startTime
        );
      }
    }
  );

  registerTool(server,
    "publish_review",
    "Publish a review (kind 31555) for a product or seller. Includes content text and ratings.",
    {
      content: z.string().describe("Review text content"),
      productId: z
        .string()
        .optional()
        .describe("Product event ID being reviewed"),
      sellerPubkey: z
        .string()
        .optional()
        .describe("Seller pubkey being reviewed"),
      ratings: z
        .array(
          z.object({
            category: z
              .string()
              .describe(
                "Rating category (e.g. 'quality', 'communication', 'shipping')"
              ),
            value: z.number().describe("Rating value (typically 0-5)"),
          })
        )
        .optional()
        .describe("Array of rating categories and values"),
    },
    async (params) => {
      const startTime = Date.now();
      if (apiKey.permissions !== "full_access") return permissionError();
      const signer = await getSigner(apiKey);
      if (!signer) return noSignerError();

      try {
        if (!params.productId && !params.sellerPubkey) {
          return errorResponse(
            "Missing target",
            "Either productId or sellerPubkey is required",
            startTime
          );
        }

        const pubkey = signer.getPubKey();
        const dTag = params.productId
          ? `${pubkey}:${params.productId}`
          : `${pubkey}:${params.sellerPubkey}`;

        const tags: string[][] = [["d", dTag]];

        if (params.productId) {
          tags.push(["e", params.productId]);
        }
        if (params.sellerPubkey) {
          tags.push(["p", params.sellerPubkey]);
        }

        if (params.ratings) {
          for (const r of params.ratings) {
            tags.push(["rating", r.value.toString(), r.category]);
          }
        }

        const eventTemplate: EventTemplate = {
          created_at: Math.floor(Date.now() / 1000),
          content: params.content,
          kind: 31555,
          tags,
        };

        const signedEvent = await signAndPublishEvent(signer, eventTemplate);
        await cacheEvent(signedEvent).catch(console.error);

        return successResponse(
          {
            eventId: signedEvent.id,
            pubkey: signedEvent.pubkey,
            review: {
              content: params.content,
              ratings: params.ratings,
              dTag,
            },
          },
          startTime
        );
      } catch (error) {
        return errorResponse(
          "Failed to publish review",
          error instanceof Error ? error.message : "Unknown error",
          startTime
        );
      }
    }
  );

  registerTool(server,
    "create_community_post",
    "Create a post in a Nostr community (kind 1111). Supports top-level posts and replies.",
    {
      content: z.string().describe("Post content text"),
      communityId: z
        .string()
        .describe(
          "Community address in format 'kind:pubkey:d-tag' (e.g. '34550:<pubkey>:<d-tag>')"
        ),
      communityPubkey: z.string().describe("Community creator's public key"),
      parentEventId: z
        .string()
        .optional()
        .describe("Parent event ID for replies"),
      parentPubkey: z
        .string()
        .optional()
        .describe("Parent event author pubkey (for replies)"),
      parentKind: z
        .number()
        .optional()
        .describe("Parent event kind (for replies)"),
    },
    async (params) => {
      const startTime = Date.now();
      if (apiKey.permissions !== "full_access") return permissionError();
      const signer = await getSigner(apiKey);
      if (!signer) return noSignerError();

      try {
        const tags: string[][] = [];

        tags.push(["A", params.communityId]);
        tags.push(["P", params.communityPubkey]);
        tags.push(["K", "34550"]);

        if (params.parentEventId) {
          tags.push(["a", params.communityId]);
          tags.push(["e", params.parentEventId, ""]);
          if (params.parentPubkey) tags.push(["p", params.parentPubkey, ""]);
          if (params.parentKind) tags.push(["k", String(params.parentKind)]);
        } else {
          tags.push(["a", params.communityId]);
          tags.push(["p", params.communityPubkey]);
          tags.push(["k", "34550"]);
        }

        const eventTemplate: EventTemplate = {
          kind: 1111,
          created_at: Math.floor(Date.now() / 1000),
          tags,
          content: params.content,
        };

        const signedEvent = await signAndPublishEvent(signer, eventTemplate);
        await cacheEvent(signedEvent).catch(console.error);

        return successResponse(
          {
            eventId: signedEvent.id,
            pubkey: signedEvent.pubkey,
            communityId: params.communityId,
            isReply: !!params.parentEventId,
          },
          startTime
        );
      } catch (error) {
        return errorResponse(
          "Failed to create community post",
          error instanceof Error ? error.message : "Unknown error",
          startTime
        );
      }
    }
  );

  registerTool(server,
    "send_direct_message",
    "Send an encrypted direct message using NIP-17 gift wrap (kind 1059/13/14). Supports plain messages, listing inquiries, and order-related messages.",
    {
      recipientPubkey: z.string().describe("Recipient's public key (hex)"),
      message: z.string().describe("Message content"),
      subject: z
        .string()
        .optional()
        .describe(
          "Message subject (e.g. 'listing-inquiry', 'order-payment', 'shipping-info', 'general')"
        ),
      productAddress: z
        .string()
        .optional()
        .describe(
          "Product address for listing inquiries (format: '30402:<pubkey>:<d-tag>')"
        ),
      orderId: z
        .string()
        .optional()
        .describe("Order ID for order-related messages"),
      isOrder: z
        .boolean()
        .optional()
        .describe("Whether this is an order-related message"),
      orderAmount: z
        .number()
        .optional()
        .describe("Order amount (for order messages)"),
      status: z
        .string()
        .optional()
        .describe("Order status (for order messages)"),
      tracking: z
        .string()
        .optional()
        .describe("Tracking number (for shipping updates)"),
      carrier: z
        .string()
        .optional()
        .describe("Shipping carrier (for shipping updates)"),
      address: z.string().optional().describe("Shipping address (for orders)"),
    },
    async (params) => {
      const startTime = Date.now();
      if (apiKey.permissions !== "full_access") return permissionError();
      const signer = await getSigner(apiKey);
      if (!signer) return noSignerError();

      try {
        const {
          generateSecretKey,
          getPublicKey,
          finalizeEvent,
          getEventHash,
          nip44,
        } = await import("nostr-tools");

        const senderPubkey = signer.getPubKey();
        const { getDefaultRelays, withBlastr } = await import(
          "@/utils/nostr/nostr-helper-functions"
        );

        const defaultRelays = getDefaultRelays();
        const relayHint = defaultRelays[0] || "wss://relay.damus.io";

        const innerTags: string[][] = [
          ["p", params.recipientPubkey, relayHint],
          ["subject", params.subject || "general"],
        ];

        if (params.isOrder) {
          innerTags.push(["order", params.orderId || uuidv4()]);
          if (params.orderAmount)
            innerTags.push(["amount", params.orderAmount.toString()]);
          if (params.status) innerTags.push(["status", params.status]);
          if (params.tracking) innerTags.push(["tracking", params.tracking]);
          if (params.carrier) innerTags.push(["carrier", params.carrier]);
          if (params.address) innerTags.push(["address", params.address]);
          if (params.productAddress) {
            innerTags.push(["item", params.productAddress, "1"]);
          }
        } else if (params.productAddress) {
          innerTags.push(["a", params.productAddress, relayHint]);
        }

        const innerEvent = {
          pubkey: senderPubkey,
          created_at: Math.floor(Date.now() / 1000),
          content: params.message,
          kind: 14,
          tags: innerTags,
        };

        const innerEventForHash = {
          ...innerEvent,
          id: "",
          sig: "",
        };
        const innerEventId = getEventHash(innerEventForHash as any);
        const fullInnerEvent = { id: innerEventId, ...innerEvent };

        const randomPrivKey = generateSecretKey();
        const randomPubKey = getPublicKey(randomPrivKey);

        async function createGiftWrap(
          targetPubkey: string,
          sealPubkey: string,
          useRandomKey: boolean
        ) {
          const stringifiedInner = JSON.stringify(fullInnerEvent);
          let encryptedSealContent: string;

          if (useRandomKey) {
            const conversationKey = nip44.getConversationKey(
              randomPrivKey,
              targetPubkey
            );
            encryptedSealContent = nip44.encrypt(
              stringifiedInner,
              conversationKey
            );
          } else {
            encryptedSealContent = signer!.encrypt(
              targetPubkey,
              stringifiedInner
            );
          }

          const now = Math.floor(Date.now() / 1000);
          const randomOffset = Math.floor(Math.random() * 172800);
          const sealTimestamp = now - randomOffset;

          const sealEvent = {
            pubkey: sealPubkey,
            created_at: sealTimestamp,
            content: encryptedSealContent,
            kind: 13,
            tags: [] as string[][],
          };

          let signedSeal;
          if (useRandomKey) {
            signedSeal = finalizeEvent(sealEvent, randomPrivKey);
          } else {
            signedSeal = signer!.sign(sealEvent);
          }

          const wrapPrivKey = generateSecretKey();
          const wrapPubKey = getPublicKey(wrapPrivKey);

          const stringifiedSeal = JSON.stringify(signedSeal);
          const wrapConversationKey = nip44.getConversationKey(
            wrapPrivKey,
            targetPubkey
          );
          const encryptedWrap = nip44.encrypt(
            stringifiedSeal,
            wrapConversationKey
          );

          const wrapTimestamp = now - Math.floor(Math.random() * 172800);
          const giftWrapEvent = {
            pubkey: wrapPubKey,
            created_at: wrapTimestamp,
            content: encryptedWrap,
            kind: 1059,
            tags: [["p", targetPubkey, relayHint]],
          };

          return finalizeEvent(giftWrapEvent, wrapPrivKey);
        }

        const recipientWrap = await createGiftWrap(
          params.recipientPubkey,
          senderPubkey,
          false
        );
        const senderWrap = await createGiftWrap(
          senderPubkey,
          randomPubKey,
          true
        );

        const relayManager = new McpRelayManager(withBlastr(defaultRelays));

        try {
          await cacheEvent(recipientWrap as any);
          await cacheEvent(senderWrap as any);
          await relayManager.publish(recipientWrap as any);
          await relayManager.publish(senderWrap as any);
        } finally {
          relayManager.close();
        }

        return successResponse(
          {
            messageId: innerEventId,
            recipientPubkey: params.recipientPubkey,
            subject: params.subject || "general",
            isOrder: params.isOrder || false,
          },
          startTime
        );
      } catch (error) {
        return errorResponse(
          "Failed to send direct message",
          error instanceof Error ? error.message : "Unknown error",
          startTime
        );
      }
    }
  );

  registerTool(server,
    "update_order_address",
    "Update the shipping address for an existing order. Sends an encrypted address change request to the seller via NIP-17 gift-wrapped DM and updates the order record.",
    {
      orderId: z.string().describe("The order ID to update"),
      sellerPubkey: z.string().describe("The seller's public key (hex format)"),
      newAddress: z
        .string()
        .describe("The new delivery address as a single string"),
      productTitle: z
        .string()
        .optional()
        .describe("Product title for context in the message to seller"),
    },
    async (params) => {
      const startTime = Date.now();
      if (apiKey.permissions !== "full_access") return permissionError();
      const signer = await getSigner(apiKey);
      if (!signer) return noSignerError();

      try {
        const { updateMcpOrderAddress } = await import(
          "@/mcp/tools/purchase-tools"
        );

        const updatedOrder = await updateMcpOrderAddress(
          params.orderId,
          apiKey.pubkey,
          { address: params.newAddress }
        );

        if (!updatedOrder) {
          return errorResponse(
            "Order not found",
            `No order found with ID "${params.orderId}" for your account`,
            startTime
          );
        }

        const message =
          `Address change request for order ${params.orderId.substring(
            0,
            8
          )}...` +
          (params.productTitle ? ` (${params.productTitle})` : "") +
          `\n\nNew Address: ${params.newAddress}`;

        const { generateSecretKey, finalizeEvent, getEventHash, nip44 } =
          await import("nostr-tools");

        const senderPubkey = signer.getPubKey();
        const { getDefaultRelays, withBlastr } = await import(
          "@/utils/nostr/nostr-helper-functions"
        );
        const defaultRelays = getDefaultRelays();

        const innerEvent = {
          pubkey: senderPubkey,
          created_at: Math.floor(Date.now() / 1000),
          content: message,
          kind: 14,
          tags: [
            ["p", params.sellerPubkey],
            ["subject", "address-change"],
            ["order", params.orderId],
            ["address", params.newAddress],
          ] as string[][],
        };

        const innerEventForHash = { ...innerEvent, id: "", sig: "" };
        const innerEventId = getEventHash(innerEventForHash as any);
        const fullInnerEvent = { id: innerEventId, ...innerEvent };

        const randomPrivKey = generateSecretKey();

        async function createAddressChangeWrap(targetPubkey: string) {
          const stringifiedInner = JSON.stringify(fullInnerEvent);
          const conversationKey = nip44.getConversationKey(
            randomPrivKey,
            targetPubkey
          );
          const encryptedSealContent = nip44.encrypt(
            stringifiedInner,
            conversationKey
          );

          const now = Math.floor(Date.now() / 1000);
          const randomOffset = Math.floor(Math.random() * 172800);
          const sealTimestamp = now - randomOffset;

          const sealEvent = {
            created_at: sealTimestamp,
            kind: 13,
            tags: [],
            content: encryptedSealContent,
          };

          const signedSeal = finalizeEvent(sealEvent, randomPrivKey);

          const wrapPrivKey = generateSecretKey();
          const wrapConversationKey = nip44.getConversationKey(
            wrapPrivKey,
            targetPubkey
          );
          const wrapContent = nip44.encrypt(
            JSON.stringify(signedSeal),
            wrapConversationKey
          );

          const wrapTimestamp = now - Math.floor(Math.random() * 172800);

          const wrapEvent = {
            created_at: wrapTimestamp,
            kind: 1059,
            tags: [["p", targetPubkey]],
            content: wrapContent,
          };

          return finalizeEvent(wrapEvent, wrapPrivKey);
        }

        const sellerWrap = await createAddressChangeWrap(params.sellerPubkey);

        const relayManager = new McpRelayManager(withBlastr(defaultRelays));

        try {
          await cacheEvent(sellerWrap as any);
          await relayManager.publish(sellerWrap as any);
        } finally {
          relayManager.close();
        }

        return successResponse(
          {
            orderId: params.orderId,
            newAddress: params.newAddress,
            addressChangeMessageSent: true,
            sellerPubkey: params.sellerPubkey,
            orderUpdated: true,
          },
          startTime
        );
      } catch (error) {
        return errorResponse(
          "Failed to update order address",
          error instanceof Error ? error.message : "Unknown error",
          startTime
        );
      }
    }
  );

  registerTool(server,
    "send_shipping_update",
    "Send a shipping update to a buyer via encrypted NIP-17 gift-wrapped DM. Includes tracking number, carrier, and estimated delivery time. Also updates the order status to 'shipped' in the database.",
    {
      orderId: z.string().describe("The order ID this shipment is for"),
      buyerPubkey: z.string().describe("The buyer's public key (hex format)"),
      trackingNumber: z.string().describe("Shipping tracking number"),
      shippingCarrier: z
        .string()
        .describe("Shipping carrier name (e.g. 'USPS', 'FedEx', 'UPS', 'DHL')"),
      deliveryDays: z
        .number()
        .describe("Estimated number of days until delivery"),
      productAddress: z
        .string()
        .optional()
        .describe("Product address (format: 30402:pubkey:dTag) for context"),
      productTitle: z
        .string()
        .optional()
        .describe("Product title for the message text"),
    },
    async (params) => {
      const startTime = Date.now();
      if (apiKey.permissions !== "full_access") return permissionError();
      const signer = await getSigner(apiKey);
      if (!signer) return noSignerError();

      try {
        const { generateSecretKey, finalizeEvent, getEventHash, nip44 } =
          await import("nostr-tools");
        const { getDefaultRelays, withBlastr } = await import(
          "@/utils/nostr/nostr-helper-functions"
        );

        const senderPubkey = signer.getPubKey();
        const defaultRelays = getDefaultRelays();
        const relayHint: string =
          defaultRelays.length > 0 ? defaultRelays[0]! : "wss://relay.damus.io";

        const currentTimestamp = Math.floor(Date.now() / 1000);
        const etaTimestamp =
          currentTimestamp + params.deliveryDays * 24 * 60 * 60;
        const humanReadableDate = new Date(
          etaTimestamp * 1000
        ).toLocaleDateString("en-US", {
          weekday: "long",
          year: "numeric",
          month: "long",
          day: "numeric",
        });

        const message = params.productTitle
          ? `Your order${
              params.productTitle ? ` of "${params.productTitle}"` : ""
            } is expected to arrive on ${humanReadableDate}. Your ${
              params.shippingCarrier
            } tracking number is: ${params.trackingNumber}`
          : `Your order is expected to arrive on ${humanReadableDate}. Your ${params.shippingCarrier} tracking number is: ${params.trackingNumber}`;

        const innerTags: string[][] = [
          ["p", params.buyerPubkey, relayHint],
          ["subject", "shipping-info"],
          ["order", params.orderId],
          ["b", params.buyerPubkey],
          ["type", "4"],
          ["status", "shipped"],
          ["tracking", params.trackingNumber],
          ["carrier", params.shippingCarrier],
          ["eta", etaTimestamp.toString()],
        ];

        if (params.productAddress) {
          innerTags.push(["item", params.productAddress, "1"]);
        }

        const innerEvent = {
          pubkey: senderPubkey,
          created_at: currentTimestamp,
          content: message,
          kind: 14,
          tags: innerTags,
        };

        const innerEventForHash = { ...innerEvent, id: "", sig: "" };
        const innerEventId = getEventHash(innerEventForHash as any);
        const fullInnerEvent = { id: innerEventId, ...innerEvent };

        const randomPrivKey = generateSecretKey();

        async function createWrap(targetPubkey: string) {
          const stringifiedInner = JSON.stringify(fullInnerEvent);
          const conversationKey = nip44.getConversationKey(
            randomPrivKey,
            targetPubkey
          );
          const encryptedContent = nip44.encrypt(
            stringifiedInner,
            conversationKey
          );

          const now = Math.floor(Date.now() / 1000);
          const sealEvent = {
            created_at: now - Math.floor(Math.random() * 172800),
            kind: 13,
            tags: [],
            content: encryptedContent,
          };
          const signedSeal = finalizeEvent(sealEvent, randomPrivKey);

          const wrapPrivKey = generateSecretKey();
          const wrapConversationKey = nip44.getConversationKey(
            wrapPrivKey,
            targetPubkey
          );
          const wrapContent = nip44.encrypt(
            JSON.stringify(signedSeal),
            wrapConversationKey
          );

          return finalizeEvent(
            {
              created_at: now - Math.floor(Math.random() * 172800),
              kind: 1059,
              tags: [["p", targetPubkey]],
              content: wrapContent,
            },
            wrapPrivKey
          );
        }

        const buyerWrap = await createWrap(params.buyerPubkey);

        const relayManager = new McpRelayManager(withBlastr(defaultRelays));

        try {
          await cacheEvent(buyerWrap as any);
          await relayManager.publish(buyerWrap as any);
        } finally {
          relayManager.close();
        }

        const { updateMcpOrderStatus } = await import(
          "@/mcp/tools/purchase-tools"
        );
        await updateMcpOrderStatus(params.orderId, "shipped").catch(
          console.error
        );

        return successResponse(
          {
            orderId: params.orderId,
            buyerPubkey: params.buyerPubkey,
            trackingNumber: params.trackingNumber,
            carrier: params.shippingCarrier,
            estimatedDelivery: humanReadableDate,
            etaTimestamp,
            status: "shipped",
            messageSent: true,
          },
          startTime
        );
      } catch (error) {
        return errorResponse(
          "Failed to send shipping update",
          error instanceof Error ? error.message : "Unknown error",
          startTime
        );
      }
    }
  );

  registerTool(server,
    "update_order_status",
    "Update the status of an order and optionally notify the buyer via encrypted DM. Sellers can confirm, ship, or complete orders. Buyers can cancel orders.",
    {
      orderId: z.string().describe("The order ID to update"),
      status: z
        .enum(["confirmed", "shipped", "delivered", "completed", "cancelled"])
        .describe("New order status"),
      buyerPubkey: z
        .string()
        .optional()
        .describe(
          "Buyer's pubkey (hex format) — required to send a notification DM"
        ),
      message: z
        .string()
        .optional()
        .describe(
          "Custom message to include in the notification DM to the buyer/seller"
        ),
      productAddress: z
        .string()
        .optional()
        .describe("Product address for context in the notification"),
    },
    async (params) => {
      const startTime = Date.now();
      if (apiKey.permissions !== "full_access") return permissionError();
      const signer = await getSigner(apiKey);
      if (!signer) return noSignerError();

      try {
        const { updateMcpOrderStatus } = await import(
          "@/mcp/tools/purchase-tools"
        );
        const updatedOrder = await updateMcpOrderStatus(
          params.orderId,
          params.status
        );

        if (!updatedOrder) {
          return errorResponse(
            "Order not found",
            `No order found with ID "${params.orderId}"`,
            startTime
          );
        }

        let notificationSent = false;

        if (params.buyerPubkey && params.message) {
          try {
            const { generateSecretKey, finalizeEvent, getEventHash, nip44 } =
              await import("nostr-tools");
            const { getDefaultRelays, withBlastr } = await import(
              "@/utils/nostr/nostr-helper-functions"
            );

            const senderPubkey = signer.getPubKey();
            const defaultRelays = getDefaultRelays();
            const relayHint: string =
              defaultRelays.length > 0
                ? defaultRelays[0]!
                : "wss://relay.damus.io";

            const subjectMap: Record<string, string> = {
              confirmed: "order-info",
              shipped: "shipping-info",
              delivered: "order-completed",
              completed: "order-completed",
              cancelled: "order-info",
            };

            const innerTags: string[][] = [
              ["p", params.buyerPubkey, relayHint],
              ["subject", subjectMap[params.status] || "order-info"],
              ["order", params.orderId],
              ["status", params.status],
              ["b", params.buyerPubkey],
            ];
            if (params.productAddress) {
              innerTags.push(["item", params.productAddress, "1"]);
            }

            const innerEvent = {
              pubkey: senderPubkey,
              created_at: Math.floor(Date.now() / 1000),
              content: params.message,
              kind: 14,
              tags: innerTags,
            };

            const innerEventForHash = { ...innerEvent, id: "", sig: "" };
            const innerEventId = getEventHash(innerEventForHash as any);
            const fullInnerEvent = { id: innerEventId, ...innerEvent };

            const randomPrivKey = generateSecretKey();

            const stringifiedInner = JSON.stringify(fullInnerEvent);
            const conversationKey = nip44.getConversationKey(
              randomPrivKey,
              params.buyerPubkey
            );
            const encryptedContent = nip44.encrypt(
              stringifiedInner,
              conversationKey
            );

            const now = Math.floor(Date.now() / 1000);
            const sealEvent = {
              created_at: now - Math.floor(Math.random() * 172800),
              kind: 13,
              tags: [],
              content: encryptedContent,
            };
            const signedSeal = finalizeEvent(sealEvent, randomPrivKey);

            const wrapPrivKey = generateSecretKey();
            const wrapConversationKey = nip44.getConversationKey(
              wrapPrivKey,
              params.buyerPubkey
            );
            const wrapContent = nip44.encrypt(
              JSON.stringify(signedSeal),
              wrapConversationKey
            );

            const wrapEvent = finalizeEvent(
              {
                created_at: now - Math.floor(Math.random() * 172800),
                kind: 1059,
                tags: [["p", params.buyerPubkey]],
                content: wrapContent,
              },
              wrapPrivKey
            );

            const relayManager = new McpRelayManager(withBlastr(defaultRelays));
            try {
              await cacheEvent(wrapEvent as any);
              await relayManager.publish(wrapEvent as any);
              notificationSent = true;
            } finally {
              relayManager.close();
            }
          } catch (dmError) {
            console.error("Failed to send status notification DM:", dmError);
          }
        }

        return successResponse(
          {
            orderId: params.orderId,
            status: params.status,
            orderUpdated: true,
            notificationSent,
          },
          startTime
        );
      } catch (error) {
        return errorResponse(
          "Failed to update order status",
          error instanceof Error ? error.message : "Unknown error",
          startTime
        );
      }
    }
  );

  registerTool(server,
    "list_messages",
    "Fetch and decrypt your incoming messages (NIP-17 gift-wrapped DMs). Returns decrypted message content, sender, subject, and read status. Use to check inquiries, order messages, address changes, and other DMs.",
    {
      unreadOnly: z
        .boolean()
        .optional()
        .describe("Only return unread messages (default false)"),
      subject: z
        .string()
        .optional()
        .describe(
          "Filter by subject tag: 'listing-inquiry', 'order-payment', 'order-info', 'address-change', 'shipping-info', 'order-completed', or any custom subject"
        ),
      limit: z
        .number()
        .optional()
        .describe("Max number of messages to return (default 20)"),
      senderPubkey: z
        .string()
        .optional()
        .describe("Filter by sender pubkey (hex format)"),
    },
    async (params) => {
      const startTime = Date.now();
      if (apiKey.permissions !== "full_access") return permissionError();
      const signer = await getSigner(apiKey);
      if (!signer) return noSignerError();

      try {
        const { fetchAllMessagesFromDb } = await import(
          "@/utils/db/db-service"
        );

        const allMessages = await fetchAllMessagesFromDb(apiKey.pubkey);

        let filtered = allMessages;
        if (params.unreadOnly) {
          filtered = filtered.filter((m) => !m.is_read);
        }

        const limit = params.limit || 20;
        filtered = filtered.slice(0, limit * 3);

        const decryptedMessages: any[] = [];

        for (const msg of filtered) {
          if (decryptedMessages.length >= limit) break;

          try {
            const innerContent = signer.decrypt(msg.pubkey, msg.content);
            let sealEvent: any;
            try {
              sealEvent = JSON.parse(innerContent);
            } catch {
              continue;
            }

            if (!sealEvent || !sealEvent.content) continue;

            let innerMessage: any;
            try {
              const sealContent = signer.decrypt(
                sealEvent.pubkey,
                sealEvent.content
              );
              innerMessage = JSON.parse(sealContent);
            } catch {
              continue;
            }

            if (!innerMessage) continue;

            const tags = innerMessage.tags || [];
            const tagsMap = new Map<string, string>();
            for (const tag of tags) {
              if (tag.length >= 2) {
                tagsMap.set(tag[0], tag[1]);
              }
            }

            const msgSubject = tagsMap.get("subject") || "general";

            if (params.subject && msgSubject !== params.subject) continue;
            if (
              params.senderPubkey &&
              innerMessage.pubkey !== params.senderPubkey
            )
              continue;

            decryptedMessages.push({
              eventId: msg.id,
              senderPubkey: innerMessage.pubkey,
              content: innerMessage.content,
              subject: msgSubject,
              orderId: tagsMap.get("order") || null,
              productAddress: tagsMap.get("a") || null,
              address: tagsMap.get("address") || null,
              createdAt: innerMessage.created_at,
              isRead: msg.is_read,
            });
          } catch {
            continue;
          }
        }

        return successResponse(
          {
            messages: decryptedMessages,
            total: decryptedMessages.length,
            hasMore: filtered.length > limit,
          },
          startTime
        );
      } catch (error) {
        return errorResponse(
          "Failed to list messages",
          error instanceof Error ? error.message : "Unknown error",
          startTime
        );
      }
    }
  );

  registerTool(server,
    "mark_messages_read",
    "Mark specific messages as read by their event IDs.",
    {
      messageIds: z
        .array(z.string())
        .describe("Array of message event IDs to mark as read"),
    },
    async (params) => {
      const startTime = Date.now();
      if (apiKey.permissions !== "full_access") return permissionError();

      try {
        const { getDbPool } = await import("@/utils/db/db-service");
        const pool = getDbPool();
        let client;
        try {
          client = await pool.connect();
          await client.query(
            `UPDATE message_events SET is_read = TRUE WHERE id = ANY($1)`,
            [params.messageIds]
          );
        } finally {
          if (client) client.release();
        }

        return successResponse(
          {
            markedRead: params.messageIds.length,
            messageIds: params.messageIds,
          },
          startTime
        );
      } catch (error) {
        return errorResponse(
          "Failed to mark messages as read",
          error instanceof Error ? error.message : "Unknown error",
          startTime
        );
      }
    }
  );

  registerTool(server,
    "set_relay_list",
    "Publish your relay list (kind 10002, NIP-65). Configures which relays you read from and write to.",
    {
      relays: z
        .array(
          z.object({
            url: z.string().describe("Relay WebSocket URL (wss://...)"),
            type: z
              .enum(["read", "write", "both"])
              .optional()
              .describe("Relay type: 'read', 'write', or 'both' (default)"),
          })
        )
        .describe("Array of relay configurations"),
    },
    async (params) => {
      const startTime = Date.now();
      if (apiKey.permissions !== "full_access") return permissionError();
      const signer = await getSigner(apiKey);
      if (!signer) return noSignerError();

      try {
        const tags: string[][] = [];
        for (const relay of params.relays) {
          if (relay.type === "read") {
            tags.push(["r", relay.url, "read"]);
          } else if (relay.type === "write") {
            tags.push(["r", relay.url, "write"]);
          } else {
            tags.push(["r", relay.url]);
          }
        }

        const eventTemplate: EventTemplate = {
          kind: 10002,
          created_at: Math.floor(Date.now() / 1000),
          tags,
          content: "",
        };

        const signedEvent = await signAndPublishEvent(signer, eventTemplate);
        await cacheEvent(signedEvent).catch(console.error);

        return successResponse(
          {
            eventId: signedEvent.id,
            relayCount: params.relays.length,
            relays: params.relays,
          },
          startTime
        );
      } catch (error) {
        return errorResponse(
          "Failed to set relay list",
          error instanceof Error ? error.message : "Unknown error",
          startTime
        );
      }
    }
  );

  registerTool(server,
    "set_blossom_servers",
    "Publish your Blossom media server list (kind 10063). Configures which servers to use for media uploads.",
    {
      servers: z.array(z.string()).describe("Array of Blossom server URLs"),
    },
    async (params) => {
      const startTime = Date.now();
      if (apiKey.permissions !== "full_access") return permissionError();
      const signer = await getSigner(apiKey);
      if (!signer) return noSignerError();

      try {
        const tags: string[][] = params.servers.map((s: string) => ["server", s]);

        const eventTemplate: EventTemplate = {
          kind: 10063,
          created_at: Math.floor(Date.now() / 1000),
          tags,
          content: "",
        };

        const signedEvent = await signAndPublishEvent(signer, eventTemplate);
        await cacheEvent(signedEvent).catch(console.error);

        return successResponse(
          {
            eventId: signedEvent.id,
            serverCount: params.servers.length,
            servers: params.servers,
          },
          startTime
        );
      } catch (error) {
        return errorResponse(
          "Failed to set blossom servers",
          error instanceof Error ? error.message : "Unknown error",
          startTime
        );
      }
    }
  );

  registerTool(server,
    "upload_media",
    "Upload media to a Blossom server. Creates a signed authorization event (kind 24242) and uploads the file. Returns the URL of the uploaded media.",
    {
      fileBase64: z.string().describe("Base64-encoded file content"),
      fileName: z.string().describe("File name with extension"),
      mimeType: z
        .string()
        .describe("MIME type of the file (e.g. 'image/jpeg', 'image/png')"),
      serverUrl: z
        .string()
        .optional()
        .describe(
          "Blossom server URL to upload to (default: https://cdn.nostrcheck.me)"
        ),
    },
    async (params) => {
      const startTime = Date.now();
      if (apiKey.permissions !== "full_access") return permissionError();
      const signer = await getSigner(apiKey);
      if (!signer) return noSignerError();

      try {
        const fileBuffer = Buffer.from(params.fileBase64, "base64");
        const fileBytes = Uint8Array.from(fileBuffer);
        const { createHash: cryptoCreateHash } = await import("crypto");
        const hash = cryptoCreateHash("sha256")
          .update(fileBytes)
          .digest("hex");

        const authEvent: EventTemplate = {
          kind: 24242,
          content: `Upload ${params.fileName}`,
          created_at: Math.floor(Date.now() / 1000),
          tags: [
            ["t", "upload"],
            ["x", hash],
            ["size", fileBuffer.length.toString()],
            [
              "expiration",
              Math.floor((Date.now() + 24 * 60 * 60 * 1000) / 1000).toString(),
            ],
          ],
        };

        const signedAuth = signer.sign(authEvent);
        const authBase64 = Buffer.from(JSON.stringify(signedAuth)).toString(
          "base64"
        );
        const authorization = `Nostr ${authBase64}`;

        const serverUrl = params.serverUrl || "https://cdn.nostrcheck.me";
        const uploadUrl = new URL("/upload", serverUrl);

        const uploadBody = new Blob([fileBytes], {
          type: params.mimeType,
        });

        const response = await fetch(uploadUrl.toString(), {
          method: "PUT",
          body: uploadBody,
          headers: {
            authorization,
            "content-type": params.mimeType,
          },
        });

        if (!response.ok) {
          const errorText = await response.text();
          return errorResponse(
            "Upload failed",
            `Server responded with ${response.status}: ${errorText}`,
            startTime
          );
        }

        const result = await response.json();

        return successResponse(
          {
            url: result.url,
            sha256: result.sha256 || hash,
            size: result.size || fileBuffer.length,
            serverUrl,
          },
          startTime
        );
      } catch (error) {
        return errorResponse(
          "Failed to upload media",
          error instanceof Error ? error.message : "Unknown error",
          startTime
        );
      }
    }
  );

  registerTool(server,
    "create_discount_code",
    "Create a discount code for your shop. Codes are percentage-based and can have optional expiration dates.",
    {
      code: z.string().describe("Discount code string (e.g. 'SUMMER20')"),
      discountPercentage: z.number().describe("Discount percentage (0-100)"),
      expiration: z
        .number()
        .optional()
        .describe("Expiration as Unix timestamp (optional)"),
    },
    async (params) => {
      const startTime = Date.now();
      if (apiKey.permissions !== "full_access") return permissionError();
      const signer = await getSigner(apiKey);
      if (!signer) return noSignerError();

      try {
        const pubkey = signer.getPubKey();
        const res = await fetch(`${baseUrl}/api/db/discount-codes`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            code: params.code,
            pubkey,
            discountPercentage: params.discountPercentage,
            expiration: params.expiration,
          }),
        });
        const data = await res.json();
        if (!res.ok) {
          return errorResponse(
            "Failed to create discount code",
            data.error || "Unknown error",
            startTime
          );
        }
        return successResponse(
          {
            code: params.code,
            discountPercentage: params.discountPercentage,
            expiration: params.expiration,
          },
          startTime
        );
      } catch (error) {
        return errorResponse(
          "Failed to create discount code",
          error instanceof Error ? error.message : "Unknown error",
          startTime
        );
      }
    }
  );

  registerTool(server,
    "delete_discount_code",
    "Delete one of your discount codes.",
    {
      code: z.string().describe("Discount code to delete"),
    },
    async (params) => {
      const startTime = Date.now();
      if (apiKey.permissions !== "full_access") return permissionError();
      const signer = await getSigner(apiKey);
      if (!signer) return noSignerError();

      try {
        const pubkey = signer.getPubKey();
        const res = await fetch(`${baseUrl}/api/db/discount-codes`, {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code: params.code, pubkey }),
        });
        const data = await res.json();
        if (!res.ok) {
          return errorResponse(
            "Failed to delete discount code",
            data.error || "Unknown error",
            startTime
          );
        }
        return successResponse({ code: params.code, deleted: true }, startTime);
      } catch (error) {
        return errorResponse(
          "Failed to delete discount code",
          error instanceof Error ? error.message : "Unknown error",
          startTime
        );
      }
    }
  );

  registerTool(server,
    "list_discount_codes",
    "List your shop's discount codes.",
    {},
    async () => {
      const startTime = Date.now();
      if (apiKey.permissions !== "full_access") return permissionError();
      const signer = await getSigner(apiKey);
      if (!signer) return noSignerError();

      try {
        const pubkey = signer.getPubKey();
        const res = await fetch(
          `${baseUrl}/api/db/discount-codes?pubkey=${pubkey}`
        );
        const data = await res.json();
        return successResponse(
          {
            count: Array.isArray(data) ? data.length : 0,
            codes: data,
          },
          startTime
        );
      } catch (error) {
        return errorResponse(
          "Failed to list discount codes",
          error instanceof Error ? error.message : "Unknown error",
          startTime
        );
      }
    }
  );

  registerTool(server,
    "get_cashu_balance",
    "Check your Cashu wallet balance by querying stored proof events.",
    {
      mintUrl: z.string().optional().describe("Filter by specific mint URL"),
    },
    async (params) => {
      const startTime = Date.now();
      if (apiKey.permissions !== "full_access") return permissionError();
      const signer = await getSigner(apiKey);
      if (!signer) return noSignerError();

      try {
        const { fetchCachedEvents } = await import("@/utils/db/db-service");
        const pubkey = signer.getPubKey();
        const proofEvents = await fetchCachedEvents(7375);
        const myProofEvents = proofEvents.filter(
          (e: any) => e.pubkey === pubkey
        );

        let totalBalance = 0;
        const mintBalances: Record<string, number> = {};

        for (const event of myProofEvents) {
          try {
            const decryptedContent = signer.decrypt(pubkey, event.content);
            const parsed = JSON.parse(decryptedContent);
            const mintUrl = parsed.mint;
            const proofs = parsed.proofs || [];
            const amount = proofs.reduce(
              (sum: number, p: any) => sum + (p.amount || 0),
              0
            );

            if (!params.mintUrl || mintUrl === params.mintUrl) {
              totalBalance += amount;
              mintBalances[mintUrl] = (mintBalances[mintUrl] || 0) + amount;
            }
          } catch {
            continue;
          }
        }

        return successResponse(
          {
            totalBalance,
            unit: "sats",
            mintBalances,
            proofEventCount: myProofEvents.length,
          },
          startTime
        );
      } catch (error) {
        return errorResponse(
          "Failed to get Cashu balance",
          error instanceof Error ? error.message : "Unknown error",
          startTime
        );
      }
    }
  );

  registerTool(server,
    "receive_cashu_tokens",
    "Receive Cashu tokens and store them as a proof event (kind 7375). Publishes the encrypted proof event to your Nostr relays.",
    {
      token: z.string().describe("Serialized Cashu token string to receive"),
    },
    async (params) => {
      const startTime = Date.now();
      if (apiKey.permissions !== "full_access") return permissionError();
      const signer = await getSigner(apiKey);
      if (!signer) return noSignerError();

      try {
        const { getDecodedToken } = await import("@cashu/cashu-ts");
        const decoded = getDecodedToken(params.token);
        const mintUrl = decoded.mint;
        const proofs = decoded.proofs;
        const totalAmount = proofs.reduce(
          (sum: number, p: any) => sum + (p.amount || 0),
          0
        );

        const pubkey = signer.getPubKey();

        const proofData = JSON.stringify({
          mint: mintUrl,
          proofs,
        });
        const encryptedContent = signer.encrypt(pubkey, proofData);

        const { getDefaultRelays, withBlastr } = await import(
          "@/utils/nostr/nostr-helper-functions"
        );

        const relays = withBlastr(getDefaultRelays());
        const tags: string[][] = [["mint", mintUrl]];
        for (const relay of relays) {
          tags.push(["relay", relay]);
        }

        const eventTemplate: EventTemplate = {
          kind: 7375,
          created_at: Math.floor(Date.now() / 1000),
          tags,
          content: encryptedContent,
        };

        const signedEvent = await signAndPublishEvent(signer, eventTemplate);

        return successResponse(
          {
            eventId: signedEvent.id,
            amount: totalAmount,
            mint: mintUrl,
            proofCount: proofs.length,
          },
          startTime
        );
      } catch (error) {
        return errorResponse(
          "Failed to receive Cashu tokens",
          error instanceof Error ? error.message : "Unknown error",
          startTime
        );
      }
    }
  );

  registerTool(server,
    "set_cashu_mints",
    "Configure your Cashu wallet mints by publishing a wallet configuration event (kind 17375).",
    {
      mints: z
        .array(z.string())
        .describe(
          "Array of Cashu mint URLs (e.g. ['https://mint.minibits.cash/Bitcoin'])"
        ),
    },
    async (params) => {
      const startTime = Date.now();
      if (apiKey.permissions !== "full_access") return permissionError();
      const signer = await getSigner(apiKey);
      if (!signer) return noSignerError();

      try {
        const pubkey = signer.getPubKey();
        const mintTags = params.mints.map((m: string) => ["mint", m]);
        const encryptedContent = signer.encrypt(
          pubkey,
          JSON.stringify(mintTags)
        );

        const { getDefaultRelays, withBlastr } = await import(
          "@/utils/nostr/nostr-helper-functions"
        );

        const relays = withBlastr(getDefaultRelays());
        const tags: string[][] = [["d", pubkey]];
        for (const relay of relays) {
          tags.push(["relay", relay]);
        }

        const eventTemplate: EventTemplate = {
          kind: 17375,
          created_at: Math.floor(Date.now() / 1000),
          tags,
          content: encryptedContent,
        };

        const signedEvent = await signAndPublishEvent(signer, eventTemplate);

        return successResponse(
          {
            eventId: signedEvent.id,
            mints: params.mints,
            mintCount: params.mints.length,
          },
          startTime
        );
      } catch (error) {
        return errorResponse(
          "Failed to set Cashu mints",
          error instanceof Error ? error.message : "Unknown error",
          startTime
        );
      }
    }
  );

  registerTool(server,
    "send_cashu_payment",
    "Send a Cashu payment by melting tokens to pay a Lightning invoice. Uses proofs from your stored Cashu wallet.",
    {
      invoice: z.string().describe("Lightning invoice (bolt11) to pay"),
      mintUrl: z
        .string()
        .optional()
        .describe(
          "Cashu mint URL to use for melting (default: https://mint.minibits.cash/Bitcoin)"
        ),
    },
    async (params) => {
      const startTime = Date.now();
      if (apiKey.permissions !== "full_access") return permissionError();
      const signer = await getSigner(apiKey);
      if (!signer) return noSignerError();

      try {
        const { CashuMint, CashuWallet } = await import("@cashu/cashu-ts");
        const mintUrl = params.mintUrl || "https://mint.minibits.cash/Bitcoin";
        const mint = new CashuMint(mintUrl);
        const keys = await mint.getKeys();
        const wallet = new CashuWallet(mint, { keys: keys.keysets[0] as any });

        const { fetchCachedEvents } = await import("@/utils/db/db-service");
        const pubkey = signer.getPubKey();
        const proofEvents = await fetchCachedEvents(7375);
        const myProofEvents = proofEvents.filter(
          (e: any) => e.pubkey === pubkey
        );

        let availableProofs: any[] = [];
        for (const event of myProofEvents) {
          try {
            const decryptedContent = signer.decrypt(pubkey, event.content);
            const parsed = JSON.parse(decryptedContent);
            if (parsed.mint === mintUrl && parsed.proofs) {
              availableProofs.push(...parsed.proofs);
            }
          } catch {
            continue;
          }
        }

        if (availableProofs.length === 0) {
          return errorResponse(
            "No available proofs",
            `No Cashu proofs found for mint ${mintUrl}`,
            startTime
          );
        }

        const meltQuote = await wallet.createMeltQuote(params.invoice);
        const totalNeeded = meltQuote.amount + (meltQuote.fee_reserve || 0);
        const totalAvailable = availableProofs.reduce(
          (sum: number, p: any) => sum + (p.amount || 0),
          0
        );

        if (totalAvailable < totalNeeded) {
          return errorResponse(
            "Insufficient balance",
            `Need ${totalNeeded} sats but only have ${totalAvailable} sats`,
            startTime
          );
        }

        const meltResult = await wallet.meltProofs(meltQuote, availableProofs);

        return successResponse(
          {
            paid: (meltResult as any).quote?.paid || true,
            amount: meltQuote.amount,
            fee: meltQuote.fee_reserve || 0,
            mintUrl,
            change: meltResult.change
              ? meltResult.change.reduce(
                  (sum: number, p: any) => sum + (p.amount || 0),
                  0
                )
              : 0,
          },
          startTime
        );
      } catch (error) {
        return errorResponse(
          "Failed to send Cashu payment",
          error instanceof Error ? error.message : "Unknown error",
          startTime
        );
      }
    }
  );

  registerTool(server,
    "list_seller_subscriptions",
    "List all subscriptions to your products. Shows subscriber details, frequency, status, pricing, and shipping info for each subscription.",
    {
      status: z
        .string()
        .optional()
        .describe(
          "Filter by subscription status: 'active', 'paused', or 'canceled'"
        ),
    },
    async (params) => {
      const startTime = Date.now();
      if (apiKey.permissions !== "full_access") return permissionError();
      const signer = await getSigner(apiKey);
      if (!signer) return noSignerError();

      try {
        const pubkey = signer.getPubKey();
        let subscriptions = await getSubscriptionsBySellerPubkey(pubkey);

        if (params.status) {
          subscriptions = subscriptions.filter(
            (s: any) => s.status === params.status
          );
        }

        return successResponse(
          {
            count: subscriptions.length,
            subscriptions: subscriptions.map((s: any) => ({
              id: s.id,
              stripeSubscriptionId: s.stripe_subscription_id,
              buyerEmail: s.buyer_email,
              buyerPubkey: s.buyer_pubkey,
              productEventId: s.product_event_id,
              quantity: s.quantity,
              variantInfo: s.variant_info,
              frequency: s.frequency,
              discountPercent: s.discount_percent,
              basePrice: s.base_price,
              subscriptionPrice: s.subscription_price,
              currency: s.currency,
              shippingAddress: s.shipping_address,
              status: s.status,
              nextBillingDate: s.next_billing_date,
              nextShippingDate: s.next_shipping_date,
              createdAt: s.created_at,
              updatedAt: s.updated_at,
            })),
          },
          startTime
        );
      } catch (error) {
        return errorResponse(
          "Failed to list seller subscriptions",
          error instanceof Error ? error.message : "Unknown error",
          startTime
        );
      }
    }
  );

  registerTool(server,
    "set_notification_email",
    "Set or update the notification email for order updates, subscription reminders, etc. Supports both buyer and seller roles.",
    {
      email: z.string().describe("Email address for notifications"),
      role: z
        .enum(["buyer", "seller"])
        .describe("Role for the notification email (buyer or seller)"),
    },
    async (params) => {
      const startTime = Date.now();
      if (apiKey.permissions !== "full_access") return permissionError();
      const signer = await getSigner(apiKey);
      if (!signer) return noSignerError();

      try {
        const pubkey = signer.getPubKey();
        const response = await fetch(
          `${baseUrl}/api/email/notification-email`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              email: params.email,
              role: params.role,
              pubkey,
            }),
          }
        );

        const data = await response.json();
        if (!response.ok) {
          return errorResponse(
            "Failed to set notification email",
            data.error || "Unknown error",
            startTime
          );
        }

        return successResponse(
          {
            email: params.email,
            role: params.role,
            pubkey,
          },
          startTime
        );
      } catch (error) {
        return errorResponse(
          "Failed to set notification email",
          error instanceof Error ? error.message : "Unknown error",
          startTime
        );
      }
    }
  );

  registerTool(server,
    "get_notification_email",
    "Retrieve the notification email configured for a given pubkey and role (buyer or seller).",
    {
      role: z
        .enum(["buyer", "seller"])
        .optional()
        .describe(
          "Role to query (buyer or seller). Defaults to checking both."
        ),
    },
    async (params) => {
      const startTime = Date.now();
      const signer = await getSigner(apiKey);
      if (!signer) return noSignerError();

      try {
        const pubkey = signer.getPubKey();
        const roleParam = params.role ? `&role=${params.role}` : "";
        const response = await fetch(
          `${baseUrl}/api/email/notification-email?pubkey=${pubkey}${roleParam}`
        );

        const data = await response.json();
        if (!response.ok) {
          return errorResponse(
            "Failed to get notification email",
            data.error || "Unknown error",
            startTime
          );
        }

        return successResponse(
          {
            email: data.email,
            pubkey,
            role: params.role || "any",
          },
          startTime
        );
      } catch (error) {
        return errorResponse(
          "Failed to get notification email",
          error instanceof Error ? error.message : "Unknown error",
          startTime
        );
      }
    }
  );

  registerTool(server,
    "create_email_flow",
    "Create an automated email flow (welcome series, abandoned cart, post-purchase, or winback). Optionally include default template steps or provide custom steps.",
    {
      name: z.string().describe("Name for the email flow"),
      flow_type: z
        .enum(["welcome_series", "abandoned_cart", "post_purchase", "winback"])
        .describe("Type of email flow"),
      from_name: z
        .string()
        .optional()
        .describe(
          "Custom sender display name for emails sent from this flow (e.g. 'Fresh Farm Dairy')"
        ),
      reply_to: z
        .string()
        .optional()
        .describe(
          "Custom reply-to email address for emails sent from this flow"
        ),
      use_defaults: z
        .boolean()
        .optional()
        .describe(
          "Whether to populate the flow with default template steps (default true)"
        ),
      steps: z
        .array(
          z.object({
            step_order: z.number().describe("Order of the step (1-based)"),
            subject: z
              .string()
              .describe(
                "Email subject line (supports merge tags like {{shop_name}}, {{buyer_name}})"
              ),
            body_html: z
              .string()
              .describe("Email body HTML (supports merge tags)"),
            delay_hours: z
              .number()
              .describe("Hours to delay after enrollment or previous step"),
          })
        )
        .optional()
        .describe("Custom steps to add to the flow (overrides use_defaults)"),
    },
    async (params) => {
      const startTime = Date.now();
      if (apiKey.permissions !== "full_access") return permissionError();
      const signer = await getSigner(apiKey);
      if (!signer) return noSignerError();

      try {
        const pubkey = signer.getPubKey();

        const flow = await createEmailFlow({
          seller_pubkey: pubkey,
          name: params.name,
          flow_type: params.flow_type,
        });

        if (params.from_name || params.reply_to) {
          await updateEmailFlow(flow.id, {
            from_name: params.from_name || null,
            reply_to: params.reply_to || null,
          });
        }

        let stepsCreated = 0;

        if (params.steps && params.steps.length > 0) {
          for (const step of params.steps) {
            await createFlowStep({
              flow_id: flow.id,
              step_order: step.step_order,
              subject: step.subject,
              body_html: step.body_html,
              delay_hours: step.delay_hours,
            });
            stepsCreated++;
          }
        } else if (params.use_defaults !== false) {
          const defaultSteps = getDefaultFlowSteps(params.flow_type);
          for (const step of defaultSteps) {
            await createFlowStep({
              flow_id: flow.id,
              step_order: step.step_order,
              subject: step.subject,
              body_html: step.body_html,
              delay_hours: step.delay_hours,
            });
            stepsCreated++;
          }
        }

        return successResponse(
          {
            flow,
            stepsCreated,
          },
          startTime
        );
      } catch (error) {
        return errorResponse(
          "Failed to create email flow",
          error instanceof Error ? error.message : "Unknown error",
          startTime
        );
      }
    }
  );

  registerTool(server,
    "list_email_flows",
    "List all email flows for your shop. Returns flow definitions with their type, status, and metadata.",
    {},
    async () => {
      const startTime = Date.now();
      const signer = await getSigner(apiKey);
      if (!signer) return noSignerError();

      try {
        const pubkey = signer.getPubKey();
        const flows = await getEmailFlows(pubkey);

        return successResponse(
          {
            flows,
            total: flows.length,
          },
          startTime
        );
      } catch (error) {
        return errorResponse(
          "Failed to list email flows",
          error instanceof Error ? error.message : "Unknown error",
          startTime
        );
      }
    }
  );

  registerTool(server,
    "update_email_flow",
    "Update an email flow's name, sender settings, steps, or any combination. Can add, update, or remove individual steps.",
    {
      flow_id: z.number().describe("The ID of the flow to update"),
      name: z.string().optional().describe("Updated flow name"),
      from_name: z
        .string()
        .optional()
        .describe("Custom sender display name (set to empty string to clear)"),
      reply_to: z
        .string()
        .optional()
        .describe(
          "Custom reply-to email address (set to empty string to clear)"
        ),
      steps: z
        .array(
          z.object({
            id: z
              .number()
              .optional()
              .describe("Step ID (omit to create a new step)"),
            step_order: z.number().describe("Order of the step (1-based)"),
            subject: z.string().describe("Email subject line"),
            body_html: z.string().describe("Email body HTML"),
            delay_hours: z.number().describe("Hours to delay"),
            delete: z
              .boolean()
              .optional()
              .describe("Set to true to delete this step (requires id)"),
          })
        )
        .optional()
        .describe("Steps to add, update, or delete"),
    },
    async (params) => {
      const startTime = Date.now();
      if (apiKey.permissions !== "full_access") return permissionError();
      const signer = await getSigner(apiKey);
      if (!signer) return noSignerError();

      try {
        const pubkey = signer.getPubKey();

        const flow = await getEmailFlow(params.flow_id);
        if (!flow) {
          return errorResponse(
            "Flow not found",
            `No flow found with ID ${params.flow_id}`,
            startTime
          );
        }
        if (flow.seller_pubkey !== pubkey) {
          return errorResponse(
            "Not authorized",
            "You do not own this flow",
            startTime
          );
        }

        const updateData: any = {};
        if (params.name !== undefined) updateData.name = params.name;
        if (params.from_name !== undefined)
          updateData.from_name = params.from_name || null;
        if (params.reply_to !== undefined)
          updateData.reply_to = params.reply_to || null;
        if (Object.keys(updateData).length > 0) {
          await updateEmailFlow(params.flow_id, updateData);
        }

        let stepsUpdated = 0;
        let stepsCreated = 0;
        let stepsDeleted = 0;

        if (params.steps) {
          const existingSteps = await getFlowSteps(params.flow_id);
          const existingStepIds = new Set(existingSteps.map((s) => s.id));

          for (const step of params.steps) {
            if (step.id && !existingStepIds.has(step.id)) {
              continue;
            }
            if (step.delete && step.id) {
              await deleteFlowStep(step.id);
              stepsDeleted++;
            } else if (step.id) {
              await updateFlowStep(step.id, {
                step_order: step.step_order,
                subject: step.subject,
                body_html: step.body_html,
                delay_hours: step.delay_hours,
              });
              stepsUpdated++;
            } else {
              await createFlowStep({
                flow_id: params.flow_id,
                step_order: step.step_order,
                subject: step.subject,
                body_html: step.body_html,
                delay_hours: step.delay_hours,
              });
              stepsCreated++;
            }
          }
        }

        const updatedFlow = await getEmailFlow(params.flow_id);
        const updatedSteps = await getFlowSteps(params.flow_id);

        return successResponse(
          {
            flow: updatedFlow,
            steps: updatedSteps,
            stepsCreated,
            stepsUpdated,
            stepsDeleted,
          },
          startTime
        );
      } catch (error) {
        return errorResponse(
          "Failed to update email flow",
          error instanceof Error ? error.message : "Unknown error",
          startTime
        );
      }
    }
  );

  registerTool(server,
    "delete_email_flow",
    "Delete an email flow and all its steps, enrollments, and executions.",
    {
      flow_id: z.number().describe("The ID of the flow to delete"),
    },
    async (params) => {
      const startTime = Date.now();
      if (apiKey.permissions !== "full_access") return permissionError();
      const signer = await getSigner(apiKey);
      if (!signer) return noSignerError();

      try {
        const pubkey = signer.getPubKey();

        const flow = await getEmailFlow(params.flow_id);
        if (!flow) {
          return errorResponse(
            "Flow not found",
            `No flow found with ID ${params.flow_id}`,
            startTime
          );
        }
        if (flow.seller_pubkey !== pubkey) {
          return errorResponse(
            "Not authorized",
            "You do not own this flow",
            startTime
          );
        }

        await deleteEmailFlow(params.flow_id);

        return successResponse(
          {
            deletedFlowId: params.flow_id,
            deletedFlowName: flow.name,
            deletedFlowType: flow.flow_type,
          },
          startTime
        );
      } catch (error) {
        return errorResponse(
          "Failed to delete email flow",
          error instanceof Error ? error.message : "Unknown error",
          startTime
        );
      }
    }
  );

  registerTool(server,
    "toggle_email_flow",
    "Activate or pause an email flow. Active flows will process enrollments and send emails. Paused flows stop sending.",
    {
      flow_id: z.number().describe("The ID of the flow to toggle"),
    },
    async (params) => {
      const startTime = Date.now();
      if (apiKey.permissions !== "full_access") return permissionError();
      const signer = await getSigner(apiKey);
      if (!signer) return noSignerError();

      try {
        const pubkey = signer.getPubKey();

        const flow = await getEmailFlow(params.flow_id);
        if (!flow) {
          return errorResponse(
            "Flow not found",
            `No flow found with ID ${params.flow_id}`,
            startTime
          );
        }
        if (flow.seller_pubkey !== pubkey) {
          return errorResponse(
            "Not authorized",
            "You do not own this flow",
            startTime
          );
        }

        const newStatus = flow.status === "active" ? "paused" : "active";
        const updated = await updateEmailFlow(params.flow_id, {
          status: newStatus,
        });

        return successResponse(
          {
            flow: updated,
            previousStatus: flow.status,
            newStatus,
          },
          startTime
        );
      } catch (error) {
        return errorResponse(
          "Failed to toggle email flow",
          error instanceof Error ? error.message : "Unknown error",
          startTime
        );
      }
    }
  );

  registerTool(server,
    "get_email_flow_stats",
    "Get enrollment and send statistics for an email flow, including total enrollments, active/completed/cancelled counts, and per-step send/fail/pending counts.",
    {
      flow_id: z.number().describe("The ID of the flow to get stats for"),
    },
    async (params) => {
      const startTime = Date.now();
      const signer = await getSigner(apiKey);
      if (!signer) return noSignerError();

      try {
        const pubkey = signer.getPubKey();

        const flow = await getEmailFlow(params.flow_id);
        if (!flow) {
          return errorResponse(
            "Flow not found",
            `No flow found with ID ${params.flow_id}`,
            startTime
          );
        }
        if (flow.seller_pubkey !== pubkey) {
          return errorResponse(
            "Not authorized",
            "You do not own this flow",
            startTime
          );
        }

        const enrollments = await getFlowEnrollments(params.flow_id);
        const steps = await getFlowSteps(params.flow_id);

        const enrollmentStats = {
          total: enrollments.length,
          active: enrollments.filter((e) => e.status === "active").length,
          completed: enrollments.filter((e) => e.status === "completed").length,
          cancelled: enrollments.filter((e) => e.status === "cancelled").length,
        };

        const dbPool = getDbPool();
        let client;
        let stepStats: any[] = [];

        try {
          client = await dbPool.connect();
          for (const step of steps) {
            const result = await client.query(
              `SELECT 
                COUNT(*) FILTER (WHERE status = 'sent') as sent,
                COUNT(*) FILTER (WHERE status = 'failed') as failed,
                COUNT(*) FILTER (WHERE status = 'pending') as pending,
                COUNT(*) FILTER (WHERE status = 'skipped') as skipped,
                COUNT(*) as total
              FROM email_flow_executions WHERE step_id = $1`,
              [step.id]
            );
            const row = result.rows[0] || {};
            stepStats.push({
              step_id: step.id,
              step_order: step.step_order,
              subject: step.subject,
              delay_hours: step.delay_hours,
              sent: parseInt(row.sent || "0"),
              failed: parseInt(row.failed || "0"),
              pending: parseInt(row.pending || "0"),
              skipped: parseInt(row.skipped || "0"),
              total: parseInt(row.total || "0"),
            });
          }
        } finally {
          if (client) client.release();
        }

        return successResponse(
          {
            flow: {
              id: flow.id,
              name: flow.name,
              flow_type: flow.flow_type,
              status: flow.status,
            },
            enrollments: enrollmentStats,
            steps: stepStats,
          },
          startTime
        );
      } catch (error) {
        return errorResponse(
          "Failed to get email flow stats",
          error instanceof Error ? error.message : "Unknown error",
          startTime
        );
      }
    }
  );
}
