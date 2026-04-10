/** @jest-environment node */

jest.mock("stripe", () => {
  const create = jest.fn();
  const Stripe = jest.fn().mockImplementation(() => ({
    accountLinks: {
      create,
    },
  }));

  return {
    __esModule: true,
    default: Stripe,
    __createAccountLink: create,
  };
});

jest.mock("@/utils/db/db-service", () => ({
  getStripeConnectAccount: jest.fn(),
}));

import { finalizeEvent, generateSecretKey, getPublicKey } from "nostr-tools";

import handler from "@/pages/api/stripe/connect/create-account-link";
import { getStripeConnectAccount } from "@/utils/db/db-service";
import { createAuthEventTemplate } from "@/utils/stripe/verify-nostr-auth";

const mockedGetStripeConnectAccount = getStripeConnectAccount as jest.Mock;
const { __createAccountLink: createAccountLink } = jest.requireMock(
  "stripe"
) as {
  __createAccountLink: jest.Mock;
};

function createMockResponse() {
  const response = {
    statusCode: 200,
    body: undefined as unknown,
    status(code: number) {
      response.statusCode = code;
      return response;
    },
    json(payload: unknown) {
      response.body = payload;
      return response;
    },
  };

  return response;
}

function createSignedEvent() {
  const secretKey = generateSecretKey();
  const pubkey = getPublicKey(secretKey);
  return {
    pubkey,
    signedEvent: finalizeEvent(createAuthEventTemplate(pubkey), secretKey),
  };
}

describe("create stripe account link api", () => {
  const originalBaseUrl = process.env.NEXT_PUBLIC_BASE_URL;

  beforeEach(() => {
    createAccountLink.mockReset();
    mockedGetStripeConnectAccount.mockReset();
    process.env.NEXT_PUBLIC_BASE_URL = "https://milkmarket.example";
  });

  afterAll(() => {
    process.env.NEXT_PUBLIC_BASE_URL = originalBaseUrl;
  });

  test("builds web redirect URLs from relative paths", async () => {
    const response = createMockResponse();
    const { pubkey, signedEvent } = createSignedEvent();
    mockedGetStripeConnectAccount.mockResolvedValue({
      stripe_account_id: "acct_123",
    });
    createAccountLink.mockResolvedValue({
      url: "https://connect.stripe.com/test-link",
    });

    await handler(
      {
        method: "POST",
        body: {
          accountId: "acct_123",
          pubkey,
          signedEvent,
          returnPath: "/onboarding/stripe-connect?success=true",
          refreshPath: "/onboarding/stripe-connect?refresh=true",
        },
      } as any,
      response as any
    );

    expect(createAccountLink).toHaveBeenCalledWith(
      expect.objectContaining({
        return_url:
          "https://milkmarket.example/onboarding/stripe-connect?success=true",
        refresh_url:
          "https://milkmarket.example/onboarding/stripe-connect?refresh=true",
      })
    );
    expect(response.statusCode).toBe(200);
  });

  test("uses absolute mobile redirect URLs unchanged", async () => {
    const response = createMockResponse();
    const { pubkey, signedEvent } = createSignedEvent();
    mockedGetStripeConnectAccount.mockResolvedValue({
      stripe_account_id: "acct_123",
    });
    createAccountLink.mockResolvedValue({
      url: "https://connect.stripe.com/test-link",
    });

    await handler(
      {
        method: "POST",
        body: {
          accountId: "acct_123",
          pubkey,
          signedEvent,
          returnUrl: "milkmarket://stripe-connect-return?success=true",
          refreshUrl: "milkmarket://stripe-connect-return?refresh=true",
        },
      } as any,
      response as any
    );

    expect(createAccountLink).toHaveBeenCalledWith(
      expect.objectContaining({
        return_url: "milkmarket://stripe-connect-return?success=true",
        refresh_url: "milkmarket://stripe-connect-return?refresh=true",
      })
    );
    expect(response.statusCode).toBe(200);
  });

  test("rejects invalid absolute redirect protocols", async () => {
    const response = createMockResponse();
    const { pubkey, signedEvent } = createSignedEvent();
    mockedGetStripeConnectAccount.mockResolvedValue({
      stripe_account_id: "acct_123",
    });

    await handler(
      {
        method: "POST",
        body: {
          accountId: "acct_123",
          pubkey,
          signedEvent,
          returnUrl: "http://evil.example/return",
        },
      } as any,
      response as any
    );

    expect(createAccountLink).not.toHaveBeenCalled();
    expect(response.statusCode).toBe(400);
    expect(response.body).toEqual(
      expect.objectContaining({
        error: "Redirect URLs must use https:// or milkmarket://",
      })
    );
  });
});
