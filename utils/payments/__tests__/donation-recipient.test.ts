import { getDonationRecipientPubkey } from "../donation-recipient";

const VALID_PUBKEY =
  "a37118a4888e02d28e8767c08caaf73b49abdac391ad7ff18a304891e416dc33";

describe("getDonationRecipientPubkey", () => {
  const originalEnv = process.env.NEXT_PUBLIC_DONATION_NOSTR_PUBKEY;

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.NEXT_PUBLIC_DONATION_NOSTR_PUBKEY;
    } else {
      process.env.NEXT_PUBLIC_DONATION_NOSTR_PUBKEY = originalEnv;
    }
  });

  it("returns null when the env var is unset", () => {
    delete process.env.NEXT_PUBLIC_DONATION_NOSTR_PUBKEY;
    expect(getDonationRecipientPubkey()).toBeNull();
  });

  it("returns null when the env var is blank", () => {
    process.env.NEXT_PUBLIC_DONATION_NOSTR_PUBKEY = "   ";
    expect(getDonationRecipientPubkey()).toBeNull();
  });

  it("returns null for a malformed pubkey", () => {
    process.env.NEXT_PUBLIC_DONATION_NOSTR_PUBKEY = "not-a-pubkey";
    expect(getDonationRecipientPubkey()).toBeNull();
  });

  it("returns the configured hex pubkey normalized to lowercase", () => {
    process.env.NEXT_PUBLIC_DONATION_NOSTR_PUBKEY =
      " " + VALID_PUBKEY.toUpperCase() + " ";
    expect(getDonationRecipientPubkey()).toBe(VALID_PUBKEY);
  });
});
