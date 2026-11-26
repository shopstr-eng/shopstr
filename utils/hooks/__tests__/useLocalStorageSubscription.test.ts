import { act, renderHook } from "@testing-library/react";
import { storage, STORAGE_KEYS } from "@/utils/storage";
import { useLocalStorageSubscription } from "../useLocalStorageSubscription";

describe("useLocalStorageSubscription", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("reads the current value from storage on mount", () => {
    storage.setJson(STORAGE_KEYS.CART, [{ id: "1" }, { id: "2" }]);

    const { result } = renderHook(() =>
      useLocalStorageSubscription(
        STORAGE_KEYS.CART,
        () => storage.getJson<unknown[]>(STORAGE_KEYS.CART, []).length,
        0
      )
    );

    expect(result.current).toBe(2);
  });

  it("updates immediately when storage.setJson writes to the subscribed key in the same tab", () => {
    const { result } = renderHook(() =>
      useLocalStorageSubscription(
        STORAGE_KEYS.CART,
        () => storage.getJson<unknown[]>(STORAGE_KEYS.CART, []).length,
        0
      )
    );

    expect(result.current).toBe(0);

    act(() => {
      storage.setJson(STORAGE_KEYS.CART, [{ id: "1" }]);
    });

    expect(result.current).toBe(1);

    act(() => {
      storage.removeItem(STORAGE_KEYS.CART);
    });

    expect(result.current).toBe(0);
  });

  it("updates on cross-tab StorageEvent for the matching key and ignores other keys", () => {
    const { result } = renderHook(() =>
      useLocalStorageSubscription(
        STORAGE_KEYS.CART,
        () => storage.getJson<unknown[]>(STORAGE_KEYS.CART, []).length,
        0
      )
    );

    localStorage.setItem(STORAGE_KEYS.CART, JSON.stringify([{ id: "1" }]));

    act(() => {
      window.dispatchEvent(
        new StorageEvent("storage", { key: STORAGE_KEYS.HISTORY })
      );
    });
    expect(result.current).toBe(0);

    act(() => {
      window.dispatchEvent(
        new StorageEvent("storage", { key: STORAGE_KEYS.CART })
      );
    });
    expect(result.current).toBe(1);
  });

  it("re-runs reader when deps change", () => {
    storage.setJson(STORAGE_KEYS.CART, [
      { pubkey: "seller-a" },
      { pubkey: "seller-b" },
      { pubkey: "seller-b" },
    ]);

    const { result, rerender } = renderHook(
      ({ seller }: { seller: string }) =>
        useLocalStorageSubscription(
          STORAGE_KEYS.CART,
          () =>
            storage
              .getJson<{ pubkey: string }[]>(STORAGE_KEYS.CART, [])
              .filter((item) => item.pubkey === seller).length,
          0,
          [seller]
        ),
      { initialProps: { seller: "seller-a" } }
    );

    expect(result.current).toBe(1);

    rerender({ seller: "seller-b" });
    expect(result.current).toBe(2);
  });
});
