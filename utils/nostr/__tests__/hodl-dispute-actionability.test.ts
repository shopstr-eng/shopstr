const getHodlEscrowOrderDisputeContextMock = jest.fn();

jest.mock("@/utils/db/db-service", () => ({
  getHodlEscrowOrderDisputeContext: (...args: unknown[]) =>
    getHodlEscrowOrderDisputeContextMock(...args),
}));

import {
  evaluateHodlDisputeActionability,
  HodlDisputeActionabilityError,
  SELLER_DISPUTE_TIMEOUT_SECONDS,
} from "../hodl-dispute-actionability";
import type { ParsedHodlDisputeEvent } from "../hodl-escrow-records";

const PAYMENT_HASH = "b".repeat(64);
const BUYER_PUBKEY = "1".repeat(64);
const SELLER_PUBKEY = "2".repeat(64);
const IMPOSTOR_PUBKEY = "e".repeat(64);

const NOW_SECONDS = 1_700_000_000;

function disputeEvent(
  overrides: Partial<ParsedHodlDisputeEvent> = {}
): ParsedHodlDisputeEvent {
  return {
    orderId: PAYMENT_HASH,
    authorPubkey: BUYER_PUBKEY,
    description: "item never arrived",
    createdAt: NOW_SECONDS,
    ...overrides,
  };
}

function orderContext(
  overrides: Partial<{
    buyerNostrPubkey: string;
    sellerNostrPubkey: string;
    acceptedAt: Date | null;
  }> = {}
) {
  return {
    buyerNostrPubkey: BUYER_PUBKEY,
    sellerNostrPubkey: SELLER_PUBKEY,
    acceptedAt: null,
    ...overrides,
  };
}

