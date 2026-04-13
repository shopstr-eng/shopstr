/** @jest-environment node */

import { finalizeEvent, generateSecretKey, getPublicKey } from "nostr-tools";

import { createAuthEventTemplate, verifyNostrAuth } from "../verify-nostr-auth";

describe("verifyNostrAuth", () => {
  test("accepts a valid signed event with the expected action", () => {
    const secretKey = generateSecretKey();
    const pubkey = getPublicKey(secretKey);
    const signedEvent = finalizeEvent(
      createAuthEventTemplate(pubkey, "notification-email-read"),
      secretKey
    );

    expect(
      verifyNostrAuth(signedEvent, pubkey, "notification-email-read")
    ).toEqual({
      valid: true,
      pubkey,
    });
  });

  test("rejects expired auth events", () => {
    const secretKey = generateSecretKey();
    const pubkey = getPublicKey(secretKey);
    const template = createAuthEventTemplate(pubkey, "stripe-connect");
    template.created_at = Math.floor(Date.now() / 1000) - 1000;
    const signedEvent = finalizeEvent(template, secretKey);

    expect(verifyNostrAuth(signedEvent, pubkey, "stripe-connect")).toEqual(
      expect.objectContaining({
        valid: false,
        error: "Auth event has expired",
      })
    );
  });

  test("rejects auth events with the wrong pubkey", () => {
    const secretKey = generateSecretKey();
    const signedEvent = finalizeEvent(
      createAuthEventTemplate(getPublicKey(secretKey), "stripe-connect"),
      secretKey
    );

    expect(
      verifyNostrAuth(signedEvent, "different-pubkey", "stripe-connect")
    ).toEqual(
      expect.objectContaining({
        valid: false,
        error: "Pubkey mismatch",
      })
    );
  });

  test("rejects auth events with the wrong action", () => {
    const secretKey = generateSecretKey();
    const pubkey = getPublicKey(secretKey);
    const signedEvent = finalizeEvent(
      createAuthEventTemplate(pubkey, "notification-email-write"),
      secretKey
    );

    expect(
      verifyNostrAuth(signedEvent, pubkey, "notification-email-read")
    ).toEqual(
      expect.objectContaining({
        valid: false,
        error: "Invalid auth action",
      })
    );
  });

  test("rejects missing signed events", () => {
    expect(
      verifyNostrAuth(undefined, "seller-pubkey", "stripe-connect")
    ).toEqual(
      expect.objectContaining({
        valid: false,
        error: "Missing signed auth event",
      })
    );
  });
});
