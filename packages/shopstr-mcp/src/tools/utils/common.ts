import type { ZodError } from "zod";

import {
  MCP_ERROR_CODES,
  createErrorResponse,
  type ToolMeta,
  type ToolTextResponse,
} from "../../errors.js";
import type { RelayFetchMeta } from "../../types.js";

export const PRODUCT_KIND = 30402;
export const REVIEW_KIND = 31555;
export const PRODUCT_RESPONSE_BUDGET = 37;
export const REVIEW_RESPONSE_BUDGET = 50;
export const RELAY_RETRY_AFTER_MS = 2_000;

export function formatValidationError(error: ZodError): string {
  return error.issues
    .map((issue) => {
      const path = issue.path.length > 0 ? issue.path.join(".") : "input";
      return `${path}: ${issue.message}`;
    })
    .join("; ");
}

export function createValidationErrorResponse(
  error: ZodError
): ToolTextResponse {
  return createErrorResponse(
    `Invalid input: ${formatValidationError(error)}`,
    MCP_ERROR_CODES.VALIDATION_ERROR,
    false,
    undefined,
    {
      _hints: ["Check the tool input schema and retry with valid arguments."],
    }
  );
}

export function buildToolMeta(
  relayMeta: RelayFetchMeta,
  fields: {
    hints?: string[];
    resultCount?: number;
    totalMatches?: number;
    truncated?: boolean;
    dataFreshness?: string | null;
  } = {}
): ToolMeta {
  return {
    ...relayMeta,
    dataSource: "nostr_relays",
    ...(fields.dataFreshness !== undefined && {
      dataFreshness: fields.dataFreshness,
    }),
    ...(fields.resultCount !== undefined && {
      resultCount: fields.resultCount,
    }),
    ...(fields.totalMatches !== undefined && {
      totalMatches: fields.totalMatches,
    }),
    ...(fields.truncated !== undefined && { _truncated: fields.truncated }),
    _hints: fields.hints ?? [],
  };
}

export function allRelaysFailed(meta: RelayFetchMeta): boolean {
  return meta.relaysQueried.length > 0 && meta.relaysSucceeded.length === 0;
}

export function createRelayUnavailableResponse(
  meta: RelayFetchMeta,
  hints: string[] = ["Retry later or configure additional relays."]
): ToolTextResponse {
  return createErrorResponse(
    "All configured relays failed to return data.",
    MCP_ERROR_CODES.RELAY_UNAVAILABLE,
    true,
    RELAY_RETRY_AFTER_MS,
    buildToolMeta(meta, { hints })
  );
}

export function getDataFreshness(
  items: readonly { createdAt: number }[]
): string | null {
  const latestTimestamp = items.reduce(
    (latest, item) => Math.max(latest, item.createdAt || 0),
    0
  );
  return latestTimestamp
    ? new Date(latestTimestamp * 1000).toISOString()
    : null;
}