describe("evaluateHodlDisputeActionability", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("is always actionable for the buyer, regardless of timing", async () => {
    getHodlEscrowOrderDisputeContextMock.mockResolvedValue(
      orderContext({ acceptedAt: new Date(NOW_SECONDS * 1000) })
    );

    const result = await evaluateHodlDisputeActionability(
      PAYMENT_HASH,
      disputeEvent({ authorPubkey: BUYER_PUBKEY }),
      NOW_SECONDS
    );

    expect(result).toEqual({ role: "buyer", actionable: true });
  });

  it("is actionable for the buyer even with no accepted_at at all", async () => {
    getHodlEscrowOrderDisputeContextMock.mockResolvedValue(
      orderContext({ acceptedAt: null })
    );

    const result = await evaluateHodlDisputeActionability(
      PAYMENT_HASH,
      disputeEvent({ authorPubkey: BUYER_PUBKEY }),
      NOW_SECONDS
    );

    expect(result).toEqual({ role: "buyer", actionable: true });
  });

  it("is not actionable for the seller before the timeout, with the correct remainingSeconds", async () => {
    const acceptedAtSeconds = NOW_SECONDS - 1000; // elapsed 1000s < timeout
    getHodlEscrowOrderDisputeContextMock.mockResolvedValue(
      orderContext({ acceptedAt: new Date(acceptedAtSeconds * 1000) })
    );

    const result = await evaluateHodlDisputeActionability(
      PAYMENT_HASH,
      disputeEvent({ authorPubkey: SELLER_PUBKEY }),
      NOW_SECONDS
    );

    expect(result).toEqual({
      role: "seller",
      actionable: false,
      remainingSeconds: SELLER_DISPUTE_TIMEOUT_SECONDS - 1000,
    });
  });

  it("is actionable for the seller exactly at the timeout boundary", async () => {
    const acceptedAtSeconds = NOW_SECONDS - SELLER_DISPUTE_TIMEOUT_SECONDS;
    getHodlEscrowOrderDisputeContextMock.mockResolvedValue(
      orderContext({ acceptedAt: new Date(acceptedAtSeconds * 1000) })
    );

    const result = await evaluateHodlDisputeActionability(
      PAYMENT_HASH,
      disputeEvent({ authorPubkey: SELLER_PUBKEY }),
      NOW_SECONDS
    );

    expect(result).toEqual({ role: "seller", actionable: true });
  });

  it("is actionable for the seller well after the timeout", async () => {
    const acceptedAtSeconds =
      NOW_SECONDS - SELLER_DISPUTE_TIMEOUT_SECONDS - 60 * 60;
    getHodlEscrowOrderDisputeContextMock.mockResolvedValue(
      orderContext({ acceptedAt: new Date(acceptedAtSeconds * 1000) })
    );

    const result = await evaluateHodlDisputeActionability(
      PAYMENT_HASH,
      disputeEvent({ authorPubkey: SELLER_PUBKEY }),
      NOW_SECONDS
    );

    expect(result).toEqual({ role: "seller", actionable: true });
    expect(result).not.toHaveProperty("remainingSeconds");
  });

  it("throws unknown_disputer when the author is neither buyer nor seller", async () => {
    getHodlEscrowOrderDisputeContextMock.mockResolvedValue(orderContext());

    await expect(
      evaluateHodlDisputeActionability(
        PAYMENT_HASH,
        disputeEvent({ authorPubkey: IMPOSTOR_PUBKEY }),
        NOW_SECONDS
      )
    ).rejects.toMatchObject({
      name: "HodlDisputeActionabilityError",
      reason: "unknown_disputer",
    });
  });

  it("throws unknown_disputer as an instance of HodlDisputeActionabilityError", async () => {
    getHodlEscrowOrderDisputeContextMock.mockResolvedValue(orderContext());

    await expect(
      evaluateHodlDisputeActionability(
        PAYMENT_HASH,
        disputeEvent({ authorPubkey: IMPOSTOR_PUBKEY }),
        NOW_SECONDS
      )
    ).rejects.toBeInstanceOf(HodlDisputeActionabilityError);
  });

  it("throws no_such_order when no commitment row exists", async () => {
    getHodlEscrowOrderDisputeContextMock.mockResolvedValue(null);

    await expect(
      evaluateHodlDisputeActionability(
        PAYMENT_HASH,
        disputeEvent(),
        NOW_SECONDS
      )
    ).rejects.toMatchObject({
      name: "HodlDisputeActionabilityError",
      reason: "no_such_order",
    });
  });

  it("throws no_accepted_at for a seller dispute when accepted_at is null", async () => {
    getHodlEscrowOrderDisputeContextMock.mockResolvedValue(
      orderContext({ acceptedAt: null })
    );

    await expect(
      evaluateHodlDisputeActionability(
        PAYMENT_HASH,
        disputeEvent({ authorPubkey: SELLER_PUBKEY }),
        NOW_SECONDS
      )
    ).rejects.toMatchObject({
      name: "HodlDisputeActionabilityError",
      reason: "no_accepted_at",
    });
  });

  it("carries the payment hash and author pubkey on the thrown error", async () => {
    getHodlEscrowOrderDisputeContextMock.mockResolvedValue(orderContext());

    await expect(
      evaluateHodlDisputeActionability(
        PAYMENT_HASH,
        disputeEvent({ authorPubkey: IMPOSTOR_PUBKEY }),
        NOW_SECONDS
      )
    ).rejects.toMatchObject({
      paymentHash: PAYMENT_HASH,
      authorPubkey: IMPOSTOR_PUBKEY,
    });
  });

  it("looks up the lowercased payment hash", async () => {
    getHodlEscrowOrderDisputeContextMock.mockResolvedValue(orderContext());

    await evaluateHodlDisputeActionability(
      PAYMENT_HASH.toUpperCase(),
      disputeEvent({ authorPubkey: BUYER_PUBKEY }),
      NOW_SECONDS
    );

    expect(getHodlEscrowOrderDisputeContextMock).toHaveBeenCalledWith(
      PAYMENT_HASH
    );
  });

  it("matches pubkeys case-insensitively", async () => {
    getHodlEscrowOrderDisputeContextMock.mockResolvedValue(orderContext());

    const result = await evaluateHodlDisputeActionability(
      PAYMENT_HASH,
      disputeEvent({ authorPubkey: BUYER_PUBKEY.toUpperCase() }),
      NOW_SECONDS
    );

    expect(result.role).toBe("buyer");
  });

  it("defaults nowSeconds to the current time when not supplied", async () => {
    getHodlEscrowOrderDisputeContextMock.mockResolvedValue(
      orderContext({ acceptedAt: new Date() })
    );

    const result = await evaluateHodlDisputeActionability(
      PAYMENT_HASH,
      disputeEvent({ authorPubkey: SELLER_PUBKEY })
    );

    // Accepted "just now" relative to the real clock, so still within the
    // timeout window.
    expect(result.role).toBe("seller");
    expect(result.actionable).toBe(false);
  });
});
