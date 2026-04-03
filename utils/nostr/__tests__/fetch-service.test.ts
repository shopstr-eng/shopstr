import { fetchAllPosts } from "../fetch-service";
import parseTags from "@/utils/parsers/product-parser-functions";

jest.mock("@/utils/db/db-client", () => ({
  cacheEventsToDatabase: jest.fn().mockResolvedValue(undefined),
}));

const { cacheEventsToDatabase } = jest.requireMock("@/utils/db/db-client");

describe("fetchAllPosts", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = jest.fn();
  });

  it("merges 30402 and 30018 variants by marketplace identity and prefers 30402", async () => {
    (global.fetch as jest.Mock).mockImplementation(async (url: string) => {
      if (url === "/api/db/fetch-products") {
        return {
          ok: true,
          json: async () => [
            {
              id: "db-30018",
              pubkey: "seller-1",
              created_at: 10,
              kind: 30018,
              tags: [["d", "coldcard-q"]],
              content: JSON.stringify({
                id: "coldcard-q",
                stall_id: "shopstr-sat",
                name: "COLDCARD Q",
                currency: "SAT",
                price: 1000,
                shipping: [{ id: "standard", cost: 25 }],
              }),
              sig: "sig-db",
            },
          ],
        };
      }

      if (url === "/api/db/fetch-stalls") {
        return {
          ok: true,
          json: async () => [
            {
              id: "db-30017",
              pubkey: "seller-1",
              created_at: 9,
              kind: 30017,
              tags: [["d", "shopstr-sat"]],
              content: JSON.stringify({
                id: "shopstr-sat",
                shipping: [{ id: "standard", name: "Standard", cost: 10 }],
              }),
              sig: "sig-stall",
            },
          ],
        };
      }

      throw new Error(`Unexpected fetch URL: ${url}`);
    });

    const nostr = {
      fetch: jest.fn().mockResolvedValue([
        {
          id: "relay-30017",
          pubkey: "seller-1",
          created_at: 20,
          kind: 30017,
          tags: [["d", "shopstr-sat"]],
          content: JSON.stringify({
            id: "shopstr-sat",
            shipping: [{ id: "standard", name: "Standard", cost: 15 }],
          }),
          sig: "sig-relay-30017",
        },
        {
          id: "relay-30018",
          pubkey: "seller-1",
          created_at: 20,
          kind: 30018,
          tags: [["d", "coldcard-q"]],
          content: JSON.stringify({
            id: "coldcard-q",
            stall_id: "shopstr-sat",
            name: "COLDCARD Q",
            currency: "SAT",
            price: 1000,
            shipping: [{ id: "standard", cost: 25 }],
          }),
          sig: "sig-relay-30018",
        },
        {
          id: "relay-30402",
          pubkey: "seller-1",
          created_at: 20,
          kind: 30402,
          tags: [
            ["d", "coldcard-q"],
            ["title", "COLDCARD Q"],
            ["price", "1000", "SAT"],
          ],
          content: "COLDCARD Q",
          sig: "sig-relay-30402",
        },
      ]),
    };

    const editProductContext = jest.fn();

    const result = await fetchAllPosts(
      nostr as any,
      ["wss://relay.example"],
      editProductContext
    );

    expect(global.fetch).toHaveBeenCalledWith("/api/db/fetch-products");
    expect(global.fetch).toHaveBeenCalledWith("/api/db/fetch-stalls");
    expect(nostr.fetch).toHaveBeenCalledWith(
      [
        { kinds: [30017, 30018, 30402] },
        { kinds: [1], "#t": ["shopstr-zapsnag", "zapsnag"] },
      ],
      {},
      ["wss://relay.example"]
    );
    expect(result.productEvents).toHaveLength(1);
    expect(result.productEvents[0]).toEqual(
      expect.objectContaining({
        id: "relay-30402",
        kind: 30402,
      })
    );
    expect(editProductContext).toHaveBeenLastCalledWith(
      [
        expect.objectContaining({
          id: "relay-30402",
          kind: 30402,
        }),
      ],
      false
    );
    expect(cacheEventsToDatabase).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ id: "relay-30017", kind: 30017 }),
        expect.objectContaining({ id: "relay-30018", kind: 30018 }),
        expect.objectContaining({ id: "relay-30402", kind: 30402 }),
      ])
    );
  });

  it("adds stall base shipping cost to imported nip-15 products", async () => {
    (global.fetch as jest.Mock).mockImplementation(async (url: string) => {
      if (url === "/api/db/fetch-products") {
        return { ok: true, json: async () => [] };
      }
      if (url === "/api/db/fetch-stalls") {
        return { ok: true, json: async () => [] };
      }
      throw new Error(`Unexpected fetch URL: ${url}`);
    });

    const nostr = {
      fetch: jest.fn().mockResolvedValue([
        {
          id: "relay-30017",
          pubkey: "seller-1",
          created_at: 20,
          kind: 30017,
          tags: [["d", "shopstr-sat"]],
          content: JSON.stringify({
            id: "shopstr-sat",
            shipping: [{ id: "standard", name: "Standard", cost: 30 }],
          }),
          sig: "sig-relay-30017",
        },
        {
          id: "relay-30018",
          pubkey: "seller-1",
          created_at: 21,
          kind: 30018,
          tags: [["d", "coldcard-q"]],
          content: JSON.stringify({
            id: "coldcard-q",
            stall_id: "shopstr-sat",
            name: "COLDCARD Q",
            currency: "SAT",
            price: 1000,
            shipping: [{ id: "standard", cost: 25 }],
          }),
          sig: "sig-relay-30018",
        },
      ]),
    };

    const editProductContext = jest.fn();
    const result = await fetchAllPosts(
      nostr as any,
      ["wss://relay.example"],
      editProductContext
    );
    const parsed = parseTags(result.productEvents[0]!)!;

    expect(parsed.kind).toBe(30018);
    expect(parsed.shippingType).toBe("Added Cost");
    expect(parsed.shippingCost).toBe(55);
  });
});
