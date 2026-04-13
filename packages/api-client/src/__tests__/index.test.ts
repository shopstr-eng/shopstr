import { MilkMarketApiError, createMilkMarketApiClient } from "../index";

describe("api client", () => {
  test("sends email sign-in requests to the expected route", async () => {
    const fetchImpl = jest.fn().mockResolvedValue({
      ok: true,
      text: async () =>
        JSON.stringify({
          success: true,
          nsec: "nsec1test",
          pubkey: "pubkey-test",
        }),
    });
    const client = createMilkMarketApiClient({
      baseUrl: "http://127.0.0.1:5000",
      fetchImpl: fetchImpl as typeof fetch,
    });

    await expect(
      client.emailSignIn({
        email: "seller@example.com",
        password: "secret",
      })
    ).resolves.toEqual({
      success: true,
      nsec: "nsec1test",
      pubkey: "pubkey-test",
    });

    expect(fetchImpl).toHaveBeenCalledWith(
      "http://127.0.0.1:5000/api/auth/email-signin",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          email: "seller@example.com",
          password: "secret",
        }),
      })
    );
  });

  test("builds signed notification email requests against the read route", async () => {
    const fetchImpl = jest.fn().mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify({ email: "seller@example.com" }),
    });
    const client = createMilkMarketApiClient({
      baseUrl: "http://localhost:5000",
      fetchImpl: fetchImpl as typeof fetch,
    });

    await expect(
      client.fetchSellerNotificationEmail("seller-pubkey", {
        id: "event-1",
      })
    ).resolves.toEqual({
      email: "seller@example.com",
    });

    expect(fetchImpl).toHaveBeenCalledWith(
      "http://localhost:5000/api/email/notification-email/read",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          pubkey: "seller-pubkey",
          role: "seller",
          signedEvent: {
            id: "event-1",
          },
        }),
      })
    );
  });

  test("throws a typed api error for non-2xx responses", async () => {
    const fetchImpl = jest.fn().mockResolvedValue({
      ok: false,
      status: 409,
      text: async () => JSON.stringify({ error: "Email already registered" }),
    });
    const client = createMilkMarketApiClient({
      fetchImpl: fetchImpl as typeof fetch,
    });

    await expect(
      client.emailSignUp({
        email: "seller@example.com",
        password: "secret",
      })
    ).rejects.toEqual(
      expect.objectContaining<Partial<MilkMarketApiError>>({
        name: "MilkMarketApiError",
        message: "Email already registered",
        status: 409,
      })
    );
  });

  test("passes absolute mobile return URLs to the stripe link route", async () => {
    const fetchImpl = jest.fn().mockResolvedValue({
      ok: true,
      text: async () =>
        JSON.stringify({ url: "https://connect.stripe.com/test" }),
    });
    const client = createMilkMarketApiClient({
      baseUrl: "http://127.0.0.1:5000",
      fetchImpl: fetchImpl as typeof fetch,
    });

    await expect(
      client.createStripeConnectAccountLink({
        accountId: "acct_123",
        pubkey: "seller-pubkey",
        signedEvent: { id: "event-1" },
        returnUrl: "milkmarket://stripe-connect-return?success=true",
        refreshUrl: "milkmarket://stripe-connect-return?refresh=true",
      })
    ).resolves.toEqual({
      url: "https://connect.stripe.com/test",
    });

    expect(fetchImpl).toHaveBeenCalledWith(
      "http://127.0.0.1:5000/api/stripe/connect/create-account-link",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          accountId: "acct_123",
          pubkey: "seller-pubkey",
          signedEvent: { id: "event-1" },
          returnUrl: "milkmarket://stripe-connect-return?success=true",
          refreshUrl: "milkmarket://stripe-connect-return?refresh=true",
        }),
      })
    );
  });
});
