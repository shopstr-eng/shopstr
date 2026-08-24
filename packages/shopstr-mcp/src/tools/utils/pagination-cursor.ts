import { createHash } from "node:crypto";
import { z } from "zod";

import { MCP_ERROR_CODES, type McpErrorCode } from "../../errors.js";

const CURSOR_VERSION = 1;
const MAX_CURSOR_LENGTH = 16_384;
const MAX_SEEN_IDS = 128;
const MAX_RELAY_LIMIT = 500;
const HEX_64_RE = /^[0-9a-f]{64}$/;
const BASE64URL_RE = /^[A-Za-z0-9_-]+$/;

const paginationCursorToolSchema = z.enum([
  "search_products",
  "get_reviews",
  "list_companies",
]);

const paginationCursorPayloadSchema = z
  .object({
    v: z.literal(CURSOR_VERSION),
    tool: paginationCursorToolSchema,
    query: z.string().regex(HEX_64_RE),
    boundary: z.number().int().nonnegative(),
    seen: z
      .array(z.string().regex(HEX_64_RE))
      .max(MAX_SEEN_IDS)
      .refine((ids) => new Set(ids).size === ids.length, {
        message: "Cursor seen IDs must be unique",
      }),
  })
  .strict();

export type PaginationCursorTool = z.infer<typeof paginationCursorToolSchema>;

export type PaginationCursorState = {
  boundary: number;
  seen: string[];
};

export type PaginationCursorExpected = {
  tool: PaginationCursorTool;
  query: string;
};

export type PaginationCursorInput = PaginationCursorExpected &
  PaginationCursorState;

type PaginationEvent = {
  id: string;
  created_at: number;
};

type PaginationIdentity<T extends PaginationEvent> = (event: T) => string;

export class PaginationCursorError extends Error {
  constructor(
    message: string,
    readonly errorCode: McpErrorCode = MCP_ERROR_CODES.VALIDATION_ERROR
  ) {
    super(message);
    this.name = "PaginationCursorError";
  }
}

export function createQueryFingerprint(
  tool: PaginationCursorTool,
  values: readonly unknown[]
): string {
  return createHash("sha256")
    .update(JSON.stringify([tool, values]))
    .digest("hex");
}

export function decodePaginationCursor(
  cursor: string,
  expected: PaginationCursorExpected
): PaginationCursorState {
  if (
    cursor.length === 0 ||
    cursor.length > MAX_CURSOR_LENGTH ||
    !BASE64URL_RE.test(cursor) ||
    cursor.length % 4 === 1
  ) {
    throw invalidCursor();
  }

  let rawPayload: unknown;
  try {
    rawPayload = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"));
  } catch {
    throw invalidCursor();
  }

  const parsed = paginationCursorPayloadSchema.safeParse(rawPayload);
  if (!parsed.success) {
    throw invalidCursor();
  }

  if (
    parsed.data.tool !== expected.tool ||
    parsed.data.query !== expected.query
  ) {
    throw invalidCursor("Pagination cursor does not match this request");
  }

  return {
    boundary: parsed.data.boundary,
    seen: parsed.data.seen,
  };
}

export function applyPaginationCursor<T extends PaginationEvent>(
  events: readonly T[],
  state: PaginationCursorState | undefined,
  getLogicalIdentity: PaginationIdentity<T> = (event) => event.id
): T[] {
  if (!state) return [...events];

  const seen = new Set(state.seen);
  return events.filter(
    (event) =>
      !seen.has(hashPaginationLogicalIdentity(getLogicalIdentity(event))) &&
      event.created_at <= state.boundary
  );
}

export function accumulatePaginationSeen<T extends PaginationEvent>(
  state: PaginationCursorState | undefined,
  events: readonly T[],
  getLogicalIdentity: PaginationIdentity<T> = (event) => event.id
): string[] {
  const seen = new Set(state?.seen ?? []);
  for (const event of events) {
    seen.add(hashPaginationLogicalIdentity(getLogicalIdentity(event)));
  }
  return Array.from(seen);
}

export function assertPaginationProgress(
  state: PaginationCursorState | undefined,
  boundary: number,
  seen: readonly string[]
): void {
  if (!state) return;

  const previousSeen = new Set(state.seen);
  const sawNewIdentity = seen.some((identity) => !previousSeen.has(identity));
  if (
    boundary > state.boundary ||
    (boundary === state.boundary && !sawNewIdentity)
  ) {
    throw new PaginationCursorError(
      "Pagination cannot make strict progress at the inclusive boundary; narrow the filters",
      MCP_ERROR_CODES.PAGINATION_LIMIT
    );
  }
}

export function hashPaginationLogicalIdentity(identity: string): string {
  return createHash("sha256").update(identity).digest("hex");
}

export function createPaginationCursor(input: PaginationCursorInput): string {
  if (input.seen.length > MAX_SEEN_IDS) {
    throw new PaginationCursorError(
      "Pagination cannot represent more than 128 consumed logical identities; narrow the filters",
      MCP_ERROR_CODES.PAGINATION_LIMIT
    );
  }

  const parsed = paginationCursorPayloadSchema.safeParse({
    v: CURSOR_VERSION,
    ...input,
  });
  if (!parsed.success) {
    throw invalidCursor("Cannot create an invalid pagination cursor");
  }

  return Buffer.from(JSON.stringify(parsed.data)).toString("base64url");
}

export function getPaginatedRelayLimit(
  baseLimit: number,
  state: PaginationCursorState | undefined
): number {
  return Math.min(MAX_RELAY_LIMIT, baseLimit + (state?.seen.length ?? 0));
}

function invalidCursor(
  message = "Invalid pagination cursor"
): PaginationCursorError {
  return new PaginationCursorError(message);
}
