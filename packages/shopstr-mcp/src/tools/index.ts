import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { wrapWithAudit } from "../audit-log.js";
import type { CoreToolContext } from "./context.js";
import {
  getProductDetailsInputSchema,
  handleGetProductDetails,
} from "./get-product-details.js";
import { getReviewsInputSchema, handleGetReviews } from "./get-reviews.js";
import {
  handleSearchProducts,
  searchProductsInputSchema,
} from "./search-products.js";

export function registerCoreTools(
  server: McpServer,
  context: CoreToolContext
): void {
  server.registerTool(
    "search_products",
    {
      description:
        "Search public Shopstr product listings by keyword, category, location, currency, or price range.",
      inputSchema: searchProductsInputSchema,
    },
    wrapWithAudit("search_products", (args, _extra) =>
      handleSearchProducts(args, context)
    )
  );

  server.registerTool(
    "get_product_details",
    {
      description: "Get full details for a public Shopstr product listing.",
      inputSchema: getProductDetailsInputSchema,
    },
    wrapWithAudit("get_product_details", (args, _extra) =>
      handleGetProductDetails(args, context)
    )
  );

  server.registerTool(
    "get_reviews",
    {
      description: "Get public reviews for a Shopstr product or seller.",
      inputSchema: getReviewsInputSchema,
    },
    wrapWithAudit("get_reviews", (args, _extra) =>
      handleGetReviews(args, context)
    )
  );
}
