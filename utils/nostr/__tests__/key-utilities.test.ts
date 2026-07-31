import {
  decryptNpub,
  generateKeys,
  nostrExtensionLoaded,
  parseBunkerToken,
  validateNPubKey,
  validateNSecKey,
} from "../key-utilities";
import { nip19 } from "nostr-tools";

describe("generateKeys", () => {
  it("returns nsec and npub strings with the correct prefixes", async () => {
    const { nsec, npub } = await generateKeys();
    expect(nsec).toMatch(/^nsec/);
    expect(npub).toMatch(/^npub/);
  });

  it("returns different key pairs on successive calls", async () => {
    const first = await generateKeys();
    const second = await generateKeys();
    expect(first.nsec).not.toBe(second.nsec);
    expect(first.npub).not.toBe(second.npub);
  });
});

describe("validateNPubKey", () => {
  it("returns true for a valid npub string", () => {
    expect(validateNPubKey("npub" + "a".repeat(59))).toBe(true);
  });

  it("returns false for a string that is too short", () => {
    expect(validateNPubKey("npub123")).toBe(false);
  });

  it("returns false for a string with invalid characters", () => {
    expect(validateNPubKey("npub" + "!".repeat(59))).toBe(false);
  });
});

describe("validateNSecKey", () => {
  it("returns true for a valid nsec string", () => {
    expect(validateNSecKey("nsec" + "a".repeat(59))).toBe(true);
  });

  it("returns false for a short or malformed string", () => {
    expect(validateNSecKey("nsec123")).toBe(false);
  });
});

describe("decryptNpub", () => {
  const hexPubkey =
    "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

  it("returns the hex pubkey for a valid bech32 npub string", () => {
    const npub = nip19.npubEncode(hexPubkey);
    expect(decryptNpub(npub)).toBe(hexPubkey);
  });

  it("returns null when the decoded type is not npub", () => {
    const noteBech32 = nip19.noteEncode(hexPubkey);
    expect(decryptNpub(noteBech32)).toBeNull();
  });

  it("returns null when nip19.decode throws", () => {
    expect(decryptNpub("not-a-valid-bech32-string")).toBeNull();
  });
});

describe("nostrExtensionLoaded", () => {
  afterEach(() => {
    (window as any).nostr = undefined;
  });

  it("returns true when window.nostr is set to a truthy object", () => {
    (window as any).nostr = { getPublicKey: jest.fn() };
    expect(nostrExtensionLoaded()).toBe(true);
  });

  it("returns false when window.nostr is undefined", () => {
    (window as any).nostr = undefined;
    expect(nostrExtensionLoaded()).toBe(false);
  });
});

describe("parseBunkerToken", () => {
  it("returns null when the token does not start with bunker://", () => {
    expect(parseBunkerToken("https://example.com")).toBeNull();
  });

  it("parses remotePubkey, relays, and secret from a well-formed token", () => {
    const token =
      "bunker://remote-pubkey-hex" +
      "?relay=wss%3A%2F%2Frelay1.example" +
      "&relay=wss%3A%2F%2Frelay2.example" +
      "&secret=my-secret";
    expect(parseBunkerToken(token)).toEqual({
      remotePubkey: "remote-pubkey-hex",
      relays: ["wss://relay1.example", "wss://relay2.example"],
      secret: "my-secret",
    });
  });

  it("returns undefined secret when the secret query param is absent", () => {
    const token = "bunker://remote-pubkey-hex?relay=wss%3A%2F%2Frelay.example";
    const result = parseBunkerToken(token);
    expect(result?.secret).toBeUndefined();
    expect(result?.remotePubkey).toBe("remote-pubkey-hex");
  });

  it("returns null and calls console.error when the URL constructor throws", () => {
    const consoleErrorSpy = jest
      .spyOn(console, "error")
      .mockImplementation(() => {});
    expect(parseBunkerToken("bunker://[invalid-host")).toBeNull();
    expect(consoleErrorSpy).toHaveBeenCalled();
    consoleErrorSpy.mockRestore();
  });
});
