import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { fetchAllProductsFromDb } from "@/utils/db/db-service";
import {
  getEffectiveShippingCost,
  parseShippingFromTags,
} from "@/utils/parsers/product-tag-helpers";
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

function buildCatalogEntry(event: NostrEvent) {
  const tags = event.tags || [];
  const priceTag = tags.find((t) => t[0] === "price");
  const parsedShipping = parseShippingFromTags(tags);

  const price = priceTag ? Number(priceTag[1]) : 0;
  const currency = priceTag ? priceTag[2] || "" : "";
  const shippingType = parsedShipping?.shippingType;
  const shippingCost = parsedShipping?.shippingCost;
  const effectiveShippingCost = getEffectiveShippingCost(
    shippingType,
    shippingCost
  );
  const shippingCostForTotal = effectiveShippingCost ?? 0;

  return {
    id: event.id,
    pubkey: event.pubkey,
    title: getTagValue(tags, "title") || "",
    summary: getTagValue(tags, "summary") || "",
    categories: getAllTagValues(tags, "t"),
    location: getTagValue(tags, "location") || "",
    price,
    currency,
    pricing: {
      amount: price,
      currency: currency || "sats",
      unit: "per item",
      shippingCost: effectiveShippingCost,
      shippingType: shippingType || "N/A",
      totalEstimate: price + shippingCostForTotal,
      paymentMethods: ["lightning", "cashu"],
    },
  };
}

export function registerResources(server: McpServer) {
  server.resource(
    "product-catalog",
    "shopstr://catalog/products",
    {
      description: "Full product catalog with all available listings",
      mimeType: "application/json",
    },
    async () => {
      const events = await fetchAllProductsFromDb();
      const catalog = events.map(buildCatalogEntry);

      return {
        contents: [
          {
            uri: "shopstr://catalog/products",
            mimeType: "application/json",
            text: JSON.stringify(
              { count: catalog.length, products: catalog },
              null,
              2
            ),
          },
        ],
      };
    }
  );
}
