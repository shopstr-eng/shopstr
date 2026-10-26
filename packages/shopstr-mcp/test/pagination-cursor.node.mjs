import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import { MCP_ERROR_CODES } from "../dist/errors.js";
import {
  applyPaginationCursor,
  createPaginationCursor,
  createQueryFingerprint,
  decodePaginationCursor,
  getPaginatedRelayLimit,
} from "../dist/tools/utils/pagination-cursor.js";

const hex = (character) => character.repeat(64);
const expected = {
  tool: "search_products",
  query: createQueryFingerprint("search_products", ["widget", "tools", 10]),
};

function encodeCursor(payload) {
  return Buffer.from(JSON.stringify(payload)).toString("base64url");
}

function assertCursorError(callback, errorCode) {
  assert.throws(callback, (error) => error?.errorCode === errorCode);
}

test("round-trips a versioned cursor and fingerprints fixed-order query values", () => {
  const cursor = createPaginationCursor({
    ...expected,
    boundary: 42,
    seen: [hex("a"), hex("b")],
  });

  assert.deepEqual(decodePaginationCursor(cursor, expected), {
    boundary: 42,
    seen: [hex("a"), hex("b")],
  });
  assert.notEqual(
    createQueryFingerprint("search_products", ["widget", "tools", 10]),
    createQueryFingerprint("search_products", ["tools", "widget", 10])
  );
});

test("emits compact version 2 cursors", () => {
  const cursor = createPaginationCursor({
    ...expected,
    boundary: 42,
    seen: [hex("a"), hex("b")],
  });
  const bytes = Buffer.from(cursor, "base64url");

  assert.equal(bytes.subarray(0, 2).toString("ascii"), "SC");
  assert.equal(bytes[2], 2);
  assert.deepEqual(decodePaginationCursor(cursor, expected), {
    boundary: 42,
    seen: [hex("a"), hex("b")],
  });
});

test("decodes legacy version 1 JSON cursors", () => {
  const cursor = encodeCursor({
    v: 1,
    ...expected,
    boundary: 42,
    seen: [hex("a"), hex("b")],
  });

  assert.deepEqual(decodePaginationCursor(cursor, expected), {
    boundary: 42,
    seen: [hex("a"), hex("b")],
  });
});

test("keeps compact cursors within the planned size ceilings", () => {
  const makeSeen = (count) =>
    Array.from({ length: count }, (_, index) =>
      index.toString(16).padStart(64, "0")
    );

  assert.ok(
    createPaginationCursor({
      ...expected,
      boundary: 42,
      seen: makeSeen(37),
    }).length <= 1_640
  );
  assert.ok(
    createPaginationCursor({
      ...expected,
      boundary: 42,
      seen: makeSeen(128),
    }).length <= 5_522
  );
});

test("rejects malformed version 2 binary cursors", () => {
  const valid = Buffer.from(
    createPaginationCursor({ ...expected, boundary: 42, seen: [hex("a")] }),
    "base64url"
  );
  const badVersion = Buffer.from(valid);
  badVersion[2] = 3;
  const badTool = Buffer.from(valid);
  badTool[3] = 255;
  const badCount = Buffer.from(valid);
  badCount[44] = 2;

  for (const bytes of [valid.subarray(0, 44), badVersion, badTool, badCount]) {
    assertCursorError(
      () => decodePaginationCursor(bytes.toString("base64url"), expected),
      MCP_ERROR_CODES.VALIDATION_ERROR
    );
  }
});

test("rejects malformed and strictly invalid cursor payloads", () => {
  const invalidPayloads = [
    "not a base64url cursor",
    Buffer.from("not json").toString("base64url"),
    encodeCursor({ v: 2, ...expected, boundary: 42, seen: [] }),
    encodeCursor({ v: 1, ...expected, boundary: -1, seen: [] }),
    encodeCursor({ v: 1, ...expected, boundary: 42, seen: [hex("A")] }),
    encodeCursor({
      v: 1,
      ...expected,
      boundary: 42,
      seen: [hex("a"), hex("a")],
    }),
  ];

  for (const cursor of invalidPayloads) {
    assertCursorError(
      () => decodePaginationCursor(cursor, expected),
      MCP_ERROR_CODES.VALIDATION_ERROR
    );
  }
  assertCursorError(
    () => decodePaginationCursor("a".repeat(16_385), expected),
    MCP_ERROR_CODES.VALIDATION_ERROR
  );
});

test("rejects a cursor for a different tool or query", () => {
  const cursor = createPaginationCursor({
    ...expected,
    boundary: 42,
    seen: [],
  });

  assertCursorError(
    () =>
      decodePaginationCursor(cursor, {
        ...expected,
        tool: "get_reviews",
      }),
    MCP_ERROR_CODES.VALIDATION_ERROR
  );
  assertCursorError(
    () =>
      decodePaginationCursor(cursor, {
        ...expected,
        query: createQueryFingerprint("search_products", ["other"]),
      }),
    MCP_ERROR_CODES.VALIDATION_ERROR
  );
});

test("enforces the consumed logical-identity bound", () => {
  assertCursorError(
    () =>
      createPaginationCursor({
        ...expected,
        boundary: 42,
        seen: Array.from({ length: 129 }, (_, index) =>
          index.toString(16).padStart(64, "0")
        ),
      }),
    MCP_ERROR_CODES.PAGINATION_LIMIT
  );
});

test("rejects a decoded cursor containing more than 128 seen keys", () => {
  const cursor = encodeCursor({
    v: 1,
    ...expected,
    boundary: 42,
    seen: Array.from({ length: 129 }, (_, index) =>
      index.toString(16).padStart(64, "0")
    ),
  });

  assertCursorError(
    () => decodePaginationCursor(cursor, expected),
    MCP_ERROR_CODES.VALIDATION_ERROR
  );
});

test("applies an inclusive relay boundary without repeating seen logical identities", () => {
  const state = {
    boundary: 10,
    seen: [createHash("sha256").update(hex("b")).digest("hex")],
  };
  const events = [
    { id: hex("a"), created_at: 11 },
    { id: hex("b"), created_at: 10 },
    { id: hex("c"), created_at: 10 },
    { id: hex("d"), created_at: 9 },
  ];

  assert.deepEqual(
    applyPaginationCursor(events, state).map((event) => event.id),
    [hex("c"), hex("d")]
  );
  assert.equal(getPaginatedRelayLimit(480, state), 481);
  assert.equal(
    getPaginatedRelayLimit(490, { boundary: 10, seen: Array(20) }),
    500
  );
});

test("rejects seen logical identities at every timestamp before applying the inclusive boundary", () => {
  const logicalIdentity = "30402:pubkey:product";
  const state = {
    boundary: 10,
    seen: [createHash("sha256").update(logicalIdentity).digest("hex")],
  };
  const events = [
    { id: hex("a"), created_at: 10, logicalIdentity: "other" },
    { id: hex("b"), created_at: 9, logicalIdentity },
    { id: hex("c"), created_at: 8, logicalIdentity: "oldest" },
  ];

  assert.deepEqual(
    applyPaginationCursor(events, state, (event) => event.logicalIdentity).map(
      (event) => event.id
    ),
    [hex("a"), hex("c")]
  );
});
