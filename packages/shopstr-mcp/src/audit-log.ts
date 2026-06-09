import { MCP_ERROR_CODES, type McpErrorCode } from "./errors.js";

export interface AuditEntry {
  timestamp: string;
  toolName: string;
  inputSummary: Record<string, unknown>;
  durationMs: number;
  success: boolean;
  errorCode?: McpErrorCode;
  relaysQueried?: string[];
  resultCount?: number;
}

type MaybePromise<T> = T | Promise<T>;

export type ToolHandler<TArgs, TResult> = (
  args: TArgs,
  extra: unknown
) => MaybePromise<TResult>;

const REDACTED = "[REDACTED]";
const MAX_STRING_LENGTH = 200;
const MAX_DEPTH = 4;

const SENSITIVE_KEY_PATTERNS = [
  /nsec/i,
  /password/i,
  /secret/i,
  /token/i,
  /api[-_]?key/i,
  /authorization/i,
  /private/i,
  /seed/i,
  /mnemonic/i,
  /^content$/i,
  /address/i,
  /invoice/i,
  /bolt11/i,
  /^file/i,
  /base64/i,
  /tracking/i,
];

function isSensitiveKey(key: string): boolean {
  return SENSITIVE_KEY_PATTERNS.some((pattern) => pattern.test(key));
}

function truncateString(value: string): string {
  return value.length > MAX_STRING_LENGTH
    ? `${value.slice(0, MAX_STRING_LENGTH)}...[truncated]`
    : value;
}

function sanitizeArray(items: unknown[], depth: number): unknown {
  if (depth >= MAX_DEPTH) return { _depth_limit: true };

  return items.map((item) => {
    if (Array.isArray(item)) {
      return sanitizeArray(item, depth + 1);
    }
    if (item !== null && typeof item === "object") {
      return sanitizeParams(item as Record<string, unknown>, depth + 1);
    }
    return typeof item === "string" ? truncateString(item) : item;
  });
}

export function sanitizeParams(
  params: Record<string, unknown>,
  depth = 0
): Record<string, unknown> {
  if (depth >= MAX_DEPTH) return { _depth_limit: true };

  const output: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(params)) {
    if (isSensitiveKey(key)) {
      output[key] = REDACTED;
    } else if (typeof value === "string") {
      output[key] = truncateString(value);
    } else if (Array.isArray(value)) {
      output[key] = sanitizeArray(value, depth);
    } else if (value !== null && typeof value === "object") {
      output[key] = sanitizeParams(value as Record<string, unknown>, depth + 1);
    } else {
      output[key] = value;
    }
  }
  return output;
}

export function logAuditEntry(
  entry: AuditEntry,
  write: (line: string) => void = (line) => process.stderr.write(line)
): void {
  write(`${JSON.stringify({ level: "audit", ...entry })}\n`);
}

function isMcpErrorCode(value: unknown): value is McpErrorCode {
  return (
    typeof value === "string" &&
    Object.values(MCP_ERROR_CODES).includes(value as McpErrorCode)
  );
}

function stringArrayFromMeta(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return;
  const strings = value.filter(
    (item): item is string => typeof item === "string"
  );
  return strings.length === value.length ? strings : undefined;
}

function numberFromMeta(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}

export function wrapWithAudit<
  TArgs extends Record<string, unknown>,
  TResult extends {
    isError?: boolean;
    resultCount?: number;
    errorCode?: McpErrorCode;
    relaysQueried?: string[];
    _meta?: Record<string, unknown>;
  },
>(
  toolName: string,
  handler: ToolHandler<TArgs, TResult>,
  write?: (line: string) => void
): ToolHandler<TArgs, TResult> {
  return async (args: TArgs, extra: unknown) => {
    const start = Date.now();
    let success = true;
    let errorCode: McpErrorCode | undefined;
    let resultCount: number | undefined;
    let relaysQueried: string[] | undefined;

    try {
      const result = await handler(args, extra);
      const meta = result._meta ?? {};

      success = result.isError !== true;
      errorCode =
        result.errorCode ??
        (isMcpErrorCode(meta.errorCode) ? meta.errorCode : undefined);
      resultCount = result.resultCount ?? numberFromMeta(meta.resultCount);
      relaysQueried =
        result.relaysQueried ?? stringArrayFromMeta(meta.relaysQueried);
      return result;
    } catch (error) {
      success = false;
      throw error;
    } finally {
      logAuditEntry(
        {
          timestamp: new Date().toISOString(),
          toolName,
          inputSummary: sanitizeParams(args ?? {}),
          durationMs: Date.now() - start,
          success,
          ...(errorCode !== undefined && { errorCode }),
          ...(relaysQueried !== undefined && { relaysQueried }),
          ...(resultCount !== undefined && { resultCount }),
        },
        write
      );
    }
  };
}
