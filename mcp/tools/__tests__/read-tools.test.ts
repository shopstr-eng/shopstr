import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getDbPool } from "@/utils/db/db-service";
import { registerReadTools } from "@/mcp/tools/read-tools";

jest.mock("@/utils/db/db-service", () => ({
  getDbPool: jest.fn(),
}));

type ToolResult = {
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
};

type ToolCallback = (
  args: Record<string, unknown>,
  extra?: unknown
) => Promise<ToolResult>;

type DbEventRow = {
  id: string;
  pubkey: string;
  created_at: number;
  kind: number;
  tags: string[][] | string;
  content: string;
  sig: string;
};

const TEST_PUBKEY = "a".repeat(64);

function registerToolsForTest() {
  const callbacks = new Map<string, ToolCallback>();
  const server = {
    registerTool: jest.fn(
      (name: string, _options: unknown, callback: ToolCallback) => {
        callbacks.set(name, callback);
      }
    ),
  };
  registerReadTools(server as unknown as McpServer);
  return callbacks;
}

function getTool(callbacks: Map<string, ToolCallback>, name: string) {
  const tool = callbacks.get(name);
  if (!tool) throw new Error(`Tool "${name}" was not registered`);
  return tool;
}

function textPayload(result: ToolResult) {
  return JSON.parse(result.content[0]!.text);
}

function mockDbPool(
  queryImpl: (
    sql: string,
    params?: unknown[]
  ) => { rows: unknown[] } | Promise<{ rows: unknown[] }>
) {
  const query = jest.fn().mockImplementation(queryImpl);
  const release = jest.fn();
  const connect = jest.fn().mockResolvedValue({ query, release });
  jest.mocked(getDbPool).mockReturnValue({ connect } as any);
  return { query, release, connect };
}

function makeProductRow(overrides: Partial<DbEventRow> = {}): DbEventRow {
  return {
    id: "product-1",
    pubkey: TEST_PUBKEY,
    created_at: 1_700_000_000,
    kind: 30402,
    tags: [],
    content: "",
    sig: "sig",
    ...overrides,
  };
}

function makeProfileRow(
  overrides: Partial<Omit<DbEventRow, "content">> & {
    content?: Record<string, unknown>;
  } = {}
): DbEventRow {
  const { content, ...rest } = overrides;
  return {
    id: "profile-1",
    pubkey: TEST_PUBKEY,
    created_at: 1_700_000_000,
    kind: 30019,
    tags: [],
    content: JSON.stringify(content ?? { name: "Fresh Farm" }),
    sig: "sig",
    ...rest,
  };
}

function makeReviewRow(overrides: Partial<DbEventRow> = {}): DbEventRow {
  return {
    id: "review-1",
    pubkey: "reviewer-pubkey",
    created_at: 1_700_000_000,
    kind: 31555,
    tags: [["d", `${TEST_PUBKEY}:some-target`]],
    content: "Great product!",
    sig: "sig",
    ...overrides,
  };
}

// get_company_details and get_storefront each fan out to multiple tables
// via a single shared mocked client.query — branch on the SQL text to
// return the right rows per table.
function mockMultiTableDbPool(rowsBySqlFragment: Record<string, unknown[]>) {
  return mockDbPool((sql: string) => {
    for (const [fragment, rows] of Object.entries(rowsBySqlFragment)) {
      if (sql.includes(fragment)) return { rows };
    }
    return { rows: [] };
  });
}

function mockStorefrontDbPool({
  profiles = [] as unknown[],
  products = [] as unknown[],
  slugRows = [] as unknown[],
  domainRows = [] as unknown[],
  slugQueryImpl,
  domainQueryImpl,
}: {
  profiles?: unknown[];
  products?: unknown[];
  slugRows?: unknown[];
  domainRows?: unknown[];
  slugQueryImpl?: (sql: string, params?: unknown[]) => unknown;
  domainQueryImpl?: (sql: string, params?: unknown[]) => unknown;
} = {}) {
  const connectQuery = jest.fn().mockImplementation((sql: string) => {
    if (sql.includes("profile_events")) return { rows: profiles };
    if (sql.includes("product_events")) return { rows: products };
    return { rows: [] };
  });
  const release = jest.fn();
  const connect = jest.fn().mockResolvedValue({ query: connectQuery, release });
  const poolQuery = jest
    .fn()
    .mockImplementation((sql: string, params?: unknown[]) => {
      if (sql.includes("shop_slugs")) {
        return slugQueryImpl ? slugQueryImpl(sql, params) : { rows: slugRows };
      }
      if (sql.includes("custom_domains")) {
        return domainQueryImpl
          ? domainQueryImpl(sql, params)
          : { rows: domainRows };
      }
      return { rows: [] };
    });
  jest.mocked(getDbPool).mockReturnValue({ connect, query: poolQuery } as any);
  return { connectQuery, release, connect, poolQuery };
}

let auditLogSpy: jest.SpyInstance;

beforeAll(() => {
  // wrapWithAudit logs a structured audit entry via console.error on every
  // call — real production behavior we want exercised, but noisy here.
  auditLogSpy = jest
    .spyOn(console, "error")
    .mockImplementation(() => undefined);
});

afterAll(() => {
  auditLogSpy.mockRestore();
});

beforeEach(() => {
  jest.clearAllMocks();
});

describe("registerReadTools — harness sanity", () => {
  function getCallback() {
    return getTool(registerToolsForTest(), "search_products");
  }

  it("returns an empty result set when there are no product rows", async () => {
    mockDbPool(() => ({ rows: [] }));
    const tool = getCallback();

    const result = await tool({});

    const payload = textPayload(result);
    expect(result.isError).toBeUndefined();
    expect(payload).toMatchObject({ count: 0, products: [] });
    expect(payload._meta).toMatchObject({
      dataSource: "cached_db",
      dataFreshness: null,
      resultCount: 0,
    });
  });

  it("returns DB_ERROR (not a silent empty result) when the product query rejects", async () => {
    const { release } = mockDbPool(() => {
      throw new Error("database offline");
    });
    const tool = getCallback();

    const result = await tool({});

    const payload = textPayload(result);
    expect(result.isError).toBe(true);
    expect(payload).toMatchObject({
      error: "DB fetch failed",
      code: "DB_ERROR",
      _meta: { dataSource: "cached_db" },
    });
    expect(release).toHaveBeenCalledTimes(1);
  });

  it("releases the client even when the query rejects", async () => {
    const { release } = mockDbPool(() => {
      throw new Error("database offline");
    });
    const tool = getCallback();

    await tool({});

    expect(release).toHaveBeenCalledTimes(1);
  });

  it("parses a single product row into the expected response shape", async () => {
    mockDbPool(() => ({
      rows: [
        makeProductRow({
          tags: [
            ["title", "Raw Milk"],
            ["summary", "Fresh from the farm"],
            ["price", "10", "USD"],
          ],
        }),
      ],
    }));
    const tool = getCallback();

    const result = await tool({});

    const payload = textPayload(result);
    expect(payload.count).toBe(1);
    expect(payload.products[0]).toMatchObject({
      id: "product-1",
      title: "Raw Milk",
      summary: "Fresh from the farm",
      price: 10,
      currency: "USD",
    });
    expect(payload._meta.dataFreshness).toBe(
      new Date(1_700_000_000 * 1000).toISOString()
    );
  });

  it("normalizeTags parses a JSON-string tags column the same as a real array (as pg returns for jsonb)", async () => {
    mockDbPool(() => ({
      rows: [makeProductRow({ tags: JSON.stringify([["title", "Raw Milk"]]) })],
    }));
    const tool = getCallback();

    const result = await tool({});

    expect(textPayload(result).products[0].title).toBe("Raw Milk");
  });

  it("normalizeTags falls back to an empty tags array on malformed JSON, rather than throwing", async () => {
    mockDbPool(() => ({
      rows: [makeProductRow({ tags: "{not valid json" })],
    }));
    const tool = getCallback();

    const result = await tool({});

    expect(textPayload(result).products[0].title).toBe("");
  });

  it("normalizeTags falls back to an empty tags array when the JSON parses to a non-array (e.g. an object)", async () => {
    mockDbPool(() => ({
      rows: [makeProductRow({ tags: JSON.stringify({ not: "an array" }) })],
    }));
    const tool = getCallback();

    const result = await tool({});

    expect(textPayload(result).products[0].title).toBe("");
  });
});

