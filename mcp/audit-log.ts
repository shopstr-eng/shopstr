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
  isError: boolean;
  timestamp: string;
}

const REDACTED = "[REDACTED]";
const SENSITIVE_KEYS = new Set([
  "nsec",
  "password",
  "secret",
  "cashuToken",
  "token",
  "apiKey",
]);

export function sanitizeParams(
  params: Record<string, unknown>
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(params)) {
    out[k] = SENSITIVE_KEYS.has(k) ? REDACTED : v;
  }
  return out;
}

export function logToolCall(entry: AuditEntry): void {
  console.log(JSON.stringify({ level: "audit", ...entry }));
}

export function wrapWithAudit(
  toolName: string,
  cb: (args: any, extra: any) => any,
  context?: ToolContext
): (args: any, extra: any) => any {
  return async (args: any, extra: any) => {
    const start = Date.now();
    let isError = false;
    try {
      const result = await cb(args, extra);
      isError = result?.isError === true;
      return result;
    } catch (err) {
      isError = true;
      throw err;
    } finally {
      logToolCall({
        tool: toolName,
        ...(context?.apiKeyId !== undefined && { apiKeyId: context.apiKeyId }),
        ...(context?.pubkey !== undefined && { pubkey: context.pubkey }),
        params: sanitizeParams(args ?? {}),
        durationMs: Date.now() - start,
        isError,
        timestamp: new Date().toISOString(),
      });
    }
  };
}
