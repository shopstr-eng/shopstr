import {
  sanitizeParams,
  logToolCall,
  wrapWithAudit,
  AuditEntry,
} from "@/mcp/audit-log";

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
});

describe("logToolCall", () => {
  let consoleSpy: jest.SpyInstance;

  beforeEach(() => {
    consoleSpy = jest.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  it("writes a single JSON line with level=audit", () => {
    const entry: AuditEntry = {
      tool: "search_products",
      params: { keyword: "shoes" },
      durationMs: 42,
      isError: false,
      timestamp: "2026-01-01T00:00:00.000Z",
    };

    logToolCall(entry);

    expect(consoleSpy).toHaveBeenCalledTimes(1);
    const logged = JSON.parse(consoleSpy.mock.calls[0][0]);
    expect(logged.level).toBe("audit");
    expect(logged.tool).toBe("search_products");
    expect(logged.durationMs).toBe(42);
    expect(logged.isError).toBe(false);
  });

  it("includes optional apiKeyId and pubkey when provided", () => {
    logToolCall({
      tool: "get_product_details",
      apiKeyId: 7,
      pubkey: "aabbcc",
      params: {},
      durationMs: 10,
      isError: false,
      timestamp: "2026-01-01T00:00:00.000Z",
    });

    const logged = JSON.parse(consoleSpy.mock.calls[0][0]);
    expect(logged.apiKeyId).toBe(7);
    expect(logged.pubkey).toBe("aabbcc");
  });

  it("omits apiKeyId and pubkey when not in entry", () => {
    logToolCall({
      tool: "list_companies",
      params: {},
      durationMs: 5,
      isError: false,
      timestamp: "2026-01-01T00:00:00.000Z",
    });

    const logged = JSON.parse(consoleSpy.mock.calls[0][0]);
    expect("apiKeyId" in logged).toBe(false);
    expect("pubkey" in logged).toBe(false);
  });
});

describe("wrapWithAudit", () => {
  let consoleSpy: jest.SpyInstance;

  beforeEach(() => {
    consoleSpy = jest.spyOn(console, "log").mockImplementation(() => {});
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

  it("logs isError: false for a successful result", async () => {
    const wrapped = wrapWithAudit(
      "search_products",
      jest.fn().mockResolvedValue({ content: [] })
    );
    await wrapped({ keyword: "test" }, {});

    const logged = JSON.parse(consoleSpy.mock.calls[0][0]);
    expect(logged.isError).toBe(false);
    expect(logged.tool).toBe("search_products");
  });

  it("logs isError: true when the result has isError: true", async () => {
    const wrapped = wrapWithAudit(
      "get_product_details",
      jest.fn().mockResolvedValue({ content: [], isError: true })
    );
    await wrapped({ productId: "missing" }, {});

    const logged = JSON.parse(consoleSpy.mock.calls[0][0]);
    expect(logged.isError).toBe(true);
  });

  it("logs isError: true and re-throws when the callback throws", async () => {
    const boom = new Error("db exploded");
    const wrapped = wrapWithAudit(
      "create_order",
      jest.fn().mockRejectedValue(boom)
    );

    await expect(wrapped({}, {})).rejects.toThrow("db exploded");

    const logged = JSON.parse(consoleSpy.mock.calls[0][0]);
    expect(logged.isError).toBe(true);
    expect(logged.tool).toBe("create_order");
  });

  it("records a positive durationMs", async () => {
    const wrapped = wrapWithAudit(
      "list_companies",
      jest.fn().mockResolvedValue({ content: [] })
    );
    await wrapped({}, {});

    const logged = JSON.parse(consoleSpy.mock.calls[0][0]);
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

    const logged = JSON.parse(consoleSpy.mock.calls[0][0]);
    expect(logged.apiKeyId).toBe(3);
    expect(logged.pubkey).toBe("deadbeef");
  });

  it("omits context fields when no context is provided", async () => {
    const wrapped = wrapWithAudit(
      "list_companies",
      jest.fn().mockResolvedValue({ content: [] })
    );
    await wrapped({}, {});

    const logged = JSON.parse(consoleSpy.mock.calls[0][0]);
    expect("apiKeyId" in logged).toBe(false);
    expect("pubkey" in logged).toBe(false);
  });

  it("redacts sensitive params before logging", async () => {
    const wrapped = wrapWithAudit(
      "some_tool",
      jest.fn().mockResolvedValue({ content: [] })
    );
    await wrapped({ nsec: "nsec1private", productId: "abc" }, {});

    const logged = JSON.parse(consoleSpy.mock.calls[0][0]);
    expect(logged.params.nsec).toBe("[REDACTED]");
    expect(logged.params.productId).toBe("abc");
  });

  it("includes a valid ISO timestamp in the log", async () => {
    const wrapped = wrapWithAudit(
      "search_products",
      jest.fn().mockResolvedValue({ content: [] })
    );
    await wrapped({}, {});

    const logged = JSON.parse(consoleSpy.mock.calls[0][0]);
    expect(() => new Date(logged.timestamp)).not.toThrow();
    expect(new Date(logged.timestamp).toISOString()).toBe(logged.timestamp);
  });
});
