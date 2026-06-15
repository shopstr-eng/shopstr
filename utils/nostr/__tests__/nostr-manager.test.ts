import type {
  NostrEvent,
  NostrManagerParams,
  NostrRelay,
  NostrSub,
} from "../nostr-manager";
import type { ChallengeHandler } from "../signers/nostr-signer";

type NostrManagerConstructor = typeof import("../nostr-manager").NostrManager;
type NostrManagerPublic = Pick<
  InstanceType<NostrManagerConstructor>,
  "addRelay" | "addRelays" | "close" | "subscribe" | "publish" | "fetch"
>;
type TestNostrManager = NostrManagerPublic;
type TimeoutExecutor<T> = (
  resolve: (value: T) => void,
  reject: (reason: Error) => void,
  abortSignal: AbortSignal
) => unknown;
type TimeoutOptions = { timeout?: number };

const verifyEventMock = jest.fn();
let relayConnectMock: jest.Mock;
let relayCloseMock: jest.Mock;
const fakePoolInstance = {
  ensureRelay: jest.fn(() =>
    Promise.resolve({
      connect: relayConnectMock,
      close: relayCloseMock,
    })
  ),
  subscribeMap: jest.fn().mockReturnValue({ close: jest.fn() }),
  publish: jest.fn().mockReturnValue([Promise.resolve("ok")]),
};
const FakePool = jest.fn().mockImplementation(() => fakePoolInstance);

const nip07 = { fromJSON: jest.fn() };
const nsec = { fromJSON: jest.fn() };
const nip46 = { fromJSON: jest.fn() };
let timeoutOptionsMock: TimeoutOptions[];
let latestAbortController: AbortController | undefined;

