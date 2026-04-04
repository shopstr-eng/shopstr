const mockConnect = jest.fn();

jest.mock("@/utils/db/db-service", () => ({
  getDbPool: jest.fn(() => ({
    connect: mockConnect,
  })),
}));

import { updateMcpOrderStatus } from "@/mcp/tools/purchase-tools";

describe("updateMcpOrderStatus", () => {
  const mockRelease = jest.fn();
  const mockQuery = jest.fn();

  beforeEach(() => {
    mockQuery.mockReset();
    mockRelease.mockReset();
    mockConnect.mockResolvedValue({
      query: mockQuery,
      release: mockRelease,
    });
  });

  it("scopes status updates to the actor's buyer or seller pubkey", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          order_id: "mcp_123",
          order_status: "shipped",
        },
      ],
    });

    await updateMcpOrderStatus("mcp_123", "shipped", "pubkey-1");

    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining(
        "AND (buyer_pubkey = $3 OR seller_pubkey = $3)"
      ),
      ["shipped", "mcp_123", "pubkey-1"]
    );
    expect(mockRelease).toHaveBeenCalled();
  });

  it("returns null when the actor does not own the order", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });

    const result = await updateMcpOrderStatus(
      "mcp_456",
      "cancelled",
      "pubkey-2"
    );

    expect(result).toBeNull();
    expect(mockRelease).toHaveBeenCalled();
  });
});
