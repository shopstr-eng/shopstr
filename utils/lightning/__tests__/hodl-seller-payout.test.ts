/**
 * @jest-environment node
 */

/**
 * Behavioural spec for utils/lightning/hodl-seller-payout.ts.
 *
 * Written before the implementation, from the payout design alone. Every
 * expectation below is a statement about what a correct payout must do with
 * somebody else's money, not a description of what some code happens to do:
 *
 *  - An invoice is stored before it is paid, always, so a crash between the
 *    two leaves a record to check against instead of an untracked payment.
 *  - A stored invoice is never re-paid on the strength of its age. Its real
 *    status is asked for, every time.
 *  - "I could not find out" is its own answer. It is never rounded to either
 *    "unpaid, pay again" or "paid, we are done".
 *  - Money that could not be delivered leaves a row a human can find.
 */

const getHodlEscrowPayoutOrderContextMock = jest.fn();
const claimHodlEscrowPayoutAttemptMock = jest.fn();
const recordHodlEscrowPayoutInvoiceMock = jest.fn();
const discardHodlEscrowPayoutInvoiceMock = jest.fn();
const markHodlEscrowPayoutPaidMock = jest.fn();
const markHodlEscrowPayoutFailedMock = jest.fn();
const markHodlEscrowPayoutAbandonedMock = jest.fn();
const recordHodlEscrowPayoutErrorMock = jest.fn();

jest.mock("@/utils/db/db-service", () => {
  class DatabaseUnavailableError extends Error {
    constructor(message = "Database unavailable") {
      super(message);
      this.name = "DatabaseUnavailableError";
    }
  }
  return {
    DatabaseUnavailableError,
    getHodlEscrowPayoutOrderContext: (...args: unknown[]) =>
      getHodlEscrowPayoutOrderContextMock(...args),
    claimHodlEscrowPayoutAttempt: (...args: unknown[]) =>
      claimHodlEscrowPayoutAttemptMock(...args),
    recordHodlEscrowPayoutInvoice: (...args: unknown[]) =>
      recordHodlEscrowPayoutInvoiceMock(...args),
    discardHodlEscrowPayoutInvoice: (...args: unknown[]) =>
      discardHodlEscrowPayoutInvoiceMock(...args),
    markHodlEscrowPayoutPaid: (...args: unknown[]) =>
      markHodlEscrowPayoutPaidMock(...args),
    markHodlEscrowPayoutFailed: (...args: unknown[]) =>
      markHodlEscrowPayoutFailedMock(...args),
    markHodlEscrowPayoutAbandoned: (...args: unknown[]) =>
      markHodlEscrowPayoutAbandonedMock(...args),
    recordHodlEscrowPayoutError: (...args: unknown[]) =>
      recordHodlEscrowPayoutErrorMock(...args),
  };
});

import {
  payoutToSeller,
  schedulePayoutToSeller,
  resolvePayoutInvoiceStatus,
  HodlSellerPayoutPayerUnavailableError,
  MAX_HODL_SELLER_PAYOUT_ATTEMPTS,
  type HodlSellerPayoutDependencies,
} from "../hodl-seller-payout";

const PAYMENT_HASH = "b".repeat(64);
const SELLER_PUBKEY = "2".repeat(64);
const SELLER_ADDRESS = "seller@getalby.com";
const AMOUNT_SATS = 4200;

const STORED_INVOICE = "lnbc42u1storedexample";
const STORED_VERIFY_URL = "https://getalby.com/verify/stored";
const FRESH_INVOICE = "lnbc42u1freshexample";
const FRESH_VERIFY_URL = "https://getalby.com/verify/fresh";

/** Records the order in which the money-touching steps happen. */
let callLog: string[];