describe("search_products", () => {
  function getCallback() {
    return getTool(registerToolsForTest(), "search_products");
  }

  describe("parseProductEvent", () => {
    it("parses price/currency from the price tag and leaves missing price undefined", async () => {
      mockDbPool(() => ({
        rows: [
          makeProductRow({ id: "priced", tags: [["price", "10", "USD"]] }),
          makeProductRow({ id: "unpriced", tags: [] }),
        ],
      }));
      const tool = getCallback();

      const result = await tool({});

      const payload = textPayload(result);
      const priced = payload.products.find((p: any) => p.id === "priced");
      const unpriced = payload.products.find((p: any) => p.id === "unpriced");
      expect(priced).toMatchObject({
        price: 10,
        currency: "USD",
        priceStatus: "known",
      });
      expect(unpriced.price).toBeUndefined();
      expect(unpriced.currency).toBeUndefined();
      expect(unpriced.priceStatus).toBe("missing");
    });

    it("does not coerce malformed or negative prices to zero", async () => {
      mockDbPool(() => ({
        rows: [
          makeProductRow({
            id: "malformed",
            tags: [["price", "not-a-number", "USD"]],
          }),
          makeProductRow({ id: "negative", tags: [["price", "-1", "USD"]] }),
        ],
      }));
      const tool = getCallback();

      const result = await tool({});

      const products = textPayload(result).products;
      for (const product of products) {
        expect(product.price).toBeUndefined();
        expect(product.currency).toBe("USD");
        expect(product.priceStatus).toBe("invalid");
        expect(product.pricing).toBeUndefined();
      }
    });

    it("defaults currency to '' when the price tag has no third (currency) element", async () => {
      mockDbPool(() => ({
        rows: [makeProductRow({ tags: [["price", "10"]] })],
      }));
      const tool = getCallback();

      const result = await tool({});

      expect(textPayload(result).products[0].price).toBe(10);
      expect(textPayload(result).products[0].currency).toBeUndefined();
    });

    it("leaves quantity/price undefined for size/volume/weight tags missing their second element", async () => {
      mockDbPool(() => ({
        rows: [
          makeProductRow({
            tags: [
              ["size", "S"],
              ["volume", "1L"],
              ["weight", "1lb"],
            ],
          }),
        ],
      }));
      const tool = getCallback();

      const result = await tool({});

      const product = textPayload(result).products[0];
      expect(product.sizes).toEqual([{ size: "S", quantity: undefined }]);
      expect(product.volumes).toEqual([{ volume: "1L", price: undefined }]);
      expect(product.weights).toEqual([{ weight: "1lb", price: undefined }]);
    });

    it("parses shipping via parseShippingFromTags + getEffectiveShippingCost", async () => {
      mockDbPool(() => ({
        rows: [
          makeProductRow({
            tags: [
              ["price", "10", "USD"],
              ["shipping", "Added Cost", "5", "USD"],
            ],
          }),
        ],
      }));
      const tool = getCallback();

      const result = await tool({});

      const product = textPayload(result).products[0];
      expect(product.shippingType).toBe("Added Cost");
      expect(product.shippingCost).toBe(5);
      expect(product.pricing).toMatchObject({
        shippingType: "Added Cost",
        shippingCost: 5,
        totalEstimate: 15,
      });
    });

    it("leaves sizes/volumes/weights/bulk undefined (not empty arrays) when no matching tags exist", async () => {
      mockDbPool(() => ({ rows: [makeProductRow({ tags: [] })] }));
      const tool = getCallback();

      const result = await tool({});

      const product = textPayload(result).products[0];
      expect(product.sizes).toBeUndefined();
      expect(product.volumes).toBeUndefined();
      expect(product.weights).toBeUndefined();
      expect(product.bulk).toBeUndefined();
      expect(product.pickupLocations).toBeUndefined();
    });

    it("collects sizes/volumes/weights/bulk/images/categories/pickupLocations from their tags", async () => {
      mockDbPool(() => ({
        rows: [
          makeProductRow({
            tags: [
              ["size", "S", "2"],
              ["size", "M", "3"],
              ["volume", "1L", "5"],
              ["weight", "1lb", "12"],
              ["bulk", "10", "40"],
              ["image", "img1"],
              ["image", "img2"],
              ["t", "dairy"],
              ["t", "farm"],
              ["pickup_location", "123 Farm Rd"],
            ],
          }),
        ],
      }));
      const tool = getCallback();

      const result = await tool({});

      const product = textPayload(result).products[0];
      expect(product.sizes).toEqual([
        { size: "S", quantity: 2 },
        { size: "M", quantity: 3 },
      ]);
      expect(product.volumes).toEqual([{ volume: "1L", price: 5 }]);
      expect(product.weights).toEqual([{ weight: "1lb", price: 12 }]);
      expect(product.bulk).toEqual([{ units: 10, price: 40 }]);
      expect(product.images).toEqual([{ url: "img1" }, { url: "img2" }]);
      expect(product.categories).toEqual(["dairy", "farm"]);
      expect(product.pickupLocations).toEqual(["123 Farm Rd"]);
    });

    it("does not cap tag-bomb images or variants in root MCP", async () => {
      const tags: string[][] = [];
      for (let i = 0; i < 500; i++) {
        tags.push(["image", `image-${i}`]);
        tags.push(["size", `size-${i}`, `${i}`]);
      }
      mockDbPool(() => ({ rows: [makeProductRow({ tags })] }));
      const tool = getCallback();

      const result = await tool({});

      const product = textPayload(result).products[0];
      expect(product.images).toHaveLength(500);
      expect(product.sizes).toHaveLength(500);
      expect(product.images[499]).toEqual({ url: "image-499" });
      expect(product.sizes[499]).toEqual({ size: "size-499", quantity: 499 });
    });

    it("parses quantity as a number, and condition/status as-is", async () => {
      mockDbPool(() => ({
        rows: [
          makeProductRow({
            tags: [
              ["quantity", "5"],
              ["condition", "new"],
              ["status", "active"],
            ],
          }),
        ],
      }));
      const tool = getCallback();

      const result = await tool({});

      const product = textPayload(result).products[0];
      expect(product.quantity).toBe(5);
      expect(product.condition).toBe("new");
      expect(product.status).toBe("active");
    });

    it("requiredCustomerInfo takes the single first-matching tag value, not an array", async () => {
      mockDbPool(() => ({
        rows: [
          makeProductRow({
            tags: [
              ["required_customer_info", "phone"],
              ["required_customer_info", "address"],
            ],
          }),
        ],
      }));
      const tool = getCallback();

      const result = await tool({});

      expect(textPayload(result).products[0].requiredCustomerInfo).toBe(
        "phone"
      );
    });

    it("parses subscription.enabled and subscription.discount from their tags", async () => {
      mockDbPool(() => ({
        rows: [
          makeProductRow({
            tags: [
              ["subscription", "true"],
              ["subscription_discount", "15"],
            ],
          }),
        ],
      }));
      const tool = getCallback();

      const result = await tool({});

      expect(textPayload(result).products[0].subscription).toMatchObject({
        enabled: true,
        discount: 15,
      });
    });

    it("takes subscription frequencies only from the first subscription_frequency tag, not aggregated across multiple tags", async () => {
      mockDbPool(() => ({
        rows: [
          makeProductRow({
            tags: [
              ["subscription_frequency", "weekly", "monthly"],
              ["subscription_frequency", "yearly"],
            ],
          }),
        ],
      }));
      const tool = getCallback();

      const result = await tool({});

      expect(textPayload(result).products[0].subscription.frequencies).toEqual([
        "weekly",
        "monthly",
      ]);
    });
  });

  describe("filters", () => {
    function twoProducts() {
      return [
        makeProductRow({
          id: "milk",
          created_at: 1_700_000_100,
          tags: [
            ["title", "Raw Milk"],
            ["summary", "Fresh from the farm"],
            ["price", "10", "USD"],
            ["location", "Vermont"],
            ["t", "dairy"],
          ],
        }),
        makeProductRow({
          id: "honey",
          created_at: 1_700_000_200,
          tags: [
            ["title", "Wildflower Honey"],
            ["summary", "Locally sourced"],
            ["price", "20", "EUR"],
            ["location", "Oregon"],
            ["t", "sweetener"],
          ],
        }),
      ];
    }

    it("keyword matches case-insensitively against title OR summary", async () => {
      mockDbPool(() => ({ rows: twoProducts() }));
      const tool = getCallback();

      const byTitle = await tool({ keyword: "MILK" });
      expect(textPayload(byTitle).products.map((p: any) => p.id)).toEqual([
        "milk",
      ]);
    });

    it("category matches case-insensitively against any category tag", async () => {
      mockDbPool(() => ({ rows: twoProducts() }));
      const tool = getCallback();

      const result = await tool({ category: "DAIRY" });

      expect(textPayload(result).products.map((p: any) => p.id)).toEqual([
        "milk",
      ]);
    });

    it("location matches as a case-insensitive substring", async () => {
      mockDbPool(() => ({ rows: twoProducts() }));
      const tool = getCallback();

      const result = await tool({ location: "verm" });

      expect(textPayload(result).products.map((p: any) => p.id)).toEqual([
        "milk",
      ]);
    });

    it("currency matches exactly, case-insensitively", async () => {
      mockDbPool(() => ({ rows: twoProducts() }));
      const tool = getCallback();

      const result = await tool({ currency: "eur" });

      expect(textPayload(result).products.map((p: any) => p.id)).toEqual([
        "honey",
      ]);
    });

    it("minPrice/maxPrice are inclusive bounds", async () => {
      mockDbPool(() => ({ rows: twoProducts() }));
      const tool = getCallback();

      const atMin = await tool({ minPrice: 10, maxPrice: 10 });
      expect(textPayload(atMin).products.map((p: any) => p.id)).toEqual([
        "milk",
      ]);

      const range = await tool({ minPrice: 10, maxPrice: 20 });
      expect(
        textPayload(range)
          .products.map((p: any) => p.id)
          .sort()
      ).toEqual(["honey", "milk"]);
    });

    it("limit truncates the result set after all other filters apply", async () => {
      mockDbPool(() => ({ rows: twoProducts() }));
      const tool = getCallback();

      const result = await tool({ limit: 1 });

      expect(textPayload(result).products).toHaveLength(1);
    });

    it("combines multiple filters with AND semantics", async () => {
      mockDbPool(() => ({ rows: twoProducts() }));
      const tool = getCallback();

      const result = await tool({ keyword: "milk", currency: "EUR" });

      expect(textPayload(result).products).toHaveLength(0);
    });

    it("returns dataFreshness as the max createdAt across returned products, ISO-formatted", async () => {
      mockDbPool(() => ({ rows: twoProducts() }));
      const tool = getCallback();

      const result = await tool({});

      expect(textPayload(result)._meta.dataFreshness).toBe(
        new Date(1_700_000_200 * 1000).toISOString()
      );
    });

    it("ignores a product with createdAt=0 when computing dataFreshness, rather than treating it as the max", async () => {
      mockDbPool(() => ({
        rows: [
          makeProductRow({ id: "zero", created_at: 0 }),
          makeProductRow({ id: "real", created_at: 1_700_000_100 }),
        ],
      }));
      const tool = getCallback();

      const result = await tool({});

      expect(textPayload(result)._meta.dataFreshness).toBe(
        new Date(1_700_000_100 * 1000).toISOString()
      );
    });
  });

  describe("DB errors", () => {
    it("returns TIMEOUT when the query exceeds DB_TIMEOUT_MS", async () => {
      jest.useFakeTimers();
      try {
        mockDbPool(() => new Promise(() => {}));
        const tool = getCallback();

        const resultPromise = tool({});
        await jest.advanceTimersByTimeAsync(15_000);
        const result = await resultPromise;

        const payload = textPayload(result);
        expect(result.isError).toBe(true);
        expect(payload).toMatchObject({
          error: "DB fetch timed out",
          code: "TIMEOUT",
        });
      } finally {
        jest.useRealTimers();
      }
    });

    it("dbError falls back to 'DB fetch failed' when a non-Error value is thrown (shared across all tools)", async () => {
      mockDbPool(() => {
        throw "raw failure";
      });
      const tool = getCallback();

      const result = await tool({});

      const payload = textPayload(result);
      expect(result.isError).toBe(true);
      expect(payload).toMatchObject({
        error: "DB fetch failed",
        code: "DB_ERROR",
      });
    });

    it("does not attempt to release a client when pool.connect itself rejects", async () => {
      const release = jest.fn();
      const connect = jest.fn().mockRejectedValue(new Error("pool exhausted"));
      jest.mocked(getDbPool).mockReturnValue({ connect } as any);
      const tool = getCallback();

      const result = await tool({});

      expect(release).not.toHaveBeenCalled();
      expect(result.isError).toBe(true);
      expect(textPayload(result).code).toBe("DB_ERROR");
    });
  });
});

