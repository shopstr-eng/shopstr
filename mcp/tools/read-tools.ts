import { z } from "zod/v4";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getDbPool } from "@/utils/db/db-service";
import {
  getEffectiveShippingCost,
  parseShippingFromTags,
} from "@/utils/parsers/product-tag-helpers";
import { NostrEvent } from "@/utils/types/types";
import { registerTool } from "./register-tool";

const DB_TIMEOUT_MS = 15_000;

function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  label: string
): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  return Promise.race<T>([
    promise,
    new Promise<never>(
      (_, reject) =>
        (timeout = setTimeout(
          () => reject(new Error(`${label} timed out after ${ms}ms`)),
          ms
        ))
    ),
  ]).finally(() => {
    if (timeout) clearTimeout(timeout);
  });
}

function dbError(error: unknown, startTime: number) {
  const message = error instanceof Error ? error.message : "DB fetch failed";
  const isTimeout = message.includes("timed out after");

  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify({
          error: isTimeout ? "DB fetch timed out" : "DB fetch failed",
          code: isTimeout ? "TIMEOUT" : "DB_ERROR",
          _meta: {
            responseTimeMs: Date.now() - startTime,
            dataSource: "cached_db",
          },
        }),
      },
    ],
    isError: true,
  };
}

type DbEventRow = {
  id: string;
  pubkey: string;
  created_at: number;
  kind: number;
  tags: string[][] | string;
  content: string;
  sig: string;
};

