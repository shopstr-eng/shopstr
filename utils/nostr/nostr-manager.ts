import {
  SimplePool,
  Filter as NToolFilter,
  Event as NToolEvent,
  EventTemplate as NToolEvenTemplate,
  verifyEvent,
} from "nostr-tools";
import { SubscribeManyParams, SubCloser } from "nostr-tools/abstract-pool";

import { NostrNIP46Signer } from "@/utils/nostr/signers/nostr-nip46-signer";
import {
  ChallengeHandler,
  NostrSigner,
} from "@/utils/nostr/signers/nostr-signer";
import { NostrNSecSigner } from "@/utils/nostr/signers/nostr-nsec-signer";
import { NostrNIP07Signer } from "@/utils/nostr/signers/nostr-nip07-signer";
import { newPromiseWithTimeout } from "../timeout";

export type NostrRelay = {
  url: string;
  disconnect: () => Promise<void>;
  connect: () => Promise<void>;
  activeSubs: Array<NostrSub>;
  sleeping: boolean;
  lastActive: number;
};

export type NostrSub = {
  _sub: SubCloser;
  close: () => Promise<void>;
};

export type NostrFilter = NToolFilter;
export type NostrEvent = NToolEvent;
export type NostrEventTemplate = NToolEvenTemplate;
export type NostrManagerParams = {
  connectionTimeout?: number;
  keepAliveTime: number;
  gcInterval: number;
  readable?: boolean;
  writable?: boolean;
};

const DEFAULT_CONNECTION_TIMEOUT_MS = 4000;

export class NostrManager {
  private readonly pool: SimplePool;
  private readonly params: NostrManagerParams;
  private readonly relays: Array<NostrRelay> = [];
  private gcTimeout: any;

  constructor(relays: Array<string> = [], params?: NostrManagerParams) {
    const {
      keepAliveTime = 1000 * 60 * 5,
      gcInterval = 1000 * 60 * 5,
      connectionTimeout = DEFAULT_CONNECTION_TIMEOUT_MS,
      readable = true,
      writable = true,
    } = params || {};

    this.pool = new SimplePool();
    this.params = {
      keepAliveTime,
      gcInterval,
      connectionTimeout,
      readable,
      writable,
    };
    for (const relay of relays) {
      this.addRelay(relay, { connectionTimeout: connectionTimeout });
    }
    this.gc().catch(console.error);
  }

  public static signerFrom(
    args: { [key: string]: string },
    challengeHandler: ChallengeHandler
  ): NostrSigner {
    const signer =
      NostrNIP07Signer.fromJSON(args, challengeHandler) ??
      NostrNSecSigner.fromJSON(args, challengeHandler) ??
      NostrNIP46Signer.fromJSON(args, challengeHandler);
    if (!signer) throw new Error("Invalid signer type " + JSON.stringify(args));
    return signer;
  }

  private async keepAlive(relays: NostrRelay[]) {
    await Promise.all(
      relays.map(async (relay) => {
        if (relay.sleeping) {
          try {
            await relay.connect();
            relay.sleeping = false;
          } catch (e) {
            console.error(e);
          }
        }
        relay.lastActive = Date.now();
      })
    );
  }

  private async gc() {
    try {
      for (const relay of this.relays) {
        if (
          !relay.sleeping &&
          relay.activeSubs.length === 0 &&
          Date.now() - relay.lastActive > this.params.keepAliveTime
        ) {
          try {
            await relay.disconnect();
          } catch (e) {
            console.error(e);
          }
          relay.sleeping = true;
        }
      }
    } catch (e) {
      console.error(e);
    }
    this.gcTimeout = setTimeout(() => {
      this.gc();
    }, this.params.keepAliveTime);
  }

  public async subscribe(
    filters: NostrFilter[],
    params: SubscribeManyParams,
    relayUrls?: string[]
  ): Promise<NostrSub> {
    if (!this.params.readable) throw new Error("not readable");

    if (params?.onevent) {
      const onevent = params.onevent;
      params.onevent = (event: NostrEvent) => {
        if (verifyEvent(event)) {
          onevent(event);
        }
      };
    }
    if (relayUrls) {
      for (const relayUrl of relayUrls) {
        this.addRelay(relayUrl);
      }
    }

    const relays = relayUrls
      ? this.relays.filter((r) => relayUrls.includes(r.url))
      : this.relays;
    // Fire-and-forget: subscribeMap() below already connects to each relay
    // independently and in parallel (with its own bounded connection
    // timeout), so awaiting keepAlive() here would only make every relay
    // wait for the slowest/dead relay before any REQ goes out.
    this.keepAlive(relays).catch(console.error);
    const requests = relays.flatMap((r) =>
      filters.map((f) => ({ url: r.url, filter: f }))
    );
    const sub: NostrSub = {
      _sub: this.pool.subscribeMap(requests, params ?? {}),
      close: async () => {
        sub._sub.close();
        for (const relay of relays) {
          const activeSubs = relay.activeSubs;
          const i = activeSubs.indexOf(sub);
          if (i !== -1) activeSubs.splice(i, 1);
        }
      },
    };
    for (const relay of relays) {
      relay.activeSubs.push(sub);
    }
    return sub;
  }

