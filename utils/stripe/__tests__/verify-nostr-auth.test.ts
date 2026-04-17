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

  test("accepts events with a matching method/path/fields binding", () => {
    const secretKey = generateSecretKey();
    const pubkey = getPublicKey(secretKey);
    const signedEvent = finalizeEvent(
      createAuthEventTemplate(pubkey, "storefront-slug-write", {
        method: "POST",
        path: "/api/storefront/register-slug",
        fields: { slug: "my-shop" },
      }),
      secretKey
    );

    expect(
      verifyNostrAuth(signedEvent, pubkey, "storefront-slug-write", {
        method: "POST",
        path: "/api/storefront/register-slug",
        fields: { slug: "my-shop" },
      })
    ).toEqual({ valid: true, pubkey });
  });

  test("rejects events whose binding method does not match", () => {
    const secretKey = generateSecretKey();
    const pubkey = getPublicKey(secretKey);
    const signedEvent = finalizeEvent(
      createAuthEventTemplate(pubkey, "storefront-slug-write", {
        method: "DELETE",
        path: "/api/storefront/register-slug",
      }),
      secretKey
    );

    expect(
      verifyNostrAuth(signedEvent, pubkey, "storefront-slug-write", {
        method: "POST",
        path: "/api/storefront/register-slug",
      })
    ).toEqual(
      expect.objectContaining({
        valid: false,
        error: "Auth event does not match this request",
      })
    );
  });

  test("rejects events whose binding path does not match", () => {
    const secretKey = generateSecretKey();
    const pubkey = getPublicKey(secretKey);
    const signedEvent = finalizeEvent(
      createAuthEventTemplate(pubkey, "custom-domain-write", {
        method: "POST",
        path: "/api/storefront/custom-domain",
        fields: { domain: "example.com" },
      }),
      secretKey
    );

    expect(
      verifyNostrAuth(signedEvent, pubkey, "custom-domain-write", {
        method: "POST",
        path: "/api/storefront/register-slug",
        fields: { domain: "example.com" },
      })
    ).toEqual(
      expect.objectContaining({
        valid: false,
        error: "Auth event does not match this request",
      })
    );
  });

  test("rejects events whose binding field value does not match", () => {
    const secretKey = generateSecretKey();
    const pubkey = getPublicKey(secretKey);
    const signedEvent = finalizeEvent(
      createAuthEventTemplate(pubkey, "storefront-slug-write", {
        method: "POST",
        path: "/api/storefront/register-slug",
        fields: { slug: "my-shop" },
      }),
      secretKey
    );

    expect(
      verifyNostrAuth(signedEvent, pubkey, "storefront-slug-write", {
        method: "POST",
        path: "/api/storefront/register-slug",
        fields: { slug: "different-shop" },
      })
    ).toEqual(
      expect.objectContaining({
        valid: false,
        error: "Auth event does not match this request",
      })
    );
  });
});
