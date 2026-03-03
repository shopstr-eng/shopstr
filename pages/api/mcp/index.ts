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
    "Place an order for a product. Supports Bitcoin payment methods: lightning (Bitcoin Lightning invoice) or cashu (ecash tokens). Requires read_write API key permission.",
    {
      productId: z.string().describe("The product event ID to purchase"),
      quantity: z.number().optional().describe("Quantity to order (default 1)"),
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
      discountCode,
      paymentMethod,
      mintUrl,
      cashuToken,
    }) => {
      const startTime = Date.now();
      if (apiKey.permissions !== "read_write") return permissionError();

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
      if (apiKey.permissions !== "read_write") return permissionError();

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
      if (apiKey.permissions !== "read_write") return permissionError();

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
      if (apiKey.permissions !== "read_write") return permissionError();

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
        const { fetchAllProfilesFromDb } = await import(
          "@/utils/db/db-service"
        );
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
