import {
  getDefaultBlossomServer,
  getDefaultMint,
  getDefaultRelays,
  getLocalStorageData,
} from "../nostr-helper-functions";
import { Amount } from "@cashu/cashu-ts";

describe("getLocalStorageData", () => {
  beforeEach(() => {
    localStorage.clear();
    jest.restoreAllMocks();
  });

  it("returns safe defaults for missing keys", () => {
    const data = getLocalStorageData();

    expect(data.relays).toEqual(getDefaultRelays());
    expect(data.mints).toEqual([getDefaultMint()]);
    expect(data.blossomServers).toEqual([getDefaultBlossomServer()]);
    expect(data.tokens).toEqual([]);
    expect(data.history).toEqual([]);
  });

  it("recovers from malformed JSON in critical keys", () => {
    localStorage.setItem("relays", "{bad");
    localStorage.setItem("readRelays", "{bad");
    localStorage.setItem("writeRelays", "{bad");
    localStorage.setItem("mints", "{bad");
    localStorage.setItem("blossomServers", "{bad");
    localStorage.setItem("tokens", "{bad");
    localStorage.setItem("history", "{bad");
    localStorage.setItem("bunkerRelays", "{bad");
    localStorage.setItem("signer", "{bad");

    expect(() => getLocalStorageData()).not.toThrow();

    const data = getLocalStorageData();
    expect(data.relays).toEqual(getDefaultRelays());
    expect(data.readRelays).toEqual([]);
    expect(data.writeRelays).toEqual([]);
    expect(data.mints).toEqual([getDefaultMint()]);
    expect(data.blossomServers).toEqual([getDefaultBlossomServer()]);
    expect(data.tokens).toEqual([]);
    expect(data.history).toEqual([]);
    expect(data.bunkerRelays).toEqual([]);
  });

  it("validates and normalizes stored wallet tokens and history", () => {
    localStorage.setItem(
      "tokens",
      JSON.stringify([
        { id: "keyset-1", amount: "100", secret: "secret-1", C: "C-1" },
        { id: "keyset-2", amount: 50, secret: "secret-2", C: "C-2" },
        { id: "bad-proof", amount: {}, secret: "secret-3", C: "C-3" },
      ])
    );
    localStorage.setItem(
      "history",
      JSON.stringify([
        { type: 1, amount: 100, date: 1721915400 },
        { type: "2", amount: 50, date: 1721915500 },
      ])
    );

    const data = getLocalStorageData();

    expect(data.tokens).toHaveLength(2);
    expect(data.tokens[0]!.amount).toBeInstanceOf(Amount);
    expect(data.tokens.map((proof) => proof.amount.toNumber())).toEqual([
      100, 50,
    ]);
    expect(data.history).toEqual([{ type: 1, amount: 100, date: 1721915400 }]);
  });

  it("falls back when wallet tokens or history are not arrays", () => {
    localStorage.setItem("tokens", JSON.stringify({ id: "not-array" }));
    localStorage.setItem("history", JSON.stringify({ type: 1 }));

    const data = getLocalStorageData();

    expect(data.tokens).toEqual([]);
    expect(data.history).toEqual([]);
    expect(localStorage.getItem("tokens")).toBe("[]");
    expect(localStorage.getItem("history")).toBe("[]");
  });

  it("falls back to signInMethod signer when stored signer shape is invalid", () => {
    localStorage.setItem("signInMethod", "extension");
    localStorage.setItem("signer", JSON.stringify({ type: "nip46" }));

    const data = getLocalStorageData();

    expect(data.signer).toEqual({ type: "nip07" });
  });

  it("keeps valid stored signer shape", () => {
    localStorage.setItem(
      "signer",
      JSON.stringify({
        type: "nsec",
        encryptedPrivKey: "ncryptsec1mock",
      })
    );

    const data = getLocalStorageData();

    expect(data.signer).toEqual({
      type: "nsec",
      encryptedPrivKey: "ncryptsec1mock",
    });
  });
});
