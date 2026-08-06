import type {
  ParsedHodlConfirmEvent,
  ParsedHodlReleaseEvent,
} from "@/utils/nostr/hodl-escrow-records";

const getHodlEscrowOrderPartiesMock = jest.fn();

jest.mock("@/utils/db/db-service", () => ({
  getHodlEscrowOrderParties: (...args: unknown[]) =>
    getHodlEscrowOrderPartiesMock(...args),
}));

import {
  HodlAuthorizationError,
  authorizeHodlConfirmEventForOrder,
  authorizeHodlReleaseEventForOrder,
} from "../server-hodl-escrow-authorization";

const PAYMENT_HASH = "ab".repeat(32);
const OTHER_PAYMENT_HASH = "cd".repeat(32);
const BUYER = "1".repeat(64);
const SELLER = "2".repeat(64);
const ARBITER = "3".repeat(64);
const STRANGER = "9".repeat(64);

const committedOrder = {
  paymentHash: PAYMENT_HASH,
  buyerNostrPubkey: BUYER,
  sellerNostrPubkey: SELLER,
  arbiterNostrPubkey: ARBITER,
};

const mkConfirm = (
  overrides: Partial<ParsedHodlConfirmEvent> = {}
): ParsedHodlConfirmEvent => ({
  orderId: PAYMENT_HASH,
  authorPubkey: BUYER,
  note: "received",
  createdAt: 1700,
  ...overrides,
});

const mkRelease = (
  overrides: Partial<ParsedHodlReleaseEvent> = {}
): ParsedHodlReleaseEvent => ({
  orderId: PAYMENT_HASH,
  decision: "release:seller",
  authorPubkey: ARBITER,
  reasoning: "goods delivered",
  createdAt: 1800,
  ...overrides,
});