describe("NostrManager", () => {
  let NostrManager: NostrManagerConstructor;

  const makeManager = (
    relays: string[],
    params?: Partial<NostrManagerParams>
  ): TestNostrManager => new NostrManager(relays, params as NostrManagerParams);

  const isNostrRelay = (value: unknown): value is NostrRelay => {
    return (
      typeof value === "object" &&
      value !== null &&
      "url" in value &&
      "activeSubs" in value &&
      Array.isArray(value.activeSubs)
    );
  };

  const getRelays = (manager: TestNostrManager): NostrRelay[] => {
    const relays: unknown = Reflect.get(manager, "relays");
    if (!Array.isArray(relays) || !relays.every(isNostrRelay)) {
      throw new Error("Expected NostrManager private relays for test");
    }
    return relays;
  };

  const getRelay = (manager: TestNostrManager, index = 0): NostrRelay => {
    const relay = getRelays(manager)[index];
    if (!relay) {
      throw new Error(`Expected relay at index ${index}`);
    }
    return relay;
  };

  const makeEvent = (overrides: Partial<NostrEvent> = {}): NostrEvent => ({
    id: "event-id",
    pubkey: "pubkey",
    created_at: 1,
    kind: 1,
    tags: [],
    content: "",
    sig: "sig",
    ...overrides,
  });

  beforeEach(async () => {
    jest.resetModules();
    jest.clearAllMocks();
    relayConnectMock = jest.fn().mockResolvedValue(undefined);
    relayCloseMock = jest.fn().mockResolvedValue(undefined);
    timeoutOptionsMock = [];
    latestAbortController = undefined;

    jest.doMock("nostr-tools", () => ({
      SimplePool: FakePool,
      verifyEvent: (e: unknown) => verifyEventMock(e),
    }));
    jest.doMock("@/utils/nostr/signers/nostr-nip07-signer", () => ({
      NostrNIP07Signer: nip07,
    }));
    jest.doMock("@/utils/nostr/signers/nostr-nsec-signer", () => ({
      NostrNSecSigner: nsec,
    }));
    jest.doMock("@/utils/nostr/signers/nostr-nip46-signer", () => ({
      NostrNIP46Signer: nip46,
    }));
    jest.doMock("../../timeout", () => ({
      newPromiseWithTimeout: <T>(
        fn: TimeoutExecutor<T>,
        options: TimeoutOptions
      ) => {
        timeoutOptionsMock.push(options);
        const abortController = new AbortController();
        latestAbortController = abortController;
        return new Promise<T>((resolve, reject) =>
          fn(resolve, reject, abortController.signal)
        );
      },
    }));

    const mod = await import("../nostr-manager");
    NostrManager = mod.NostrManager;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe("signerFrom()", () => {
    const CH: ChallengeHandler = async () => ({ res: "", remind: false });

    it("uses NIP-07 when available", () => {
      nip07.fromJSON.mockReturnValue("S07");
      const s = NostrManager.signerFrom({ a: "b" }, CH);
      expect(s).toBe("S07");
    });

    it("falls back to NSEC", () => {
      nip07.fromJSON.mockReturnValue(undefined);
      nsec.fromJSON.mockReturnValue("SNSEC");
      const s = NostrManager.signerFrom({}, CH);
      expect(s).toBe("SNSEC");
    });

    it("falls back to NIP-46", () => {
      nip07.fromJSON.mockReturnValue(undefined);
      nsec.fromJSON.mockReturnValue(undefined);
      nip46.fromJSON.mockReturnValue("S46");
      const s = NostrManager.signerFrom({}, CH);
      expect(s).toBe("S46");
    });

    it("throws if none match", () => {
      nip07.fromJSON.mockReturnValue(undefined);
      nsec.fromJSON.mockReturnValue(undefined);
      nip46.fromJSON.mockReturnValue(undefined);
      expect(() => NostrManager.signerFrom({}, CH)).toThrow(
        /Invalid signer type/
      );
    });
  });

  describe("relay management", () => {
    it("addRelay/addRelays avoids duplicates", () => {
      const mgr = makeManager([], { keepAliveTime: 10, gcInterval: 10 });
      mgr.addRelay("r1");
      mgr.addRelay("r1");
      mgr.addRelays(["r2", "r1"]);
      const urls = getRelays(mgr)
        .map((relay) => relay.url)
        .sort();
      expect(urls).toEqual(["r1", "r2"]);
    });

    it("close() clears all relays and subs", async () => {
      const mgr = makeManager(["x"]);
      const sub: NostrSub = { close: jest.fn(), _sub: { close: jest.fn() } };
      getRelay(mgr).activeSubs.push(sub);
      mgr.close();
      expect(getRelays(mgr).length).toBe(0);
      expect(sub.close).toHaveBeenCalled();
    });
  });

  describe("subscribe()", () => {
    let mgr: TestNostrManager;
    beforeEach(() => {
      mgr = makeManager(["u1"], { readable: true });
    });

    it("throws if not readable", async () => {
      mgr = makeManager([], { readable: false });
      await expect(mgr.subscribe([], {})).rejects.toThrow("not readable");
    });

    it("wraps onevent with verifyEvent", async () => {
      verifyEventMock.mockReturnValueOnce(false).mockReturnValueOnce(true);
      const cb = jest.fn();
      await mgr.subscribe([], { onevent: cb }, ["u1"]);

      const params = fakePoolInstance.subscribeMap.mock.calls[0][1];
      params.onevent!(makeEvent({ id: "1" }));
      params.onevent!(makeEvent({ id: "2" }));

      expect(cb).toHaveBeenCalledTimes(1);
      expect(cb).toHaveBeenCalledWith(makeEvent({ id: "2" }));
    });

    it("close() removes from activeSubs", async () => {
      const sub = await mgr.subscribe([], {}, ["u1"]);
      expect(getRelay(mgr).activeSubs).toContain(sub);
      await sub.close();
      expect(getRelay(mgr).activeSubs).not.toContain(sub);
    });

    it("awaits reconnect before subscribing on sleeping relays", async () => {
      let resolveConnect!: () => void;
      relayConnectMock.mockReturnValueOnce(
        new Promise<void>((resolve) => {
          resolveConnect = resolve;
        })
      );

      const subscribePromise = mgr.subscribe([], {}, ["u1"]);
      await Promise.resolve();

      expect(fakePoolInstance.subscribeMap).not.toHaveBeenCalled();

      resolveConnect();
      await subscribePromise;

      expect(fakePoolInstance.subscribeMap).toHaveBeenCalledTimes(1);
    });
  });

  describe("publish()", () => {
    const evt = makeEvent({ id: "X" });
    let mgr: TestNostrManager;
    beforeEach(() => {
      mgr = makeManager(["p1"], { writable: true });
    });

    it("throws if not writable", async () => {
      mgr = makeManager([], { writable: false });
      await expect(mgr.publish(evt)).rejects.toThrow("not writable");
    });

    it("publishes and resolves", async () => {
      await expect(mgr.publish(evt, ["p1"])).resolves.toBeUndefined();

      expect(fakePoolInstance.publish).toHaveBeenCalledWith(["p1"], evt);
    });

    it("awaits reconnect before publishing on sleeping relays", async () => {
      let resolveConnect!: () => void;
      relayConnectMock.mockReturnValueOnce(
        new Promise<void>((resolve) => {
          resolveConnect = resolve;
        })
      );

      const publishPromise = mgr.publish(evt, ["p1"]);
      await Promise.resolve();

      expect(fakePoolInstance.publish).not.toHaveBeenCalled();

      resolveConnect();
      await publishPromise;

      expect(fakePoolInstance.publish).toHaveBeenCalledWith(["p1"], evt);
    });
  });

  describe("fetch()", () => {
    let mgr: TestNostrManager;
    const waitForSubscribeMap = async () => {
      for (
        let index = 0;
        index < 5 && fakePoolInstance.subscribeMap.mock.calls.length === 0;
        index += 1
      ) {
        await Promise.resolve();
      }
      for (let index = 0; index < 5; index += 1) {
        await Promise.resolve();
      }
    };

    beforeEach(() => {
      mgr = makeManager(["u1"], { readable: true });
      getRelay(mgr).sleeping = false;
      verifyEventMock.mockReturnValue(true);
    });

    it("forwards timeout options and closes the subscription on EOSE", async () => {
      const subClose = jest.fn();
      fakePoolInstance.subscribeMap.mockReturnValueOnce({ close: subClose });

      const fetchPromise = mgr.fetch([{ kinds: [30402] }], {}, ["u1"], 1234);
      await waitForSubscribeMap();

      const params = fakePoolInstance.subscribeMap.mock.calls[0][1];
      params.onevent(makeEvent({ id: "product-1" }));
      params.oneose();

      await expect(fetchPromise).resolves.toEqual([
        makeEvent({ id: "product-1" }),
      ]);
      expect(timeoutOptionsMock).toEqual([{ timeout: 1234 }]);
      expect(subClose).toHaveBeenCalledTimes(1);
    });

    it("closes the subscription when the fetch timeout aborts", async () => {
      const subClose = jest.fn();
      fakePoolInstance.subscribeMap.mockReturnValueOnce({ close: subClose });

      const fetchPromise = mgr.fetch([{ kinds: [30402] }], {}, ["u1"], 1234);
      await waitForSubscribeMap();

      latestAbortController!.abort();
      await Promise.resolve();

      expect(subClose).toHaveBeenCalledTimes(1);

      const params = fakePoolInstance.subscribeMap.mock.calls[0][1];
      params.oneose();
      await fetchPromise;

      expect(subClose).toHaveBeenCalledTimes(1);
    });
  });
});