describe("get_product_details", () => {
  function getCallback() {
    return getTool(registerToolsForTest(), "get_product_details");
  }

  it("returns the parsed product spread at the top level with _meta.resultCount=1 when the id matches", async () => {
    mockDbPool(() => ({
      rows: [
        makeProductRow({ id: "product-1", tags: [["title", "Raw Milk"]] }),
        makeProductRow({ id: "product-2", tags: [["title", "Honey"]] }),
      ],
    }));
    const tool = getCallback();

    const result = await tool({ productId: "product-1" });

    const payload = textPayload(result);
    expect(payload.id).toBe("product-1");
    expect(payload.title).toBe("Raw Milk");
    expect(payload._meta.resultCount).toBe(1);
  });

  it("returns 'Product not found' (isError) when no event matches productId", async () => {
    mockDbPool(() => ({ rows: [makeProductRow({ id: "product-1" })] }));
    const tool = getCallback();

    const result = await tool({ productId: "unknown-id" });

    expect(result.isError).toBe(true);
    expect(textPayload(result).error).toBe("Product not found");
  });

  it("returns dataFreshness derived from the single product's own createdAt", async () => {
    mockDbPool(() => ({
      rows: [makeProductRow({ id: "product-1", created_at: 1_700_000_000 })],
    }));
    const tool = getCallback();

    const result = await tool({ productId: "product-1" });

    expect(textPayload(result)._meta.dataFreshness).toBe(
      new Date(1_700_000_000 * 1000).toISOString()
    );
  });

  it("returns dataFreshness=null when createdAt is falsy (e.g. 0)", async () => {
    mockDbPool(() => ({
      rows: [makeProductRow({ id: "product-1", created_at: 0 })],
    }));
    const tool = getCallback();

    const result = await tool({ productId: "product-1" });

    expect(textPayload(result)._meta.dataFreshness).toBeNull();
  });

  it("returns DB_ERROR and releases the client when the query rejects", async () => {
    const { release } = mockDbPool(() => {
      throw new Error("database offline");
    });
    const tool = getCallback();

    const result = await tool({ productId: "product-1" });

    expect(result.isError).toBe(true);
    expect(textPayload(result)).toMatchObject({
      error: "DB fetch failed",
      code: "DB_ERROR",
    });
    expect(release).toHaveBeenCalledTimes(1);
  });
});