  public async fetch(
    filters: NostrFilter[],
    params?: SubscribeManyParams,
    relayUrls?: string[],
    timeout?: number
  ): Promise<NostrEvent[]> {
    return await newPromiseWithTimeout(
      async (resolve, _reject, abortSignal) => {
        if (!params) {
          params = {};
        }

        if (!params.onevent) {
          params.onevent = () => {};
        }

        if (!params.oneose) {
          params.oneose = () => {};
        }

        const onEvent = params.onevent;
        const onEose = params.oneose;
        const fetchedEvents: Array<NostrEvent> = [];
        let sub: NostrSub | undefined;
        let didCloseSub = false;
        let didResolve = false;

        const closeSubIfNeeded = async () => {
          if (!sub || didCloseSub) return;
          didCloseSub = true;
          await sub.close();
        };

        abortSignal.addEventListener("abort", () => {
          closeSubIfNeeded().catch(console.error);
          // If the aggregate timeout fires, return whatever events were
          // already collected from the relays that did respond instead of
          // discarding them. The abort listener runs synchronously before
          // the timeout's reject(), so resolving here wins.
          if (!didResolve) {
            didResolve = true;
            resolve(fetchedEvents);
          }
        });

        params.onevent = (event: NostrEvent) => {
          fetchedEvents.push(event);
          return onEvent!(event);
        };

        params.oneose = () => {
          closeSubIfNeeded().catch(console.error);
          if (!didResolve) {
            didResolve = true;
            resolve(fetchedEvents);
          }
          return onEose!();
        };

        sub = await this.subscribe(filters, params, relayUrls);
        if (abortSignal.aborted) {
          await closeSubIfNeeded();
        }
      },
      { timeout }
    );
  }

  public async publish(event: NostrEvent, relayUrls?: string[]): Promise<void> {
    if (!this.params.writable) throw new Error("not writable");
    if (relayUrls) {
      for (const relayUrl of relayUrls) {
        this.addRelay(relayUrl);
      }
    }

    const relays = relayUrls
      ? this.relays.filter((r) => relayUrls.includes(r.url))
      : this.relays;
    // Fire-and-forget: pool.publish() connects to each relay independently
    // with its own bounded connection timeout.
    this.keepAlive(relays).catch(console.error);
    await Promise.allSettled(
      this.pool.publish(
        relays.map((r) => r.url),
        event
      )
    );
  }

  public addRelay(
    relayUrl: string,
    params?: {
      connectionTimeout?: number;
    }
  ): void {
    if (this.relays.find((r) => r.url === relayUrl)) return;
    const connectionTimeout =
      params?.connectionTimeout ??
      this.params.connectionTimeout ??
      DEFAULT_CONNECTION_TIMEOUT_MS;
    const relay: NostrRelay = {
      url: relayUrl,
      connect: async () => {
        // Ask the pool fresh on every call instead of caching the first
        // ensureRelay() promise: a rejected promise stays rejected forever,
        // which previously made a relay unrecoverable after one failed
        // connection attempt. The pool/AbstractRelay already dedupes
        // in-flight connection attempts internally.
        await this.pool.ensureRelay(relayUrl, { connectionTimeout });
      },
      disconnect: async () => {
        this.pool.close([relayUrl]);
      },
      activeSubs: [],
      sleeping: true,
      lastActive: Date.now(),
    };
    this.relays.push(relay);
  }

  public addRelays(
    relayUrls: string[],
    params?: {
      connectionTimeout?: number;
    }
  ): void {
    for (const relayUrl of relayUrls) {
      this.addRelay(relayUrl, params);
    }
  }

  public close() {
    clearTimeout(this.gcTimeout);
    for (const relay of this.relays) {
      for (const sub of [...relay.activeSubs]) {
        sub.close();
      }
      relay.disconnect();
    }
    this.relays.length = 0;
  }
}
