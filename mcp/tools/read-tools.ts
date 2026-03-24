import { z } from "zod/v4";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  fetchAllProductsFromDb,
  fetchAllProfilesFromDb,
  fetchCachedEvents,
  validateDiscountCode,
} from "@/utils/db/db-service";
import { NostrEvent } from "@/utils/types/types";

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

function determinePaymentMethods(): string[] {
  return ["lightning", "cashu"];
}

function buildPricingBlock(
  price: number,
  currency: string,
  shippingType: string,
  shippingCost: number,
  quantity: number = 1,
  paymentMethods?: string[]
) {
  const effectiveShippingCost =
    shippingType === "Free" ||
    shippingType === "Free/Pickup" ||
    shippingType === "Pickup" ||
    shippingType === "N/A"
      ? 0
      : shippingCost;
  return {
    amount: price,
    currency: currency || "sats",
    unit: "per item",
    shippingCost: effectiveShippingCost,
    shippingType: shippingType || "N/A",
    totalEstimate: price * quantity + effectiveShippingCost,
    paymentMethods: paymentMethods || ["lightning", "cashu"],
  };
}

function parseProductEvent(event: NostrEvent) {
  const tags = event.tags || [];
  const priceTag = tags.find((t) => t[0] === "price");
  const shippingTag = tags.find((t) => t[0] === "shipping");

  const price = priceTag ? Number(priceTag[1]) : 0;
  const currency = priceTag ? priceTag[2] || "" : "";
  const shippingType = shippingTag ? shippingTag[1] || "" : "";
  const shippingCost =
    shippingTag && shippingTag[2] ? Number(shippingTag[2]) : 0;

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
    createdAt: event.created_at,
    pricing: buildPricingBlock(price, currency, shippingType, shippingCost),
  };
}

function parseProfileEvent(event: NostrEvent) {
  let content: Record<string, any> = {};
  try {
    content = JSON.parse(event.content);
  } catch {
    content = {};
  }

  return {
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
  server.tool(
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
      const events = await fetchAllProductsFromDb();
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
          p.createdAt && Number(p.createdAt) > max ? Number(p.createdAt) : max,
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
    }
  );

  server.tool(
    "get_product_details",
    "Get full details for a specific product by its event ID",
    {
      productId: z.string().describe("The product event ID"),
    },
    async ({ productId }) => {
      const startTime = Date.now();
      const events = await fetchAllProductsFromDb();
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
    }
  );

  server.tool(
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
      const events = await fetchAllProfilesFromDb();
      const shopProfiles = events
        .filter((e) => e.kind === 30019)
        .map(parseProfileEvent);

      const results = limit ? shopProfiles.slice(0, limit) : shopProfiles;

      const latestTimestamp = results.reduce(
        (max, p) =>
          p.createdAt && Number(p.createdAt) > max ? Number(p.createdAt) : max,
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
    }
  );

  server.tool(
    "get_company_details",
    "Get a specific company's shop profile, their products, and reviews",
    {
      pubkey: z.string().describe("The seller's public key (hex)"),
    },
    async ({ pubkey }) => {
      const startTime = Date.now();
      const [profileEvents, productEvents, reviewEvents] = await Promise.all([
        fetchAllProfilesFromDb(),
        fetchAllProductsFromDb(),
        fetchCachedEvents(31555),
      ]);

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

      const acceptedPaymentMethods = determinePaymentMethods();

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

  server.tool(
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

      const reviewEvents = await fetchCachedEvents(31555);
      let reviews = reviewEvents.map(parseReviewEvent);

      if (productId) {
        reviews = reviews.filter((r) => r.d && r.d.includes(productId));
      }

      if (sellerPubkey) {
        reviews = reviews.filter((r) => r.d && r.d.includes(sellerPubkey));
      }

      const latestTimestamp = reviews.reduce(
        (max, r) =>
          r.createdAt && Number(r.createdAt) > max ? Number(r.createdAt) : max,
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
    }
  );

  server.tool(
    "check_discount_code",
    "Validate a discount code for a specific seller",
    {
      code: z.string().describe("The discount code to validate"),
      sellerPubkey: z.string().describe("The seller's public key"),
    },
    async ({ code, sellerPubkey }) => {
      const startTime = Date.now();
      const result = await validateDiscountCode(code, sellerPubkey);

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
    }
  );
}
