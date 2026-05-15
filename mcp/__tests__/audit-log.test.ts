import {
  sanitizeParams,
  logToolCall,
  wrapWithAudit,
  AuditEntry,
} from "@/mcp/audit-log";

// noUncheckedIndexedAccess-safe helper: extract the JSON the spy wrote on call N
function loggedEntry(
  spy: { mock: { calls: unknown[][] } },
  callIndex = 0
): Record<string, unknown> {
  const call = spy.mock.calls[callIndex] ?? [];
  return JSON.parse(call[0] as string) as Record<string, unknown>;
}

describe("sanitizeParams", () => {
  it("passes through non-sensitive fields unchanged", () => {
    expect(sanitizeParams({ keyword: "shoes", limit: 10 })).toEqual({
      keyword: "shoes",
      limit: 10,
    });
  });

  it("redacts known sensitive keys", () => {
    const result = sanitizeParams({
      nsec: "nsec1secret",
      cashuToken: "cashuA...",
      password: "hunter2",
      secret: "shh",
      token: "tok_xyz",
      apiKey: "sk_live_...",
    });
    for (const key of [
      "nsec",
      "cashuToken",
      "password",
      "secret",
      "token",
      "apiKey",
    ]) {
      expect(result[key]).toBe("[REDACTED]");
    }
  });

  it("redacts only sensitive keys, leaving the rest intact", () => {
    const result = sanitizeParams({ productId: "abc123", nsec: "nsec1secret" });
    expect(result.productId).toBe("abc123");
    expect(result.nsec).toBe("[REDACTED]");
  });

  it("redacts sensitive keys nested inside objects", () => {
    const result = sanitizeParams({
      order: { nsec: "leak", buyerNote: "hi" },
    });
    const order = result.order as Record<string, unknown>;
    expect(order.nsec).toBe("[REDACTED]");
    expect(order.buyerNote).toBe("hi");
  });

  it("redacts sensitive keys at multiple nesting levels", () => {
    const result = sanitizeParams({
      outer: { inner: { password: "deep-secret", safe: "ok" } },
    });
    const inner = (result.outer as Record<string, unknown>).inner as Record<
      string,
      unknown
    >;
    expect(inner.password).toBe("[REDACTED]");
    expect(inner.safe).toBe("ok");
  });

  it("redacts private message, payment, address, and file fields", () => {
    const result = sanitizeParams({
      message: "Please leave this by the door",
      invoice: "lnbc...",
      fileBase64: "x".repeat(300),
      shippingAddress: { address: "123 Market St" },
    });

    expect(result.message).toBe("[REDACTED]");
    expect(result.invoice).toBe("[REDACTED]");
    expect(result.fileBase64).toBe("[REDACTED]");
    expect(result.shippingAddress).toBe("[REDACTED]");
  });

  it("truncates long non-sensitive string values to 200 chars", () => {
    const long = "x".repeat(300);
    const result = sanitizeParams({ description: long });
    const val = result.description as string;
    expect(val).toHaveLength("x".repeat(200).length + "...[truncated]".length);
    expect(val.endsWith("...[truncated]")).toBe(true);
  });

  it("does not truncate short strings", () => {
    const result = sanitizeParams({ note: "hello" });
    expect(result.note).toBe("hello");
  });

  it("redacts sensitive strings inside nested objects", () => {
    const long = "a".repeat(300);
    const result = sanitizeParams({ shipping: { address: long } });
    const shipping = result.shipping as Record<string, unknown>;
    expect(shipping.address).toBe("[REDACTED]");
  });

  it("sanitizes objects inside arrays", () => {
    const result = sanitizeParams({
      items: [{ nsec: "should-redact", label: "foo" }],
    });
    const items = result.items as Record<string, unknown>[];
    expect(items[0]?.nsec).toBe("[REDACTED]");
    expect(items[0]?.label).toBe("foo");
  });

  it("truncates long strings inside arrays", () => {
    const long = "b".repeat(300);
    const result = sanitizeParams({ tags: [long, "short"] });
    const tags = result.tags as string[];
    expect(tags[0]?.endsWith("...[truncated]")).toBe(true);
    expect(tags[1]).toBe("short");
  });

  it("stops recursing past depth 4 and returns a sentinel", () => {
    const deep = { a: { b: { c: { d: { e: { f: "too deep" } } } } } };
    const result = sanitizeParams(deep);
    // Depth 0→a, 1→b, 2→c, 3→d, 4→_depth_limit sentinel
    const d = (
      ((result.a as Record<string, unknown>).b as Record<string, unknown>)
        .c as Record<string, unknown>
    ).d as Record<string, unknown>;
    expect(d).toEqual({ _depth_limit: true });
  });
});

