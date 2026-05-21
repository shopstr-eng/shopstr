import {
  SimplePool,
  type Event as NostrToolsEvent,
  type Filter,
  verifyEvent,
} from "nostr-tools";
import type { SubscribeManyParams, SubCloser } from "nostr-tools/abstract-pool";

import { TimeoutError } from "./timeout.js";

export type NostrEvent = NostrToolsEvent;
export type NostrFilter = Filter;

export type NostrRelay = {
  url: string;
  disconnect: () => Promise<void>;
  connect: () => Promise<void>;
  activeSubs: NostrSub[];
  sleeping: boolean;
  lastActive: number;
};

export type NostrSub = {
  _sub: SubCloser;
  close: () => Promise<void>;
};

export type NostrManagerParams = {
  connectionTimeout?: number;
  keepAliveTime?: number;
  gcInterval?: number;
  readable?: boolean;
  writable?: boolean;
};

export type FetchOptions = {
  timeoutMs?: number;
};

const DEFAULT_KEEP_ALIVE_MS = 5 * 60 * 1000;
const DEFAULT_GC_INTERVAL_MS = 5 * 60 * 1000;
const DEFAULT_FETCH_TIMEOUT_MS = 60_000;

export class NostrManager {
  private readonly pool: SimplePool;
  private readonly params: Required<
    Pick<NostrManagerParams, "keepAliveTime" | "gcInterval" | "readable" | "writable">
  > & {
    connectionTimeout?: number;
  };
  private readonly relays: NostrRelay[] = [];
  private gcTimeout?: ReturnType<typeof setTimeout>;

  constructor(relays: string[] = [], params: NostrManagerParams = {}) {
    this.pool = new SimplePool();
    this.params = {
      keepAliveTime: params.keepAliveTime ?? DEFAULT_KEEP_ALIVE_MS,
      gcInterval: params.gcInterval ?? DEFAULT_GC_INTERVAL_MS,
      readable: params.readable ?? true,
      writable: params.writable ?? false,
      ...(params.connectionTimeout !== undefined && {
        connectionTimeout: params.connectionTimeout,
      }),
    };
    this.addRelays(relays, {
      connectionTimeout: this.params.connectionTimeout,
    });
    this.scheduleGc();
  }

  private async keepAlive(relays: NostrRelay[]): Promise<void> {
    await Promise.allSettled(
      relays.map(async (relay) => {
        if (relay.sleeping) {
          await relay.connect();
          relay.sleeping = false;
        }
        relay.lastActive = Date.now();
      })
    );
  }

  private scheduleGc(): void {
    this.gcTimeout = setTimeout(() => {
      void this.gc();
    }, this.params.gcInterval);
  }

  private async gc(): Promise<void> {
    try {
      const now = Date.now();
      for (const relay of this.relays) {
        if (
          !relay.sleeping &&
          relay.activeSubs.length === 0 &&
          now - relay.lastActive > this.params.keepAliveTime
        ) {
          await relay.disconnect();
          relay.sleeping = true;
        }
      }
    } finally {
      this.scheduleGc();
    }
  }

  public async subscribe(
    filters: NostrFilter[],
    params: SubscribeManyParams = {},
    relayUrls?: string[]
  ): Promise<NostrSub> {
    if (!this.params.readable) throw new Error("not readable");

    if (relayUrls) {
      this.addRelays(relayUrls, {
        connectionTimeout: this.params.connectionTimeout,
      });
    }

    const relays = relayUrls
      ? this.relays.filter((relay) => relayUrls.includes(relay.url))
      : this.relays;
    const requests = relays.flatMap((relay) =>
      filters.map((filter) => ({ url: relay.url, filter }))
    );
    const originalOnevent = params.onevent;
    const subscribeParams: SubscribeManyParams = {
      ...params,
      onevent: (event) => {
        if (verifyEvent(event)) {
          originalOnevent?.(event);
        }
      },
    };

    const sub: NostrSub = {
      _sub: this.pool.subscribeMap(requests, subscribeParams),
      close: async () => {
        sub._sub.close();
        for (const relay of relays) {
          const index = relay.activeSubs.indexOf(sub);
          if (index !== -1) relay.activeSubs.splice(index, 1);
        }
      },
    };

    for (const relay of relays) {
      relay.activeSubs.push(sub);
    }
    await this.keepAlive(relays);
    return sub;
  }

  public async fetch(
    filters: NostrFilter[],
    params: SubscribeManyParams = {},
    relayUrls?: string[],
    options: FetchOptions = {}
  ): Promise<NostrEvent[]> {
    const timeoutMs = options.timeoutMs ?? DEFAULT_FETCH_TIMEOUT_MS;
    const fetchedEvents: NostrEvent[] = [];
    let sub: NostrSub | undefined;
    let settled = false;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;

    return await new Promise<NostrEvent[]>((resolve, reject) => {
      const cleanup = async (): Promise<void> => {
        if (timeoutId) clearTimeout(timeoutId);
        if (sub) await sub.close();
      };
      const settle = (callback: () => void): void => {
        if (settled) return;
        settled = true;
        void cleanup().finally(callback);
      };

      timeoutId = setTimeout(() => {
        settle(() =>
          reject(new TimeoutError("Relay fetch timed out", timeoutMs))
        );
      }, timeoutMs);

      const originalOnevent = params.onevent;
      const originalOneose = params.oneose;
      const fetchParams: SubscribeManyParams = {
        ...params,
        onevent: (event) => {
          fetchedEvents.push(event);
          originalOnevent?.(event);
        },
        oneose: () => {
          originalOneose?.();
          settle(() => resolve(fetchedEvents));
        },
      };

      this.subscribe(filters, fetchParams, relayUrls)
        .then((createdSub) => {
          sub = createdSub;
          if (settled) {
            void sub.close();
          }
        })
        .catch((error: unknown) => {
          settle(() => reject(error));
        });
    });
  }

  public addRelay(
    relayUrl: string,
    params: {
      connectionTimeout?: number;
    } = {}
  ): void {
    if (this.relays.some((relay) => relay.url === relayUrl)) return;

    const relayPromise = this.pool.ensureRelay(relayUrl, params);
    const relay: NostrRelay = {
      url: relayUrl,
      connect: async () => {
        this.pool.ensureRelay(relayUrl, params);
        await (await relayPromise).connect();
      },
      disconnect: async () => {
        (await relayPromise).close();
      },
      activeSubs: [],
      sleeping: true,
      lastActive: Date.now(),
    };
    this.relays.push(relay);
  }

  public addRelays(
    relayUrls: string[],
    params: {
      connectionTimeout?: number;
    } = {}
  ): void {
    for (const relayUrl of relayUrls) {
      this.addRelay(relayUrl, params);
    }
  }

  public async close(): Promise<void> {
    if (this.gcTimeout) clearTimeout(this.gcTimeout);
    await Promise.allSettled(
      this.relays.flatMap((relay) => [
        ...relay.activeSubs.map((sub) => sub.close()),
        relay.disconnect(),
      ])
    );
    this.relays.length = 0;
  }
}