describe("list_companies", () => {
  function getCallback() {
    return getTool(registerToolsForTest(), "list_companies");
  }

  it("includes only kind:30019 shop profiles, excluding kind:0 user-only profiles", async () => {
    mockDbPool(() => ({
      rows: [
        makeProfileRow({ id: "shop-1", kind: 30019 }),
        makeProfileRow({ id: "user-1", kind: 0 }),
      ],
    }));
    const tool = getCallback();

    const result = await tool({});

    const payload = textPayload(result);
    expect(payload.count).toBe(1);
    expect(payload.companies).toHaveLength(1);
    expect(payload.companies[0].pubkey).toBe(TEST_PUBKEY);
  });

  it("parses shop-specific fields via parseProfileEvent, including a derived storefrontUrl", async () => {
    mockDbPool(() => ({
      rows: [
        makeProfileRow({
          kind: 30019,
          content: {
            name: "Fresh Farm",
            paymentMethodDiscounts: { bitcoin: 5 },
            freeShippingThreshold: 50,
            freeShippingCurrency: "USD",
            storefront: { shopSlug: "fresh-farm" },
          },
        }),
      ],
    }));
    const tool = getCallback();

    const result = await tool({});

    expect(textPayload(result).companies[0]).toMatchObject({
      name: "Fresh Farm",
      paymentMethodDiscounts: { bitcoin: 5 },
      freeShippingThreshold: 50,
      freeShippingCurrency: "USD",
      storefront: { shopSlug: "fresh-farm" },
      storefrontUrl: "/shop/fresh-farm",
    });
  });

  it("omits storefrontUrl when storefront is present but has no shopSlug", async () => {
    mockDbPool(() => ({
      rows: [makeProfileRow({ kind: 30019, content: { storefront: {} } })],
    }));
    const tool = getCallback();

    const result = await tool({});

    const company = textPayload(result).companies[0];
    expect(company.storefront).toEqual({});
    expect(company.storefrontUrl).toBeUndefined();
  });

  it("falls back to an empty profile object when content is malformed JSON, rather than throwing", async () => {
    // makeProfileRow always JSON.stringifies its content, so build this row
    // by hand to get genuinely malformed JSON in the content column.
    mockDbPool(() => ({
      rows: [
        {
          id: "profile-1",
          pubkey: TEST_PUBKEY,
          created_at: 1_700_000_000,
          kind: 30019,
          tags: [],
          content: "{not valid json",
          sig: "sig",
        },
      ],
    }));
    const tool = getCallback();

    const result = await tool({});

    expect(textPayload(result).companies[0]).toMatchObject({ name: "" });
  });

  it("applies limit after filtering to shop profiles", async () => {
    mockDbPool(() => ({
      rows: [
        makeProfileRow({ id: "shop-1", kind: 30019 }),
        makeProfileRow({ id: "shop-2", kind: 30019 }),
        makeProfileRow({ id: "user-1", kind: 0 }),
      ],
    }));
    const tool = getCallback();

    const result = await tool({ limit: 1 });

    expect(textPayload(result).companies).toHaveLength(1);
  });

  it("computes dataFreshness from the returned (post-limit) set", async () => {
    mockDbPool(() => ({
      rows: [
        makeProfileRow({
          id: "shop-1",
          kind: 30019,
          created_at: 1_700_000_100,
        }),
        makeProfileRow({
          id: "shop-2",
          kind: 30019,
          created_at: 1_700_000_200,
        }),
      ],
    }));
    const tool = getCallback();

    const result = await tool({});

    expect(textPayload(result)._meta.dataFreshness).toBe(
      new Date(1_700_000_200 * 1000).toISOString()
    );
  });

  it("ignores a company with createdAt=0 when computing dataFreshness, rather than treating it as the max", async () => {
    mockDbPool(() => ({
      rows: [
        makeProfileRow({ id: "zero", kind: 30019, created_at: 0 }),
        makeProfileRow({ id: "real", kind: 30019, created_at: 1_700_000_100 }),
      ],
    }));
    const tool = getCallback();

    const result = await tool({});

    expect(textPayload(result)._meta.dataFreshness).toBe(
      new Date(1_700_000_100 * 1000).toISOString()
    );
  });

  it("returns an empty companies array and dataFreshness=null (not an error) when no shop profiles exist", async () => {
    mockDbPool(() => ({ rows: [makeProfileRow({ kind: 0 })] }));
    const tool = getCallback();

    const result = await tool({});

    const payload = textPayload(result);
    expect(result.isError).toBeUndefined();
    expect(payload).toMatchObject({ count: 0, companies: [] });
    expect(payload._meta.dataFreshness).toBeNull();
  });

  it("returns DB_ERROR and releases the client when the query rejects", async () => {
    const { release } = mockDbPool(() => {
      throw new Error("database offline");
    });
    const tool = getCallback();

    const result = await tool({});

    expect(result.isError).toBe(true);
    expect(textPayload(result)).toMatchObject({
      error: "DB fetch failed",
      code: "DB_ERROR",
    });
    expect(release).toHaveBeenCalledTimes(1);
  });

  it("does not attempt to release a client when pool.connect itself rejects", async () => {
    const release = jest.fn();
    const connect = jest.fn().mockRejectedValue(new Error("pool exhausted"));
    jest.mocked(getDbPool).mockReturnValue({ connect } as any);
    const tool = getCallback();

    const result = await tool({});

    expect(release).not.toHaveBeenCalled();
    expect(result.isError).toBe(true);
    expect(textPayload(result).code).toBe("DB_ERROR");
  });
});