describe("logToolCall", () => {
  let consoleSpy: jest.SpyInstance;

  beforeEach(() => {
    consoleSpy = jest.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  it("writes a single JSON line with level=audit", () => {
    const entry: AuditEntry = {
      tool: "search_products",
      params: { keyword: "shoes" },
      durationMs: 42,
      status: "success",
      timestamp: "2026-01-01T00:00:00.000Z",
    };

    logToolCall(entry);

    expect(consoleSpy).toHaveBeenCalledTimes(1);
    const logged = loggedEntry(consoleSpy);
    expect(logged.level).toBe("audit");
    expect(logged.tool).toBe("search_products");
    expect(logged.durationMs).toBe(42);
    expect(logged.status).toBe("success");
  });

  it("includes optional apiKeyId and pubkey when provided", () => {
    logToolCall({
      tool: "get_product_details",
      apiKeyId: 7,
      pubkey: "aabbcc",
      params: {},
      durationMs: 10,
      status: "success",
      timestamp: "2026-01-01T00:00:00.000Z",
    });

    const logged = loggedEntry(consoleSpy);
    expect(logged.apiKeyId).toBe(7);
    expect(logged.pubkey).toBe("aabbcc");
  });

  it("omits apiKeyId and pubkey when not in entry", () => {
    logToolCall({
      tool: "list_companies",
      params: {},
      durationMs: 5,
      status: "success",
      timestamp: "2026-01-01T00:00:00.000Z",
    });

    const logged = loggedEntry(consoleSpy);
    expect("apiKeyId" in logged).toBe(false);
    expect("pubkey" in logged).toBe(false);
  });
});

describe("wrapWithAudit", () => {
  let consoleSpy: jest.SpyInstance;

  beforeEach(() => {
    consoleSpy = jest.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  it("passes args and extra through to the original callback", async () => {
    const cb = jest.fn().mockResolvedValue({ content: [] });
    const wrapped = wrapWithAudit("my_tool", cb);

    await wrapped({ foo: "bar" }, { session: "xyz" });

    expect(cb).toHaveBeenCalledWith({ foo: "bar" }, { session: "xyz" });
  });

  it("returns the result from the original callback", async () => {
    const expected = { content: [{ type: "text", text: "ok" }] };
    const wrapped = wrapWithAudit(
      "my_tool",
      jest.fn().mockResolvedValue(expected)
    );

    const result = await wrapped({}, {});

    expect(result).toBe(expected);
  });

  it("logs status: success for a successful result", async () => {
    const wrapped = wrapWithAudit(
      "search_products",
      jest.fn().mockResolvedValue({ content: [] })
    );
    await wrapped({ keyword: "test" }, {});

    const logged = loggedEntry(consoleSpy);
    expect(logged.status).toBe("success");
    expect(logged.tool).toBe("search_products");
  });

  it("logs status: error when the result has isError: true", async () => {
    const wrapped = wrapWithAudit(
      "get_product_details",
      jest.fn().mockResolvedValue({ content: [], isError: true })
    );
    await wrapped({ productId: "missing" }, {});

    const logged = loggedEntry(consoleSpy);
    expect(logged.status).toBe("error");
  });

  it("logs status: error and re-throws when the callback throws", async () => {
    const boom = new Error("db exploded");
    const wrapped = wrapWithAudit(
      "create_order",
      jest.fn().mockRejectedValue(boom)
    );

    await expect(wrapped({}, {})).rejects.toThrow("db exploded");

    const logged = loggedEntry(consoleSpy);
    expect(logged.status).toBe("error");
    expect(logged.tool).toBe("create_order");
  });

  it("logs the original exception message in the error field", async () => {
    const boom = new Error("connection pool exhausted");
    const wrapped = wrapWithAudit(
      "create_order",
      jest.fn().mockRejectedValue(boom)
    );

    await expect(wrapped({}, {})).rejects.toThrow();

    const logged = loggedEntry(consoleSpy);
    expect(logged.error).toBe("connection pool exhausted");
  });

  it("logs non-Error throws as string in the error field", async () => {
    const wrapped = wrapWithAudit(
      "some_tool",
      jest.fn().mockRejectedValue("plain string error")
    );

    await expect(wrapped({}, {})).rejects.toBe("plain string error");

    const logged = loggedEntry(consoleSpy);
    expect(logged.error).toBe("plain string error");
  });

  it("omits the error field on a successful call", async () => {
    const wrapped = wrapWithAudit(
      "list_companies",
      jest.fn().mockResolvedValue({ content: [] })
    );
    await wrapped({}, {});

    const logged = loggedEntry(consoleSpy);
    expect("error" in logged).toBe(false);
  });

  it("logs resultCount when the callback returns one", async () => {
    const wrapped = wrapWithAudit(
      "search_products",
      jest.fn().mockResolvedValue({ content: [], resultCount: 12 })
    );
    await wrapped({ keyword: "bitcoin" }, {});

    const logged = loggedEntry(consoleSpy);
    expect(logged.resultCount).toBe(12);
  });

  it("omits resultCount when the callback does not return one", async () => {
    const wrapped = wrapWithAudit(
      "get_product_details",
      jest.fn().mockResolvedValue({ content: [] })
    );
    await wrapped({ productId: "abc" }, {});

    const logged = loggedEntry(consoleSpy);
    expect("resultCount" in logged).toBe(false);
  });

  it("records a positive durationMs", async () => {
    const wrapped = wrapWithAudit(
      "list_companies",
      jest.fn().mockResolvedValue({ content: [] })
    );
    await wrapped({}, {});

    const logged = loggedEntry(consoleSpy);
    expect(logged.durationMs).toBeGreaterThanOrEqual(0);
  });

  it("includes context fields (apiKeyId, pubkey) in the log", async () => {
    const context = { apiKeyId: 3, pubkey: "deadbeef" };
    const wrapped = wrapWithAudit(
      "set_user_profile",
      jest.fn().mockResolvedValue({ content: [] }),
      context
    );
    await wrapped({}, {});

    const logged = loggedEntry(consoleSpy);
    expect(logged.apiKeyId).toBe(3);
    expect(logged.pubkey).toBe("deadbeef");
  });

  it("omits context fields when no context is provided", async () => {
    const wrapped = wrapWithAudit(
      "list_companies",
      jest.fn().mockResolvedValue({ content: [] })
    );
    await wrapped({}, {});

    const logged = loggedEntry(consoleSpy);
    expect("apiKeyId" in logged).toBe(false);
    expect("pubkey" in logged).toBe(false);
  });

  it("redacts top-level sensitive params before logging", async () => {
    const wrapped = wrapWithAudit(
      "some_tool",
      jest.fn().mockResolvedValue({ content: [] })
    );
    await wrapped({ nsec: "nsec1private", productId: "abc" }, {});

    const logged = loggedEntry(consoleSpy);
    const params = logged.params as Record<string, unknown>;
    expect(params.nsec).toBe("[REDACTED]");
    expect(params.productId).toBe("abc");
  });

  it("redacts sensitive params nested inside objects", async () => {
    const wrapped = wrapWithAudit(
      "create_order",
      jest.fn().mockResolvedValue({ content: [] })
    );
    await wrapped({ order: { nsec: "leaked-key", buyerNote: "rush" } }, {});

    const logged = loggedEntry(consoleSpy);
    const order = (logged.params as Record<string, unknown>).order as Record<
      string,
      unknown
    >;
    expect(order.nsec).toBe("[REDACTED]");
    expect(order.buyerNote).toBe("rush");
  });

  it("redacts large private field values before logging", async () => {
    const wrapped = wrapWithAudit(
      "upload_media",
      jest.fn().mockResolvedValue({ content: [] })
    );
    const blob = "A".repeat(500);
    await wrapped({ fileBase64: blob }, {});

    const logged = loggedEntry(consoleSpy);
    const params = logged.params as Record<string, unknown>;
    expect(params.fileBase64).toBe("[REDACTED]");
  });

  it("includes a valid ISO timestamp in the log", async () => {
    const wrapped = wrapWithAudit(
      "search_products",
      jest.fn().mockResolvedValue({ content: [] })
    );
    await wrapped({}, {});

    const logged = loggedEntry(consoleSpy);
    expect(() => new Date(logged.timestamp as string)).not.toThrow();
    expect(new Date(logged.timestamp as string).toISOString()).toBe(
      logged.timestamp
    );
  });
});
