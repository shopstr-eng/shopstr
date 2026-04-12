import type { NextApiRequest, NextApiResponse } from "next";
import { randomUUID } from "crypto";
import { z } from "zod/v4";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createMcpServer } from "@/mcp/server";
import {
  extractBearerToken,
  validateApiKey,
  initializeApiKeysTable,
  ApiKeyRecord,
} from "@/utils/mcp/auth";
import { recordRequest } from "@/utils/mcp/metrics";
import { registerWriteTools } from "@/mcp/tools/write-tools";

let tablesReady = false;

async function ensureTables() {
  if (!tablesReady) {
    await initializeApiKeysTable();
    tablesReady = true;
  }
}

const sessions = new Map<
  string,
  { transport: StreamableHTTPServerTransport; apiKey: ApiKeyRecord }
>();

export const config = {
  api: {
    bodyParser: true,
  },
};

function registerPurchaseTools(
  server: ReturnType<typeof createMcpServer>,
  apiKey: ApiKeyRecord,
  token: string
) {
  const baseUrl = `http://localhost:${process.env.PORT || 5000}`;

  function permissionError() {
    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify({
            error:
              "Insufficient permissions. This action requires a read_write API key.",
          }),
        },
      ],
      isError: true,
    };
  }

  server.tool(
    "create_order",
    "Place an order for a product. Supports Bitcoin payment methods: lightning (Bitcoin Lightning invoice) or cashu (ecash tokens). Supports selecting product specifications (size, volume, bulk bundle) and providing a shipping address. Requires read_write API key permission.",
    {
      productId: z.string().describe("The product event ID to purchase"),
      quantity: z.number().optional().describe("Quantity to order (default 1)"),
      buyerEmail: z
        .string()
        .optional()
        .describe("Buyer's email for order confirmation"),
      selectedSize: z
        .string()
        .optional()
        .describe(
          "Selected size option (must match a size defined on the product)"
        ),
      selectedVolume: z
        .string()
        .optional()
        .describe(
          "Selected volume/variant option (must match a volume defined on the product). Overrides base price."
        ),
      selectedWeight: z
        .string()
        .optional()
        .describe(
          "Selected weight option (must match a weight defined on the product). Overrides base price."
        ),
      selectedBulkUnits: z
        .number()
        .optional()
        .describe(
          "Selected bulk/bundle tier (number of units). Must match a bulk tier defined on the product."
        ),
      shippingAddress: z
        .object({
          name: z.string().describe("Recipient name"),
          address: z.string().describe("Street address"),
          unit: z.string().optional().describe("Apartment/unit number"),
          city: z.string().describe("City"),
          postalCode: z.string().describe("Postal/ZIP code"),
          stateProvince: z.string().describe("State or province"),
          country: z.string().describe("Country"),
        })
        .optional()
        .describe("Shipping address for physical goods"),
      discountCode: z.string().optional().describe("Optional discount code"),
      paymentMethod: z
        .enum(["stripe", "lightning", "cashu", "fiat"])
        .optional()
        .describe(
          "Payment method: stripe (default), lightning (Bitcoin Lightning invoice), cashu (ecash tokens), or fiat (Venmo, Cash App, etc.)"
        ),
      mintUrl: z
        .string()
        .optional()
        .describe(
          "Cashu mint URL for Lightning invoice generation (optional, defaults to minibits mint)"
        ),
      cashuToken: z
        .string()
        .optional()
        .describe("Serialized Cashu token string for cashu payment method"),
      fiatMethod: z
        .string()
        .optional()
        .describe(
          "Specific fiat method (e.g. 'venmo', 'cashapp', 'zelle') when using fiat payment"
        ),
    },
    async ({
      productId,
      quantity,
      buyerEmail,
      selectedSize,
      selectedVolume,
      selectedWeight,
      selectedBulkUnits,
      shippingAddress,
      discountCode,
      paymentMethod,
      mintUrl,
      cashuToken,
      fiatMethod,
    }) => {
      const startTime = Date.now();
      if (
        apiKey.permissions !== "read_write" &&
        apiKey.permissions !== "full_access"
      )
        return permissionError();

      try {
        const orderRes = await fetch(`${baseUrl}/api/mcp/create-order`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            productId,
            quantity: quantity || 1,
            buyerEmail,
            selectedSize,
            selectedVolume,
            selectedWeight,
            selectedBulkUnits,
            shippingAddress,
            discountCode,
            paymentMethod: paymentMethod || "stripe",
            mintUrl,
            cashuToken,
            fiatMethod,
          }),
        });
        const data = await orderRes.json();
        data._meta = {
          responseTimeMs: Date.now() - startTime,
          dataSource: "live",
        };
        return {
          content: [
            { type: "text" as const, text: JSON.stringify(data, null, 2) },
          ],
          isError: !data.success && !data.status,
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                error: "Failed to create order",
                details:
                  error instanceof Error ? error.message : "Unknown error",
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
    }
  );

  server.tool(
    "get_order_status",
    "Check the status of an existing order. Requires read_write API key permission.",
    {
      orderId: z.string().describe("The order ID to check"),
    },
    async ({ orderId }) => {
      const startTime = Date.now();
      if (
        apiKey.permissions !== "read_write" &&
        apiKey.permissions !== "full_access"
      )
        return permissionError();

      try {
        const orderRes = await fetch(
          `${baseUrl}/api/mcp/create-order?orderId=${orderId}`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        const data = await orderRes.json();
        data._meta = {
          responseTimeMs: Date.now() - startTime,
          dataSource: "live",
          resultCount: 1,
        };
        return {
          content: [
            { type: "text" as const, text: JSON.stringify(data, null, 2) },
          ],
          isError: !data.success,
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                error: "Failed to get order status",
                details:
                  error instanceof Error ? error.message : "Unknown error",
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
    }
  );

  server.tool(
    "list_orders",
    "List your orders. Requires read_write API key permission.",
    {
      limit: z
        .number()
        .optional()
        .describe("Maximum number of orders to return (default 50)"),
      offset: z
        .number()
        .optional()
        .describe("Offset for pagination (default 0)"),
    },
    async ({ limit, offset }) => {
      const startTime = Date.now();
      if (
        apiKey.permissions !== "read_write" &&
        apiKey.permissions !== "full_access"
      )
        return permissionError();

      try {
        const l = limit || 50;
        const o = offset || 0;
        const orderRes = await fetch(
          `${baseUrl}/api/mcp/create-order?limit=${l}&offset=${o}`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        const data = await orderRes.json();
        data._meta = {
          responseTimeMs: Date.now() - startTime,
          dataSource: "live",
          resultCount: data.orders?.length || 0,
        };
        return {
          content: [
            { type: "text" as const, text: JSON.stringify(data, null, 2) },
          ],
          isError: !data.success,
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                error: "Failed to list orders",
                details:
                  error instanceof Error ? error.message : "Unknown error",
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
    }
  );

  server.tool(
    "verify_payment",
    "Verify the payment status of a Lightning invoice for an order. Use after paying a Lightning invoice to confirm the order. Requires read_write API key permission.",
    {
      orderId: z.string().describe("The order ID to verify payment for"),
    },
    async ({ orderId }) => {
      const startTime = Date.now();
      if (
        apiKey.permissions !== "read_write" &&
        apiKey.permissions !== "full_access"
      )
        return permissionError();

      try {
        const verifyRes = await fetch(`${baseUrl}/api/mcp/verify-payment`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ orderId }),
        });
        const data = await verifyRes.json();
        data._meta = {
          responseTimeMs: Date.now() - startTime,
          dataSource: "live",
        };
        return {
          content: [
            { type: "text" as const, text: JSON.stringify(data, null, 2) },
          ],
          isError: !data.success,
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                error: "Failed to verify payment",
                details:
                  error instanceof Error ? error.message : "Unknown error",
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
    }
  );

  server.tool(
    "get_payment_methods",
    "Get available payment methods for a specific seller. Shows which payment options (stripe, lightning, cashu, fiat) the seller accepts, along with any payment method discounts.",
    {
      sellerPubkey: z.string().describe("The seller's public key (hex)"),
    },
    async ({ sellerPubkey }) => {
      const startTime = Date.now();

      try {
        const { fetchAllProfilesFromDb, getStripeConnectAccount } =
          await import("@/utils/db/db-service");
        const profiles = await fetchAllProfilesFromDb();
        const profile = profiles.find(
          (p: any) =>
            p.pubkey === sellerPubkey && (p.kind === 0 || p.kind === 30019)
        );

        if (!profile) {
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

        let content: any = {};
        try {
          content = JSON.parse(profile.content);
        } catch {}

        let hasStripe = false;
        try {
          const stripeAccount = await getStripeConnectAccount(sellerPubkey);
          hasStripe = !!(stripeAccount && stripeAccount.charges_enabled);
        } catch {}

        const methods: any[] = [];

        methods.push({
          method: "lightning",
          available: true,
          description: "Pay with a Bitcoin Lightning invoice",
          lud16: content.lud16 || null,
        });

        methods.push({
          method: "cashu",
          available: true,
          description: "Pay with Cashu ecash tokens",
        });

        if (hasStripe) {
          methods.push({
            method: "stripe",
            available: true,
            description: "Pay with credit/debit card via Stripe",
          });
        }

        const fiatOptions = content.fiat_options || [];
        if (fiatOptions.length > 0) {
          methods.push({
            method: "fiat",
            available: true,
            description: "Pay via fiat transfer",
            options: fiatOptions,
          });
        }

        const discounts = content.paymentMethodDiscounts || {};

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  sellerPubkey,
                  sellerName: content.name || content.display_name || null,
                  paymentMethods: methods,
                  discounts:
                    Object.keys(discounts).length > 0 ? discounts : null,
                  _meta: {
                    responseTimeMs: Date.now() - startTime,
                    dataSource: "cached_db",
                    resultCount: methods.length,
                  },
                },
                null,
                2
              ),
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                error: "Failed to get payment methods",
                details:
                  error instanceof Error ? error.message : "Unknown error",
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
    }
  );

  server.tool(
    "create_subscription",
    "Create a subscription order for a product. The product must have subscription enabled. Requires read_write or full_access API key permission.",
    {
      productId: z.string().describe("The product event ID to subscribe to"),
      frequency: z
        .enum([
          "weekly",
          "every_2_weeks",
          "monthly",
          "every_2_months",
          "quarterly",
        ])
        .describe("Subscription delivery frequency"),
      buyerEmail: z
        .string()
        .describe("Buyer's email address for the subscription"),
      quantity: z
        .number()
        .optional()
        .describe("Quantity per delivery (default 1)"),
      shippingAddress: z
        .object({
          name: z.string(),
          address: z.string(),
          unit: z.string().optional(),
          city: z.string(),
          postalCode: z.string(),
          stateProvince: z.string(),
          country: z.string(),
        })
        .optional()
        .describe("Shipping address for subscription deliveries"),
      selectedSize: z
        .string()
        .optional()
        .describe(
          "Selected size option (must match a size defined on the product)"
        ),
      selectedVolume: z
        .string()
        .optional()
        .describe(
          "Selected volume/variant option (must match a volume defined on the product)"
        ),
      selectedWeight: z
        .string()
        .optional()
        .describe(
          "Selected weight option (must match a weight defined on the product)"
        ),
    },
    async ({
      productId,
      frequency,
      buyerEmail,
      quantity,
      shippingAddress,
      selectedSize,
      selectedVolume,
      selectedWeight,
    }) => {
      const startTime = Date.now();
      if (
        apiKey.permissions !== "read_write" &&
        apiKey.permissions !== "full_access"
      )
        return permissionError();

      try {
        const { fetchAllProductsFromDb } = await import(
          "@/utils/db/db-service"
        );
        const products = await fetchAllProductsFromDb();
        const product = products.find((p: any) => p.id === productId);

        if (!product) {
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

        let tags: string[][] = [];
        try {
          const rawTags = product.tags;
          tags =
            typeof rawTags === "string"
              ? JSON.parse(rawTags)
              : Array.isArray(rawTags)
                ? rawTags
                : [];
        } catch {}

        const titleTag = tags.find((t) => t[0] === "title" || t[0] === "name");
        const priceTag = tags.find((t) => t[0] === "price");
        const subscriptionTag = tags.find((t) => t[0] === "subscription");
        const discountTag = tags.find((t) => t[0] === "subscription_discount");
        const freqTag = tags.find((t) => t[0] === "subscription_frequency");

        if (!subscriptionTag || subscriptionTag[1] !== "true") {
          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify({
                  error: "This product does not have subscriptions enabled",
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

        const availableFrequencies = freqTag ? freqTag.slice(1) : [];
        if (
          availableFrequencies.length > 0 &&
          !availableFrequencies.includes(frequency)
        ) {
          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify({
                  error: `Frequency '${frequency}' is not available for this product`,
                  availableFrequencies,
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

        const productTitle = titleTag?.[1] ?? null;
        const amount = priceTag?.[1] ? parseFloat(priceTag[1]) : 0;
        const currency = priceTag?.[2] ?? "usd";
        const discountPercent = discountTag?.[1]
          ? parseFloat(discountTag[1])
          : 0;

        const subRes = await fetch(
          `${baseUrl}/api/stripe/create-subscription`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              customerEmail: buyerEmail,
              productTitle,
              productDescription: product.content || null,
              amount,
              currency,
              frequency,
              discountPercent,
              sellerPubkey: product.pubkey,
              buyerPubkey: apiKey.pubkey || null,
              productEventId: productId,
              quantity: quantity || 1,
              selectedSize: selectedSize || null,
              selectedVolume: selectedVolume || null,
              selectedWeight: selectedWeight || null,
              shippingAddress: shippingAddress || null,
            }),
          }
        );
        const data = await subRes.json();
        data._meta = {
          responseTimeMs: Date.now() - startTime,
          dataSource: "live",
        };
        return {
          content: [
            { type: "text" as const, text: JSON.stringify(data, null, 2) },
          ],
          isError: !data.success,
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                error: "Failed to create subscription",
                details:
                  error instanceof Error ? error.message : "Unknown error",
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
    }
  );

  server.tool(
    "get_notifications",
    "Check for new activity: unread message count, recent orders as buyer, and recent orders as seller. Use this to detect new inquiries, order updates, and address changes that need attention.",
    {
      includeOrders: z
        .boolean()
        .optional()
        .describe("Include recent order summaries (default true)"),
      orderLimit: z
        .number()
        .optional()
        .describe("Max number of recent orders to return (default 10)"),
    },
    async (params) => {
      const startTime = Date.now();
      if (
        apiKey.permissions !== "read_write" &&
        apiKey.permissions !== "full_access"
      )
        return permissionError();

      try {
        const { getUnreadMessageCount } = await import("@/utils/db/db-service");
        const { listMcpOrders, listMcpOrdersAsSeller, formatOrderForResponse } =
          await import("@/mcp/tools/purchase-tools");

        const unreadCount = await getUnreadMessageCount(apiKey.pubkey);

        const result: Record<string, any> = {
          unreadMessages: unreadCount,
        };

        if (params.includeOrders !== false) {
          const limit = params.orderLimit || 10;
          const buyerOrders = await listMcpOrders(apiKey.pubkey, limit);
          const sellerOrders = await listMcpOrdersAsSeller(
            apiKey.pubkey,
            limit
          );

          result.ordersAsBuyer = {
            total: buyerOrders.length,
            recent: buyerOrders.map(formatOrderForResponse),
          };
          result.ordersAsSeller = {
            total: sellerOrders.length,
            recent: sellerOrders.map(formatOrderForResponse),
          };

          const pendingBuyerOrders = buyerOrders.filter(
            (o) =>
              o.payment_status === "pending" || o.order_status === "pending"
          );
          const pendingSellerOrders = sellerOrders.filter(
            (o) =>
              o.order_status === "pending" || o.order_status === "confirmed"
          );

          result.actionRequired = {
            pendingPayments: pendingBuyerOrders.length,
            ordersToFulfill: pendingSellerOrders.length,
            unreadMessages: unreadCount,
          };
        }

        result._meta = {
          responseTimeMs: Date.now() - startTime,
          dataSource: "cached_db",
        };

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                error: "Failed to get notifications",
                details:
                  error instanceof Error ? error.message : "Unknown error",
                _meta: { responseTimeMs: Date.now() - startTime },
              }),
            },
          ],
          isError: true,
        };
      }
    }
  );

  server.tool(
    "list_subscriptions",
    "List the buyer's subscriptions. Queries by the API key's associated pubkey or by email. Requires read_write or full_access API key permission.",
    {
      email: z
        .string()
        .optional()
        .describe(
          "Buyer email to look up subscriptions (used if no pubkey is associated with the API key)"
        ),
    },
    async ({ email }) => {
      const startTime = Date.now();
      if (
        apiKey.permissions !== "read_write" &&
        apiKey.permissions !== "full_access"
      )
        return permissionError();

      try {
        let url: string;
        if (apiKey.pubkey) {
          url = `${baseUrl}/api/stripe/get-subscriptions?pubkey=${encodeURIComponent(
            apiKey.pubkey
          )}`;
        } else if (email) {
          url = `${baseUrl}/api/stripe/get-subscriptions?email=${encodeURIComponent(
            email
          )}`;
        } else {
          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify({
                  error:
                    "No pubkey associated with API key and no email provided",
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

        const subRes = await fetch(url);
        const data = await subRes.json();
        data._meta = {
          responseTimeMs: Date.now() - startTime,
          dataSource: "live",
          resultCount: data.subscriptions?.length || 0,
        };
        return {
          content: [
            { type: "text" as const, text: JSON.stringify(data, null, 2) },
          ],
          isError: !data.success,
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                error: "Failed to list subscriptions",
                details:
                  error instanceof Error ? error.message : "Unknown error",
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
    }
  );

  server.tool(
    "cancel_subscription",
    "Cancel an existing subscription. The subscription will remain active until the end of the current billing period. Requires read_write or full_access API key permission.",
    {
      subscriptionId: z
        .string()
        .describe("The Stripe subscription ID to cancel"),
      connectedAccountId: z
        .string()
        .optional()
        .describe("The Stripe connected account ID (if applicable)"),
    },
    async ({ subscriptionId, connectedAccountId }) => {
      const startTime = Date.now();
      if (
        apiKey.permissions !== "read_write" &&
        apiKey.permissions !== "full_access"
      )
        return permissionError();

      try {
        const cancelRes = await fetch(
          `${baseUrl}/api/stripe/cancel-subscription`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              subscriptionId,
              connectedAccountId: connectedAccountId || undefined,
            }),
          }
        );
        const data = await cancelRes.json();
        data._meta = {
          responseTimeMs: Date.now() - startTime,
          dataSource: "live",
        };
        return {
          content: [
            { type: "text" as const, text: JSON.stringify(data, null, 2) },
          ],
          isError: !data.success,
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                error: "Failed to cancel subscription",
                details:
                  error instanceof Error ? error.message : "Unknown error",
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
    }
  );

  server.tool(
    "update_subscription",
    "Update an existing subscription's shipping address or next billing date. Requires read_write or full_access API key permission.",
    {
      subscriptionId: z
        .string()
        .describe("The Stripe subscription ID to update"),
      connectedAccountId: z
        .string()
        .optional()
        .describe("The Stripe connected account ID (if applicable)"),
      shippingAddress: z
        .object({
          name: z.string(),
          address: z.string(),
          unit: z.string().optional(),
          city: z.string(),
          postalCode: z.string(),
          stateProvince: z.string(),
          country: z.string(),
        })
        .optional()
        .describe("New shipping address"),
      nextBillingDate: z
        .string()
        .optional()
        .describe("New next billing date (ISO 8601 format, e.g. 2025-02-01)"),
    },
    async ({
      subscriptionId,
      connectedAccountId,
      shippingAddress,
      nextBillingDate,
    }) => {
      const startTime = Date.now();
      if (
        apiKey.permissions !== "read_write" &&
        apiKey.permissions !== "full_access"
      )
        return permissionError();

      try {
        const updateRes = await fetch(
          `${baseUrl}/api/stripe/update-subscription`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              subscriptionId,
              connectedAccountId: connectedAccountId || undefined,
              shippingAddress: shippingAddress || undefined,
              nextBillingDate: nextBillingDate || undefined,
            }),
          }
        );
        const data = await updateRes.json();
        data._meta = {
          responseTimeMs: Date.now() - startTime,
          dataSource: "live",
        };
        return {
          content: [
            { type: "text" as const, text: JSON.stringify(data, null, 2) },
          ],
          isError: !data.success,
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                error: "Failed to update subscription",
                details:
                  error instanceof Error ? error.message : "Unknown error",
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
    }
  );

  server.tool(
    "list_seller_orders",
    "List orders where you are the seller. Shows incoming purchases from buyers with payment status, order status, quantities, and shipping addresses.",
    {
      limit: z
        .number()
        .optional()
        .describe("Max number of orders to return (default 50)"),
      offset: z
        .number()
        .optional()
        .describe("Offset for pagination (default 0)"),
      status: z
        .string()
        .optional()
        .describe(
          "Filter by order status: pending, confirmed, shipped, delivered, cancelled"
        ),
    },
    async (params) => {
      const startTime = Date.now();
      if (
        apiKey.permissions !== "read_write" &&
        apiKey.permissions !== "full_access"
      )
        return permissionError();

      try {
        const { listMcpOrdersAsSeller, formatOrderForResponse } =
          await import("@/mcp/tools/purchase-tools");

        let orders = await listMcpOrdersAsSeller(
          apiKey.pubkey,
          params.limit || 50,
          params.offset || 0
        );

        if (params.status) {
          orders = orders.filter((o) => o.order_status === params.status);
        }

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  orders: orders.map(formatOrderForResponse),
                  total: orders.length,
                  _meta: {
                    responseTimeMs: Date.now() - startTime,
                    dataSource: "cached_db",
                    resultCount: orders.length,
                  },
                },
                null,
                2
              ),
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                error: "Failed to list seller orders",
                details:
                  error instanceof Error ? error.message : "Unknown error",
                _meta: { responseTimeMs: Date.now() - startTime },
              }),
            },
          ],
          isError: true,
        };
      }
    }
  );
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  const requestStart = Date.now();
  await ensureTables();

  const token = extractBearerToken(req);
  if (!token) {
    recordRequest(Date.now() - requestStart, false);
    return res.status(401).json({
      jsonrpc: "2.0",
      error: {
        code: -32000,
        message: "Missing API key. Use Authorization: Bearer <key>",
      },
      id: null,
    });
  }

  const apiKey = await validateApiKey(token);
  if (!apiKey) {
    recordRequest(Date.now() - requestStart, false);
    return res.status(401).json({
      jsonrpc: "2.0",
      error: { code: -32000, message: "Invalid or revoked API key" },
      id: null,
    });
  }

  res.setHeader("X-Response-Time-Start", requestStart.toString());

  const originalEnd = res.end.bind(res);
  (res as any).end = function (...args: any[]) {
    const durationMs = Date.now() - requestStart;
    res.setHeader("X-Response-Time", `${durationMs}ms`);
    recordRequest(durationMs, res.statusCode < 400, req.body?.method);
    return originalEnd(...args);
  };

  if (req.method === "POST") {
    const sessionId = req.headers["mcp-session-id"] as string | undefined;

    if (sessionId && sessions.has(sessionId)) {
      const session = sessions.get(sessionId)!;
      await session.transport.handleRequest(req as any, res as any, req.body);
      return;
    }

    const body = req.body;
    const isInitialize =
      body && !Array.isArray(body) && body.method === "initialize";

    if (isInitialize || !sessionId) {
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        onsessioninitialized: (sid) => {
          sessions.set(sid, { transport, apiKey });
        },
      });

      const server = createMcpServer();
      registerPurchaseTools(server, apiKey, token);
      if (apiKey.permissions === "full_access") {
        registerWriteTools(server, apiKey);
      }

      await server.connect(transport);
      await transport.handleRequest(req as any, res as any, req.body);
      return;
    }

    return res.status(400).json({
      jsonrpc: "2.0",
      error: {
        code: -32000,
        message: "Bad Request: No valid session ID provided",
      },
      id: null,
    });
  }

  if (req.method === "GET") {
    const sessionId = req.headers["mcp-session-id"] as string | undefined;
    if (sessionId && sessions.has(sessionId)) {
      const session = sessions.get(sessionId)!;
      await session.transport.handleRequest(req as any, res as any);
      return;
    }
    return res.status(400).json({
      jsonrpc: "2.0",
      error: {
        code: -32000,
        message: "Bad Request: Missing or invalid session ID for SSE stream",
      },
      id: null,
    });
  }

  if (req.method === "DELETE") {
    const sessionId = req.headers["mcp-session-id"] as string | undefined;
    if (sessionId && sessions.has(sessionId)) {
      const session = sessions.get(sessionId)!;
      await session.transport.handleRequest(req as any, res as any);
      sessions.delete(sessionId);
      return;
    }
    return res.status(404).json({
      jsonrpc: "2.0",
      error: { code: -32000, message: "Session not found" },
      id: null,
    });
  }

  res.status(405).json({
    jsonrpc: "2.0",
    error: { code: -32000, message: "Method not allowed" },
    id: null,
  });
}