describe("get_company_details", () => {
  function getCallback() {
    return getTool(registerToolsForTest(), "get_company_details");
  }

  it("combines shopProfile (kind 30019) and userProfile (kind 0) for the same pubkey", async () => {
    mockMultiTableDbPool({
      profile_events: [
        makeProfileRow({ kind: 30019, content: { name: "Fresh Farm Shop" } }),
        makeProfileRow({ kind: 0, content: { name: "Alice" } }),
      ],
    });
    const tool = getCallback();

    const result = await tool({ pubkey: TEST_PUBKEY });

    const payload = textPayload(result);
    expect(payload.shopProfile).toMatchObject({ name: "Fresh Farm Shop" });
    expect(payload.userProfile).toMatchObject({ name: "Alice" });
  });

  it("parses kind:0-only fields (website, fiat_options, payment_preference) onto the userProfile", async () => {
    mockMultiTableDbPool({
      profile_events: [
        makeProfileRow({
          kind: 0,
          content: {
            name: "Alice",
            website: "https://example.com",
            fiat_options: { venmo: "alice-v" },
            payment_preference: "lightning",
          },
        }),
      ],
    });
    const tool = getCallback();

    const result = await tool({ pubkey: TEST_PUBKEY });

    expect(textPayload(result).userProfile).toMatchObject({
      website: "https://example.com",
      fiat_options: { venmo: "alice-v" },
      payment_preference: "lightning",
    });
  });

  it("returns 'Company not found' when neither profile kind exists for this pubkey, even if products/reviews do", async () => {
    mockMultiTableDbPool({
      profile_events: [makeProfileRow({ pubkey: "someone-else", kind: 30019 })],
      product_events: [makeProductRow({ pubkey: TEST_PUBKEY })],
      review_events: [makeReviewRow({ tags: [["d", `${TEST_PUBKEY}:x`]] })],
    });
    const tool = getCallback();

    const result = await tool({ pubkey: TEST_PUBKEY });

    expect(result.isError).toBe(true);
    expect(textPayload(result).error).toBe("Company not found");
  });

  it("scopes products and reviews to the requested pubkey", async () => {
    mockMultiTableDbPool({
      profile_events: [makeProfileRow({ kind: 30019 })],
      product_events: [
        makeProductRow({ id: "mine", pubkey: TEST_PUBKEY }),
        makeProductRow({ id: "theirs", pubkey: "someone-else" }),
      ],
      review_events: [
        makeReviewRow({ id: "review-mine", tags: [["d", `${TEST_PUBKEY}:x`]] }),
        makeReviewRow({ id: "review-theirs", tags: [["d", "someone-else:x"]] }),
      ],
    });
    const tool = getCallback();

    const result = await tool({ pubkey: TEST_PUBKEY });

    const payload = textPayload(result);
    expect(payload.products.items.map((p: any) => p.id)).toEqual(["mine"]);
    expect(payload.reviews.items.map((r: any) => r.id)).toEqual([
      "review-mine",
    ]);
  });

  it("matches reviews whose d tag contains the pubkey, not just an exact match", async () => {
    mockMultiTableDbPool({
      profile_events: [makeProfileRow({ kind: 30019 })],
      review_events: [
        makeReviewRow({
          id: "product-review",
          tags: [["d", `${TEST_PUBKEY}:product-abc`]],
        }),
      ],
    });
    const tool = getCallback();

    const result = await tool({ pubkey: TEST_PUBKEY });

    expect(textPayload(result).reviews.items[0].id).toBe("product-review");
  });

  it("parses rating tags into the review's ratings map, keyed by category", async () => {
    mockMultiTableDbPool({
      profile_events: [makeProfileRow({ kind: 30019 })],
      review_events: [
        makeReviewRow({
          tags: [
            ["d", `${TEST_PUBKEY}:x`],
            ["rating", "5", "quality"],
            ["rating", "4", "shipping"],
          ],
        }),
      ],
    });
    const tool = getCallback();

    const result = await tool({ pubkey: TEST_PUBKEY });

    expect(textPayload(result).reviews.items[0].ratings).toEqual({
      quality: 5,
      shipping: 4,
    });
  });

  it("skips a rating tag that is missing its category (third) element", async () => {
    mockMultiTableDbPool({
      profile_events: [makeProfileRow({ kind: 30019 })],
      review_events: [
        makeReviewRow({
          tags: [
            ["d", `${TEST_PUBKEY}:x`],
            ["rating", "5"],
            ["rating", "4", "shipping"],
          ],
        }),
      ],
    });
    const tool = getCallback();

    const result = await tool({ pubkey: TEST_PUBKEY });

    expect(textPayload(result).reviews.items[0].ratings).toEqual({
      shipping: 4,
    });
  });

  it("attaches pricing with acceptedPaymentMethods=[lightning, cashu] to every product", async () => {
    mockMultiTableDbPool({
      profile_events: [makeProfileRow({ kind: 30019 })],
      product_events: [
        makeProductRow({ pubkey: TEST_PUBKEY, tags: [["price", "10", "USD"]] }),
      ],
    });
    const tool = getCallback();

    const result = await tool({ pubkey: TEST_PUBKEY });

    const payload = textPayload(result);
    expect(payload.paymentInfo.acceptedPaymentMethods).toEqual([
      "lightning",
      "cashu",
    ]);
    expect(payload.products.items[0].pricing.paymentMethods).toEqual([
      "lightning",
      "cashu",
    ]);
  });

  it("computes priceRange as null when no products have price > 0", async () => {
    mockMultiTableDbPool({
      profile_events: [makeProfileRow({ kind: 30019 })],
      product_events: [makeProductRow({ pubkey: TEST_PUBKEY, tags: [] })],
    });
    const tool = getCallback();

    const result = await tool({ pubkey: TEST_PUBKEY });

    expect(textPayload(result).paymentInfo.priceRange).toBeNull();
  });

  it("computes priceRange min/max/currency from priced products", async () => {
    mockMultiTableDbPool({
      profile_events: [makeProfileRow({ kind: 30019 })],
      product_events: [
        makeProductRow({
          id: "cheap",
          pubkey: TEST_PUBKEY,
          tags: [["price", "5", "USD"]],
        }),
        makeProductRow({
          id: "pricey",
          pubkey: TEST_PUBKEY,
          tags: [["price", "50", "USD"]],
        }),
      ],
    });
    const tool = getCallback();

    const result = await tool({ pubkey: TEST_PUBKEY });

    expect(textPayload(result).paymentInfo.priceRange).toEqual({
      min: 5,
      max: 50,
      currency: "USD",
    });
  });

  it("falls back to 'sats' for priceRange.currency when the first product has no currency", async () => {
    mockMultiTableDbPool({
      profile_events: [makeProfileRow({ kind: 30019 })],
      product_events: [
        makeProductRow({ pubkey: TEST_PUBKEY, tags: [["price", "5"]] }),
      ],
    });
    const tool = getCallback();

    const result = await tool({ pubkey: TEST_PUBKEY });

    expect(textPayload(result).paymentInfo.priceRange.currency).toBe("sats");
  });

  it("counts freeShippingProducts only for shippingType 'Free' or 'Free/Pickup'", async () => {
    mockMultiTableDbPool({
      profile_events: [makeProfileRow({ kind: 30019 })],
      product_events: [
        makeProductRow({
          id: "free",
          pubkey: TEST_PUBKEY,
          tags: [["shipping", "Free", "0", "USD"]],
        }),
        makeProductRow({
          id: "free-pickup",
          pubkey: TEST_PUBKEY,
          tags: [["shipping", "Free/Pickup", "0", "USD"]],
        }),
        makeProductRow({
          id: "paid",
          pubkey: TEST_PUBKEY,
          tags: [["shipping", "Added Cost", "5", "USD"]],
        }),
      ],
    });
    const tool = getCallback();

    const result = await tool({ pubkey: TEST_PUBKEY });

    const payload = textPayload(result);
    expect(payload.paymentInfo.freeShippingAvailable).toBe(true);
    expect(payload.paymentInfo.freeShippingProductCount).toBe(2);
  });

  it("computes dataFreshness as the max createdAt across products AND reviews", async () => {
    mockMultiTableDbPool({
      profile_events: [makeProfileRow({ kind: 30019 })],
      product_events: [
        makeProductRow({ pubkey: TEST_PUBKEY, created_at: 1_700_000_100 }),
      ],
      review_events: [
        makeReviewRow({
          tags: [["d", `${TEST_PUBKEY}:x`]],
          created_at: 1_700_000_300,
        }),
      ],
    });
    const tool = getCallback();

    const result = await tool({ pubkey: TEST_PUBKEY });

    expect(textPayload(result)._meta.dataFreshness).toBe(
      new Date(1_700_000_300 * 1000).toISOString()
    );
  });

  it("treats a product or review with createdAt=0 as contributing 0 (not NaN) to dataFreshness", async () => {
    mockMultiTableDbPool({
      profile_events: [makeProfileRow({ kind: 30019 })],
      product_events: [makeProductRow({ pubkey: TEST_PUBKEY, created_at: 0 })],
      review_events: [
        makeReviewRow({
          tags: [["d", `${TEST_PUBKEY}:x`]],
          created_at: 0,
        }),
      ],
    });
    const tool = getCallback();

    const result = await tool({ pubkey: TEST_PUBKEY });

    expect(textPayload(result)._meta.dataFreshness).toBeNull();
  });

  it("returns DB_ERROR when the combined Promise.all rejects (e.g. one of the three queries fails)", async () => {
    const query = jest.fn().mockImplementation((sql: string) => {
      if (sql.includes("review_events")) {
        throw new Error("reviews table offline");
      }
      return { rows: [] };
    });
    const release = jest.fn();
    const connect = jest.fn().mockResolvedValue({ query, release });
    jest.mocked(getDbPool).mockReturnValue({ connect } as any);
    const tool = getCallback();

    const result = await tool({ pubkey: TEST_PUBKEY });

    expect(result.isError).toBe(true);
    expect(textPayload(result)).toMatchObject({
      error: "DB fetch failed",
      code: "DB_ERROR",
    });
  });
});

