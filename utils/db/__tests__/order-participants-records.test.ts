/**
 * @jest-environment node
 */

const queryMock = jest.fn();
const releaseMock = jest.fn();
const endMock = jest.fn();
const connectMock = jest.fn().mockResolvedValue({
  query: queryMock,
  release: releaseMock,
});

jest.mock("pg", () => ({
  Pool: jest.fn().mockImplementation(() => ({
    connect: connectMock,
    on: jest.fn(),
    end: endMock,
  })),
}));

import * as dbService from "../db-service";

const registration = {
  orderId: "7f0c1a52-3d4e-4b6f-8a9b-0c1d2e3f4a5b",
  buyerPubkey: "1".repeat(64),
  sellerPubkey: "2".repeat(64),
  productAddress: `30402:${"2".repeat(64)}:listing-1`,
};

const storedRow = {
  buyer_pubkey: registration.buyerPubkey,
  seller_pubkey: registration.sellerPubkey,
  product_address: registration.productAddress,
};

describe("order participant records", () => {
  const originalDatabaseUrl = process.env.DATABASE_URL;

  beforeAll(() => {
    process.env.DATABASE_URL = "postgres://test:test@localhost:5432/shopstr";
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterAll(async () => {
    await dbService.closeDbPool();
    if (originalDatabaseUrl === undefined) {
      delete process.env.DATABASE_URL;
    } else {
      process.env.DATABASE_URL = originalDatabaseUrl;
    }
  });

  describe("registerOrderParticipants", () => {
    it("creates the record on first write", async () => {
      queryMock.mockResolvedValueOnce({ rowCount: 1, rows: [] });

      await expect(
        dbService.registerOrderParticipants(registration)
      ).resolves.toBe("created");
      expect(queryMock.mock.calls[0][0]).toContain(
        "ON CONFLICT (order_id) DO NOTHING"
      );
      expect(releaseMock).toHaveBeenCalled();
    });

    it("treats an identical retry as existing", async () => {
      queryMock
        .mockResolvedValueOnce({ rowCount: 0, rows: [] })
        .mockResolvedValueOnce({ rows: [storedRow] });

      await expect(
        dbService.registerOrderParticipants(registration)
      ).resolves.toBe("existing");
    });

    it.each([
      ["buyer", { buyer_pubkey: "3".repeat(64) }],
      ["seller", { seller_pubkey: "3".repeat(64) }],
      ["product", { product_address: `30402:${"2".repeat(64)}:other` }],
    ])(
      "rejects a claim with a different %s without overwriting",
      async (_label, change) => {
        queryMock
          .mockResolvedValueOnce({ rowCount: 0, rows: [] })
          .mockResolvedValueOnce({ rows: [{ ...storedRow, ...change }] });

        await expect(
          dbService.registerOrderParticipants(registration)
        ).resolves.toBe("conflict");
        expect(
          queryMock.mock.calls.some(([sql]) =>
            /UPDATE|DELETE/i.test(String(sql))
          )
        ).toBe(false);
      }
    );
  });

  describe("getOrderParticipants", () => {
    const recordRow = (source: string, buyer: string, orderId = "order-1") => ({
      order_id: orderId,
      source,
      buyer_pubkey: buyer,
      seller_pubkey: registration.sellerPubkey,
    });

    it("resolves from authoritative tables before anything else", async () => {
      queryMock.mockResolvedValueOnce({
        rows: [recordRow("order_participants", registration.buyerPubkey)],
      });

      await expect(dbService.getOrderParticipants("order-1")).resolves.toEqual({
        buyerPubkey: registration.buyerPubkey,
        sellerPubkey: registration.sellerPubkey,
        source: "order_participants",
      });

      const [sql, params] = queryMock.mock.calls[0];
      expect(String(sql)).toContain("FROM order_participants");
      expect(String(sql)).toContain("FROM mcp_orders");
      expect(String(sql)).not.toContain("message_events");
      expect(String(sql)).not.toContain("p2pk_escrow_orders");
      expect(params).toEqual([["order-1"]]);
      expect(queryMock).toHaveBeenCalledTimes(1);
      expect(releaseMock).toHaveBeenCalled();
    });

    it("resolves MCP orders from mcp_orders", async () => {
      queryMock.mockResolvedValueOnce({
        rows: [recordRow("mcp_orders", registration.buyerPubkey, "mcp_1_ab")],
      });

      await expect(
        dbService.getOrderParticipants("mcp_1_ab")
      ).resolves.toMatchObject({ source: "mcp_orders" });
    });

    it("returns null when the order is unresolved", async () => {
      queryMock
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] });

      await expect(
        dbService.getOrderParticipants("unknown")
      ).resolves.toBeNull();
    });

    it("returns null, without a legacy fallback, when records disagree", async () => {
      const warnSpy = jest
        .spyOn(console, "warn")
        .mockImplementation(() => undefined);
      queryMock.mockResolvedValueOnce({
        rows: [
          recordRow("order_participants", registration.buyerPubkey),
          recordRow("mcp_orders", "3".repeat(64)),
        ],
      });

      try {
        await expect(
          dbService.getOrderParticipants("order-1")
        ).resolves.toBeNull();
        expect(warnSpy).toHaveBeenCalled();
        expect(queryMock).toHaveBeenCalledTimes(1);
      } finally {
        warnSpy.mockRestore();
      }
    });

    it("falls back to legacy message tags cached before the cutoff", async () => {
      queryMock.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({
        rows: [
          { order_id: "legacy-order", tags: [["b", "buyer-legacy"]] },
          {
            order_id: "legacy-order",
            tags: [["item", "30402:seller-legacy:listing-1"]],
          },
        ],
      });

      await expect(
        dbService.getOrderParticipants("legacy-order")
      ).resolves.toEqual({
        buyerPubkey: "buyer-legacy",
        sellerPubkey: "seller-legacy",
        source: "legacy_message_tags",
      });

      const legacySql = String(queryMock.mock.calls[1][0]);
      expect(legacySql).toContain("FROM message_events");
      expect(legacySql).toContain("cached_at <");
      expect(legacySql).toContain("schema_milestones");
    });

    it("does not use legacy tags when only one role is tagged", async () => {
      queryMock.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({
        rows: [{ order_id: "legacy-order", tags: [["b", "buyer-legacy"]] }],
      });

      await expect(
        dbService.getOrderParticipants("legacy-order")
      ).resolves.toBeNull();
    });

    it("never falls back to legacy tags when an authoritative record exists", async () => {
      queryMock.mockResolvedValueOnce({
        rows: [recordRow("mcp_orders", registration.buyerPubkey, "mcp_1_ab")],
      });

      await dbService.getOrderParticipants("mcp_1_ab");

      expect(
        queryMock.mock.calls.some(([sql]) =>
          String(sql).includes("message_events")
        )
      ).toBe(false);
    });
  });

  describe("getOrderParticipantsForOrders", () => {
    it("resolves a batch and leaves unknown orders out", async () => {
      queryMock.mockResolvedValueOnce({
        rows: [
          {
            order_id: "order-1",
            source: "order_participants",
            buyer_pubkey: "buyer-1",
            seller_pubkey: "seller-1",
          },
          {
            order_id: "order-2",
            source: "mcp_orders",
            buyer_pubkey: "buyer-2",
            seller_pubkey: "seller-2",
          },
        ],
      });

      const result = await dbService.getOrderParticipantsForOrders(
        ["order-1", "order-2", "order-3"],
        { includeLegacy: false }
      );

      expect(Object.fromEntries(result)).toEqual({
        "order-1": {
          buyerPubkey: "buyer-1",
          sellerPubkey: "seller-1",
          source: "order_participants",
        },
        "order-2": {
          buyerPubkey: "buyer-2",
          sellerPubkey: "seller-2",
          source: "mcp_orders",
        },
      });
      expect(queryMock).toHaveBeenCalledTimes(1);
    });

    it("only queries legacy tags for orders with no record", async () => {
      queryMock
        .mockResolvedValueOnce({
          rows: [
            {
              order_id: "order-1",
              source: "order_participants",
              buyer_pubkey: "buyer-1",
              seller_pubkey: "seller-1",
            },
          ],
        })
        .mockResolvedValueOnce({ rows: [] });

      await dbService.getOrderParticipantsForOrders(["order-1", "old-order"], {
        includeLegacy: true,
      });

      expect(queryMock.mock.calls[1][1]).toEqual([["old-order"]]);
    });

    it("skips the database for an empty batch", async () => {
      await expect(
        dbService.getOrderParticipantsForOrders([], { includeLegacy: true })
      ).resolves.toEqual(new Map());
      expect(queryMock).not.toHaveBeenCalled();
    });
  });
});
