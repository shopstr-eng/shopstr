const mockQuery = jest.fn();
const mockRelease = jest.fn();
const mockConnect = jest.fn(async () => ({
  query: mockQuery,
  release: mockRelease,
}));
const mockOn = jest.fn();
const mockEnd = jest.fn();

jest.mock("pg", () => ({
  Pool: jest.fn(() => ({
    connect: mockConnect,
    on: mockOn,
    end: mockEnd,
  })),
}));

describe("fetchProductByTitleSlug", () => {
  beforeEach(() => {
    jest.resetModules();
    mockQuery.mockReset();
    mockRelease.mockReset();
    mockConnect.mockClear();
    mockOn.mockClear();
    mockEnd.mockClear();
    process.env.DATABASE_URL =
      "postgres://shopstr:shopstr@localhost:5432/shopstr";
  });

  it("returns the newest revision when multiple rows belong to the same listing", async () => {
    mockQuery.mockImplementation(async (query: string) => {
      if (query.includes("FROM product_events")) {
        return {
          rows: [
            {
              id: "rev-2",
              pubkey: "seller-pubkey",
              created_at: 200,
              kind: 30402,
              tags: [
                ["d", "coldcard-q"],
                ["title", "COLDCARD Q"],
              ],
              content: "{}",
              sig: "sig-2",
            },
            {
              id: "rev-1",
              pubkey: "seller-pubkey",
              created_at: 100,
              kind: 30402,
              tags: [
                ["d", "coldcard-q"],
                ["title", "COLDCARD Q"],
              ],
              content: "{}",
              sig: "sig-1",
            },
          ],
        };
      }

      return { rows: [], rowCount: 0 };
    });

    const { fetchProductByTitleSlug } = await import("@/utils/db/db-service");
    const result = await fetchProductByTitleSlug("COLDCARD-Q");

    expect(result?.id).toBe("rev-2");
    expect(result?.sig).toBe("sig-2");
  });

  it("returns null when the same slug matches different logical listings", async () => {
    mockQuery.mockImplementation(async (query: string) => {
      if (query.includes("FROM product_events")) {
        return {
          rows: [
            {
              id: "listing-a",
              pubkey: "seller-a",
              created_at: 200,
              kind: 30402,
              tags: [
                ["d", "coldcard-q-a"],
                ["title", "COLDCARD Q"],
              ],
              content: "{}",
              sig: "sig-a",
            },
            {
              id: "listing-b",
              pubkey: "seller-b",
              created_at: 150,
              kind: 30402,
              tags: [
                ["d", "coldcard-q-b"],
                ["title", "COLDCARD Q"],
              ],
              content: "{}",
              sig: "sig-b",
            },
          ],
        };
      }

      return { rows: [], rowCount: 0 };
    });

    const { fetchProductByTitleSlug } = await import("@/utils/db/db-service");
    const result = await fetchProductByTitleSlug("COLDCARD-Q");

    expect(result).toBeNull();
  });
});