describe("get_reviews", () => {
  function getCallback() {
    return getTool(registerToolsForTest(), "get_reviews");
  }

  it("returns a validation error when neither productId nor sellerPubkey is provided, without querying the db", async () => {
    const { query } = mockDbPool(() => ({ rows: [] }));
    const tool = getCallback();

    const result = await tool({});

    expect(result.isError).toBe(true);
    expect(textPayload(result).error).toBe(
      "Either productId or sellerPubkey is required"
    );
    expect(query).not.toHaveBeenCalled();
  });

  it("filters to reviews whose d tag contains productId when only productId is given", async () => {
    mockDbPool(() => ({
      rows: [
        makeReviewRow({
          id: "for-product",
          tags: [["d", `seller-a:product-123`]],
        }),
        makeReviewRow({
          id: "for-other-product",
          tags: [["d", `seller-a:product-999`]],
        }),
      ],
    }));
    const tool = getCallback();

    const result = await tool({ productId: "product-123" });

    expect(textPayload(result).reviews.map((r: any) => r.id)).toEqual([
      "for-product",
    ]);
  });

  it("filters to reviews whose d tag contains sellerPubkey when only sellerPubkey is given", async () => {
    mockDbPool(() => ({
      rows: [
        makeReviewRow({ id: "for-seller", tags: [["d", `${TEST_PUBKEY}:x`]] }),
        makeReviewRow({
          id: "for-other-seller",
          tags: [["d", "someone-else:x"]],
        }),
      ],
    }));
    const tool = getCallback();

    const result = await tool({ sellerPubkey: TEST_PUBKEY });

    expect(textPayload(result).reviews.map((r: any) => r.id)).toEqual([
      "for-seller",
    ]);
  });

  it("applies both filters (AND) when both productId and sellerPubkey are given", async () => {
    mockDbPool(() => ({
      rows: [
        makeReviewRow({
          id: "matches-both",
          tags: [["d", `${TEST_PUBKEY}:product-123`]],
        }),
        makeReviewRow({
          id: "wrong-product",
          tags: [["d", `${TEST_PUBKEY}:product-999`]],
        }),
        makeReviewRow({
          id: "wrong-seller",
          tags: [["d", `someone-else:product-123`]],
        }),
      ],
    }));
    const tool = getCallback();

    const result = await tool({
      productId: "product-123",
      sellerPubkey: TEST_PUBKEY,
    });

    expect(textPayload(result).reviews.map((r: any) => r.id)).toEqual([
      "matches-both",
    ]);
  });

  it("computes dataFreshness from the filtered result set", async () => {
    mockDbPool(() => ({
      rows: [
        makeReviewRow({
          tags: [["d", `${TEST_PUBKEY}:x`]],
          created_at: 1_700_000_100,
        }),
        makeReviewRow({
          tags: [["d", "someone-else:x"]],
          created_at: 1_700_000_900,
        }),
      ],
    }));
    const tool = getCallback();

    const result = await tool({ sellerPubkey: TEST_PUBKEY });

    // The someone-else review is filtered out, so freshness should reflect
    // only the surviving TEST_PUBKEY review, not the later unfiltered one.
    expect(textPayload(result)._meta.dataFreshness).toBe(
      new Date(1_700_000_100 * 1000).toISOString()
    );
  });

  it("ignores a review with createdAt=0 when computing dataFreshness, rather than treating it as the max", async () => {
    mockDbPool(() => ({
      rows: [
        makeReviewRow({
          id: "zero",
          tags: [["d", `${TEST_PUBKEY}:x`]],
          created_at: 0,
        }),
        makeReviewRow({
          id: "real",
          tags: [["d", `${TEST_PUBKEY}:y`]],
          created_at: 1_700_000_100,
        }),
      ],
    }));
    const tool = getCallback();

    const result = await tool({ sellerPubkey: TEST_PUBKEY });

    expect(textPayload(result)._meta.dataFreshness).toBe(
      new Date(1_700_000_100 * 1000).toISOString()
    );
  });

  it("returns dataFreshness=null when the filtered result set is empty", async () => {
    mockDbPool(() => ({
      rows: [makeReviewRow({ tags: [["d", "someone-else:x"]] })],
    }));
    const tool = getCallback();

    const result = await tool({ sellerPubkey: TEST_PUBKEY });

    const payload = textPayload(result);
    expect(payload.reviews).toEqual([]);
    expect(payload._meta.dataFreshness).toBeNull();
  });

  it("returns DB_ERROR and releases the client when the query rejects", async () => {
    const { release } = mockDbPool(() => {
      throw new Error("database offline");
    });
    const tool = getCallback();

    const result = await tool({ sellerPubkey: TEST_PUBKEY });

    expect(result.isError).toBe(true);
    expect(textPayload(result)).toMatchObject({
      error: "DB fetch failed",
      code: "DB_ERROR",
    });
    expect(release).toHaveBeenCalledTimes(1);
  });

  it("does not attempt to release a client when pool.connect itself rejects", async () => {
    const release = jest.fn();
    const connect = jest.fn().mockRejectedValue(new Error("pool exhausted"));
    jest.mocked(getDbPool).mockReturnValue({ connect } as any);
    const tool = getCallback();

    const result = await tool({ sellerPubkey: TEST_PUBKEY });

    expect(release).not.toHaveBeenCalled();
    expect(result.isError).toBe(true);
    expect(textPayload(result).code).toBe("DB_ERROR");
  });
});

