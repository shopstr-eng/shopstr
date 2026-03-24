import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { fetchAllProductsFromDb } from "@/utils/db/db-service";
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
  const shippingTag = tags.find((t) => t[0] === "shipping");

  const price = priceTag ? Number(priceTag[1]) : 0;
  const currency = priceTag ? priceTag[2] || "" : "";
  const shippingType = shippingTag ? shippingTag[1] || "" : "";
  const shippingCost =
    shippingTag && shippingTag[2] ? Number(shippingTag[2]) : 0;

  const effectiveShippingCost =
    shippingType === "Free" ||
    shippingType === "Free/Pickup" ||
    shippingType === "Pickup" ||
    shippingType === "N/A"
      ? 0
      : shippingCost;

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
      totalEstimate: price + effectiveShippingCost,
      paymentMethods: ["lightning", "cashu"],
    },
  };
}

export function registerResources(server: McpServer) {
  server.resource(
    "product-catalog",
    "milkmarket://catalog/products",
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
            uri: "milkmarket://catalog/products",
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
