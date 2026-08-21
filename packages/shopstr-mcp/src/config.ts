import { z } from "zod";

export const DEFAULT_RELAYS = [
  "wss://nos.lol",
  "wss://relay.damus.io",
  "wss://purplepag.es",
] as const;

export const DEFAULT_NIP50_SEARCH_RELAYS = [] as const;

export const DEFAULT_TOOL_TIMEOUT_MS = 10_000;
export const DEFAULT_RELAY_CONNECT_TIMEOUT_MS = 5_000;
export const DEFAULT_RESOURCE_CACHE_TTL_MS = 60_000;
export const DEFAULT_CACHE_MAX_ENTRIES = 5_000;
export const DEFAULT_MAX_CONCURRENT_REQUESTS = 10;
export const DEFAULT_CATEGORY_CACHE_TTL_MS = 24 * 60 * 60 * 1_000;
export const DEFAULT_NIP05_CACHE_TTL_MS = 24 * 60 * 60 * 1_000;

const LOG_LEVEL_VALUES = ["error", "warn", "info", "debug"] as const;
const logLevelSchema = z.enum(LOG_LEVEL_VALUES);
const positiveIntegerSchema = z.coerce.number().int().positive();

export type LogLevel = "error" | "warn" | "info" | "debug";

export type ShopstrMcpConfig = {
  version: string;
  relays: string[];
  nip50SearchRelays: string[];
  logLevel: LogLevel;
  defaultToolTimeoutMs: number;
  relayConnectTimeoutMs: number;
  resourceCacheTtlMs: number;
  profileCacheTtlMs: number;
  categoryCacheTtlMs: number;
  nip05CacheTtlMs: number;
  cacheMaxEntries: number;
  maxConcurrentRequests: number;
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

export function parseRelayList(
  rawRelays?: string,
  fallbackRelays: readonly string[] = DEFAULT_RELAYS
): string[] {
  if (!rawRelays) return [...fallbackRelays];

  const relays = rawRelays
    .split(",")
    .map((relay) => relay.trim())
    .filter(Boolean)
    .filter(validateRelayUrl);

  return relays.length > 0 ? [...new Set(relays)] : [...fallbackRelays];
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
  const resourceCacheTtlMs = parsePositiveInteger(
    env.SHOPSTR_MCP_RESOURCE_CACHE_TTL_MS,
    DEFAULT_RESOURCE_CACHE_TTL_MS
  );

  return {
    version: env.npm_package_version ?? "0.1.0",
    relays: parseRelayList(env.SHOPSTR_MCP_RELAYS),
    nip50SearchRelays:
      env.SHOPSTR_MCP_NIP50_SEARCH_RELAYS?.trim() === ""
        ? []
        : parseRelayList(
            env.SHOPSTR_MCP_NIP50_SEARCH_RELAYS,
            DEFAULT_NIP50_SEARCH_RELAYS
          ),
    logLevel: parseLogLevel(env.SHOPSTR_MCP_LOG_LEVEL),
    defaultToolTimeoutMs: parsePositiveInteger(
      env.SHOPSTR_MCP_TOOL_TIMEOUT_MS,
      DEFAULT_TOOL_TIMEOUT_MS
    ),
    relayConnectTimeoutMs: parsePositiveInteger(
      env.SHOPSTR_MCP_RELAY_CONNECT_TIMEOUT_MS,
      DEFAULT_RELAY_CONNECT_TIMEOUT_MS
    ),
    resourceCacheTtlMs,
    profileCacheTtlMs: parsePositiveInteger(
      env.SHOPSTR_MCP_PROFILE_CACHE_TTL_MS,
      resourceCacheTtlMs
    ),
    categoryCacheTtlMs: parsePositiveInteger(
      env.SHOPSTR_MCP_CATEGORY_CACHE_TTL_MS,
      DEFAULT_CATEGORY_CACHE_TTL_MS
    ),
    nip05CacheTtlMs: parsePositiveInteger(
      env.SHOPSTR_MCP_NIP05_CACHE_TTL_MS,
      DEFAULT_NIP05_CACHE_TTL_MS
    ),
    cacheMaxEntries: parsePositiveInteger(
      env.SHOPSTR_MCP_CACHE_MAX_ENTRIES,
      DEFAULT_CACHE_MAX_ENTRIES
    ),
    maxConcurrentRequests: parsePositiveInteger(
      env.SHOPSTR_MCP_MAX_CONCURRENT_REQUESTS,
      DEFAULT_MAX_CONCURRENT_REQUESTS
    ),
  };
}
