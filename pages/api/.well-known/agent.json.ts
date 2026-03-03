import type { NextApiRequest, NextApiResponse } from "next";

export default function handler(_req: NextApiRequest, res: NextApiResponse) {
  const baseUrl =
    process.env.NEXT_PUBLIC_BASE_URL || `https://${_req.headers.host}`;

  res.setHeader("Content-Type", "application/json");
  res.setHeader("Cache-Control", "public, max-age=3600");

  return res.status(200).json({
    schema_version: "1.0",
    name: "Shopstr",
    description:
      "A permissionless marketplace built on the Nostr protocol for Bitcoin-enabled commerce. Browse and purchase products using Lightning Network and Cashu ecash tokens.",
    url: baseUrl,
    logo: `${baseUrl}/shopstr-2000x2000.png`,
    authentication: {
      type: "bearer",
      instructions:
        "Obtain an API key via POST /api/mcp/onboard or from the /settings/api-keys page. Use it as a Bearer token in the Authorization header.",
    },
    endpoints: {
      mcp: `${baseUrl}/api/mcp`,
      onboard: `${baseUrl}/api/mcp/onboard`,
      status: `${baseUrl}/api/mcp/status`,
      api_keys: `${baseUrl}/api/mcp/api-keys`,
    },
    capabilities: {
      mcp: {
        version: "2025-03-26",
        tools: [
          "search_products",
          "get_product_details",
          "list_companies",
          "get_company_details",
          "get_reviews",
          "check_discount_code",
          "get_payment_methods",
          "create_order",
          "verify_payment",
          "get_order_status",
          "list_orders",
        ],
        resources: ["product-catalog"],
      },
    },
    payment_methods: ["lightning", "cashu"],
    protocols: ["nostr", "lightning", "cashu"],
  });
}
