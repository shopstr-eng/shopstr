#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { loadConfig } from "./config.js";
import { createLogger } from "./logger.js";
import { createMcpServer } from "./server.js";

const config = loadConfig();
const logger = createLogger(config.logLevel);
let isShuttingDown = false;

const server = createMcpServer(config);

async function shutdown(reason: string): Promise<void> {
  if (isShuttingDown) return;
  isShuttingDown = true;

  logger.info("Shutting down Shopstr MCP server", { reason });

  try {
    await server.close();
  } catch (error) {
    logger.error("Failed to close MCP server cleanly", {
      error: error instanceof Error ? error.message : String(error),
    });
    process.exitCode = 1;
  } finally {
    process.exit(process.exitCode ?? 0);
  }
}

process.once("SIGINT", () => {
  void shutdown("SIGINT");
});

process.once("SIGTERM", () => {
  void shutdown("SIGTERM");
});

process.on("unhandledRejection", (reason) => {
  process.exitCode = 1;
  logger.error("Unhandled promise rejection; shutting down", {
    reason: reason instanceof Error ? reason.message : String(reason),
  });
  void shutdown("unhandledRejection");
});

process.on("uncaughtException", (error) => {
  process.exitCode = 1;
  logger.error("Uncaught exception; shutting down", {
    error: error.message,
    stack: error.stack,
  });
  void shutdown("uncaughtException");
});

try {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  logger.info("Shopstr MCP server started", {
    relays: config.relays.length,
    logLevel: config.logLevel,
  });
} catch (error) {
  logger.error("Failed to start Shopstr MCP server", {
    error: error instanceof Error ? error.message : String(error),
  });
  process.exitCode = 1;
  void shutdown("startupFailure");
}
