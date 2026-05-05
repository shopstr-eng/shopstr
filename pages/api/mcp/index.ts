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
import { applyRateLimit } from "@/utils/rate-limit";

// MCP protocol entry — high per-IP cap for legitimate session traffic, with
// a tighter per-key cap so a single compromised credential cannot exhaust
// the connection pool.
const RATE_LIMIT = { limit: 600, windowMs: 60 * 1000 };
const PER_KEY_LIMIT = { limit: 300, windowMs: 60 * 1000 };

let tablesReady = false;

async function ensureTables() {
  if (!tablesReady) {
    await initializeApiKeysTable();
    tablesReady = true;
  }
}

const SESSION_TTL_MS = 30 * 60 * 1000;
const SWEEP_INTERVAL_MS = 5 * 60 * 1000;

interface McpSession {
  transport: StreamableHTTPServerTransport;
  apiKey: ApiKeyRecord;
  createdAt: number;
  lastActivityAt: number;
}

const sessions = new Map<string, McpSession>();

function rejectSessionMismatch(res: NextApiResponse) {
  return res.status(403).json({
    jsonrpc: "2.0",
    error: { code: -32000, message: "Session belongs to a different API key" },
    id: null,
  });
}

setInterval(() => {
  const now = Date.now();
  for (const [sid, session] of sessions) {
    if (now - session.lastActivityAt > SESSION_TTL_MS) {
      try {
        session.transport.close?.();
      } catch {}
      sessions.delete(sid);
    }
  }
}, SWEEP_INTERVAL_MS);

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
    "Place an order for a product. Supports Bitcoin payment methods: lightning (Bitcoin Lightning invoice) or cashu (ecash tokens). Supports selecting product specifications (size, volume, weight, bulk bundle) and providing a shipping address. Requires read_write API key permission.",
    {
      productId: z.string().describe("The product event ID to purchase"),
      quantity: z.number().optional().describe("Quantity to order (default 1)"),
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
          "Selected weight option (must match a weight defined on the product, e.g. '1 oz', '1 lb'). Overrides base price."
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
        .enum(["lightning", "cashu"])
        .optional()
        .describe(
          "Payment method: lightning (default, Bitcoin Lightning invoice) or cashu (ecash tokens)"
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
    },
    async ({
      productId,
      quantity,
      selectedSize,
      selectedVolume,
      selectedWeight,
      selectedBulkUnits,
      shippingAddress,
      discountCode,
      paymentMethod,
      mintUrl,
      cashuToken,
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
            selectedSize,
            selectedVolume,
            selectedWeight,
            selectedBulkUnits,
            shippingAddress,
            discountCode,
            paymentMethod: paymentMethod || "lightning",
            mintUrl,
            cashuToken,
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
    "Get available payment methods for a specific seller. Shows which Bitcoin payment options (lightning, cashu) the seller accepts, along with any payment method discounts.",
    {
      sellerPubkey: z.string().describe("The seller's public key (hex)"),
    },
    async ({ sellerPubkey }) => {
      const startTime = Date.now();

      try {
        const { fetchAllProfilesFromDb } =
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

        const discounts = content.paymentMethodDiscounts || {};
        const bitcoinDiscount = discounts.bitcoin
          ? { bitcoin: discounts.bitcoin }
          : null;

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  sellerPubkey,
                  sellerName: content.name || content.display_name || null,
                  paymentMethods: methods,
                  discounts: bitcoinDiscount,
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

  if (!applyRateLimit(req, res, "mcp-protocol:ip", RATE_LIMIT)) {
    recordRequest(Date.now() - requestStart, false);
    return;
  }

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

  if (
    !applyRateLimit(
      req,
      res,
      "mcp-protocol:key",
      PER_KEY_LIMIT,
      String(apiKey.id)
    )
  ) {
    recordRequest(Date.now() - requestStart, false);
    return;
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
      if (apiKey.id !== session.apiKey.id) return rejectSessionMismatch(res);
      session.lastActivityAt = Date.now();
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
          const now = Date.now();
          sessions.set(sid, {
            transport,
            apiKey,
            createdAt: now,
            lastActivityAt: now,
          });
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
      if (apiKey.id !== session.apiKey.id) return rejectSessionMismatch(res);
      session.lastActivityAt = Date.now();
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
      if (apiKey.id !== session.apiKey.id) return rejectSessionMismatch(res);
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
