import {
  getDefaultBlossomServer,
  getDefaultMint,
  getDefaultRelays,
  getLocalStorageData,
} from "../nostr-helper-functions";
import * as NostrHelpers from "../nostr-helper-functions";

type CashuCacheHelpers = typeof NostrHelpers & {
  getCachedCashuProofs?: () => unknown[];
  setCachedCashuProofs?: (proofs?: unknown[]) => void;
};

const cashuHelpers = NostrHelpers as CashuCacheHelpers;

const hasVolatileCashuCache = () =>
  typeof cashuHelpers.getCachedCashuProofs === "function" &&
  typeof cashuHelpers.setCachedCashuProofs === "function";

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

  it("keeps the volatile Cashu proof cache isolated from caller mutation when available", () => {
    if (!hasVolatileCashuCache()) {
      expect(cashuHelpers.setCachedCashuProofs).toBeUndefined();
      return;
    }

    const firstProof = {
      id: "00d0a1b24d1c1a53",
      amount: 1,
      secret: "first-secret",
      C: "first-c",
    };
    const secondProof = {
      id: "00d0a1b24d1c1a53",
      amount: 2,
      secret: "second-secret",
      C: "second-c",
    };
    const originalProofs = [firstProof];

    cashuHelpers.setCachedCashuProofs(originalProofs);
    originalProofs.push(secondProof);

    expect(cashuHelpers.getCachedCashuProofs()).toEqual([firstProof]);

    const returnedProofs = cashuHelpers.getCachedCashuProofs();
    returnedProofs.push(secondProof);

    expect(cashuHelpers.getCachedCashuProofs()).toEqual([firstProof]);
    expect(getLocalStorageData().tokens).toEqual([firstProof]);
  });
});
