import { getDbPool } from "@/utils/db/db-service";
import {
  createMcpOrder,
  getMcpOrder,
  listMcpOrders,
  listMcpOrdersAsSeller,
  updateMcpOrderPayment,
  updateMcpOrderStatus,
  updateMcpOrderAddress,
  formatOrderForResponse,
  type McpOrder,
} from "@/mcp/tools/purchase-tools";

jest.mock("@/utils/db/db-service", () => ({
  getDbPool: jest.fn(),
}));

const BUYER_PUBKEY = "buyer-pubkey";
const SELLER_PUBKEY = "seller-pubkey";

function makeOrderRow(overrides: Partial<McpOrder> = {}): McpOrder {
  return {
    id: 1,
    order_id: "order-1",
    api_key_id: 10,
    buyer_pubkey: BUYER_PUBKEY,
    seller_pubkey: SELLER_PUBKEY,
    product_id: "prod-1",
    product_title: "Handmade Mug",
    quantity: 2,
    amount_total: 1000,
    currency: "SATS",
    shipping_address: null,
    payment_ref: null,
    payment_status: "pending",
    order_status: "pending",
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
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

beforeEach(() => {
  jest.clearAllMocks();
});

describe("createMcpOrder", () => {
  it("passes all 11 fields to the INSERT in the documented parameter order", async () => {
    const row = makeOrderRow();
    const { query } = mockDbPool(() => ({ rows: [row] }));

    const result = await createMcpOrder(
      "order-1",
      10,
      BUYER_PUBKEY,
      SELLER_PUBKEY,
      "prod-1",
      "Handmade Mug",
      2,
      1000,
      "SATS",
      null,
      null
    );

    expect(query).toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO mcp_orders"),
      [
        "order-1",
        10,
        BUYER_PUBKEY,
        SELLER_PUBKEY,
        "prod-1",
        "Handmade Mug",
        2,
        1000,
        "SATS",
        null,
        null,
      ]
    );
    expect(result).toBe(row);
  });

  it("JSON.stringifies shippingAddress when present, passes it through unchanged (null) when absent", async () => {
    const { query } = mockDbPool(() => ({ rows: [makeOrderRow()] }));
    const address = {
      name: "Ada Lovelace",
      address: "123 Main St",
      city: "Metropolis",
      postalCode: "12345",
      stateProvince: "NY",
      country: "USA",
    };

    await createMcpOrder(
      "order-1",
      null,
      BUYER_PUBKEY,
      SELLER_PUBKEY,
      "prod-1",
      null,
      1,
      500,
      "SATS",
      address,
      "payment-ref-1"
    );

    const [, params] = query.mock.calls[0]!;
    expect((params as unknown[])[9]).toBe(JSON.stringify(address));
    expect((params as unknown[])[10]).toBe("payment-ref-1");

    await createMcpOrder(
      "order-2",
      null,
      BUYER_PUBKEY,
      SELLER_PUBKEY,
      "prod-1",
      null,
      1,
      500,
      "SATS",
      null,
      null
    );
    const [, secondParams] = query.mock.calls[1]!;
    expect((secondParams as unknown[])[9]).toBeNull();
  });

  it("releases the client even if the query throws", async () => {
    const release = jest.fn();
    const query = jest.fn().mockRejectedValue(new Error("db down"));
    const connect = jest.fn().mockResolvedValue({ query, release });
    jest.mocked(getDbPool).mockReturnValue({ connect } as any);

    await expect(
      createMcpOrder(
        "order-1",
        null,
        BUYER_PUBKEY,
        SELLER_PUBKEY,
        "prod-1",
        null,
        1,
        500,
        "SATS",
        null,
        null
      )
    ).rejects.toThrow("db down");
    expect(release).toHaveBeenCalledTimes(1);
  });
});

describe("getMcpOrder", () => {
  it("returns null when no row matches", async () => {
    mockDbPool(() => ({ rows: [] }));
    expect(await getMcpOrder("missing-order")).toBeNull();
  });

  it("returns the row when found, querying by order_id", async () => {
    const row = makeOrderRow();
    const { query } = mockDbPool(() => ({ rows: [row] }));

    const result = await getMcpOrder("order-1");

    expect(result).toBe(row);
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining("SELECT * FROM mcp_orders WHERE order_id = $1"),
      ["order-1"]
    );
  });
});