function createDeps(
  overrides: Partial<HodlSellerPayoutDependencies> = {}
): HodlSellerPayoutDependencies {
  return {
    resolveLightningAddress: jest.fn(async () => SELLER_ADDRESS),
    requestPayoutInvoice: jest.fn(async () => {
      callLog.push("requestPayoutInvoice");
      return {
        paymentRequest: FRESH_INVOICE,
        verifyUrl: FRESH_VERIFY_URL,
        amountSats: AMOUNT_SATS,
      };
    }),
    checkPayoutInvoiceStatus: jest.fn(async () => {
      callLog.push("checkPayoutInvoiceStatus");
      return "unknown" as const;
    }),
    payPayoutInvoice: jest.fn(async () => {
      callLog.push("payPayoutInvoice");
    }),
    ...overrides,
  };
}

/** A settled order with a seller and an amount to pay out. */
function settledOrder() {
  return {
    sellerNostrPubkey: SELLER_PUBKEY,
    amountSats: AMOUNT_SATS,
    orderStatus: "settled" as const,
  };
}

/** The claim a first, uncontended attempt gets: no invoice was ever stored. */
function freshClaim(attemptCount = 1) {
  return {
    outcome: "claimed" as const,
    invoice: null,
    verifyUrl: null,
    attemptCount,
  };
}

