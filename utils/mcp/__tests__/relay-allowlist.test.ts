jest.mock("nostr-tools", () => ({
  SimplePool: jest.fn().mockImplementation(() => ({
    publish: jest.fn().mockReturnValue([Promise.resolve()]),
    close: jest.fn(),
  })),
  finalizeEvent: jest.fn(),
  getPublicKey: jest.fn(),
  nip19: { decode: jest.fn() },
  nip44: {
    getConversationKey: jest.fn(),
    encrypt: jest.fn(),
    decrypt: jest.fn(),
  },
}));

jest.mock("@/utils/nostr/nostr-helper-functions", () => ({
  getDefaultRelays: jest.fn(() => [
    "wss://relay.damus.io",
    "wss://nos.lol",
    "wss://purplepag.es",
    "wss://relay.primal.net",
    "wss://relay.nostr.band",
  ]),
  withBlastr: jest.fn((relays: string[]) => [
    ...relays,
    "wss://sendit.nosflare.com",
  ]),
}));

jest.mock("@/utils/db/db-service", () => ({ cacheEvent: jest.fn() }));

import { McpRelayManager, MCP_RELAY_ALLOWLIST } from "../nostr-signing";

describe("MCP_RELAY_ALLOWLIST", () => {
  it("contains the 6 known Shopstr relays", () => {
    expect(MCP_RELAY_ALLOWLIST.has("wss://relay.damus.io")).toBe(true);
    expect(MCP_RELAY_ALLOWLIST.has("wss://nos.lol")).toBe(true);
    expect(MCP_RELAY_ALLOWLIST.has("wss://purplepag.es")).toBe(true);
    expect(MCP_RELAY_ALLOWLIST.has("wss://relay.primal.net")).toBe(true);
    expect(MCP_RELAY_ALLOWLIST.has("wss://relay.nostr.band")).toBe(true);
    expect(MCP_RELAY_ALLOWLIST.has("wss://sendit.nosflare.com")).toBe(true);
  });

  it("has exactly 6 entries", () => {
    expect(MCP_RELAY_ALLOWLIST.size).toBe(6);
  });
});

describe("McpRelayManager — allowlist enforcement", () => {
  let warnSpy: jest.SpyInstance;

  beforeEach(() => {
    warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  it("accepts all known allowlisted relays", () => {
    const mgr = new McpRelayManager(["wss://relay.damus.io", "wss://nos.lol"]);
    expect(mgr.getRelayUrls()).toEqual([
      "wss://relay.damus.io",
      "wss://nos.lol",
    ]);
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it("blocks an unknown relay and logs a warning", () => {
    expect(
      () => new McpRelayManager(["wss://attacker-controlled.example.com"])
    ).toThrow("MCP relay allowlist produced no valid relays");

    expect(warnSpy).toHaveBeenCalledWith(
      "MCP relay blocked (not in allowlist): wss://attacker-controlled.example.com"
    );
  });

  it("filters out unknown relays while keeping allowed ones", () => {
    const mgr = new McpRelayManager([
      "wss://relay.damus.io",
      "wss://attacker-controlled.example.com",
      "wss://nos.lol",
    ]);
    expect(mgr.getRelayUrls()).toEqual([
      "wss://relay.damus.io",
      "wss://nos.lol",
    ]);
    expect(warnSpy).toHaveBeenCalledWith(
      "MCP relay blocked (not in allowlist): wss://attacker-controlled.example.com"
    );
  });

  it("throws when all supplied relays are blocked", () => {
    expect(
      () =>
        new McpRelayManager([
          "wss://evil.example.com",
          "wss://another-bad.relay.io",
        ])
    ).toThrow("MCP relay allowlist produced no valid relays");

    expect(warnSpy).toHaveBeenCalledTimes(2);
  });

  it("uses default relays when none are supplied and all pass the allowlist", () => {
    const mgr = new McpRelayManager();
    const urls = mgr.getRelayUrls();
    expect(urls.length).toBeGreaterThan(0);
    for (const url of urls) {
      expect(MCP_RELAY_ALLOWLIST.has(url)).toBe(true);
    }
  });

  it("warns once per blocked relay", () => {
    expect(
      () => new McpRelayManager(["wss://bad1.com", "wss://bad2.com"])
    ).toThrow();
    expect(warnSpy).toHaveBeenCalledTimes(2);
    expect(warnSpy).toHaveBeenCalledWith(
      "MCP relay blocked (not in allowlist): wss://bad1.com"
    );
    expect(warnSpy).toHaveBeenCalledWith(
      "MCP relay blocked (not in allowlist): wss://bad2.com"
    );
  });
});
