/** @jest-environment node */
import { encryptHodlValue, decryptHodlValue } from "../hodl-storage";
const hash = "ab".repeat(32);
beforeEach(() => {
  process.env.HODL_ESCROW_ENCRYPTION_KEY = "11".repeat(32);
});
afterEach(() => {
  delete process.env.HODL_ESCROW_ENCRYPTION_KEY;
});
it("encrypts with random nonces and binds ciphertext to the order and purpose", () => {
  const a = encryptHodlValue("secret", hash, "preimage");
  const b = encryptHodlValue("secret", hash, "preimage");
  expect(a).not.toBe(b);
  expect(a).not.toContain("secret");
  expect(decryptHodlValue(a, hash, "preimage")).toBe("secret");
  expect(() => decryptHodlValue(a, "cd".repeat(32), "preimage")).toThrow();
  expect(() => decryptHodlValue(a, hash, "order")).toThrow();
  expect(() =>
    decryptHodlValue(a.slice(0, -2) + "aa", hash, "preimage")
  ).toThrow();
});
it("fails closed for missing keys, plaintext, and wrong keys", () => {
  const encrypted = encryptHodlValue("secret", hash, "preimage");
  delete process.env.HODL_ESCROW_ENCRYPTION_KEY;
  expect(() => encryptHodlValue("secret", hash, "preimage")).toThrow();
  process.env.HODL_ESCROW_ENCRYPTION_KEY = "22".repeat(32);
  expect(() => decryptHodlValue(encrypted, hash, "preimage")).toThrow();
  expect(() => decryptHodlValue("11".repeat(32), hash, "preimage")).toThrow();
});