/** The claim a retry gets when an invoice was stored by an earlier attempt. */
function claimWithStoredInvoice(attemptCount = 2) {
  return {
    outcome: "claimed" as const,
    invoice: STORED_INVOICE,
    verifyUrl: STORED_VERIFY_URL,
    attemptCount,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  callLog = [];
  getHodlEscrowPayoutOrderContextMock.mockResolvedValue(settledOrder());
  claimHodlEscrowPayoutAttemptMock.mockResolvedValue(freshClaim());
  recordHodlEscrowPayoutInvoiceMock.mockImplementation(async () => {
    callLog.push("recordHodlEscrowPayoutInvoice");
    return "stored";
  });
  discardHodlEscrowPayoutInvoiceMock.mockImplementation(async () => {
    callLog.push("discardHodlEscrowPayoutInvoice");
    return "failed";
  });
  markHodlEscrowPayoutPaidMock.mockImplementation(async () => {
    callLog.push("markHodlEscrowPayoutPaid");
    return "paid";
  });
  markHodlEscrowPayoutFailedMock.mockResolvedValue("failed");
  markHodlEscrowPayoutAbandonedMock.mockResolvedValue("abandoned");
  recordHodlEscrowPayoutErrorMock.mockResolvedValue(undefined);
  jest.spyOn(console, "error").mockImplementation(() => {});
  jest.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe("payoutToSeller — the first attempt", () => {
  it("requests a fresh invoice for the settled amount and pays it", async () => {
    const deps = createDeps();

    const result = await payoutToSeller(PAYMENT_HASH, deps);

    expect(result.status).toBe("paid");
    expect(deps.requestPayoutInvoice).toHaveBeenCalledWith(
      expect.objectContaining({
        lightningAddress: SELLER_ADDRESS,
        amountSats: AMOUNT_SATS,
      })
    );
    expect(deps.payPayoutInvoice).toHaveBeenCalledWith(
      expect.objectContaining({
        paymentRequest: FRESH_INVOICE,
        amountSats: AMOUNT_SATS,
      })
    );
    expect(markHodlEscrowPayoutPaidMock).toHaveBeenCalledWith(PAYMENT_HASH);
  });

  it("stores the invoice BEFORE attempting payment", async () => {
    // The load-bearing ordering. Stored after payment, a crash in between
    // leaves a paid invoice nothing knows about, and the next retry pays a
    // second one.
    await payoutToSeller(PAYMENT_HASH, createDeps());

    expect(callLog).toEqual([
      "requestPayoutInvoice",
      "recordHodlEscrowPayoutInvoice",
      "payPayoutInvoice",
      "markHodlEscrowPayoutPaid",
    ]);
  });

  it("stores the invoice together with the verify URL that can prove it paid", async () => {
    await payoutToSeller(PAYMENT_HASH, createDeps());

    expect(recordHodlEscrowPayoutInvoiceMock).toHaveBeenCalledWith(
      PAYMENT_HASH,
      expect.objectContaining({
        invoice: FRESH_INVOICE,
        verifyUrl: FRESH_VERIFY_URL,
      })
    );
  });

  it("normalizes a mixed-case payment hash before touching any record", async () => {
    await payoutToSeller(PAYMENT_HASH.toUpperCase(), createDeps());

    expect(getHodlEscrowPayoutOrderContextMock).toHaveBeenCalledWith(
      PAYMENT_HASH
    );
    expect(claimHodlEscrowPayoutAttemptMock).toHaveBeenCalledWith(PAYMENT_HASH);
  });
});

describe("payoutToSeller — orders that must not be paid out", () => {
  it("refuses when no escrow order exists for the payment hash", async () => {
    getHodlEscrowPayoutOrderContextMock.mockResolvedValue(null);
    const deps = createDeps();

    const result = await payoutToSeller(PAYMENT_HASH, deps);

    expect(result.status).toBe("no_order");
    expect(claimHodlEscrowPayoutAttemptMock).not.toHaveBeenCalled();
    expect(deps.requestPayoutInvoice).not.toHaveBeenCalled();
    expect(deps.payPayoutInvoice).not.toHaveBeenCalled();
  });

  it.each(["open", "accepted", "cancelled"] as const)(
    "refuses to pay out a %s order — only a settled one has funds to forward",
    async (orderStatus) => {
      getHodlEscrowPayoutOrderContextMock.mockResolvedValue({
        ...settledOrder(),
        orderStatus,
      });
      const deps = createDeps();

      const result = await payoutToSeller(PAYMENT_HASH, deps);

      expect(result.status).toBe("not_settled");
      expect(claimHodlEscrowPayoutAttemptMock).not.toHaveBeenCalled();
      expect(deps.requestPayoutInvoice).not.toHaveBeenCalled();
      expect(deps.payPayoutInvoice).not.toHaveBeenCalled();
    }
  );
});

describe("payoutToSeller — retry with no stored invoice", () => {
  it("requests a fresh invoice, because nothing was ever paid", async () => {
    claimHodlEscrowPayoutAttemptMock.mockResolvedValue(freshClaim(3));
    const deps = createDeps();

    const result = await payoutToSeller(PAYMENT_HASH, deps);

    expect(result.status).toBe("paid");
    // No invoice on record means there is nothing whose status could be
    // checked; asking anyway would be asking about nothing.
    expect(deps.checkPayoutInvoiceStatus).not.toHaveBeenCalled();
    expect(deps.requestPayoutInvoice).toHaveBeenCalledTimes(1);
    expect(deps.payPayoutInvoice).toHaveBeenCalledTimes(1);
  });
});

describe("payoutToSeller — retry with a stored invoice", () => {
  it("always checks the stored invoice's real status before anything else", async () => {
    claimHodlEscrowPayoutAttemptMock.mockResolvedValue(
      claimWithStoredInvoice()
    );
    const deps = createDeps();

    await payoutToSeller(PAYMENT_HASH, deps);

    expect(deps.checkPayoutInvoiceStatus).toHaveBeenCalledWith(
      expect.objectContaining({
        paymentRequest: STORED_INVOICE,
        verifyUrl: STORED_VERIFY_URL,
      })
    );
    expect(callLog[0]).toBe("checkPayoutInvoiceStatus");
  });

  it("marks the payout complete and pays nothing more when the stored invoice is confirmed paid", async () => {
    claimHodlEscrowPayoutAttemptMock.mockResolvedValue(
      claimWithStoredInvoice()
    );
    const deps = createDeps({
      checkPayoutInvoiceStatus: jest.fn(async () => "paid" as const),
    });

    const result = await payoutToSeller(PAYMENT_HASH, deps);

    expect(result.status).toBe("already_paid");
    expect(markHodlEscrowPayoutPaidMock).toHaveBeenCalledWith(PAYMENT_HASH);
    // The whole point: no second invoice, no second payment.
    expect(deps.requestPayoutInvoice).not.toHaveBeenCalled();
    expect(deps.payPayoutInvoice).not.toHaveBeenCalled();
    expect(discardHodlEscrowPayoutInvoiceMock).not.toHaveBeenCalled();
  });

  it("requests a new invoice when the stored one is confirmed dead and never paid", async () => {
    claimHodlEscrowPayoutAttemptMock.mockResolvedValue(
      claimWithStoredInvoice()
    );
    const deps = createDeps({
      checkPayoutInvoiceStatus: jest.fn(async () => {
        callLog.push("checkPayoutInvoiceStatus");
        return "dead" as const;
      }),
    });

    const result = await payoutToSeller(PAYMENT_HASH, deps);

    expect(result.status).toBe("paid");
    // The dead invoice is cleared first, so it can never be mistaken later
    // for an invoice whose status still needs checking.
    expect(discardHodlEscrowPayoutInvoiceMock).toHaveBeenCalledWith(
      PAYMENT_HASH,
      expect.any(String)
    );
    expect(callLog).toEqual([
      "checkPayoutInvoiceStatus",
      "discardHodlEscrowPayoutInvoice",
      "requestPayoutInvoice",
      "recordHodlEscrowPayoutInvoice",
      "payPayoutInvoice",
      "markHodlEscrowPayoutPaid",
    ]);
  });

  it("takes no new payment action when the stored invoice's status is ambiguous", async () => {
    claimHodlEscrowPayoutAttemptMock.mockResolvedValue(
      claimWithStoredInvoice()
    );
    const deps = createDeps({
      checkPayoutInvoiceStatus: jest.fn(async () => "unknown" as const),
    });

    const result = await payoutToSeller(PAYMENT_HASH, deps);

    // A distinct answer of its own: neither success nor failure, so a later
    // attempt asks the same question again.
    expect(result.status).toBe("unverified");
    expect(deps.requestPayoutInvoice).not.toHaveBeenCalled();
    expect(deps.payPayoutInvoice).not.toHaveBeenCalled();
    // Nothing terminal is written, and the invoice stays on the row.
    expect(markHodlEscrowPayoutPaidMock).not.toHaveBeenCalled();
    expect(markHodlEscrowPayoutFailedMock).not.toHaveBeenCalled();
    expect(markHodlEscrowPayoutAbandonedMock).not.toHaveBeenCalled();
    expect(discardHodlEscrowPayoutInvoiceMock).not.toHaveBeenCalled();
  });

  it("treats a status check that throws as ambiguous, not as a dead invoice", async () => {
    claimHodlEscrowPayoutAttemptMock.mockResolvedValue(
      claimWithStoredInvoice()
    );
    const deps = createDeps({
      checkPayoutInvoiceStatus: jest.fn(async () => {
        throw new Error("verify endpoint unreachable");
      }),
    });

    const result = await payoutToSeller(PAYMENT_HASH, deps);

    expect(result.status).toBe("unverified");
    expect(deps.requestPayoutInvoice).not.toHaveBeenCalled();
    expect(deps.payPayoutInvoice).not.toHaveBeenCalled();
    expect(discardHodlEscrowPayoutInvoiceMock).not.toHaveBeenCalled();
  });
});

describe("payoutToSeller — concurrent attempts", () => {
  it("stands down when another attempt already holds the claim", async () => {
    claimHodlEscrowPayoutAttemptMock.mockResolvedValue({
      outcome: "in-progress",
    });
    const deps = createDeps();

    const result = await payoutToSeller(PAYMENT_HASH, deps);

    expect(result.status).toBe("in_progress");
    expect(deps.requestPayoutInvoice).not.toHaveBeenCalled();
    expect(deps.payPayoutInvoice).not.toHaveBeenCalled();
  });

  it("pays exactly once when two attempts run against the same order", async () => {
    // The row lock hands the claim to one caller; the other is told the
    // payout is already in flight. Two concurrent retries, one payment.
    claimHodlEscrowPayoutAttemptMock
      .mockResolvedValueOnce(freshClaim())
      .mockResolvedValueOnce({ outcome: "in-progress" });

    const deps = createDeps();
    const results = await Promise.all([
      payoutToSeller(PAYMENT_HASH, deps),
      payoutToSeller(PAYMENT_HASH, deps),
    ]);

    expect(deps.payPayoutInvoice).toHaveBeenCalledTimes(1);
    expect(deps.requestPayoutInvoice).toHaveBeenCalledTimes(1);
    expect(results.map((r) => r.status).sort()).toEqual([
      "in_progress",
      "paid",
    ]);
  });

  it("does not pay when the invoice it just requested lost the store race", async () => {
    // recordHodlEscrowPayoutInvoice is first-write-wins. Losing it means some
    // other attempt's invoice is the one on the row, and paying this one
    // would pay an invoice nothing is tracking.
    recordHodlEscrowPayoutInvoiceMock.mockResolvedValue("not-stored");
    const deps = createDeps();

    const result = await payoutToSeller(PAYMENT_HASH, deps);

    expect(result.status).toBe("unverified");
    expect(deps.payPayoutInvoice).not.toHaveBeenCalled();
    expect(markHodlEscrowPayoutPaidMock).not.toHaveBeenCalled();
  });
});

describe("payoutToSeller — a payment whose outcome is unknown", () => {
  it("leaves the row pending with the invoice intact when the payment call fails", async () => {
    // A send that throws may still be in flight. Marking it failed, or
    // discarding the invoice, would invite a second payment for the same
    // money — so the row keeps the invoice and the next attempt verifies it.
    const deps = createDeps({
      payPayoutInvoice: jest.fn(async () => {
        throw new Error("payment timed out");
      }),
    });

    const result = await payoutToSeller(PAYMENT_HASH, deps);

    expect(result.status).toBe("unverified");
    expect(recordHodlEscrowPayoutErrorMock).toHaveBeenCalledWith(
      PAYMENT_HASH,
      expect.stringContaining("payment timed out")
    );
    expect(markHodlEscrowPayoutFailedMock).not.toHaveBeenCalled();
    expect(markHodlEscrowPayoutAbandonedMock).not.toHaveBeenCalled();
    expect(discardHodlEscrowPayoutInvoiceMock).not.toHaveBeenCalled();
    expect(markHodlEscrowPayoutPaidMock).not.toHaveBeenCalled();
  });

  it("leaves the row pending when the payment succeeded but the record could not be written", async () => {
    markHodlEscrowPayoutPaidMock.mockRejectedValue(new Error("db down"));
    const deps = createDeps();

    const result = await payoutToSeller(PAYMENT_HASH, deps);

    // Still pending with the invoice stored: the next attempt verifies that
    // invoice, finds it paid, and reconciles the row. It never pays twice.
    expect(result.status).toBe("unverified");
    expect(markHodlEscrowPayoutFailedMock).not.toHaveBeenCalled();
    expect(discardHodlEscrowPayoutInvoiceMock).not.toHaveBeenCalled();
  });
});

describe("payoutToSeller — failures that must stay find-able", () => {
  it("records a retryable failure when the seller has no Lightning address", async () => {
    const deps = createDeps({
      resolveLightningAddress: jest.fn(async () => null),
    });

    const result = await payoutToSeller(PAYMENT_HASH, deps);

    expect(result.status).toBe("failed");
    expect(markHodlEscrowPayoutFailedMock).toHaveBeenCalledWith(
      PAYMENT_HASH,
      expect.any(String)
    );
    expect(deps.requestPayoutInvoice).not.toHaveBeenCalled();
    expect(deps.payPayoutInvoice).not.toHaveBeenCalled();
  });

  it("records a retryable failure when the Lightning address is unreachable", async () => {
    const deps = createDeps({
      requestPayoutInvoice: jest.fn(async () => {
        throw new Error("LNURL host did not respond");
      }),
    });

    const result = await payoutToSeller(PAYMENT_HASH, deps);

    expect(result.status).toBe("failed");
    expect(markHodlEscrowPayoutFailedMock).toHaveBeenCalledWith(
      PAYMENT_HASH,
      expect.stringContaining("LNURL host did not respond")
    );
    // Nothing was stored, so the next attempt starts cleanly from scratch.
    expect(recordHodlEscrowPayoutInvoiceMock).not.toHaveBeenCalled();
    expect(deps.payPayoutInvoice).not.toHaveBeenCalled();
  });

  it("refuses an invoice whose amount is not the settled amount", async () => {
    const deps = createDeps({
      requestPayoutInvoice: jest.fn(async () => ({
        paymentRequest: FRESH_INVOICE,
        verifyUrl: FRESH_VERIFY_URL,
        amountSats: AMOUNT_SATS + 1,
      })),
    });

    const result = await payoutToSeller(PAYMENT_HASH, deps);

    expect(result.status).toBe("failed");
    expect(recordHodlEscrowPayoutInvoiceMock).not.toHaveBeenCalled();
    expect(deps.payPayoutInvoice).not.toHaveBeenCalled();
  });

  it("records a retryable failure when no Lightning payer is configured", async () => {
    // Nothing was sent, and configuring a payer later fixes it — so this is
    // failed, not abandoned.
    const deps = createDeps({
      payPayoutInvoice: jest.fn(async () => {
        throw new HodlSellerPayoutPayerUnavailableError(
          "No Lightning payer is configured"
        );
      }),
    });

    const result = await payoutToSeller(PAYMENT_HASH, deps);

    expect(result.status).toBe("failed");
    expect(markHodlEscrowPayoutFailedMock).toHaveBeenCalledWith(
      PAYMENT_HASH,
      expect.stringContaining("No Lightning payer is configured")
    );
    expect(markHodlEscrowPayoutPaidMock).not.toHaveBeenCalled();
  });

  it("abandons the payout once the attempt limit is exhausted, instead of retrying forever", async () => {
    claimHodlEscrowPayoutAttemptMock.mockResolvedValue(
      freshClaim(MAX_HODL_SELLER_PAYOUT_ATTEMPTS + 1)
    );
    const deps = createDeps();

    const result = await payoutToSeller(PAYMENT_HASH, deps);

    expect(result.status).toBe("abandoned");
    expect(markHodlEscrowPayoutAbandonedMock).toHaveBeenCalledWith(
      PAYMENT_HASH,
      expect.any(String)
    );
    expect(deps.requestPayoutInvoice).not.toHaveBeenCalled();
    expect(deps.payPayoutInvoice).not.toHaveBeenCalled();
  });

  it("still verifies a stored invoice on the attempt that hits the limit", async () => {
    // Money that was already sent must be recognized even at the limit;
    // abandoning a payout that in fact succeeded would strand the record.
    claimHodlEscrowPayoutAttemptMock.mockResolvedValue({
      ...claimWithStoredInvoice(),
      attemptCount: MAX_HODL_SELLER_PAYOUT_ATTEMPTS + 1,
    });
    const deps = createDeps({
      checkPayoutInvoiceStatus: jest.fn(async () => "paid" as const),
    });

    const result = await payoutToSeller(PAYMENT_HASH, deps);

    expect(result.status).toBe("already_paid");
    expect(markHodlEscrowPayoutPaidMock).toHaveBeenCalledWith(PAYMENT_HASH);
    expect(markHodlEscrowPayoutAbandonedMock).not.toHaveBeenCalled();
  });
});

describe("payoutToSeller — terminal rows", () => {
  it("reports an already-paid payout without touching Lightning", async () => {
    claimHodlEscrowPayoutAttemptMock.mockResolvedValue({
      outcome: "terminal",
      status: "paid",
      lastError: null,
    });
    const deps = createDeps();

    const result = await payoutToSeller(PAYMENT_HASH, deps);

    expect(result.status).toBe("already_paid");
    expect(deps.checkPayoutInvoiceStatus).not.toHaveBeenCalled();
    expect(deps.requestPayoutInvoice).not.toHaveBeenCalled();
    expect(deps.payPayoutInvoice).not.toHaveBeenCalled();
  });

  it("reports an abandoned payout and never silently retries it", async () => {
    claimHodlEscrowPayoutAttemptMock.mockResolvedValue({
      outcome: "terminal",
      status: "abandoned",
      lastError: "seller address unreachable",
    });
    const deps = createDeps();

    const result = await payoutToSeller(PAYMENT_HASH, deps);

    expect(result.status).toBe("abandoned");
    expect(result.reason).toContain("seller address unreachable");
    expect(deps.requestPayoutInvoice).not.toHaveBeenCalled();
    expect(deps.payPayoutInvoice).not.toHaveBeenCalled();
  });
});

describe("resolvePayoutInvoiceStatus", () => {
  /** Stands in for a lightning-tools Invoice. */
  function fakeInvoice(options: {
    verify: string | null;
    paid?: boolean | (() => Promise<boolean>);
    expired?: boolean;
  }) {
    return {
      verify: options.verify,
      verifyPayment: async () => {
        if (typeof options.paid === "function") return options.paid();
        return options.paid ?? false;
      },
      hasExpired: () => options.expired ?? false,
    };
  }

  it("reports paid when the invoice's own verify endpoint says so", async () => {
    await expect(
      resolvePayoutInvoiceStatus(
        fakeInvoice({ verify: STORED_VERIFY_URL, paid: true })
      )
    ).resolves.toBe("paid");
  });

  it("reports paid for an expired invoice that was genuinely paid", async () => {
    // Old and paid is a real combination. Age is not evidence of anything.
    await expect(
      resolvePayoutInvoiceStatus(
        fakeInvoice({ verify: STORED_VERIFY_URL, paid: true, expired: true })
      )
    ).resolves.toBe("paid");
  });

  it("reports dead only when verify says unpaid AND the invoice has expired", async () => {
    await expect(
      resolvePayoutInvoiceStatus(
        fakeInvoice({ verify: STORED_VERIFY_URL, paid: false, expired: true })
      )
    ).resolves.toBe("dead");
  });

  it("reports unknown for an unpaid invoice that has not expired yet", async () => {
    // A payment could still be in flight against it.
    await expect(
      resolvePayoutInvoiceStatus(
        fakeInvoice({ verify: STORED_VERIFY_URL, paid: false, expired: false })
      )
    ).resolves.toBe("unknown");
  });

  it("reports unknown when the invoice offers no way to verify payment", async () => {
    // Expiry alone must never stand in for a status check.
    await expect(
      resolvePayoutInvoiceStatus(fakeInvoice({ verify: null, expired: true }))
    ).resolves.toBe("unknown");
  });

  it("reports unknown when the verify call itself fails", async () => {
    await expect(
      resolvePayoutInvoiceStatus(
        fakeInvoice({
          verify: STORED_VERIFY_URL,
          expired: true,
          paid: async () => {
            throw new Error("verify endpoint 502");
          },
        })
      )
    ).resolves.toBe("unknown");
  });
});

describe("schedulePayoutToSeller", () => {
  it("never lets a payout failure escape into the caller's control flow", async () => {
    getHodlEscrowPayoutOrderContextMock.mockRejectedValue(new Error("db down"));

    expect(() => schedulePayoutToSeller(PAYMENT_HASH)).not.toThrow();
    // Let the detached promise settle so an unhandled rejection would surface.
    await new Promise((resolve) => setImmediate(resolve));
    expect(console.error).toHaveBeenCalled();
  });
});
