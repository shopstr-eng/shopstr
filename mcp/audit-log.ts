export interface ToolContext {
  apiKeyId?: number | null;
  pubkey?: string;
}

export interface AuditEntry {
  tool: string;
  apiKeyId?: number | null;
  pubkey?: string;
  params: Record<string, unknown>;
  durationMs: number;
  status: "success" | "error";
  error?: string | null;
  resultCount?: number;
  timestamp: string;
}

type MaybePromise<T> = T | Promise<T>;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type ToolCb = (
  args: any,
  extra: any
) => MaybePromise<{
  content: unknown[];
  isError?: boolean;
  resultCount?: number;
}>;

const REDACTED = "[REDACTED]";
const MAX_STRING_LENGTH = 200;

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
  /message/i,
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

function truncateString(s: string): string {
  return s.length > MAX_STRING_LENGTH
    ? `${s.slice(0, MAX_STRING_LENGTH)}...[truncated]`
    : s;
}

export function sanitizeParams(
  params: Record<string, unknown>,
  depth = 0
): Record<string, unknown> {
  if (depth >= 4) return { _depth_limit: true };
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(params)) {
    if (isSensitiveKey(k)) {
      out[k] = REDACTED;
    } else if (v !== null && typeof v === "object" && !Array.isArray(v)) {
      out[k] = sanitizeParams(v as Record<string, unknown>, depth + 1);
    } else if (Array.isArray(v)) {
      out[k] = v.map((item) =>
        item !== null && typeof item === "object" && !Array.isArray(item)
          ? sanitizeParams(item as Record<string, unknown>, depth + 1)
          : typeof item === "string"
            ? truncateString(item)
            : item
      );
    } else if (typeof v === "string") {
      out[k] = truncateString(v);
    } else {
      out[k] = v;
    }
  }
  return out;
}

export function logToolCall(entry: AuditEntry): void {
  console.error(JSON.stringify({ level: "audit", ...entry }));
}

export function wrapWithAudit(
  toolName: string,
  cb: ToolCb,
  context?: ToolContext
): ToolCb {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return async (args: any, extra: any) => {
    const start = Date.now();
    let status: "success" | "error" = "success";
    let errorMessage: string | null = null;
    let resultCount: number | undefined;
    try {
      const result = await cb(args, extra);
      if (result?.isError === true) status = "error";
      if (result?.resultCount !== undefined) resultCount = result.resultCount;
      return result;
    } catch (err) {
      status = "error";
      errorMessage = err instanceof Error ? err.message : String(err);
      throw err;
    } finally {
      logToolCall({
        tool: toolName,
        ...(context?.apiKeyId !== undefined && { apiKeyId: context.apiKeyId }),
        ...(context?.pubkey !== undefined && { pubkey: context.pubkey }),
        params: sanitizeParams(args ?? {}),
        durationMs: Date.now() - start,
        status,
        ...(errorMessage !== null && { error: errorMessage }),
        ...(resultCount !== undefined && { resultCount }),
        timestamp: new Date().toISOString(),
      });
    }
  };
}
