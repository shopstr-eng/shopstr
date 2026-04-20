/**
 * @jest-environment node
 */
import {
  mintAffiliateUnsubscribeToken,
  verifyAffiliateUnsubscribeToken,
} from "@/utils/email/unsubscribe-tokens";

const ORIGINAL_SECRET = process.env.AFFILIATE_UNSUBSCRIBE_SECRET;

beforeAll(() => {
  process.env.AFFILIATE_UNSUBSCRIBE_SECRET =
    "test-unsubscribe-secret-must-be-at-least-16-chars";
});

afterAll(() => {
  if (ORIGINAL_SECRET === undefined) {
    delete process.env.AFFILIATE_UNSUBSCRIBE_SECRET;
  } else {
    process.env.AFFILIATE_UNSUBSCRIBE_SECRET = ORIGINAL_SECRET;
  }
});

describe("affiliate unsubscribe tokens", () => {
  it("round-trips a freshly-minted token", () => {
    const t = mintAffiliateUnsubscribeToken(42);
    expect(verifyAffiliateUnsubscribeToken(t)).toEqual({ affiliateId: 42 });
  });

  it("rejects tokens whose timestamp has been swapped onto another id", () => {
    const t = mintAffiliateUnsubscribeToken(42, 1_700_000_000_000);
    // Forge: keep the MAC but replace the id.
    const [, ts, mac] = t.split(".");
    const forged = `99.${ts}.${mac}`;
    expect(verifyAffiliateUnsubscribeToken(forged)).toBeNull();
  });

  it("rejects tokens older than the 1-year TTL", () => {
    const oneYearAndOneDay = 366 * 24 * 60 * 60 * 1000;
    const issued = Date.now() - oneYearAndOneDay;
    const t = mintAffiliateUnsubscribeToken(42, issued);
    expect(verifyAffiliateUnsubscribeToken(t)).toBeNull();
  });

  it("accepts tokens just inside the TTL", () => {
    const elevenMonths = 11 * 30 * 24 * 60 * 60 * 1000;
    const issued = Date.now() - elevenMonths;
    const t = mintAffiliateUnsubscribeToken(42, issued);
    expect(verifyAffiliateUnsubscribeToken(t)).toEqual({ affiliateId: 42 });
  });

  it("rejects tokens issued in the implausible future", () => {
    const t = mintAffiliateUnsubscribeToken(
      42,
      Date.now() + 24 * 60 * 60 * 1000
    );
    expect(verifyAffiliateUnsubscribeToken(t)).toBeNull();
  });

  it("rejects tampered MACs", () => {
    const t = mintAffiliateUnsubscribeToken(42);
    const tampered = t.slice(0, -1) + (t.endsWith("a") ? "b" : "a");
    expect(verifyAffiliateUnsubscribeToken(tampered)).toBeNull();
  });

  it("rejects malformed tokens", () => {
    expect(verifyAffiliateUnsubscribeToken("")).toBeNull();
    expect(verifyAffiliateUnsubscribeToken("garbage")).toBeNull();
    expect(verifyAffiliateUnsubscribeToken("1.2")).toBeNull();
    expect(
      verifyAffiliateUnsubscribeToken("not-a-number.123.deadbeef")
    ).toBeNull();
  });
});
