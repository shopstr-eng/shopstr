const verifyEventMock = jest.fn();
const fakePoolInstance = {
  ensureRelay: jest.fn().mockResolvedValue({
    connect: jest.fn().mockResolvedValue(undefined),
    close: jest.fn().mockResolvedValue(undefined),
  }),
  subscribeMany: jest.fn().mockReturnValue({ close: jest.fn() }),
  publish: jest.fn().mockReturnValue([Promise.resolve("ok")]),
};
const FakePool = jest.fn().mockImplementation(() => fakePoolInstance);

const nip07 = { fromJSON: jest.fn() };
const nsec = { fromJSON: jest.fn() };
const nip46 = { fromJSON: jest.fn() };

describe("NostrManager", () => {
  let NostrManager: any;

  beforeEach(async () => {
    jest.resetModules();
    jest.clearAllMocks();

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
      newPromiseWithTimeout: (fn: any) =>
        new Promise((resolve, reject) => fn(resolve, reject)),
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

      const params = fakePoolInstance.subscribeMany.mock.calls[0][2];
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
  });
});
