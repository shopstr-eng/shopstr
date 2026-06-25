export async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  mapper: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  if (items.length === 0) return [];

  const limit = Number.isFinite(concurrency)
    ? Math.max(1, Math.floor(concurrency))
    : 1;
  const results = new Array<R>(items.length);
  let nextIndex = 0;
  let failed = false;
  let firstError: unknown;

  const workers = Array.from(
    { length: Math.min(limit, items.length) },
    async () => {
      // Stop pulling new work as soon as any worker fails so siblings don't
      // keep running after the overall operation is doomed.
      while (!failed) {
        const index = nextIndex++;
        if (index >= items.length) return;
        try {
          results[index] = await mapper(items[index]!, index);
        } catch (error) {
          // Capture the first error and swallow the rest here so a sibling
          // rejection can't escape as an unhandled promise rejection. The
          // captured error is rethrown once all workers have settled.
          if (!failed) {
            failed = true;
            firstError = error;
          }
          return;
        }
      }
    }
  );

  await Promise.all(workers);
  if (failed) throw firstError;
  return results;
}
