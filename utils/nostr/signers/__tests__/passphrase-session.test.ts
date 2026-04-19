import { PassphraseSession } from "../passphrase-session";

describe("PassphraseSession", () => {
  afterEach(() => {
    jest.clearAllMocks();
    jest.useRealTimers();
  });

  it("returns configured passphrase before prompting", async () => {
    const requester = jest.fn().mockResolvedValue({
      passphrase: "prompted",
      remember: true,
    });
    const session = new PassphraseSession(requester, () => "configured");

    await expect(session.getPassphrase()).resolves.toEqual([
      "configured",
      false,
    ]);
    expect(requester).not.toHaveBeenCalled();
  });

  it("reuses remembered passphrase without prompting again", async () => {
    const requester = jest.fn().mockResolvedValue({
      passphrase: "prompted",
      remember: true,
    });
    const session = new PassphraseSession(requester);

    const [passphrase, remember] = await session.getPassphrase();
    session.registerSuccessfulPassphrase(passphrase, remember);

    await expect(session.getPassphrase()).resolves.toEqual(["prompted", false]);
    expect(requester).toHaveBeenCalledTimes(1);
  });

  it("reuses short-lived input passphrase for nearby actions", async () => {
    jest.useFakeTimers();
    const requester = jest.fn().mockResolvedValue({
      passphrase: "prompted",
      remember: false,
    });
    const session = new PassphraseSession(requester, undefined, 5000);

    const [passphrase, remember] = await session.getPassphrase();
    session.registerSuccessfulPassphrase(passphrase, remember);

    await expect(session.getPassphrase()).resolves.toEqual(["prompted", false]);
    expect(requester).toHaveBeenCalledTimes(1);

    jest.advanceTimersByTime(5001);
    await expect(session.getPassphrase()).resolves.toEqual(["prompted", false]);
    expect(requester).toHaveBeenCalledTimes(2);
  });

  it("clears remembered and cached passphrases", async () => {
    jest.useFakeTimers();
    const requester = jest.fn().mockResolvedValue({
      passphrase: "prompted",
      remember: true,
    });
    const session = new PassphraseSession(requester, undefined, 5000);

    const [passphrase, remember] = await session.getPassphrase();
    session.registerSuccessfulPassphrase(passphrase, remember);
    session.clearAll();

    await expect(session.getPassphrase()).resolves.toEqual(["prompted", true]);
    expect(requester).toHaveBeenCalledTimes(2);
  });
});