describe("hodl escrow event authorization", () => {
  beforeEach(() => {
    getHodlEscrowOrderPartiesMock.mockReset();
    getHodlEscrowOrderPartiesMock.mockResolvedValue(committedOrder);
  });

  describe("authorizeHodlConfirmEventForOrder", () => {
    it("authorizes a confirmation signed by the order's committed buyer", async () => {
      const authorized = await authorizeHodlConfirmEventForOrder(
        PAYMENT_HASH,
        mkConfirm()
      );

      expect(getHodlEscrowOrderPartiesMock).toHaveBeenCalledWith(PAYMENT_HASH);
      expect(authorized).toMatchObject({
        paymentHash: PAYMENT_HASH,
        buyerNostrPubkey: BUYER,
        sellerNostrPubkey: SELLER,
        arbiterNostrPubkey: ARBITER,
        confirmedAt: 1700,
      });
    });

    it("carries the parties from the commitment row, not from the event", async () => {
      getHodlEscrowOrderPartiesMock.mockResolvedValue({
        ...committedOrder,
        sellerNostrPubkey: "7".repeat(64),
      });

      const authorized = await authorizeHodlConfirmEventForOrder(
        PAYMENT_HASH,
        mkConfirm()
      );

      expect(authorized.sellerNostrPubkey).toBe("7".repeat(64));
    });

    it("throws no_such_order when the payment hash has no commitment", async () => {
      getHodlEscrowOrderPartiesMock.mockResolvedValue(null);

      await expect(
        authorizeHodlConfirmEventForOrder(PAYMENT_HASH, mkConfirm())
      ).rejects.toMatchObject({
        name: "HodlAuthorizationError",
        reason: "no_such_order",
      });
    });

    it("throws pubkey_mismatch when a stranger signed the confirmation", async () => {
      // The forgery this whole layer exists for: a well-formed, correctly
      // signed confirm event for a real order, from a throwaway keypair.
      await expect(
        authorizeHodlConfirmEventForOrder(
          PAYMENT_HASH,
          mkConfirm({ authorPubkey: STRANGER })
        )
      ).rejects.toMatchObject({
        name: "HodlAuthorizationError",
        reason: "pubkey_mismatch",
      });
    });

    it("throws rather than returning any falsy value on failure", async () => {
      getHodlEscrowOrderPartiesMock.mockResolvedValue(null);
      let threw = false;

      try {
        await authorizeHodlConfirmEventForOrder(PAYMENT_HASH, mkConfirm());
      } catch (error) {
        threw = true;
        expect(error).toBeInstanceOf(HodlAuthorizationError);
      }

      expect(threw).toBe(true);
    });

    it("rejects a confirmation signed by the seller", async () => {
      await expect(
        authorizeHodlConfirmEventForOrder(
          PAYMENT_HASH,
          mkConfirm({ authorPubkey: SELLER })
        )
      ).rejects.toThrow(HodlAuthorizationError);
    });

    it("checks the buyer, not the arbiter", async () => {
      // A confirm event signed by the arbiter must fail. If this ever passes,
      // the confirm path is reading the wrong column.
      await expect(
        authorizeHodlConfirmEventForOrder(
          PAYMENT_HASH,
          mkConfirm({ authorPubkey: ARBITER })
        )
      ).rejects.toMatchObject({ reason: "pubkey_mismatch" });
    });

    it("does not leak the committed buyer pubkey in the error message", async () => {
      const error = await authorizeHodlConfirmEventForOrder(
        PAYMENT_HASH,
        mkConfirm({ authorPubkey: STRANGER })
      ).catch((thrown: HodlAuthorizationError) => thrown);

      expect((error as HodlAuthorizationError).message).not.toContain(BUYER);
    });

    it("throws order_mismatch when the event belongs to another order", async () => {
      await expect(
        authorizeHodlConfirmEventForOrder(
          PAYMENT_HASH,
          mkConfirm({ orderId: OTHER_PAYMENT_HASH })
        )
      ).rejects.toMatchObject({ reason: "order_mismatch" });

      // Rejected on the arguments alone — the wrong order's row is never read.
      expect(getHodlEscrowOrderPartiesMock).not.toHaveBeenCalled();
    });

    it("matches a buyer pubkey that differs only in hex case", async () => {
      getHodlEscrowOrderPartiesMock.mockResolvedValue({
        ...committedOrder,
        buyerNostrPubkey: "abcd".repeat(16),
      });

      await expect(
        authorizeHodlConfirmEventForOrder(
          PAYMENT_HASH,
          mkConfirm({ authorPubkey: "ABCD".repeat(16) })
        )
      ).resolves.toBeDefined();
    });

    it("looks the order up under the lowercased payment hash", async () => {
      await authorizeHodlConfirmEventForOrder(
        PAYMENT_HASH.toUpperCase(),
        mkConfirm()
      );

      expect(getHodlEscrowOrderPartiesMock).toHaveBeenCalledWith(PAYMENT_HASH);
    });

    it("never treats two malformed pubkeys as a match", async () => {
      // Empty === empty is true in JavaScript. It must not be an authorization.
      getHodlEscrowOrderPartiesMock.mockResolvedValue({
        ...committedOrder,
        buyerNostrPubkey: "",
      });

      await expect(
        authorizeHodlConfirmEventForOrder(
          PAYMENT_HASH,
          mkConfirm({ authorPubkey: "" })
        )
      ).rejects.toMatchObject({ reason: "pubkey_mismatch" });
    });
  });

  describe("authorizeHodlReleaseEventForOrder", () => {
    it("authorizes a ruling signed by the order's committed arbiter", async () => {
      const authorized = await authorizeHodlReleaseEventForOrder(
        PAYMENT_HASH,
        mkRelease()
      );

      expect(authorized).toMatchObject({
        paymentHash: PAYMENT_HASH,
        decision: "release:seller",
        buyerNostrPubkey: BUYER,
        sellerNostrPubkey: SELLER,
        arbiterNostrPubkey: ARBITER,
        decidedAt: 1800,
      });
    });

    it("carries the ruling through, so the settle path branches on a checked decision", async () => {
      const authorized = await authorizeHodlReleaseEventForOrder(
        PAYMENT_HASH,
        mkRelease({ decision: "release:buyer" })
      );

      expect(authorized.decision).toBe("release:buyer");
    });

    it("throws no_such_order when the payment hash has no commitment", async () => {
      getHodlEscrowOrderPartiesMock.mockResolvedValue(null);

      await expect(
        authorizeHodlReleaseEventForOrder(PAYMENT_HASH, mkRelease())
      ).rejects.toMatchObject({
        name: "HodlAuthorizationError",
        reason: "no_such_order",
      });
    });

    it("throws pubkey_mismatch when a stranger signed the ruling", async () => {
      await expect(
        authorizeHodlReleaseEventForOrder(
          PAYMENT_HASH,
          mkRelease({ authorPubkey: STRANGER })
        )
      ).rejects.toMatchObject({
        name: "HodlAuthorizationError",
        reason: "pubkey_mismatch",
      });
    });

    it("checks the arbiter, not the buyer", async () => {
      // The buyer ruling in their own favour is the swap this guards against.
      await expect(
        authorizeHodlReleaseEventForOrder(
          PAYMENT_HASH,
          mkRelease({ authorPubkey: BUYER, decision: "release:buyer" })
        )
      ).rejects.toMatchObject({ reason: "pubkey_mismatch" });
    });

    it("rejects a ruling signed by the seller", async () => {
      await expect(
        authorizeHodlReleaseEventForOrder(
          PAYMENT_HASH,
          mkRelease({ authorPubkey: SELLER })
        )
      ).rejects.toThrow(HodlAuthorizationError);
    });

    it("is anchored on the order's arbiter, not on whoever is configured now", async () => {
      // The row was written under a previous ARBITER_NOSTR_PUBKEY. Rotating
      // the config must not hand a new key authority over old escrow.
      const rotatedArbiter = "5".repeat(64);
      process.env.ARBITER_NOSTR_PUBKEY = rotatedArbiter;

      await expect(
        authorizeHodlReleaseEventForOrder(
          PAYMENT_HASH,
          mkRelease({ authorPubkey: rotatedArbiter })
        )
      ).rejects.toMatchObject({ reason: "pubkey_mismatch" });

      delete process.env.ARBITER_NOSTR_PUBKEY;
    });

    it("throws order_mismatch when the ruling belongs to another order", async () => {
      await expect(
        authorizeHodlReleaseEventForOrder(
          PAYMENT_HASH,
          mkRelease({ orderId: OTHER_PAYMENT_HASH })
        )
      ).rejects.toMatchObject({ reason: "order_mismatch" });

      expect(getHodlEscrowOrderPartiesMock).not.toHaveBeenCalled();
    });

    it("matches an arbiter pubkey that differs only in hex case", async () => {
      getHodlEscrowOrderPartiesMock.mockResolvedValue({
        ...committedOrder,
        arbiterNostrPubkey: "beef".repeat(16),
      });

      await expect(
        authorizeHodlReleaseEventForOrder(
          PAYMENT_HASH,
          mkRelease({ authorPubkey: "BEEF".repeat(16) })
        )
      ).resolves.toBeDefined();
    });
  });
});
