const helperMock = {
  getLocalStorageData: jest.fn(),
  setLocalStorageDataOnSignIn: jest.fn(),
};
jest.mock("../nostr-helper-functions", () => helperMock);

const instanceMock = {
  _getPrivKey: jest.fn(),
};
const staticGetEncrypted = jest.fn();
const constructorMock = jest
  .fn()
  .mockImplementation(
    (
      opts: { encryptedPrivKey?: string; passphrase?: string },
      _ch: unknown
    ) => {
      Object.assign(instanceMock, {
        encryptedPrivKey: opts.encryptedPrivKey,
        passphrase: opts.passphrase,
      });
      return instanceMock;
    }
  );
(
  constructorMock as typeof constructorMock & { getEncryptedNSEC: jest.Mock }
).getEncryptedNSEC = staticGetEncrypted;
jest.mock("../signers/nostr-nsec-signer", () => ({
  NostrNSecSigner: constructorMock,
}));

describe("encryption-migration", () => {
  let needsMigration: () => boolean;
  let migrateToNip49: (pass: string) => Promise<boolean>;

  beforeEach(async () => {
    jest.resetModules();
    helperMock.getLocalStorageData.mockReset();
    helperMock.setLocalStorageDataOnSignIn.mockReset();
    instanceMock._getPrivKey.mockReset();
    staticGetEncrypted.mockReset();
    constructorMock.mockClear();

    const mod = await import("../encryption-migration");
    needsMigration = mod.needsMigration;
    migrateToNip49 = mod.migrateToNip49;
  });

  describe("needsMigration()", () => {
    it("returns false when migrationComplete===true", () => {
      helperMock.getLocalStorageData.mockReturnValue({
        migrationComplete: true,
      });
      expect(needsMigration()).toBe(false);
    });

    it("returns false when no key present", () => {
      helperMock.getLocalStorageData.mockReturnValue({});
      expect(needsMigration()).toBe(false);
    });

    it("returns false when key already NIP49 format", () => {
      helperMock.getLocalStorageData.mockReturnValue({
        encryptedPrivateKey: "ncryptsecXYZ",
      });
      expect(needsMigration()).toBe(false);
    });

    it("returns true when plain-text key exists", () => {
      helperMock.getLocalStorageData.mockReturnValue({
        encryptedPrivateKey: "plainHexKey",
      });
      expect(needsMigration()).toBe(true);
    });
  });

  describe("migrateToNip49()", () => {
    const PASS = "p@ss";

    it("no-op when no key to migrate", async () => {
      helperMock.getLocalStorageData.mockReturnValue({});
      const result = await migrateToNip49(PASS);
      expect(result).toBe(true);
      expect(constructorMock).not.toHaveBeenCalled();
      expect(helperMock.setLocalStorageDataOnSignIn).not.toHaveBeenCalled();
    });

    it("no-op when key already NIP49", async () => {
      helperMock.getLocalStorageData.mockReturnValue({
        encryptedPrivateKey: "ncryptsecFoo",
      });
      const result = await migrateToNip49(PASS);
      expect(result).toBe(true);
      expect(constructorMock).not.toHaveBeenCalled();
      expect(helperMock.setLocalStorageDataOnSignIn).not.toHaveBeenCalled();
    });

    it("migrates top-level encryptedPrivateKey", async () => {
      helperMock.getLocalStorageData.mockReturnValue({
        encryptedPrivateKey: "oldEnc",
      });
      instanceMock._getPrivKey.mockResolvedValue(new Uint8Array([1, 2, 3]));
      staticGetEncrypted.mockReturnValue({ encryptedPrivKey: "newEnc" });

      const result = await migrateToNip49(PASS);
      expect(result).toBe(true);

      expect(constructorMock).toHaveBeenCalledWith(
        { encryptedPrivKey: "oldEnc", passphrase: PASS },
        expect.any(Function)
      );
      expect(staticGetEncrypted).toHaveBeenCalledWith(
        new Uint8Array([1, 2, 3]),
        PASS
      );
      expect(helperMock.setLocalStorageDataOnSignIn).toHaveBeenCalledWith({
        encryptedPrivateKey: "newEnc",
        migrationComplete: true,
      });
    });

    it("migrates nested signer.encryptedPrivKey", async () => {
      const nested = { type: "nsec", encryptedPrivKey: "abc" };
      helperMock.getLocalStorageData.mockReturnValue({ signer: nested });
      instanceMock._getPrivKey.mockResolvedValue(new Uint8Array([4, 5, 6]));
      staticGetEncrypted.mockReturnValue({ encryptedPrivKey: "xyz" });

      const result = await migrateToNip49(PASS);
      expect(result).toBe(true);

      expect(constructorMock).toHaveBeenCalledWith(
        { encryptedPrivKey: "abc", passphrase: PASS },
        expect.any(Function)
      );
      expect(staticGetEncrypted).toHaveBeenCalledWith(
        new Uint8Array([4, 5, 6]),
        PASS
      );
      expect(helperMock.setLocalStorageDataOnSignIn).toHaveBeenCalledWith({
        signer: { ...nested, encryptedPrivKey: "xyz" },
        migrationComplete: true,
      });
    });

    it("returns false on decryption error, then allows a subsequent no-op call", async () => {
      helperMock.getLocalStorageData.mockReturnValue({
        encryptedPrivateKey: "willFail",
      });
      instanceMock._getPrivKey.mockRejectedValue(new Error("decrypt failed"));

      const first = await migrateToNip49(PASS);
      expect(first).toBe(false);
      expect(constructorMock).toHaveBeenCalled();

      constructorMock.mockClear();
      helperMock.setLocalStorageDataOnSignIn.mockClear();

      const second = await migrateToNip49(PASS);
      expect(second).toBe(true);
      expect(constructorMock).not.toHaveBeenCalled();
      expect(helperMock.setLocalStorageDataOnSignIn).not.toHaveBeenCalled();
    });
  });
});
