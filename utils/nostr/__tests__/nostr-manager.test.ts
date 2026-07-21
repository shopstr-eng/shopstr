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
  close: jest.fn(),
};
const FakePool = jest.fn().mockImplementation(() => fakePoolInstance);

const nip07 = { fromJSON: jest.fn() };
const nsec = { fromJSON: jest.fn() };
const nip46 = { fromJSON: jest.fn() };
let timeoutOptionsMock: any[];
let latestAbortController: AbortController | undefined;

describe("NostrManager", () => {
  let NostrManager: any;

  beforeEach(async () => {
    jest.resetModules();
    jest.clearAllMocks();
    relayConnectMock = jest.fn().mockResolvedValue(undefined);
    relayCloseMock = jest.fn().mockResolvedValue(undefined);
    timeoutOptionsMock = [];
    latestAbortController = undefined;

    jest.doMock("nostr-tools", () => ({
      SimplePool: FakePool,
      verifyEvent: (e: any) => verifyEventMock(e),
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
      newPromiseWithTimeout: (fn: any, options: any) => {
        timeoutOptionsMock.push(options);
        const abortController = new AbortController();
        latestAbortController = abortController;
        return new Promise((resolve, reject) =>
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
    const CH: any = jest.fn();

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
      const mgr = new NostrManager([], { keepAliveTime: 10, gcInterval: 10 });
      mgr.addRelay("r1");
      mgr.addRelay("r1");
      mgr.addRelays(["r2", "r1"]);
      const urls = mgr.relays.map((r: any) => r.url).sort();
      expect(urls).toEqual(["r1", "r2"]);
    });

    it("close() clears all relays and subs", async () => {
      const mgr = new NostrManager(["x"]);
      const sub = { close: jest.fn(), _sub: { close: jest.fn() } };
      mgr.relays[0].activeSubs.push(sub);
      mgr.close();
      expect(mgr.relays.length).toBe(0);
      expect(sub.close).toHaveBeenCalled();
    });

    it("passes a bounded default connectionTimeout to the pool", async () => {
      const mgr = new NostrManager(["r1"]);
      await mgr.relays[0].connect();
      expect(fakePoolInstance.ensureRelay).toHaveBeenCalledWith("r1", {
        connectionTimeout: 4000,
      });
    });

    it("retries a failed connection instead of caching the rejection", async () => {
      const mgr = new NostrManager(["r1"]);
      fakePoolInstance.ensureRelay
        .mockRejectedValueOnce(new Error("connection failed"))
        .mockResolvedValueOnce({
          connect: relayConnectMock,
          close: relayCloseMock,
        });

      await expect(mgr.relays[0].connect()).rejects.toThrow(
        "connection failed"
      );
      await expect(mgr.relays[0].connect()).resolves.toBeUndefined();
      expect(fakePoolInstance.ensureRelay).toHaveBeenCalledTimes(2);
    });
  });

  describe("subscribe()", () => {
    let mgr: any;
    beforeEach(() => {
      mgr = new NostrManager(["u1"], { readable: true });
    });

    it("throws if not readable", async () => {
      mgr = new NostrManager([], { readable: false });
      await expect(mgr.subscribe([], {})).rejects.toThrow("not readable");
    });

    it("wraps onevent with verifyEvent", async () => {
      verifyEventMock.mockReturnValueOnce(false).mockReturnValueOnce(true);
      const cb = jest.fn();
      await mgr.subscribe([], { onevent: cb }, ["u1"]);

      const params = fakePoolInstance.subscribeMap.mock.calls[0][1];
      params.onevent!({ id: 1 });
      params.onevent!({ id: 2 });

      expect(cb).toHaveBeenCalledTimes(1);
      expect(cb).toHaveBeenCalledWith({ id: 2 });
    });

    it("close() removes from activeSubs", async () => {
      const sub = await mgr.subscribe([], {}, ["u1"]);
      expect(mgr.relays[0].activeSubs).toContain(sub);
      await sub.close();
      expect(mgr.relays[0].activeSubs).not.toContain(sub);
    });

    it("subscribes immediately without waiting for slow relay connections", async () => {
      fakePoolInstance.ensureRelay.mockReturnValueOnce(
        new Promise(() => {}) // connection attempt that never settles
      );

      await mgr.subscribe([], {}, ["u1"]);

      expect(fakePoolInstance.subscribeMap).toHaveBeenCalledTimes(1);
    });
  });

  describe("publish()", () => {
    const evt = { id: "X" };
    let mgr: any;
    beforeEach(() => {
      mgr = new NostrManager(["p1"], { writable: true });
    });

    it("throws if not writable", async () => {
      mgr = new NostrManager([], { writable: false });
      await expect(mgr.publish(evt)).rejects.toThrow("not writable");
    });

    it("publishes and resolves", async () => {
      await expect(mgr.publish(evt, ["p1"])).resolves.toBeUndefined();

      expect(fakePoolInstance.publish).toHaveBeenCalledWith(["p1"], evt);
    });

    it("publishes immediately without waiting for slow relay connections", async () => {
      fakePoolInstance.ensureRelay.mockReturnValueOnce(
        new Promise(() => {}) // connection attempt that never settles
      );

      await expect(mgr.publish(evt, ["p1"])).resolves.toBeUndefined();

      expect(fakePoolInstance.publish).toHaveBeenCalledWith(["p1"], evt);
    });
  });

  describe("fetch()", () => {
    let mgr: any;
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
      mgr = new NostrManager(["u1"], { readable: true });
      mgr.relays[0].sleeping = false;
      verifyEventMock.mockReturnValue(true);
    });

    it("forwards timeout options and closes the subscription on EOSE", async () => {
      const subClose = jest.fn();
      fakePoolInstance.subscribeMap.mockReturnValueOnce({ close: subClose });

      const fetchPromise = mgr.fetch([{ kinds: [30402] }], {}, ["u1"], 1234);
      await waitForSubscribeMap();

      const params = fakePoolInstance.subscribeMap.mock.calls[0][1];
      params.onevent({ id: "product-1" });
      params.oneose();

      await expect(fetchPromise).resolves.toEqual([{ id: "product-1" }]);
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

    it("resolves with partial events when the timeout aborts", async () => {
      const subClose = jest.fn();
      fakePoolInstance.subscribeMap.mockReturnValueOnce({ close: subClose });

      const fetchPromise = mgr.fetch([{ kinds: [30402] }], {}, ["u1"], 1234);
      await waitForSubscribeMap();

      const params = fakePoolInstance.subscribeMap.mock.calls[0][1];
      params.onevent({ id: "partial-1" });

      latestAbortController!.abort();

      await expect(fetchPromise).resolves.toEqual([{ id: "partial-1" }]);
      expect(subClose).toHaveBeenCalledTimes(1);
    });
  });
});