describe("check_discount_code", () => {
  function getCallback() {
    return getTool(registerToolsForTest(), "check_discount_code");
  }

  const FAR_FUTURE = Math.floor(Date.now() / 1000) + 1_000_000;
  const FAR_PAST = Math.floor(Date.now() / 1000) - 1_000_000;

  it("returns {valid:true, discount_percentage} for a code within its expiration", async () => {
    mockDbPool(() => ({
      rows: [{ discount_percentage: 20, expiration: FAR_FUTURE }],
    }));
    const tool = getCallback();

    const result = await tool({ code: "SUMMER20", sellerPubkey: TEST_PUBKEY });

    const payload = textPayload(result);
    expect(payload.valid).toBe(true);
    expect(payload.discount_percentage).toBe(20);
    expect(payload._meta.resultCount).toBe(1);
  });

  it("returns {valid:true, discount_percentage} for a code with no expiration (permanent)", async () => {
    mockDbPool(() => ({
      rows: [{ discount_percentage: 10, expiration: null }],
    }));
    const tool = getCallback();

    const result = await tool({ code: "FOREVER", sellerPubkey: TEST_PUBKEY });

    expect(textPayload(result)).toMatchObject({
      valid: true,
      discount_percentage: 10,
    });
  });

  it("returns {valid:false} (no discount_percentage) for an unknown code", async () => {
    mockDbPool(() => ({ rows: [] }));
    const tool = getCallback();

    const result = await tool({ code: "UNKNOWN", sellerPubkey: TEST_PUBKEY });

    const payload = textPayload(result);
    expect(payload.valid).toBe(false);
    expect(payload.discount_percentage).toBeUndefined();
  });

  it("returns {valid:false} for a code that has expired, even though the row still exists", async () => {
    mockDbPool(() => ({
      rows: [{ discount_percentage: 20, expiration: FAR_PAST }],
    }));
    const tool = getCallback();

    const result = await tool({ code: "EXPIRED10", sellerPubkey: TEST_PUBKEY });

    expect(textPayload(result).valid).toBe(false);
  });

  it("scopes the lookup to code AND pubkey via query params", async () => {
    const { query } = mockDbPool(() => ({ rows: [] }));
    const tool = getCallback();

    await tool({ code: "SUMMER20", sellerPubkey: TEST_PUBKEY });

    expect(query).toHaveBeenCalledWith(
      expect.stringContaining("SELECT discount_percentage, expiration"),
      ["SUMMER20", TEST_PUBKEY]
    );
  });

  it("returns DB_ERROR and releases the client when the query rejects", async () => {
    const { release } = mockDbPool(() => {
      throw new Error("database offline");
    });
    const tool = getCallback();

    const result = await tool({ code: "SUMMER20", sellerPubkey: TEST_PUBKEY });

    expect(result.isError).toBe(true);
    expect(textPayload(result)).toMatchObject({
      error: "DB fetch failed",
      code: "DB_ERROR",
    });
    expect(release).toHaveBeenCalledTimes(1);
  });

  it("does not attempt to release a client when pool.connect itself rejects", async () => {
    const release = jest.fn();
    const connect = jest.fn().mockRejectedValue(new Error("pool exhausted"));
    jest.mocked(getDbPool).mockReturnValue({ connect } as any);
    const tool = getCallback();

    const result = await tool({ code: "SUMMER20", sellerPubkey: TEST_PUBKEY });

    expect(release).not.toHaveBeenCalled();
    expect(result.isError).toBe(true);
    expect(textPayload(result).code).toBe("DB_ERROR");
  });
});

