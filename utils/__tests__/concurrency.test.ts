import { mapWithConcurrency } from "@/utils/concurrency";

describe("mapWithConcurrency", () => {
  it("preserves result order while limiting active work", async () => {
    let active = 0;
    let maxActive = 0;

    const results = await mapWithConcurrency(
      [1, 2, 3, 4, 5],
      2,
      async (item) => {
        active += 1;
        maxActive = Math.max(maxActive, active);
        await new Promise((resolve) => setTimeout(resolve, 1));
        active -= 1;
        return item * 10;
      }
    );

    expect(results).toEqual([10, 20, 30, 40, 50]);
    expect(maxActive).toBeLessThanOrEqual(2);
  });

  it("falls back to serial work for a non-finite concurrency", async () => {
    const results = await mapWithConcurrency(
      [1, 2, 3],
      Number.NaN,
      async (item) => item * 2
    );

    expect(results).toEqual([2, 4, 6]);
  });

  it("rejects with the first mapper error", async () => {
    await expect(
      mapWithConcurrency([1, 2, 3], 2, async (item) => {
        if (item === 2) throw new Error("boom");
        return item;
      })
    ).rejects.toThrow("boom");
  });

  it("stops scheduling new work after a failure", async () => {
    const started: number[] = [];

    await expect(
      mapWithConcurrency([1, 2, 3, 4], 1, async (item) => {
        started.push(item);
        if (item === 2) throw new Error("stop");
        return item;
      })
    ).rejects.toThrow("stop");

    // With concurrency 1, the worker fails on item 2 and must not start 3 or 4.
    expect(started).toEqual([1, 2]);
  });

  it("does not surface sibling rejections as unhandled", async () => {
    const unhandled: unknown[] = [];
    const onUnhandled = (reason: unknown) => unhandled.push(reason);
    process.on("unhandledRejection", onUnhandled);

    try {
      await expect(
        mapWithConcurrency([1, 2, 3, 4], 4, async (item) => {
          await new Promise((resolve) => setTimeout(resolve, 1));
          throw new Error(`fail-${item}`);
        })
      ).rejects.toThrow(/^fail-/);

      // Give any stray rejections a tick to surface.
      await new Promise((resolve) => setTimeout(resolve, 5));
      expect(unhandled).toHaveLength(0);
    } finally {
      process.off("unhandledRejection", onUnhandled);
    }
  });
});
