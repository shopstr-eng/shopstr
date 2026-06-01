export const MCP_ERROR_CODES = {
  NOT_FOUND: "NOT_FOUND",
  VALIDATION_ERROR: "VALIDATION_ERROR",
  RELAY_TIMEOUT: "RELAY_TIMEOUT",
  RELAY_UNAVAILABLE: "RELAY_UNAVAILABLE",
  RATE_LIMITED: "RATE_LIMITED",
  INTERNAL_ERROR: "INTERNAL_ERROR",
} as const;

export type McpErrorCode =
  (typeof MCP_ERROR_CODES)[keyof typeof MCP_ERROR_CODES];

export type ToolMeta = Record<string, unknown>;

export type ToolTextResponse = {
  content: Array<{ type: "text"; text: string }>;
  _meta?: ToolMeta;
  isError?: boolean;
  resultCount?: number;
};

export type ErrorPayload = {
  error: string;
  errorCode: McpErrorCode;
  retryable: boolean;
  retryAfterMs?: number;
  _meta?: ToolMeta;
};

export function createErrorPayload(
  error: string,
  errorCode: McpErrorCode,
  retryable: boolean,
  retryAfterMs?: number,
  meta?: ToolMeta
): ErrorPayload {
  return {
    error,
    errorCode,
    retryable,
    ...(retryAfterMs !== undefined && { retryAfterMs }),
    ...(meta && { _meta: meta }),
  };
}

export function createErrorResponse(
  error: string,
  errorCode: McpErrorCode,
  retryable: boolean,
  retryAfterMs?: number,
  meta?: ToolMeta
): ToolTextResponse {
  const responseMeta: ToolMeta = {
    ...(meta ?? {}),
    errorCode,
    retryable,
    ...(retryAfterMs !== undefined && { retryAfterMs }),
  };

  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(
          createErrorPayload(error, errorCode, retryable, retryAfterMs, meta),
          null,
          2
        ),
      },
    ],
    _meta: responseMeta,
    isError: true,
  };
}

export function createSuccessResponse(
  data: Record<string, unknown>,
  meta: ToolMeta = {},
  resultCount?: number
): ToolTextResponse {
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify({ ...data, _meta: meta }, null, 2),
      },
    ],
    _meta: meta,
    ...(resultCount !== undefined && { resultCount }),
  };
}
