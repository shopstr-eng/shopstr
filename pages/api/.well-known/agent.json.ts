import type { NextApiRequest, NextApiResponse } from "next";

export default function handler(_req: NextApiRequest, res: NextApiResponse) {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:5000";

  res.setHeader("Cache-Control", "public, max-age=3600");
  res.setHeader("Access-Control-Allow-Origin", "*");

  return res.status(200).json({
    schema: "https://open-agents.com/schema/v1",
    name: "Milk Market",
    version: "2.0.0",
    description:
      "A decentralized marketplace for local food and goods, built on Nostr. Browse products, view seller profiles, read reviews, place orders, create listings, manage shops, upload media, send messages, and participate in communities via MCP. Full marketplace participation as both buyer and seller.",
    logo: `${baseUrl}/milk-market.png`,
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
              description: "Filter by currency (e.g. 'USD', 'BTC')",
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
            "Place an order for a product. Supports multiple payment methods. Requires read_write or full_access API key.",
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
            buyerEmail: {
              type: "string",
              optional: true,
              description: "Buyer's email for order confirmation",
            },
            discountCode: {
              type: "string",
              optional: true,
              description: "Optional discount code",
            },
            paymentMethod: {
              type: "string",
              optional: true,
              description:
                "Payment method: stripe (default), lightning, cashu, or fiat",
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
            fiatMethod: {
              type: "string",
              optional: true,
              description: "Specific fiat method (venmo, cashapp, zelle, etc.)",
            },
          },
          permissions: "read_write",
        },
        {
          name: "get_order_status",
          description:
            "Check the status of an existing order. Requires read_write or full_access API key.",
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
            "List your orders. Requires read_write or full_access API key.",
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
            "Verify the payment status of a Lightning invoice. Requires read_write or full_access API key.",
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
            "Get available payment methods for a specific seller, including discounts.",
          parameters: {
            sellerPubkey: {
              type: "string",
              required: true,
              description: "The seller's public key (hex)",
            },
          },
          permissions: "read",
        },
        {
          name: "set_user_profile",
          description:
            "Create or update your Nostr user profile (kind 0). Sets name, bio, picture, lightning address, etc.",
          parameters: {
            name: {
              type: "string",
              optional: true,
              description: "Display name",
            },
            display_name: {
              type: "string",
              optional: true,
              description: "Full display name",
            },
            about: {
              type: "string",
              optional: true,
              description: "Bio/description",
            },
            picture: {
              type: "string",
              optional: true,
              description: "Profile picture URL",
            },
            banner: {
              type: "string",
              optional: true,
              description: "Banner image URL",
            },
            lud16: {
              type: "string",
              optional: true,
              description: "Lightning address",
            },
            nip05: {
              type: "string",
              optional: true,
              description: "NIP-05 identifier",
            },
            website: {
              type: "string",
              optional: true,
              description: "Website URL",
            },
          },
          permissions: "full_access",
        },
        {
          name: "set_shop_profile",
          description:
            "Create or update your shop profile (kind 30019). Sets shop name, description, branding, and settings.",
          parameters: {
            name: { type: "string", optional: true, description: "Shop name" },
            about: {
              type: "string",
              optional: true,
              description: "Shop description",
            },
            picture: {
              type: "string",
              optional: true,
              description: "Shop logo URL",
            },
            banner: {
              type: "string",
              optional: true,
              description: "Shop banner URL",
            },
            theme: {
              type: "string",
              optional: true,
              description: "Theme color",
            },
            darkMode: {
              type: "boolean",
              optional: true,
              description: "Dark mode setting",
            },
            freeShippingThreshold: {
              type: "number",
              optional: true,
              description: "Min order for free shipping",
            },
            freeShippingCurrency: {
              type: "string",
              optional: true,
              description: "Currency for free shipping threshold",
            },
          },
          permissions: "full_access",
        },
        {
          name: "create_product_listing",
          description:
            "Publish a new product listing (kind 30402) with title, description, price, images, categories, shipping, and more.",
          parameters: {
            title: {
              type: "string",
              required: true,
              description: "Product title",
            },
            description: {
              type: "string",
              required: true,
              description: "Product description",
            },
            price: {
              type: "string",
              required: true,
              description: "Price amount",
            },
            currency: {
              type: "string",
              required: true,
              description: "Currency (USD, sats, BTC)",
            },
            images: {
              type: "array",
              optional: true,
              description: "Image URLs",
            },
            categories: {
              type: "array",
              optional: true,
              description: "Category tags",
            },
            location: {
              type: "string",
              optional: true,
              description: "Location",
            },
            shippingOption: {
              type: "string",
              optional: true,
              description: "Shipping type",
            },
            shippingCost: {
              type: "string",
              optional: true,
              description: "Shipping cost",
            },
            quantity: {
              type: "string",
              optional: true,
              description: "Available quantity",
            },
          },
          permissions: "full_access",
        },
        {
          name: "update_product_listing",
          description: "Update an existing product listing by d-tag.",
          parameters: {
            dTag: {
              type: "string",
              required: true,
              description: "d-tag of the listing to update",
            },
            title: {
              type: "string",
              optional: true,
              description: "Updated title",
            },
            description: {
              type: "string",
              optional: true,
              description: "Updated description",
            },
            price: {
              type: "string",
              optional: true,
              description: "Updated price",
            },
            currency: {
              type: "string",
              optional: true,
              description: "Updated currency",
            },
          },
          permissions: "full_access",
        },
        {
          name: "delete_listing",
          description:
            "Delete a product listing or Nostr event by publishing a deletion event (kind 5).",
          parameters: {
            eventIds: {
              type: "array",
              required: true,
              description: "Event IDs to delete",
            },
            reason: {
              type: "string",
              optional: true,
              description: "Deletion reason",
            },
          },
          permissions: "full_access",
        },
        {
          name: "publish_review",
          description:
            "Publish a review (kind 31555) for a product or seller with content and ratings.",
          parameters: {
            content: {
              type: "string",
              required: true,
              description: "Review text",
            },
            productId: {
              type: "string",
              optional: true,
              description: "Product event ID",
            },
            sellerPubkey: {
              type: "string",
              optional: true,
              description: "Seller pubkey",
            },
            ratings: {
              type: "array",
              optional: true,
              description: "Rating categories and values",
            },
          },
          permissions: "full_access",
        },
        {
          name: "create_community_post",
          description:
            "Create a post in a Nostr community (kind 1111). Supports posts and replies.",
          parameters: {
            content: {
              type: "string",
              required: true,
              description: "Post content",
            },
            communityId: {
              type: "string",
              required: true,
              description: "Community address (kind:pubkey:d-tag)",
            },
            communityPubkey: {
              type: "string",
              required: true,
              description: "Community creator pubkey",
            },
            parentEventId: {
              type: "string",
              optional: true,
              description: "Parent event for replies",
            },
          },
          permissions: "full_access",
        },
        {
          name: "send_direct_message",
          description:
            "Send an encrypted DM using NIP-17 gift wrap. Supports plain messages, listing inquiries, and order messages.",
          parameters: {
            recipientPubkey: {
              type: "string",
              required: true,
              description: "Recipient pubkey (hex)",
            },
            message: {
              type: "string",
              required: true,
              description: "Message content",
            },
            subject: {
              type: "string",
              optional: true,
              description: "Message subject",
            },
            productAddress: {
              type: "string",
              optional: true,
              description: "Product address for inquiries",
            },
            orderId: {
              type: "string",
              optional: true,
              description: "Order ID for order messages",
            },
            isOrder: {
              type: "boolean",
              optional: true,
              description: "Whether this is order-related",
            },
          },
          permissions: "full_access",
        },
        {
          name: "set_relay_list",
          description: "Publish your relay list (kind 10002, NIP-65).",
          parameters: {
            relays: {
              type: "array",
              required: true,
              description:
                "Array of relay configs with url and type (read/write/both)",
            },
          },
          permissions: "full_access",
        },
        {
          name: "set_blossom_servers",
          description: "Publish your Blossom media server list (kind 10063).",
          parameters: {
            servers: {
              type: "array",
              required: true,
              description: "Array of Blossom server URLs",
            },
          },
          permissions: "full_access",
        },
        {
          name: "upload_media",
          description:
            "Upload media to a Blossom server with signed authorization. Returns the uploaded file URL.",
          parameters: {
            fileBase64: {
              type: "string",
              required: true,
              description: "Base64-encoded file content",
            },
            fileName: {
              type: "string",
              required: true,
              description: "File name",
            },
            mimeType: {
              type: "string",
              required: true,
              description: "MIME type",
            },
            serverUrl: {
              type: "string",
              optional: true,
              description: "Blossom server URL",
            },
          },
          permissions: "full_access",
        },
        {
          name: "create_discount_code",
          description: "Create a discount code for your shop.",
          parameters: {
            code: {
              type: "string",
              required: true,
              description: "Discount code string",
            },
            discountPercentage: {
              type: "number",
              required: true,
              description: "Discount percentage (0-100)",
            },
            expiration: {
              type: "number",
              optional: true,
              description: "Unix timestamp expiration",
            },
          },
          permissions: "full_access",
        },
        {
          name: "delete_discount_code",
          description: "Delete one of your discount codes.",
          parameters: {
            code: {
              type: "string",
              required: true,
              description: "Code to delete",
            },
          },
          permissions: "full_access",
        },
        {
          name: "list_discount_codes",
          description: "List your shop's discount codes.",
          parameters: {},
          permissions: "full_access",
        },
        {
          name: "get_cashu_balance",
          description: "Check your Cashu wallet balance.",
          parameters: {
            mintUrl: {
              type: "string",
              optional: true,
              description: "Filter by mint URL",
            },
          },
          permissions: "full_access",
        },
        {
          name: "receive_cashu_tokens",
          description:
            "Receive Cashu tokens and store them as proof events (kind 7375).",
          parameters: {
            token: {
              type: "string",
              required: true,
              description: "Serialized Cashu token",
            },
          },
          permissions: "full_access",
        },
        {
          name: "set_cashu_mints",
          description: "Configure Cashu wallet mints (kind 17375).",
          parameters: {
            mints: {
              type: "array",
              required: true,
              description: "Array of Cashu mint URLs",
            },
          },
          permissions: "full_access",
        },
        {
          name: "send_cashu_payment",
          description:
            "Send a Cashu payment by melting tokens to pay a Lightning invoice.",
          parameters: {
            invoice: {
              type: "string",
              required: true,
              description: "Lightning invoice (bolt11)",
            },
            mintUrl: {
              type: "string",
              optional: true,
              description: "Cashu mint URL",
            },
          },
          permissions: "full_access",
        },
      ],
      resources: [
        {
          uri: "catalog://products",
          name: "Product Catalog",
          description: "Browse the full product catalog",
        },
        {
          uri: "catalog://companies",
          name: "Company Directory",
          description: "Browse all seller/shop profiles",
        },
        {
          uri: "catalog://reviews",
          name: "Reviews",
          description: "Browse all product and seller reviews",
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
        "Single unauthenticated POST to get an API key and start using the service immediately. Provide nsec for full marketplace access.",
      body: {
        name: {
          type: "string",
          required: true,
          description: "Name for this API key / agent",
        },
        permissions: {
          type: "string",
          optional: true,
          description:
            "'read', 'read_write', or 'full_access' (default: 'read')",
        },
        contact: {
          type: "string",
          optional: true,
          description: "Contact email or URL",
        },
        pubkey: {
          type: "string",
          optional: true,
          description: "Existing Nostr pubkey (hex or npub1...)",
        },
        nsec: {
          type: "string",
          optional: true,
          description:
            "Nostr secret key for write capabilities (nsec1... or hex). Stored encrypted.",
        },
      },
    },
    endpoints: {
      mcp: `${baseUrl}/api/mcp`,
      status: `${baseUrl}/api/mcp/status`,
      manifest: `${baseUrl}/.well-known/agent.json`,
      onboarding: `${baseUrl}/api/mcp/onboard`,
      apiKeys: `${baseUrl}/api/mcp/api-keys`,
      setNsec: `${baseUrl}/api/mcp/set-nsec`,
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
        {
          method: "stripe",
          description: "Credit/debit card via Stripe",
          currencies: ["usd"],
        },
        {
          method: "fiat",
          description: "Fiat transfer (Venmo, Cash App, Zelle, etc.)",
          currencies: ["usd"],
          note: "Availability depends on seller",
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
