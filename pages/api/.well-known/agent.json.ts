import type { NextApiRequest, NextApiResponse } from "next";

export default function handler(_req: NextApiRequest, res: NextApiResponse) {
  const baseUrl =
    process.env.NEXT_PUBLIC_BASE_URL || `https://${_req.headers.host}`;

  res.setHeader("Cache-Control", "public, max-age=3600");
  res.setHeader("Access-Control-Allow-Origin", "*");

  return res.status(200).json({
    schema: "https://open-agents.com/schema/v1",
    name: "Shopstr",
    version: "1.0.0",
    description:
      "A permissionless marketplace built on the Nostr protocol for Bitcoin-enabled commerce. Browse products, view seller profiles, read reviews, and place orders via MCP.",
    logo: `${baseUrl}/shopstr-2000x2000.png`,
    capabilities: {
      tools: [
        {
          name: "search_products",
          description:
            "Search and filter products by category, location, price range, or keyword",
          parameters: {
            keyword: {
              type: "string",
              optional: true,
              description: "Search keyword to match against title or summary",
            },
            category: {
              type: "string",
              optional: true,
              description: "Filter by product category tag",
            },
            location: {
              type: "string",
              optional: true,
              description: "Filter by product location",
            },
            minPrice: {
              type: "number",
              optional: true,
              description: "Minimum price filter",
            },
            maxPrice: {
              type: "number",
              optional: true,
              description: "Maximum price filter",
            },
            currency: {
              type: "string",
              optional: true,
              description: "Filter by currency (e.g. 'SATS', 'BTC')",
            },
            limit: {
              type: "number",
              optional: true,
              description: "Maximum number of results to return",
            },
          },
          permissions: "read",
        },
        {
          name: "get_product_details",
          description:
            "Get full details for a specific product by its event ID",
          parameters: {
            productId: {
              type: "string",
              required: true,
              description: "The product event ID",
            },
          },
          permissions: "read",
        },
        {
          name: "list_companies",
          description: "List all seller/shop profiles",
          parameters: {
            limit: {
              type: "number",
              optional: true,
              description: "Maximum number of results to return",
            },
          },
          permissions: "read",
        },
        {
          name: "get_company_details",
          description:
            "Get a specific company's shop profile, their products, and reviews",
          parameters: {
            pubkey: {
              type: "string",
              required: true,
              description: "The seller's public key (hex)",
            },
          },
          permissions: "read",
        },
        {
          name: "get_reviews",
          description: "Get reviews for a product or seller",
          parameters: {
            productId: {
              type: "string",
              optional: true,
              description: "Product event ID to get reviews for",
            },
            sellerPubkey: {
              type: "string",
              optional: true,
              description: "Seller public key to get all reviews for",
            },
          },
          permissions: "read",
        },
        {
          name: "check_discount_code",
          description: "Validate a discount code for a specific seller",
          parameters: {
            code: {
              type: "string",
              required: true,
              description: "The discount code to validate",
            },
            sellerPubkey: {
              type: "string",
              required: true,
              description: "The seller's public key",
            },
          },
          permissions: "read",
        },
        {
          name: "create_order",
          description:
            "Place an order for a product. Supports Bitcoin payment methods. Requires read_write API key permission.",
          parameters: {
            productId: {
              type: "string",
              required: true,
              description: "The product event ID to purchase",
            },
            quantity: {
              type: "number",
              optional: true,
              description: "Quantity to order (default 1)",
            },
            discountCode: {
              type: "string",
              optional: true,
              description: "Optional discount code",
            },
            paymentMethod: {
              type: "string",
              optional: true,
              description: "Payment method: lightning (default) or cashu",
            },
            mintUrl: {
              type: "string",
              optional: true,
              description: "Cashu mint URL for Lightning invoices",
            },
            cashuToken: {
              type: "string",
              optional: true,
              description: "Serialized Cashu token for cashu payments",
            },
          },
          permissions: "read_write",
        },
        {
          name: "get_order_status",
          description:
            "Check the status of an existing order. Requires read_write API key permission.",
          parameters: {
            orderId: {
              type: "string",
              required: true,
              description: "The order ID to check",
            },
          },
          permissions: "read_write",
        },
        {
          name: "list_orders",
          description:
            "List your orders. Requires read_write API key permission.",
          parameters: {
            limit: {
              type: "number",
              optional: true,
              description: "Maximum number of orders to return (default 50)",
            },
            offset: {
              type: "number",
              optional: true,
              description: "Offset for pagination (default 0)",
            },
          },
          permissions: "read_write",
        },
        {
          name: "verify_payment",
          description:
            "Verify the payment status of a Lightning invoice. Use after paying to confirm. Requires read_write API key permission.",
          parameters: {
            orderId: {
              type: "string",
              required: true,
              description: "The order ID to verify payment for",
            },
          },
          permissions: "read_write",
        },
        {
          name: "get_payment_methods",
          description:
            "Get available Bitcoin payment methods for a specific seller, including discounts.",
          parameters: {
            sellerPubkey: {
              type: "string",
              required: true,
              description: "The seller's public key (hex)",
            },
          },
          permissions: "read",
        },
      ],
      resources: [
        {
          uri: "shopstr://catalog/products",
          name: "Product Catalog",
          description: "Browse the full product catalog",
        },
      ],
    },
    authentication: {
      type: "bearer",
      description:
        "Use Authorization: Bearer <api_key> header. API keys can be created via the onboarding endpoint or the API keys management endpoint.",
    },
    onboarding: {
      endpoint: `${baseUrl}/api/mcp/onboard`,
      method: "POST",
      description:
        "Single unauthenticated POST to get an API key and start using the service immediately.",
      body: {
        name: {
          type: "string",
          required: true,
          description: "Name for this API key / agent",
        },
        permissions: {
          type: "string",
          optional: true,
          description: "'read' or 'read_write' (default: 'read')",
        },
        contact: {
          type: "string",
          optional: true,
          description: "Contact URL or identifier",
        },
      },
    },
    endpoints: {
      mcp: `${baseUrl}/api/mcp`,
      status: `${baseUrl}/api/mcp/status`,
      manifest: `${baseUrl}/.well-known/agent.json`,
      onboarding: `${baseUrl}/api/mcp/onboard`,
      apiKeys: `${baseUrl}/api/mcp/api-keys`,
    },
    pricing: {
      model: "free_api",
      description:
        "The API itself is free to use. Product prices are included in search results and product details. Payment is required only when placing orders.",
      paymentMethods: [
        {
          method: "lightning",
          description: "Bitcoin Lightning Network invoice",
          currencies: ["sats"],
        },
        {
          method: "cashu",
          description: "Cashu ecash tokens",
          currencies: ["sats"],
        },
      ],
    },
    protocols: {
      mcp: {
        transport: "streamable-http",
        version: "2025-03-26",
        endpoint: `${baseUrl}/api/mcp`,
      },
    },
  });
}
