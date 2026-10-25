const lookupMock = jest.fn();

jest.mock("dns/promises", () => ({
  lookup: (...args: unknown[]) => lookupMock(...args),
}));

import { normalizeMintUrl, resolveSafeMintUrl } from "../mint-url-safety";

// process.env is replaced between tests, so always write through the live object.
const setEnv = (key: string, value: string) => {
  (process.env as Record<string, string | undefined>)[key] = value;
};

describe("normalizeMintUrl", () => {
  const envBackup = { ...process.env };

  afterEach(() => {
    process.env = { ...envBackup };
  });

  it("trims whitespace and trailing slashes but keeps the path", () => {
    expect(normalizeMintUrl("  https://mint.example.com///  ")).toBe(
      "https://mint.example.com"
    );
    expect(normalizeMintUrl("https://mint.example.com/Bitcoin/")).toBe(
      "https://mint.example.com/Bitcoin"
    );
  });

  it.each([
    ["a non-string", 42],
    ["an empty string", "   "],
    ["a malformed URL", "not a url"],
    ["an ftp URL", "ftp://mint.example.com"],
    ["a file URL", "file:///etc/passwd"],
    ["embedded credentials", "https://user:pass@mint.example.com"],
    ["a query string", "https://mint.example.com/?a=1"],
    ["a fragment", "https://mint.example.com/#frag"],
    ["a non-standard port", "https://mint.example.com:9000"],
    ["an oversized URL", `https://mint.example.com/${"a".repeat(600)}`],
  ])("rejects %s", (_label, value) => {
    expect(normalizeMintUrl(value)).toBeNull();
  });

  it("accepts a non-standard port only when local mints are enabled outside production", () => {
    setEnv("NODE_ENV", "development");
    setEnv("CASHU_MINT_VALIDATION_ALLOW_LOCAL", "true");
    expect(normalizeMintUrl("http://127.0.0.1:3338")).toBe(
      "http://127.0.0.1:3338"
    );

    setEnv("NODE_ENV", "production");
    expect(normalizeMintUrl("http://127.0.0.1:3338")).toBeNull();
  });
});