describe("listMcpOrders", () => {
  it("scopes the query to buyer_pubkey with default limit/offset", async () => {
    const { query } = mockDbPool(() => ({ rows: [makeOrderRow()] }));

    await listMcpOrders(BUYER_PUBKEY);

    expect(query).toHaveBeenCalledWith(
      expect.stringContaining("WHERE buyer_pubkey = $1"),
      [BUYER_PUBKEY, 50, 0]
    );
  });

  it("applies a custom limit/offset when provided", async () => {
    const { query } = mockDbPool(() => ({ rows: [] }));

    await listMcpOrders(BUYER_PUBKEY, 10, 20);

    expect(query).toHaveBeenCalledWith(expect.any(String), [
      BUYER_PUBKEY,
      10,
      20,
    ]);
  });
});

describe("listMcpOrdersAsSeller", () => {
  it("scopes the query to seller_pubkey, not buyer_pubkey", async () => {
    const { query } = mockDbPool(() => ({ rows: [] }));

    await listMcpOrdersAsSeller(SELLER_PUBKEY);

    expect(query).toHaveBeenCalledWith(
      expect.stringContaining("WHERE seller_pubkey = $1"),
      [SELLER_PUBKEY, 50, 0]
    );
  });
});

describe("updateMcpOrderPayment", () => {
  it("updates payment_ref/payment_status and returns the updated row", async () => {
    const row = makeOrderRow({ payment_ref: "ref-1", payment_status: "paid" });
    const { query } = mockDbPool(() => ({ rows: [row] }));

    const result = await updateMcpOrderPayment("order-1", "ref-1", "paid");

    expect(result).toBe(row);
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining("SET payment_ref = $1, payment_status = $2"),
      ["ref-1", "paid", "order-1"]
    );
  });

  it("returns null when orderId doesn't match any row", async () => {
    mockDbPool(() => ({ rows: [] }));
    expect(
      await updateMcpOrderPayment("missing-order", "ref-1", "paid")
    ).toBeNull();
  });
});

describe("updateMcpOrderStatus", () => {
  it("returns null when the order doesn't exist, without attempting an UPDATE", async () => {
    const { query } = mockDbPool(() => ({ rows: [] }));

    const result = await updateMcpOrderStatus(
      "missing-order",
      "shipped",
      SELLER_PUBKEY
    );

    expect(result).toBeNull();
    expect(query).toHaveBeenCalledTimes(1);
  });

  it("returns null when the actor's status transition isn't authorized (buyer trying a seller-only status)", async () => {
    const order = makeOrderRow();
    const { query } = mockDbPool((sql) =>
      sql.trim().startsWith("SELECT") ? { rows: [order] } : { rows: [] }
    );

    // "shipped" is seller-managed only; the buyer cannot set it.
    const result = await updateMcpOrderStatus(
      "order-1",
      "shipped",
      BUYER_PUBKEY
    );

    expect(result).toBeNull();
    expect(query).toHaveBeenCalledTimes(1); // only the getMcpOrder SELECT — no UPDATE issued
  });

  it("returns null when the actor is neither the order's buyer nor seller", async () => {
    const order = makeOrderRow();
    const { query } = mockDbPool((sql) =>
      sql.trim().startsWith("SELECT") ? { rows: [order] } : { rows: [] }
    );

    const result = await updateMcpOrderStatus(
      "order-1",
      "shipped",
      "stranger-pubkey"
    );

    expect(result).toBeNull();
    expect(query).toHaveBeenCalledTimes(1);
  });

  it("scopes the UPDATE to seller_pubkey when the actor is the seller", async () => {
    const order = makeOrderRow();
    const updatedRow = { ...order, order_status: "shipped" };
    const { query } = mockDbPool((sql) =>
      sql.trim().startsWith("SELECT")
        ? { rows: [order] }
        : { rows: [updatedRow] }
    );

    const result = await updateMcpOrderStatus(
      "order-1",
      "shipped",
      SELLER_PUBKEY
    );

    expect(result).toBe(updatedRow);
    const [updateSql, updateParams] = query.mock.calls[1]!;
    expect(updateSql).toContain("AND seller_pubkey = $3");
    expect(updateParams).toEqual(["shipped", "order-1", SELLER_PUBKEY]);
  });

  it("scopes the UPDATE to buyer_pubkey when the actor is the buyer", async () => {
    const order = makeOrderRow();
    const updatedRow = { ...order, order_status: "cancelled" };
    const { query } = mockDbPool((sql) =>
      sql.trim().startsWith("SELECT")
        ? { rows: [order] }
        : { rows: [updatedRow] }
    );

    const result = await updateMcpOrderStatus(
      "order-1",
      "cancelled",
      BUYER_PUBKEY
    );

    expect(result).toBe(updatedRow);
    const [updateSql, updateParams] = query.mock.calls[1]!;
    expect(updateSql).toContain("AND buyer_pubkey = $3");
    expect(updateParams).toEqual(["cancelled", "order-1", BUYER_PUBKEY]);
  });

  it("returns null when the authorized UPDATE still matches no row", async () => {
    const order = makeOrderRow();
    mockDbPool((sql) =>
      sql.trim().startsWith("SELECT") ? { rows: [order] } : { rows: [] }
    );

    const result = await updateMcpOrderStatus(
      "order-1",
      "shipped",
      SELLER_PUBKEY
    );

    expect(result).toBeNull();
  });
});

