/** @jest-environment node */

import {
  SellerNostrError,
  cacheSignedEvent,
  createSellerActionAuthEventTemplate,
  createSellerSessionFromNsec,
  createSignedSellerActionAuthEvent,
  createSignedStripeConnectAuthEvent,
  deserializeSellerSession,
  generateSellerNsecCredentials,
  serializeSellerSession,
  validateSellerNsec,
} from "../index";

describe("seller nostr helpers", () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    jest.restoreAllMocks();
    global.fetch = originalFetch;
  });

  test("generates and validates seller nsec credentials", () => {
    const credentials = generateSellerNsecCredentials();
    const validation = validateSellerNsec(credentials.nsec);

    expect(validation).toEqual({
      valid: true,
      normalized: credentials.nsec,
      pubkey: credentials.pubkey,
    });
  });

  test("serializes and restores seller sessions", () => {
    const { nsec, pubkey } = generateSellerNsecCredentials();
    const session = createSellerSessionFromNsec(nsec, {
      authMethod: "email",
      email: "seller@example.com",
      relays: ["wss://relay.damus.io"],
      writeRelays: ["wss://relay.primal.net"],
    });

    expect(session.pubkey).toBe(pubkey);
    expect(deserializeSellerSession(serializeSellerSession(session))).toEqual(
      session
    );
  });

  test("creates a signed stripe auth event for the seller session", () => {
    const session = createSellerSessionFromNsec(
      generateSellerNsecCredentials().nsec
    );

    const event = createSignedStripeConnectAuthEvent(session);

    expect(event.kind).toBe(27235);
    expect(event.pubkey).toBe(session.pubkey);
    expect(event.tags).toEqual([["action", "stripe-connect"]]);
    expect(event.content).toBe("Authorize Stripe Connect account management");
  });

  test("creates generic signed auth events for seller-owned actions", () => {
    const session = createSellerSessionFromNsec(
      generateSellerNsecCredentials().nsec
    );

    const event = createSignedSellerActionAuthEvent(
      session,
      "notification-email-write"
    );

    expect(event.kind).toBe(27235);
    expect(event.pubkey).toBe(session.pubkey);
    expect(event.tags).toEqual([["action", "notification-email-write"]]);
    expect(event.content).toBe("Authorize notification email updates");
  });

  test("builds auth templates for non-stripe actions", () => {
    const template = createSellerActionAuthEventTemplate(
      "seller-pubkey",
      "storefront-slug-write"
    );

    expect(template.pubkey).toBe("seller-pubkey");
    expect(template.tags).toEqual([["action", "storefront-slug-write"]]);
    expect(template.content).toBe("Authorize storefront slug updates");
  });

  test("throws when caching a signed event fails", async () => {
    const fetchSpy = jest.fn().mockResolvedValue({
      ok: false,
    } as Response);
    global.fetch = fetchSpy as typeof fetch;

    await expect(
      cacheSignedEvent("http://127.0.0.1:5000", {
        id: "event-1",
        pubkey: "seller-pubkey",
        created_at: 1710000000,
        kind: 30019,
        tags: [["d", "seller-pubkey"]],
        content: "{}",
      })
    ).rejects.toThrow(new SellerNostrError("Failed to cache the signed event."));

    expect(fetchSpy).toHaveBeenCalledWith(
      "http://127.0.0.1:5000/api/db/cache-event",
      expect.objectContaining({
        method: "POST",
      })
    );
  });
});