function normalizeTags(tags: DbEventRow["tags"]): string[][] {
  if (Array.isArray(tags)) return tags;

  try {
    const parsed = JSON.parse(tags);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function rowToNostrEvent(row: DbEventRow): NostrEvent {
  return {
    id: row.id,
    pubkey: row.pubkey,
    created_at: row.created_at,
    kind: row.kind,
    tags: normalizeTags(row.tags),
    content: row.content,
    sig: row.sig,
  };
}

async function fetchAllProductsFromDbStrict(
  limit = 500,
  offset = 0
): Promise<NostrEvent[]> {
  const dbPool = getDbPool();
  let client;

  try {
    client = await dbPool.connect();
    const result = await client.query<DbEventRow>(
      `SELECT pe.id, pe.pubkey, pe.created_at, pe.kind,
              pe.tags, pe.content, pe.sig
       FROM (
         SELECT DISTINCT ON (p.pubkey, d.d_tag)
           p.id, p.pubkey, p.created_at, p.kind, p.tags, p.content, p.sig
         FROM product_events p,
         LATERAL (
           SELECT COALESCE(
             (SELECT elem->>'1'
              FROM jsonb_array_elements(p.tags) elem
              WHERE elem->>'0' = 'd'
              LIMIT 1),
             p.id
           ) AS d_tag
         ) d
         WHERE p.kind = 30402
         ORDER BY p.pubkey, d.d_tag, p.created_at DESC
       ) pe
       ORDER BY pe.created_at DESC
       LIMIT $1 OFFSET $2`,
      [limit, offset]
    );

    return result.rows.map(rowToNostrEvent);
  } finally {
    if (client) client.release();
  }
}

async function fetchAllProfilesFromDbStrict(): Promise<NostrEvent[]> {
  const dbPool = getDbPool();
  let client;

  try {
    client = await dbPool.connect();
    const result = await client.query<DbEventRow>(
      `SELECT id, pubkey, created_at, kind, tags, content, sig
       FROM profile_events
       ORDER BY created_at DESC`
    );

    return result.rows.map(rowToNostrEvent);
  } finally {
    if (client) client.release();
  }
}

async function fetchReviewsFromDbStrict(): Promise<NostrEvent[]> {
  const dbPool = getDbPool();
  let client;

  try {
    client = await dbPool.connect();
    const result = await client.query<DbEventRow>(
      `SELECT id, pubkey, created_at, kind, tags, content, sig
       FROM review_events
       WHERE kind = 31555
       ORDER BY created_at DESC`
    );

    return result.rows.map(rowToNostrEvent);
  } finally {
    if (client) client.release();
  }
}

async function validateDiscountCodeStrict(
  code: string,
  pubkey: string
): Promise<{ valid: boolean; discount_percentage?: number }> {
  const dbPool = getDbPool();
  let client;

  try {
    client = await dbPool.connect();
    const result = await client.query<{
      discount_percentage: number;
      expiration: number | null;
    }>(
      `SELECT discount_percentage, expiration
       FROM discount_codes
       WHERE code = $1 AND pubkey = $2`,
      [code, pubkey]
    );

    if (result.rows.length === 0) return { valid: false };

    const { discount_percentage, expiration } = result.rows[0]!;
    if (expiration && Date.now() / 1000 > expiration) {
      return { valid: false };
    }

    return { valid: true, discount_percentage };
  } finally {
    if (client) client.release();
  }
}

function getTagValue(tags: string[][], key: string): string | undefined {
  const tag = tags.find((t) => t[0] === key);
  return tag ? tag[1] : undefined;
}

function getAllTagValues(tags: string[][], key: string): string[] {
  return tags
    .filter((t) => t[0] === key)
    .map((t) => t[1]!)
    .filter(Boolean);
}

function determinePaymentMethods(
  _sellerPubkey?: string,
  hasStripeConnect?: boolean
): string[] {
  const methods = ["lightning", "cashu"];
  if (hasStripeConnect) {
    methods.push("stripe");
  }
  return methods;
}

function buildPricingBlock(
  price: number,
  currency: string,
  shippingType?: string,
  shippingCost?: number,
  quantity: number = 1,
  paymentMethods?: string[]
) {
  const effectiveShippingCost = getEffectiveShippingCost(
    shippingType,
    shippingCost
  );
  const shippingCostForTotal = effectiveShippingCost ?? 0;
  return {
    amount: price,
    currency: currency || "sats",
    unit: "per item",
    shippingCost: effectiveShippingCost,
    shippingType: shippingType || "N/A",
    totalEstimate: price * quantity + shippingCostForTotal,
    paymentMethods: paymentMethods || ["lightning", "cashu"],
  };
}

function parseProductEvent(event: NostrEvent) {
  const tags = event.tags || [];
  const priceTag = tags.find((t) => t[0] === "price");
  const parsedShipping = parseShippingFromTags(tags);

  const price = priceTag ? Number(priceTag[1]) : 0;
  const currency = priceTag ? priceTag[2] || "" : "";
  const shippingType = parsedShipping?.shippingType;
  const shippingCost = parsedShipping?.shippingCost;

  const sizes = tags
    .filter((t) => t[0] === "size" && t[1])
    .map((t) => ({ size: t[1]!, quantity: t[2] ? Number(t[2]) : undefined }));

  const volumes = tags
    .filter((t) => t[0] === "volume" && t[1])
    .map((t) => ({ volume: t[1]!, price: t[2] ? Number(t[2]) : undefined }));

  const weights = tags
    .filter((t) => t[0] === "weight" && t[1])
    .map((t) => ({ weight: t[1]!, price: t[2] ? Number(t[2]) : undefined }));

  const bulk = tags
    .filter((t) => t[0] === "bulk" && t[1] && t[2])
    .map((t) => ({ units: Number(t[1]), price: Number(t[2]) }));

  const pickupLocations = getAllTagValues(tags, "pickup_location");

  return {
    id: event.id,
    pubkey: event.pubkey,
    d: getTagValue(tags, "d"),
    title: getTagValue(tags, "title") || "",
    summary: getTagValue(tags, "summary") || "",
    images: getAllTagValues(tags, "image"),
    categories: getAllTagValues(tags, "t"),
    location: getTagValue(tags, "location") || "",
    price,
    currency,
    shippingType,
    shippingCost,
    quantity: getTagValue(tags, "quantity")
      ? Number(getTagValue(tags, "quantity"))
      : undefined,
    condition: getTagValue(tags, "condition"),
    status: getTagValue(tags, "status"),
    sizes: sizes.length > 0 ? sizes : undefined,
    volumes: volumes.length > 0 ? volumes : undefined,
    weights: weights.length > 0 ? weights : undefined,
    bulk: bulk.length > 0 ? bulk : undefined,
    pickupLocations: pickupLocations.length > 0 ? pickupLocations : undefined,
    requiredCustomerInfo: getTagValue(tags, "required_customer_info"),
    createdAt: event.created_at,
    pricing: buildPricingBlock(price, currency, shippingType, shippingCost),
    subscription: {
      enabled: getTagValue(tags, "subscription") === "true",
      discount: getTagValue(tags, "subscription_discount")
        ? Number(getTagValue(tags, "subscription_discount"))
        : undefined,
      frequencies: (() => {
        const freqTag = tags.find((t) => t[0] === "subscription_frequency");
        return freqTag ? freqTag.slice(1) : [];
      })(),
    },
  };
}

function parseProfileEvent(event: NostrEvent) {
  let content: Record<string, any> = {};
  try {
    content = JSON.parse(event.content);
  } catch {
    content = {};
  }

  const base: Record<string, any> = {
    pubkey: event.pubkey,
    kind: event.kind,
    name: content.name || "",
    about: content.about || "",
    picture: content.picture || "",
    banner: content.banner || "",
    lud16: content.lud16 || "",
    nip05: content.nip05 || "",
    createdAt: event.created_at,
  };

  if (event.kind === 0) {
    if (content.website) base.website = content.website;
    if (content.fiat_options) base.fiat_options = content.fiat_options;
    if (content.payment_preference)
      base.payment_preference = content.payment_preference;
  }

  if (event.kind === 30019) {
    if (content.paymentMethodDiscounts)
      base.paymentMethodDiscounts = content.paymentMethodDiscounts;
    if (content.freeShippingThreshold !== undefined)
      base.freeShippingThreshold = content.freeShippingThreshold;
    if (content.freeShippingCurrency)
      base.freeShippingCurrency = content.freeShippingCurrency;
    if (content.storefront) {
      base.storefront = content.storefront;
      if (content.storefront.shopSlug)
        base.storefrontUrl = `/shop/${content.storefront.shopSlug}`;
    }
  }

  return base;
}

function parseReviewEvent(event: NostrEvent) {
  const tags = event.tags || [];
  const ratingTags = tags.filter((t) => t[0] === "rating");
  const ratings: Record<string, number> = {};
  for (const rt of ratingTags) {
    if (rt[2]) {
      ratings[rt[2]] = parseFloat(rt[1]!);
    }
  }

  return {
    id: event.id,
    pubkey: event.pubkey,
    d: getTagValue(tags, "d"),
    content: event.content,
    ratings,
    createdAt: event.created_at,
  };
}

export function registerReadTools(server: McpServer) {
  registerTool(
    server,
    "search_products",
    "Search and filter products by category, location, price range, or keyword",
    {
      keyword: z
        .string()
        .optional()
        .describe("Search keyword to match against title or summary"),
      category: z
        .string()
        .optional()
        .describe("Filter by product category tag"),
      location: z.string().optional().describe("Filter by product location"),
      minPrice: z.number().optional().describe("Minimum price filter"),
      maxPrice: z.number().optional().describe("Maximum price filter"),
      currency: z
        .string()
        .optional()
        .describe("Filter by currency (e.g. 'USD', 'BTC')"),
      limit: z
        .number()
        .optional()
        .describe("Maximum number of results to return"),
    },
    async ({
      keyword,
      category,
      location,
      minPrice,
      maxPrice,
      currency,
      limit,
    }) => {
      const startTime = Date.now();
      try {
        const events = await withTimeout(
          fetchAllProductsFromDbStrict(),
          DB_TIMEOUT_MS,
          "fetchAllProductsFromDb"
        );
        let products = events.map(parseProductEvent);

        if (keyword) {
          const kw = keyword.toLowerCase();
          products = products.filter(
            (p) =>
              p.title.toLowerCase().includes(kw) ||
              p.summary.toLowerCase().includes(kw)
          );
        }

        if (category) {
          const cat = category.toLowerCase();
          products = products.filter((p) =>
            p.categories.some((c) => c.toLowerCase() === cat)
          );
        }

        if (location) {
          const loc = location.toLowerCase();
          products = products.filter((p) =>
            p.location.toLowerCase().includes(loc)
          );
        }

        if (currency) {
          const cur = currency.toLowerCase();
          products = products.filter((p) => p.currency.toLowerCase() === cur);
        }

        if (minPrice !== undefined) {
          products = products.filter((p) => p.price >= minPrice);
        }

        if (maxPrice !== undefined) {
          products = products.filter((p) => p.price <= maxPrice);
        }

        if (limit) {
          products = products.slice(0, limit);
        }

        const latestTimestamp = products.reduce(
          (max, p) =>
            p.createdAt && Number(p.createdAt) > max
              ? Number(p.createdAt)
              : max,
          0
        );

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  count: products.length,
                  products,
                  _meta: {
                    responseTimeMs: Date.now() - startTime,
                    dataSource: "cached_db",
                    dataFreshness: latestTimestamp
                      ? new Date(latestTimestamp * 1000).toISOString()
                      : null,
                    resultCount: products.length,
                  },
                },
                null,
                2
              ),
            },
          ],
        };
      } catch (error) {
        return dbError(error, startTime);
      }
    }
  );

  registerTool(
    server,
    "get_product_details",
    "Get full details for a specific product by its event ID",
    {
      productId: z.string().describe("The product event ID"),
    },
    async ({ productId }) => {
      const startTime = Date.now();
      try {
        const events = await withTimeout(
          fetchAllProductsFromDbStrict(),
          DB_TIMEOUT_MS,
          "fetchAllProductsFromDb"
        );
        const event = events.find((e) => e.id === productId);

        if (!event) {
          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify({
                  error: "Product not found",
                  _meta: {
                    responseTimeMs: Date.now() - startTime,
                    dataSource: "cached_db",
                  },
                }),
              },
            ],
            isError: true,
          };
        }

        const product = parseProductEvent(event);

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  ...product,
                  _meta: {
                    responseTimeMs: Date.now() - startTime,
                    dataSource: "cached_db",
                    dataFreshness: product.createdAt
                      ? new Date(Number(product.createdAt) * 1000).toISOString()
                      : null,
                    resultCount: 1,
                  },
                },
                null,
                2
              ),
            },
          ],
        };
      } catch (error) {
        return dbError(error, startTime);
      }
    }
  );

  registerTool(
    server,
    "list_companies",
    "List all seller/shop profiles",
    {
      limit: z
        .number()
        .optional()
        .describe("Maximum number of results to return"),
    },
    async ({ limit }) => {
      const startTime = Date.now();
      try {
        const events = await withTimeout(
          fetchAllProfilesFromDbStrict(),
          DB_TIMEOUT_MS,
          "fetchAllProfilesFromDb"
        );
        const shopProfiles = events
          .filter((e) => e.kind === 30019)
          .map(parseProfileEvent);

        const results = limit ? shopProfiles.slice(0, limit) : shopProfiles;

        const latestTimestamp = results.reduce(
          (max, p) =>
            p.createdAt && Number(p.createdAt) > max
              ? Number(p.createdAt)
              : max,
          0
        );

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  count: results.length,
                  companies: results,
                  _meta: {
                    responseTimeMs: Date.now() - startTime,
                    dataSource: "cached_db",
                    dataFreshness: latestTimestamp
                      ? new Date(latestTimestamp * 1000).toISOString()
                      : null,
                    resultCount: results.length,
                  },
                },
                null,
                2
              ),
            },
          ],
        };
      } catch (error) {
        return dbError(error, startTime);
      }
    }
  );

  registerTool(
    server,
    "get_company_details",
    "Get a specific company's shop profile, their products, and reviews",
    {
      pubkey: z.string().describe("The seller's public key (hex)"),
    },
    async ({ pubkey }) => {
      const startTime = Date.now();
      let profileEvents: NostrEvent[];
      let productEvents: NostrEvent[];
      let reviewEvents: NostrEvent[];
      try {
        [profileEvents, productEvents, reviewEvents] = await withTimeout(
          Promise.all([
            fetchAllProfilesFromDbStrict(),
            fetchAllProductsFromDbStrict(),
            fetchReviewsFromDbStrict(),
          ]),
          DB_TIMEOUT_MS,
          "get_company_details DB fetch"
        );
      } catch (error) {
        return dbError(error, startTime);
      }

      const shopProfile = profileEvents
        .filter((e) => e.kind === 30019 && e.pubkey === pubkey)
        .map(parseProfileEvent)[0];

      const userProfile = profileEvents
        .filter((e) => e.kind === 0 && e.pubkey === pubkey)
        .map(parseProfileEvent)[0];

      const products = productEvents
        .filter((e) => e.pubkey === pubkey)
        .map(parseProductEvent);

      const reviews = reviewEvents
        .filter((e) => {
          const dTag = getTagValue(e.tags, "d");
          return dTag && dTag.includes(pubkey);
        })
        .map(parseReviewEvent);

      if (!shopProfile && !userProfile) {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                error: "Company not found",
                _meta: {
                  responseTimeMs: Date.now() - startTime,
                  dataSource: "cached_db",
                },
              }),
            },
          ],
          isError: true,
        };
      }

      const acceptedPaymentMethods = determinePaymentMethods(pubkey, false);

      const productsWithPricing = products.map((p) => ({
        ...p,
        pricing: buildPricingBlock(
          p.price,
          p.currency,
          p.shippingType,
          p.shippingCost,
          1,
          acceptedPaymentMethods
        ),
      }));

      const allPrices = products.map((p) => p.price).filter((p) => p > 0);
      const freeShippingProducts = products.filter(
        (p) => p.shippingType === "Free" || p.shippingType === "Free/Pickup"
      );

      const allTimestamps = [
        ...products.map((p) => Number(p.createdAt) || 0),
        ...reviews.map((r) => Number(r.createdAt) || 0),
      ];
      const latestTimestamp = Math.max(...allTimestamps, 0);

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                shopProfile: shopProfile || null,
                userProfile: userProfile || null,
                products: {
                  count: productsWithPricing.length,
                  items: productsWithPricing,
                },
                reviews: { count: reviews.length, items: reviews },
                paymentInfo: {
                  acceptedPaymentMethods,
                  hasStripeConnect: false,
                  freeShippingAvailable: freeShippingProducts.length > 0,
                  freeShippingProductCount: freeShippingProducts.length,
                  priceRange:
                    allPrices.length > 0
                      ? {
                          min: Math.min(...allPrices),
                          max: Math.max(...allPrices),
                          currency: products[0]?.currency || "sats",
                        }
                      : null,
                },
                _meta: {
                  responseTimeMs: Date.now() - startTime,
                  dataSource: "cached_db",
                  dataFreshness: latestTimestamp
                    ? new Date(latestTimestamp * 1000).toISOString()
                    : null,
                  resultCount: products.length + reviews.length,
                },
              },
              null,
              2
            ),
          },
        ],
      };
    }
  );

  registerTool(
    server,
    "get_reviews",
    "Get reviews for a product or seller",
    {
      productId: z
        .string()
        .optional()
        .describe("Product event ID to get reviews for"),
      sellerPubkey: z
        .string()
        .optional()
        .describe("Seller public key to get all reviews for"),
    },
    async ({ productId, sellerPubkey }) => {
      const startTime = Date.now();
      if (!productId && !sellerPubkey) {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                error: "Either productId or sellerPubkey is required",
                _meta: {
                  responseTimeMs: Date.now() - startTime,
                  dataSource: "cached_db",
                },
              }),
            },
          ],
          isError: true,
        };
      }

      try {
        const reviewEvents = await withTimeout(
          fetchReviewsFromDbStrict(),
          DB_TIMEOUT_MS,
          "fetchCachedEvents"
        );
        let reviews = reviewEvents.map(parseReviewEvent);

        if (productId) {
          reviews = reviews.filter((r) => r.d && r.d.includes(productId));
        }

        if (sellerPubkey) {
          reviews = reviews.filter((r) => r.d && r.d.includes(sellerPubkey));
        }

        const latestTimestamp = reviews.reduce(
          (max, r) =>
            r.createdAt && Number(r.createdAt) > max
              ? Number(r.createdAt)
              : max,
          0
        );

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  count: reviews.length,
                  reviews,
                  _meta: {
                    responseTimeMs: Date.now() - startTime,
                    dataSource: "cached_db",
                    dataFreshness: latestTimestamp
                      ? new Date(latestTimestamp * 1000).toISOString()
                      : null,
                    resultCount: reviews.length,
                  },
                },
                null,
                2
              ),
            },
          ],
        };
      } catch (error) {
        return dbError(error, startTime);
      }
    }
  );

  registerTool(
    server,
    "check_discount_code",
    "Validate a discount code for a specific seller",
    {
      code: z.string().describe("The discount code to validate"),
      sellerPubkey: z.string().describe("The seller's public key"),
    },
    async ({ code, sellerPubkey }) => {
      const startTime = Date.now();
      try {
        const result = await withTimeout(
          validateDiscountCodeStrict(code, sellerPubkey),
          DB_TIMEOUT_MS,
          "validateDiscountCode"
        );

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  ...result,
                  _meta: {
                    responseTimeMs: Date.now() - startTime,
                    dataSource: "cached_db",
                    resultCount: 1,
                  },
                },
                null,
                2
              ),
            },
          ],
        };
      } catch (error) {
        return dbError(error, startTime);
      }
    }
  );

  registerTool(
    server,
    "get_storefront",
    "Look up a seller's storefront by shop slug or pubkey. Returns storefront configuration, products, and shop profile for rendering a seller's standalone shop page.",
    {
      slug: z
        .string()
        .optional()
        .describe(
          "Shop URL slug (e.g. 'fresh-farm' for milk.market/shop/fresh-farm)"
        ),
      pubkey: z
        .string()
        .optional()
        .describe("Seller's public key (hex). Use if slug is not known."),
    },
    async ({ slug, pubkey }) => {
      const startTime = Date.now();

      if (!slug && !pubkey) {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                error: "Either slug or pubkey is required",
                _meta: {
                  responseTimeMs: Date.now() - startTime,
                  dataSource: "cached_db",
                },
              }),
            },
          ],
          isError: true,
        };
      }

      try {
        let resolvedPubkey = pubkey;

        if (slug && !pubkey) {
          const dbPool = getDbPool();
          const slugResult = (await withTimeout(
            dbPool.query("SELECT pubkey FROM shop_slugs WHERE slug = $1", [
              slug.toLowerCase(),
            ]),
            DB_TIMEOUT_MS,
            "shop_slugs query"
          )) as { rows: { pubkey: string }[] };
          if (slugResult.rows.length === 0) {
            return {
              content: [
                {
                  type: "text" as const,
                  text: JSON.stringify({
                    error: `Shop with slug '${slug}' not found`,
                    _meta: {
                      responseTimeMs: Date.now() - startTime,
                      dataSource: "cached_db",
                    },
                  }),
                },
              ],
              isError: true,
            };
          }
          resolvedPubkey = slugResult.rows[0]!.pubkey;
        }

        const [profileEvents, productEvents] = await withTimeout(
          Promise.all([
            fetchAllProfilesFromDbStrict(),
            fetchAllProductsFromDbStrict(),
          ]),
          DB_TIMEOUT_MS,
          "get_storefront profiles+products fetch"
        );

        const shopProfile = profileEvents
          .filter((e) => e.kind === 30019 && e.pubkey === resolvedPubkey)
          .map(parseProfileEvent)[0];

        const userProfile = profileEvents
          .filter((e) => e.kind === 0 && e.pubkey === resolvedPubkey)
          .map(parseProfileEvent)[0];

        if (!shopProfile && !userProfile) {
          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify({
                  error: "Seller not found",
                  _meta: {
                    responseTimeMs: Date.now() - startTime,
                    dataSource: "cached_db",
                  },
                }),
              },
            ],
            isError: true,
          };
        }

        const products = productEvents
          .filter((e) => e.pubkey === resolvedPubkey)
          .map(parseProductEvent);

        const productsWithPricing = products.map((p) => ({
          ...p,
          pricing: buildPricingBlock(
            p.price,
            p.currency,
            p.shippingType,
            p.shippingCost,
            1,
            ["lightning", "cashu"]
          ),
        }));

        const storefront = (shopProfile as any)?.storefront || {};

        let customDomain = null;
        const dbPool = getDbPool();
        const domainResult = (await withTimeout(
          dbPool.query(
            "SELECT domain, verified FROM custom_domains WHERE pubkey = $1",
            [resolvedPubkey!]
          ),
          DB_TIMEOUT_MS,
          "custom_domains query"
        )) as { rows: { domain: string; verified: boolean }[] };
        if (domainResult.rows.length > 0) {
          customDomain = {
            domain: domainResult.rows[0]!.domain,
            verified: domainResult.rows[0]!.verified,
          };
        }

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  pubkey: resolvedPubkey,
                  shopProfile: shopProfile || null,
                  userProfile: userProfile || null,
                  storefront: {
                    ...storefront,
                    storefrontUrl: storefront.shopSlug
                      ? `/shop/${storefront.shopSlug}`
                      : null,
                    customDomain,
                  },
                  products: {
                    count: productsWithPricing.length,
                    items: productsWithPricing,
                  },
                  paymentInfo: {
                    acceptedPaymentMethods: determinePaymentMethods(
                      resolvedPubkey || "",
                      false
                    ),
                    hasStripeConnect: false,
                  },
                  _meta: {
                    responseTimeMs: Date.now() - startTime,
                    dataSource: "cached_db",
                  },
                },
                null,
                2
              ),
            },
          ],
        };
      } catch (error) {
        return dbError(error, startTime);
      }
    }
  );
}