describe("resolveSafeMintUrl", () => {
  const envBackup = { ...process.env };

  beforeEach(() => {
    process.env = { ...envBackup };
    delete process.env.CASHU_MINT_VALIDATION_ALLOW_LOCAL;
    delete process.env.CASHU_MINT_VALIDATION_ALLOWED_MINTS;
    lookupMock.mockReset();
    lookupMock.mockResolvedValue([{ family: 4, address: "93.184.216.34" }]);
  });

  afterAll(() => {
    process.env = envBackup;
  });

  it("returns the normalized URL for a public host", async () => {
    await expect(
      resolveSafeMintUrl(" https://mint.example.com/Bitcoin/ ")
    ).resolves.toEqual({
      ok: true,
      mintUrl: "https://mint.example.com/Bitcoin",
    });
    expect(lookupMock).toHaveBeenCalledWith("mint.example.com", { all: true });
  });

  it("returns 'Invalid mint URL' for anything that does not normalize", async () => {
    await expect(resolveSafeMintUrl("ftp://mint.example.com")).resolves.toEqual(
      { ok: false, error: "Invalid mint URL" }
    );
    expect(lookupMock).not.toHaveBeenCalled();
  });

  it.each([
    "http://localhost",
    "http://mint.localhost",
    "http://mint.local",
    "http://127.0.0.1",
    "http://127.1.2.3",
    "http://10.0.0.5",
    "http://172.16.0.1",
    "http://172.31.255.255",
    "http://192.168.1.10",
    "http://169.254.169.254",
    "http://100.64.0.1",
    "http://0.0.0.0",
    "http://224.0.0.1",
    "http://[::1]",
    "http://[fe80::1]",
    "http://[febf::1]",
    "http://[fc00::1]",
    "http://[fd12::1]",
    "http://[::ffff:10.0.0.1]",
    "http://[::]",
  ])("rejects %s without resolving DNS", async (url) => {
    const result = await resolveSafeMintUrl(url);

    expect(result.ok).toBe(false);
    expect(lookupMock).not.toHaveBeenCalled();
  });

  it("rejects a public-looking URL that is an internal IP once normalized", async () => {
    await expect(
      resolveSafeMintUrl("http://169.254.169.254/")
    ).resolves.toEqual({ ok: false, error: "Mint host is not allowed" });
  });

  it("accepts public IPv6 literals", async () => {
    await expect(
      resolveSafeMintUrl("https://[2606:4700:4700::1111]")
    ).resolves.toEqual({
      ok: true,
      mintUrl: "https://[2606:4700:4700::1111]",
    });
    expect(lookupMock).not.toHaveBeenCalled();
  });

  it("accepts public IP literals", async () => {
    await expect(resolveSafeMintUrl("https://93.184.216.34")).resolves.toEqual({
      ok: true,
      mintUrl: "https://93.184.216.34",
    });
    expect(lookupMock).not.toHaveBeenCalled();
  });

  it("rejects a hostname that resolves to a private address", async () => {
    lookupMock.mockResolvedValueOnce([{ family: 4, address: "10.1.2.3" }]);

    await expect(
      resolveSafeMintUrl("https://evil.example.com")
    ).resolves.toEqual({ ok: false, error: "Mint host is not allowed" });
  });

  it("rejects a hostname when any resolved address is private", async () => {
    lookupMock.mockResolvedValueOnce([
      { family: 4, address: "93.184.216.34" },
      { family: 6, address: "fd00::1" },
    ]);

    await expect(
      resolveSafeMintUrl("https://evil.example.com")
    ).resolves.toEqual({ ok: false, error: "Mint host is not allowed" });
  });

  it("rejects a hostname that does not resolve, or resolves to nothing", async () => {
    lookupMock.mockRejectedValueOnce(new Error("ENOTFOUND"));
    await expect(
      resolveSafeMintUrl("https://nope.example.com")
    ).resolves.toEqual({ ok: false, error: "Mint host is not allowed" });

    lookupMock.mockResolvedValueOnce([]);
    await expect(
      resolveSafeMintUrl("https://empty.example.com")
    ).resolves.toEqual({ ok: false, error: "Mint host is not allowed" });
  });

  it("rejects an address family it does not recognise", async () => {
    lookupMock.mockResolvedValueOnce([{ family: 5, address: "x" }]);

    await expect(
      resolveSafeMintUrl("https://odd.example.com")
    ).resolves.toEqual({ ok: false, error: "Mint host is not allowed" });
  });

  describe("server allowlist", () => {
    beforeEach(() => {
      setEnv(
        "CASHU_MINT_VALIDATION_ALLOWED_MINTS",
        "https://mint.example.com/, https://other.example.com/Bitcoin"
      );
    });

    it("accepts listed mints regardless of trailing slash", async () => {
      await expect(
        resolveSafeMintUrl("https://mint.example.com")
      ).resolves.toEqual({ ok: true, mintUrl: "https://mint.example.com" });
      await expect(
        resolveSafeMintUrl("https://other.example.com/Bitcoin/")
      ).resolves.toEqual({
        ok: true,
        mintUrl: "https://other.example.com/Bitcoin",
      });
    });

    it("rejects mints that are not listed before any DNS lookup", async () => {
      await expect(
        resolveSafeMintUrl("https://unlisted.example.com")
      ).resolves.toEqual({ ok: false, error: "Mint is not allowed" });
      expect(lookupMock).not.toHaveBeenCalled();
    });
  });

  describe("local mint override", () => {
    it("allows loopback mints outside production when explicitly enabled", async () => {
      setEnv("NODE_ENV", "development");
      setEnv("CASHU_MINT_VALIDATION_ALLOW_LOCAL", "true");

      await expect(
        resolveSafeMintUrl("http://127.0.0.1:3338")
      ).resolves.toEqual({ ok: true, mintUrl: "http://127.0.0.1:3338" });
      expect(lookupMock).not.toHaveBeenCalled();
    });

    it("ignores the override in production", async () => {
      setEnv("NODE_ENV", "production");
      setEnv("CASHU_MINT_VALIDATION_ALLOW_LOCAL", "true");

      await expect(resolveSafeMintUrl("http://127.0.0.1")).resolves.toEqual({
        ok: false,
        error: "Mint host is not allowed",
      });
    });

    it("does not enable local mints unless the flag is exactly 'true'", async () => {
      setEnv("NODE_ENV", "development");
      setEnv("CASHU_MINT_VALIDATION_ALLOW_LOCAL", "1");

      await expect(resolveSafeMintUrl("http://127.0.0.1")).resolves.toEqual({
        ok: false,
        error: "Mint host is not allowed",
      });
    });
  });
});
