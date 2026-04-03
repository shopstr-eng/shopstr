import { ReactNode } from "react";
import { act, renderHook, waitFor } from "@testing-library/react";
import { useNip50Search } from "../use-nip50-search";
import { NostrContext } from "@/components/utility-components/nostr-context-provider";
import { searchListingsNip50 } from "@/utils/nostr/nip50-search";
import { cacheEventsToDatabase } from "@/utils/db/db-client";

jest.mock("@/utils/nostr/nip50-search", () => ({
  ...jest.requireActual("@/utils/nostr/nip50-search"),
  searchListingsNip50: jest.fn(),
}));

jest.mock("@/utils/db/db-client", () => ({
  cacheEventsToDatabase: jest.fn().mockResolvedValue(undefined),
}));

const mockSearchListingsNip50 = searchListingsNip50 as jest.Mock;
const mockCacheEventsToDatabase = cacheEventsToDatabase as jest.Mock;

describe("useNip50Search", () => {
  const mockNostr = { fetch: jest.fn() } as any;

  const wrapper = ({ children }: { children: ReactNode }) => (
    <NostrContext.Provider value={{ nostr: mockNostr }}>
      {children}
    </NostrContext.Provider>
  );

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  it("debounces search calls", async () => {
    mockSearchListingsNip50.mockResolvedValue([]);

    renderHook(() => useNip50Search("camera", 400), { wrapper });

    act(() => {
      jest.advanceTimersByTime(399);
    });
    expect(mockSearchListingsNip50).not.toHaveBeenCalled();

    act(() => {
      jest.advanceTimersByTime(1);
    });

    await waitFor(() => {
      expect(mockSearchListingsNip50).toHaveBeenCalledWith(
        mockNostr,
        "camera",
        "wss://relay.nostr.band"
      );
    });
  });

  it("skips relay search for npub and naddr queries", async () => {
    const { rerender } = renderHook(({ query }) => useNip50Search(query, 400), {
      wrapper,
      initialProps: { query: "npub1abcdef" },
    });

    act(() => {
      jest.advanceTimersByTime(500);
    });

    expect(mockSearchListingsNip50).not.toHaveBeenCalled();

    rerender({ query: "naddr1abcdef" });

    act(() => {
      jest.advanceTimersByTime(500);
    });

    expect(mockSearchListingsNip50).not.toHaveBeenCalled();
  });

  it("caches valid kind 30402 events returned by relay search", async () => {
    mockSearchListingsNip50.mockResolvedValue([
      {
        id: "valid-1",
        pubkey: "pub-1",
        sig: "sig-1",
        kind: 30402,
        created_at: 1,
        tags: [["d", "listing-1"]],
      },
      {
        id: "ignored-1",
        pubkey: "pub-2",
        sig: "sig-2",
        kind: 1,
        created_at: 1,
        tags: [],
      },
    ]);

    renderHook(() => useNip50Search("camera", 10), { wrapper });

    act(() => {
      jest.advanceTimersByTime(10);
    });

    await waitFor(() => {
      expect(mockCacheEventsToDatabase).toHaveBeenCalledTimes(1);
    });

    expect(mockCacheEventsToDatabase).toHaveBeenCalledWith([
      expect.objectContaining({ id: "valid-1", kind: 30402 }),
    ]);
  });
});