describe("updateMcpOrderAddress", () => {
  it("stringifies the new address and scopes the UPDATE to buyer_pubkey", async () => {
    const address = {
      name: "Ada Lovelace",
      address: "123 Main St",
      city: "Metropolis",
      postalCode: "12345",
      stateProvince: "NY",
      country: "USA",
    };
    const updatedRow = makeOrderRow({ shipping_address: address });
    const { query } = mockDbPool(() => ({ rows: [updatedRow] }));

    const result = await updateMcpOrderAddress(
      "order-1",
      BUYER_PUBKEY,
      address
    );

    expect(result).toBe(updatedRow);
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining("WHERE order_id = $2 AND buyer_pubkey = $3"),
      [JSON.stringify(address), "order-1", BUYER_PUBKEY]
    );
  });

  it("returns null when the order/buyer combination doesn't match (e.g. a seller cannot rewrite the buyer's address)", async () => {
    mockDbPool(() => ({ rows: [] }));

    const result = await updateMcpOrderAddress("order-1", SELLER_PUBKEY, {
      name: "x",
      address: "y",
      city: "z",
      postalCode: "0",
      stateProvince: "s",
      country: "c",
    });

    expect(result).toBeNull();
  });
});

describe("formatOrderForResponse", () => {
  it("coerces amount_total from a Postgres numeric string to a JS number", () => {
    const order = makeOrderRow({ amount_total: "1000.5" as unknown as number });

    const result = formatOrderForResponse(order);

    expect(result.amountTotal).toBe(1000.5);
    expect(typeof result.amountTotal).toBe("number");
  });

  it("maps every field through to its response shape unchanged aside from amountTotal's coercion", () => {
    const address = { city: "Metropolis" };
    const order = makeOrderRow({
      order_id: "order-1",
      product_id: "prod-1",
      product_title: "Handmade Mug",
      quantity: 2,
      currency: "SATS",
      shipping_address: address,
      payment_status: "paid",
      order_status: "shipped",
      payment_ref: "ref-1",
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-02T00:00:00.000Z",
    });

    expect(formatOrderForResponse(order)).toEqual({
      orderId: "order-1",
      productId: "prod-1",
      productTitle: "Handmade Mug",
      quantity: 2,
      amountTotal: order.amount_total,
      currency: "SATS",
      shippingAddress: address,
      paymentStatus: "paid",
      orderStatus: "shipped",
      paymentRef: "ref-1",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-02T00:00:00.000Z",
    });
  });
});