describe("get_storefront", () => {
  function getCallback() {
    return getTool(registerToolsForTest(), "get_storefront");
  }

  it("returns a validation error when neither slug nor pubkey is provided, without querying the db", async () => {
    const { poolQuery, connect } = mockStorefrontDbPool();
    const tool = getCallback();

    const result = await tool({});

    expect(result.isError).toBe(true);
    expect(textPayload(result).error).toBe("Either slug or pubkey is required");
    expect(poolQuery).not.toHaveBeenCalled();
    expect(connect).not.toHaveBeenCalled();
  });

  it("resolves slug to pubkey via shop_slugs, lowercased", async () => {
    const { poolQuery } = mockStorefrontDbPool({
      slugRows: [{ pubkey: TEST_PUBKEY }],
      profiles: [makeProfileRow({ kind: 30019 })],
    });
    const tool = getCallback();

    const result = await tool({ slug: "Fresh-Farm" });

    expect(poolQuery).toHaveBeenCalledWith(
      expect.stringContaining("SELECT pubkey FROM shop_slugs"),
      ["fresh-farm"]
    );
    expect(textPayload(result).pubkey).toBe(TEST_PUBKEY);
  });

  it("skips the shop_slugs lookup entirely when pubkey is provided directly", async () => {
    const { poolQuery } = mockStorefrontDbPool({
      profiles: [makeProfileRow({ kind: 30019 })],
    });
    const tool = getCallback();

    await tool({ pubkey: TEST_PUBKEY });

    expect(poolQuery).not.toHaveBeenCalledWith(
      expect.stringContaining("shop_slugs"),
      expect.anything()
    );
  });

  it("returns \"Shop with slug '...' not found\" when the slug has no match", async () => {
    mockStorefrontDbPool({ slugRows: [] });
    const tool = getCallback();

    const result = await tool({ slug: "no-such-shop" });

    expect(result.isError).toBe(true);
    expect(textPayload(result).error).toBe(
      "Shop with slug 'no-such-shop' not found"
    );
  });

  it("returns 'Seller not found' when the resolved pubkey has neither shop nor user profile", async () => {
    mockStorefrontDbPool({
      profiles: [makeProfileRow({ pubkey: "someone-else", kind: 30019 })],
    });
    const tool = getCallback();

    const result = await tool({ pubkey: TEST_PUBKEY });

    expect(result.isError).toBe(true);
    expect(textPayload(result).error).toBe("Seller not found");
  });

  it("resolves successfully from a kind:0 user profile alone, with shopProfile null", async () => {
    mockStorefrontDbPool({
      profiles: [
        makeProfileRow({ kind: 0, content: { name: "Alice the Farmer" } }),
      ],
    });
    const tool = getCallback();

    const result = await tool({ pubkey: TEST_PUBKEY });

    const payload = textPayload(result);
    expect(result.isError).toBeUndefined();
    expect(payload.shopProfile).toBeNull();
    expect(payload.userProfile).toMatchObject({ name: "Alice the Farmer" });
  });

  it("computes storefrontUrl from storefront.shopSlug when present, else null", async () => {
    mockStorefrontDbPool({
      profiles: [
        makeProfileRow({
          kind: 30019,
          content: { storefront: { shopSlug: "fresh-farm" } },
        }),
      ],
    });
    const tool = getCallback();

    const withSlug = await tool({ pubkey: TEST_PUBKEY });
    expect(textPayload(withSlug).storefront.storefrontUrl).toBe(
      "/shop/fresh-farm"
    );

    mockStorefrontDbPool({
      profiles: [makeProfileRow({ kind: 30019, content: {} })],
    });
    const withoutSlug = await getCallback()({ pubkey: TEST_PUBKEY });
    expect(textPayload(withoutSlug).storefront.storefrontUrl).toBeNull();
  });

  it("populates customDomain from custom_domains when a row exists, else null", async () => {
    mockStorefrontDbPool({
      profiles: [makeProfileRow({ kind: 30019 })],
      domainRows: [{ domain: "shop.example.com", verified: true }],
    });
    const tool = getCallback();

    const result = await tool({ pubkey: TEST_PUBKEY });

    expect(textPayload(result).storefront.customDomain).toEqual({
      domain: "shop.example.com",
      verified: true,
    });
  });

  it("customDomain is null when no custom_domains row exists", async () => {
    mockStorefrontDbPool({
      profiles: [makeProfileRow({ kind: 30019 })],
      domainRows: [],
    });
    const tool = getCallback();

    const result = await tool({ pubkey: TEST_PUBKEY });

    expect(textPayload(result).storefront.customDomain).toBeNull();
  });

  it("attaches pricing (lightning+cashu always) to every returned product", async () => {
    mockStorefrontDbPool({
      profiles: [makeProfileRow({ kind: 30019 })],
      products: [
        makeProductRow({ pubkey: TEST_PUBKEY, tags: [["price", "10", "USD"]] }),
      ],
    });
    const tool = getCallback();

    const result = await tool({ pubkey: TEST_PUBKEY });

    const payload = textPayload(result);
    expect(payload.products.count).toBe(1);
    expect(payload.products.items[0].pricing.paymentMethods).toEqual([
      "lightning",
      "cashu",
    ]);
    expect(payload.paymentInfo.acceptedPaymentMethods).toEqual([
      "lightning",
      "cashu",
    ]);
  });

  it("returns DB_ERROR when the shop_slugs lookup fails", async () => {
    mockStorefrontDbPool({
      slugQueryImpl: () => {
        throw new Error("slug table offline");
      },
    });
    const tool = getCallback();

    const result = await tool({ slug: "fresh-farm" });

    expect(result.isError).toBe(true);
    expect(textPayload(result)).toMatchObject({
      error: "DB fetch failed",
      code: "DB_ERROR",
    });
  });

  it("returns DB_ERROR when the profiles+products Promise.all fails", async () => {
    const { connectQuery } = mockStorefrontDbPool();
    connectQuery.mockImplementation((sql: string) => {
      if (sql.includes("product_events")) {
        throw new Error("products table offline");
      }
      return { rows: [] };
    });
    const tool = getCallback();

    const result = await tool({ pubkey: TEST_PUBKEY });

    expect(result.isError).toBe(true);
    expect(textPayload(result)).toMatchObject({
      error: "DB fetch failed",
      code: "DB_ERROR",
    });
  });

  it("returns DB_ERROR when the custom_domains lookup fails", async () => {
    mockStorefrontDbPool({
      profiles: [makeProfileRow({ kind: 30019 })],
      domainQueryImpl: () => {
        throw new Error("domains table offline");
      },
    });
    const tool = getCallback();

    const result = await tool({ pubkey: TEST_PUBKEY });

    expect(result.isError).toBe(true);
    expect(textPayload(result)).toMatchObject({
      error: "DB fetch failed",
      code: "DB_ERROR",
    });
  });
});
