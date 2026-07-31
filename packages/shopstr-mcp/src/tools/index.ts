/**
  Each tool uses a two-layer validation pattern:
    1. MCP inputSchema  is a plain Zod object
       that the MCP SDK converts to JSON Schema for LLM tool listings. These are
       intentionally kept loose.
    2. Zod validation schema is the actual
       schema used in handlers via safeParse(). These add transforms (e.g.
       canonicalizePubkey), refines (e.g. isHex64), and defaults.

  The MCP schema tells the LLM what shape of args to send; the Zod schema
  validates and normalizes the actual input at runtime.
**/
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { wrapWithAudit } from "../audit-log.js";
import type { CoreToolContext } from "./utils/context.js";
import {
  getProductDetailsInputSchema,
  handleGetProductDetails,
} from "./get-product-details.js";
import { getReviewsInputSchema, handleGetReviews } from "./get-reviews.js";
import {
  getCompanyDetailsInputSchema,
  handleGetCompanyDetails,
} from "./get-company-details.js";
import {
  getSellerReputationInputSchema,
  handleGetSellerReputation,
} from "./get-seller-reputation.js";
import {
  getStorefrontInputSchema,
  handleGetStorefront,
} from "./get-storefront.js";
import {
  handleListCompanies,
  listCompaniesInputSchema,
} from "./list-companies.js";

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
    "list_companies",
    {
      description: "List public Shopstr seller/shop profiles.",
      inputSchema: listCompaniesInputSchema,
    },
    wrapWithAudit("list_companies", (args, _extra) =>
      handleListCompanies(args, context)
    )
  );

  server.registerTool(
    "get_company_details",
    {
      description:
        "Get a public Shopstr seller profile, shop metadata, products, and reviews. Accepts hex pubkey or npub1... address.",
      inputSchema: getCompanyDetailsInputSchema,
    },
    wrapWithAudit("get_company_details", (args, _extra) =>
      handleGetCompanyDetails(args, context)
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

  server.registerTool(
    "get_storefront",
    {
      description:
        "Get public storefront configuration and products for a seller pubkey. Slug lookup is not supported in standalone MCP.",
      inputSchema: getStorefrontInputSchema,
    },
    wrapWithAudit("get_storefront", (args, _extra) =>
      handleGetStorefront(args, context)
    )
  );

  server.registerTool(
    "get_seller_reputation",
    {
      description:
        "Summarize public Shopstr reviews into a seller reputation snapshot.",
      inputSchema: getSellerReputationInputSchema,
    },
    wrapWithAudit("get_seller_reputation", (args, _extra) =>
      handleGetSellerReputation(args, context)
    )
  );
}
