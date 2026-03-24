import { validateZapReceipt } from "@/utils/nostr/zap-validator";
import { NostrManager } from "@/utils/nostr/nostr-manager";

const mockFetch = jest.fn();
const mockNostrManager = {
  fetch: mockFetch,
} as unknown as NostrManager;

describe("validateZapReceipt", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("returns true immediately if receipt is found on first try", async () => {
    mockFetch.mockResolvedValue([{ id: "zap-receipt" }]);

    const promise = validateZapReceipt(mockNostrManager, "item-123", 1000);

    const result = await promise;

    expect(result).toBe(true);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("retries and returns true if receipt is found on the 3rd try", async () => {
    mockFetch
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: "zap-receipt" }]);

    const promise = validateZapReceipt(mockNostrManager, "item-123", 1000);

    await jest.advanceTimersByTimeAsync(3000);

    const result = await promise;

    expect(result).toBe(true);
    expect(mockFetch).toHaveBeenCalledTimes(3);
  });

  it("returns false after max retries (5) if no receipt is found", async () => {
    mockFetch.mockResolvedValue([]);

    const promise = validateZapReceipt(mockNostrManager, "item-123", 1000);

    await jest.advanceTimersByTimeAsync(6000);

    const result = await promise;

    expect(result).toBe(false);
    expect(mockFetch).toHaveBeenCalledTimes(5);
  });

  it("uses the correct filter parameters", async () => {
    mockFetch.mockResolvedValue([{ id: "zap" }]);
    const minTimestamp = 162000;
    const productId = "item-xyz";

    await validateZapReceipt(mockNostrManager, productId, minTimestamp);

    expect(mockFetch).toHaveBeenCalledWith([
      expect.objectContaining({
        kinds: [9735],
        "#e": [productId],
        since: minTimestamp,
      }),
    ]);
  });
});
