export type CacheKey = {
  pubkey: string;
  kind: number;
};

export type CacheRead<T> = {
  value: T;
  cached: boolean;
};

type CacheEntry<T> = {
  value: T;
  expiresAt: number;
};

export class MemoryCache {
  private readonly entries = new Map<string, CacheEntry<unknown>>();
  private readonly maxEntries: number;
  private readonly now: () => number;

  constructor(
    private readonly ttlMs: number,
    maxEntriesOrNow: number | (() => number) = 5_000,
    now: () => number = () => Date.now()
  ) {
    if (typeof maxEntriesOrNow === "function") {
      this.maxEntries = 5_000;
      this.now = maxEntriesOrNow;
    } else {
      this.maxEntries = maxEntriesOrNow;
      this.now = now;
    }
  }

  get<T>(key: CacheKey): CacheRead<T> | undefined {
    if (this.ttlMs <= 0) return undefined;

    const cacheKey = toCacheKey(key);
    const entry = this.entries.get(cacheKey);
    if (!entry) return undefined;

    if (entry.expiresAt <= this.now()) {
      this.entries.delete(cacheKey);
      return undefined;
    }

    return {
      value: entry.value as T,
      cached: true,
    };
  }

  set<T>(key: CacheKey, value: T): void {
    if (this.ttlMs <= 0 || this.maxEntries <= 0) return;

    const cacheKey = toCacheKey(key);
    if (!this.entries.has(cacheKey) && this.entries.size >= this.maxEntries) {
      const oldestKey = this.entries.keys().next().value;
      if (oldestKey !== undefined) this.entries.delete(oldestKey);
    }

    this.entries.set(cacheKey, {
      value,
      expiresAt: this.now() + this.ttlMs,
    });
  }

  delete(key: CacheKey): boolean {
    return this.entries.delete(toCacheKey(key));
  }

  clear(): void {
    this.entries.clear();
  }

  pruneExpired(): number {
    const currentTime = this.now();
    let removed = 0;

    for (const [cacheKey, entry] of this.entries) {
      if (entry.expiresAt <= currentTime) {
        this.entries.delete(cacheKey);
        removed += 1;
      }
    }

    return removed;
  }

  size(): number {
    this.pruneExpired();
    return this.entries.size;
  }
}

function toCacheKey({ pubkey, kind }: CacheKey): string {
  return `${kind}:${pubkey.trim().toLowerCase()}`;
}
