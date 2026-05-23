import { z } from "zod";

export const DEFAULT_RELAYS = [
  "wss://nos.lol",
  "wss://relay.damus.io",
  "wss://relay.nostr.band",
] as const;

export const DEFAULT_TOOL_TIMEOUT_MS = 10_000;
export const DEFAULT_RELAY_CONNECT_TIMEOUT_MS = 5_000;
export const DEFAULT_RESOURCE_CACHE_TTL_MS = 60_000;

const LOG_LEVEL_VALUES = ["error", "warn", "info", "debug"] as const;
const logLevelSchema = z.enum(LOG_LEVEL_VALUES);
const positiveIntegerSchema = z.coerce.number().int().positive();

export type LogLevel = "error" | "warn" | "info" | "debug";

export type ShopstrMcpConfig = {
  version: string;
  relays: string[];
  logLevel: LogLevel;
  defaultToolTimeoutMs: number;
  relayConnectTimeoutMs: number;
  resourceCacheTtlMs: number;
};

export function validateRelayUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return (
      (parsed.protocol === "wss:" || parsed.protocol === "ws:") &&
      parsed.hostname.length > 0 &&
      !parsed.username &&
      !parsed.password
    );
  } catch {
    return false;
  }
}

export function parseRelayList(rawRelays?: string): string[] {
  if (!rawRelays) return [...DEFAULT_RELAYS];

  const relays = rawRelays
    .split(",")
    .map((relay) => relay.trim())
    .filter(Boolean)
    .filter(validateRelayUrl);

  return relays.length > 0 ? [...new Set(relays)] : [...DEFAULT_RELAYS];
}

export function parseLogLevel(rawLogLevel?: string): LogLevel {
  const parsed = logLevelSchema.safeParse(rawLogLevel);
  return parsed.success ? parsed.data : "info";
}

export function parsePositiveInteger(
  rawValue: string | undefined,
  fallback: number
): number {
  const parsed = positiveIntegerSchema.safeParse(rawValue);
  return parsed.success ? parsed.data : fallback;
}

export function loadConfig(
  env: NodeJS.ProcessEnv = process.env
): ShopstrMcpConfig {
  return {
    version: "0.1.0",
    relays: parseRelayList(env.SHOPSTR_MCP_RELAYS),
    logLevel: parseLogLevel(env.SHOPSTR_MCP_LOG_LEVEL),
    defaultToolTimeoutMs: parsePositiveInteger(
      env.SHOPSTR_MCP_TOOL_TIMEOUT_MS,
      DEFAULT_TOOL_TIMEOUT_MS
    ),
    relayConnectTimeoutMs: parsePositiveInteger(
      env.SHOPSTR_MCP_RELAY_CONNECT_TIMEOUT_MS,
      DEFAULT_RELAY_CONNECT_TIMEOUT_MS
    ),
    resourceCacheTtlMs: parsePositiveInteger(
      env.SHOPSTR_MCP_RESOURCE_CACHE_TTL_MS,
      DEFAULT_RESOURCE_CACHE_TTL_MS
    ),
  };
}
