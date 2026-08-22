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

  it("throws unknown_disputer, as an instance of HodlDisputeActionabilityError, carrying identifying context", async () => {
    getHodlEscrowOrderDisputeContextMock.mockResolvedValue(orderContext());

    const error = await evaluateHodlDisputeActionability(
      PAYMENT_HASH,
      disputeEvent({ authorPubkey: IMPOSTOR_PUBKEY }),
      NOW_SECONDS
    ).catch((thrown: HodlDisputeActionabilityError) => thrown);

    expect(error).toBeInstanceOf(HodlDisputeActionabilityError);
    expect(error).toMatchObject({
      name: "HodlDisputeActionabilityError",
      reason: "unknown_disputer",
      paymentHash: PAYMENT_HASH,
      authorPubkey: IMPOSTOR_PUBKEY,
    });
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

  /**
   * The seller timeout is epoch arithmetic on both sides — acceptedAt.getTime()
   * against a nowSeconds derived from Date.now() — so a correct absolute
   * instant has to yield the same verdict in every process timezone. These pin
   * that: no manual formatting, no wall-clock component, nothing that would
   * make a non-UTC deployment behave differently from a UTC one.
   *
   * What they deliberately do not cover: whether the Date reaching this
   * function is the right instant in the first place. That depends on
   * accepted_at being TIMESTAMPTZ in the database, and is pinned separately in
   * utils/db/__tests__/hodl-escrow-orders.test.ts ("accepted_at timezone
   * round-tripping").
   */
  describe("timezone independence of the seller timeout", () => {
    const ACCEPTED_AT_SECONDS = Math.floor(
      Date.parse("2026-08-05T12:00:00.000Z") / 1000
    );

    // One instant, spelled four ways — UTC, a half-hour offset, a negative
    // offset, and one past the dateline where even the calendar date differs.
    // Every Date below is the same absolute moment, so the verdict must not
    // move. Note this varies the *spelling of the input*, not process.env.TZ:
    // assigning that under Jest does not invalidate V8's timezone cache, so
    // zone-parameterised cases would pass vacuously in the runner's own zone.
    const SPELLINGS: [string, string][] = [
      ["Z", "2026-08-05T12:00:00.000Z"],
      ["+05:30", "2026-08-05T17:30:00.000+05:30"],
      ["-04:00", "2026-08-05T08:00:00.000-04:00"],
      ["+14:00", "2026-08-06T02:00:00.000+14:00"],
    ];

    it.each(SPELLINGS)(
      "holds a one-minute-early seller dispute for an acceptedAt spelled %s",
      async (_, iso) => {
        getHodlEscrowOrderDisputeContextMock.mockResolvedValue(
          orderContext({ acceptedAt: new Date(iso) })
        );

        const result = await evaluateHodlDisputeActionability(
          PAYMENT_HASH,
          disputeEvent({ authorPubkey: SELLER_PUBKEY }),
          ACCEPTED_AT_SECONDS + SELLER_DISPUTE_TIMEOUT_SECONDS - 60
        );

        expect(result).toEqual({
          role: "seller",
          actionable: false,
          remainingSeconds: 60,
        });
      }
    );

    it.each(SPELLINGS)(
      "releases the seller dispute on the boundary for an acceptedAt spelled %s",
      async (_, iso) => {
        getHodlEscrowOrderDisputeContextMock.mockResolvedValue(
          orderContext({ acceptedAt: new Date(iso) })
        );

        const result = await evaluateHodlDisputeActionability(
          PAYMENT_HASH,
          disputeEvent({ authorPubkey: SELLER_PUBKEY }),
          ACCEPTED_AT_SECONDS + SELLER_DISPUTE_TIMEOUT_SECONDS
        );

        expect(result).toEqual({ role: "seller", actionable: true });
      }
    );

    it("flips the verdict outright when acceptedAt arrives skewed by a UTC offset", async () => {
      // Why the column type is load-bearing rather than cosmetic. A plain
      // TIMESTAMP read in Asia/Kolkata (+05:30) lands 5h30m early, and the
      // seller timeout is 4h — so an order accepted moments ago reads as long
      // past its window. Feed the function the Date such a read would hand it
      // and the wait it exists to impose disappears.
      const acceptedJustNow = new Date("2026-08-05T12:00:00.000Z");
      const nowSeconds = ACCEPTED_AT_SECONDS + 60;

      getHodlEscrowOrderDisputeContextMock.mockResolvedValue(
        orderContext({ acceptedAt: acceptedJustNow })
      );
      await expect(
        evaluateHodlDisputeActionability(
          PAYMENT_HASH,
          disputeEvent({ authorPubkey: SELLER_PUBKEY }),
          nowSeconds
        )
      ).resolves.toMatchObject({ actionable: false });

      const skewedByIstOffset = new Date(
        acceptedJustNow.getTime() - 5.5 * 60 * 60 * 1000
      );
      getHodlEscrowOrderDisputeContextMock.mockResolvedValue(
        orderContext({ acceptedAt: skewedByIstOffset })
      );
      await expect(
        evaluateHodlDisputeActionability(
          PAYMENT_HASH,
          disputeEvent({ authorPubkey: SELLER_PUBKEY }),
          nowSeconds
        )
      ).resolves.toMatchObject({ actionable: true });
    });
  });
});
