import type { ToolHandler } from "./audit-log.js";
import {
  MCP_ERROR_CODES,
  createErrorResponse,
  type ToolTextResponse,
} from "./errors.js";

const DEFAULT_RETRY_AFTER_MS = 1_000;

export class InFlightRateLimiter {
  private inFlight = 0;

  constructor(
    private readonly maxConcurrent: number,
    private readonly retryAfterMs = DEFAULT_RETRY_AFTER_MS
  ) {}

  async run<T>(operation: () => Promise<T> | T): Promise<T | ToolTextResponse> {
    if (this.maxConcurrent > 0 && this.inFlight >= this.maxConcurrent) {
      return createErrorResponse(
        "Too many concurrent Shopstr MCP requests.",
        MCP_ERROR_CODES.RATE_LIMITED,
        true,
        this.retryAfterMs,
        {
          retryAfterMs: this.retryAfterMs,
          _hints: ["Retry after the indicated delay."],
        }
      );
    }

    this.inFlight += 1;
    try {
      return await operation();
    } finally {
      this.inFlight -= 1;
    }
  }
}

export function wrapWithRateLimit<
  TArgs extends Record<string, unknown>,
  TResult extends ToolTextResponse,
>(
  limiter: InFlightRateLimiter,
  handler: ToolHandler<TArgs, TResult>
): ToolHandler<TArgs, TResult | ToolTextResponse> {
  return (args: TArgs, extra: unknown) =>
    limiter.run(() => handler(args, extra));
}
