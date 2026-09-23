import { createHash } from "node:crypto";
import { z } from "zod";

import { MCP_ERROR_CODES, type McpErrorCode } from "../../errors.js";

const LEGACY_CURSOR_VERSION = 1;
const CURSOR_VERSION = 2;
const MAX_CURSOR_LENGTH = 16_384;
const MAX_SEEN_IDS = 128;
const MAX_RELAY_LIMIT = 500;
const HEX_64_RE = /^[0-9a-f]{64}$/;
const BASE64URL_RE = /^[A-Za-z0-9_-]+$/;
const CURSOR_MAGIC = Buffer.from("SC", "ascii");
const CURSOR_HEADER_LENGTH = 45;

const paginationCursorToolSchema = z.enum([
  "search_products",
  "get_reviews",
  "list_companies",
]);

const paginationCursorFields = {
  tool: paginationCursorToolSchema,
  query: z.string().regex(HEX_64_RE),
  boundary: z.number().int().nonnegative(),
  seen: z
    .array(z.string().regex(HEX_64_RE))
    .max(MAX_SEEN_IDS)
    .refine((ids) => new Set(ids).size === ids.length, {
      message: "Cursor seen IDs must be unique",
    }),
};

const paginationCursorInputSchema = z.object(paginationCursorFields).strict();

const legacyPaginationCursorPayloadSchema = z
  .object({
    v: z.literal(LEGACY_CURSOR_VERSION),
    ...paginationCursorFields,
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

type DecodedPaginationCursor = PaginationCursorInput;

const CURSOR_TOOL_CODES: Record<PaginationCursorTool, number> = {
  search_products: 0,
  get_reviews: 1,
  list_companies: 2,
};

const CURSOR_TOOLS_BY_CODE: readonly PaginationCursorTool[] = [
  "search_products",
  "get_reviews",
  "list_companies",
];

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

  let payload: Buffer;
  try {
    payload = Buffer.from(cursor, "base64url");
  } catch {
    throw invalidCursor();
  }

  const decoded =
    payload[0] === 0x7b
      ? decodeLegacyPaginationCursor(payload)
      : decodePaginationCursorV2(payload);

  if (decoded.tool !== expected.tool || decoded.query !== expected.query) {
    throw invalidCursor("Pagination cursor does not match this request");
  }

  return {
    boundary: decoded.boundary,
    seen: decoded.seen,
  };
}

function decodeLegacyPaginationCursor(
  payload: Buffer
): DecodedPaginationCursor {
  let rawPayload: unknown;
  try {
    rawPayload = JSON.parse(payload.toString("utf8"));
  } catch {
    throw invalidCursor();
  }

  const parsed = legacyPaginationCursorPayloadSchema.safeParse(rawPayload);
  if (!parsed.success) throw invalidCursor();

  return parsed.data;
}

function decodePaginationCursorV2(payload: Buffer): DecodedPaginationCursor {
  if (
    payload.length < CURSOR_HEADER_LENGTH ||
    !payload.subarray(0, 2).equals(CURSOR_MAGIC) ||
    payload[2] !== CURSOR_VERSION
  ) {
    throw invalidCursor();
  }

  const tool = CURSOR_TOOLS_BY_CODE[payload[3]!];
  const seenCount = payload[44]!;
  if (
    tool === undefined ||
    seenCount > MAX_SEEN_IDS ||
    payload.length !== CURSOR_HEADER_LENGTH + seenCount * 32
  ) {
    throw invalidCursor();
  }

  const boundaryBigInt = payload.readBigUInt64BE(4);
  if (boundaryBigInt > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw invalidCursor();
  }

  const seen = Array.from({ length: seenCount }, (_, index) =>
    payload.subarray(45 + index * 32, 45 + (index + 1) * 32).toString("hex")
  );
  if (new Set(seen).size !== seen.length) throw invalidCursor();

  return {
    tool,
    query: payload.subarray(12, 44).toString("hex"),
    boundary: Number(boundaryBigInt),
    seen,
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

  const parsed = paginationCursorInputSchema.safeParse(input);
  if (!parsed.success) {
    throw invalidCursor("Cannot create an invalid pagination cursor");
  }

  return encodePaginationCursorV2(parsed.data);
}

function encodePaginationCursorV2(input: PaginationCursorInput): string {
  const payload = Buffer.alloc(CURSOR_HEADER_LENGTH + input.seen.length * 32);
  CURSOR_MAGIC.copy(payload, 0);
  payload.writeUInt8(CURSOR_VERSION, 2);
  payload.writeUInt8(CURSOR_TOOL_CODES[input.tool], 3);
  payload.writeBigUInt64BE(BigInt(input.boundary), 4);
  Buffer.from(input.query, "hex").copy(payload, 12);
  payload.writeUInt8(input.seen.length, 44);
  input.seen.forEach((identity, index) => {
    Buffer.from(identity, "hex").copy(payload, 45 + index * 32);
  });
  return payload.toString("base64url");
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
