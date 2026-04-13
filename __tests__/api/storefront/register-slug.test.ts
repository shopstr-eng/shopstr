/** @jest-environment node */

import { finalizeEvent, generateSecretKey, getPublicKey } from "nostr-tools";

import handler from "@/pages/api/storefront/register-slug";
import { createAuthEventTemplate } from "@/utils/stripe/verify-nostr-auth";

jest.mock("@/utils/db/db-service", () => ({
  __mockQuery: jest.fn(),
  getDbPool: function getDbPool() {
    const mocked = jest.requireMock("@/utils/db/db-service");
    return {
      query: mocked.__mockQuery,
    };
  },
}));

const { __mockQuery: query } = jest.requireMock("@/utils/db/db-service") as {
  __mockQuery: jest.Mock;
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

function createSignedAction(
  action: Parameters<typeof createAuthEventTemplate>[1]
) {
  const secretKey = generateSecretKey();
  const pubkey = getPublicKey(secretKey);
  return {
    pubkey,
    signedEvent: finalizeEvent(
      createAuthEventTemplate(pubkey, action),
      secretKey
    ),
  };
}

describe("register slug api", () => {
  beforeEach(() => {
    query.mockReset();
  });

  test("registers a slug with a valid signed event", async () => {
    const response = createMockResponse();
    query.mockResolvedValueOnce({});
    const { pubkey, signedEvent } = createSignedAction("storefront-slug-write");

    await handler(
      {
        method: "POST",
        body: {
          pubkey,
          slug: "Fresh Farm!!",
          signedEvent,
        },
      } as any,
      response as any
    );

    expect(query).toHaveBeenCalled();
    expect(response.statusCode).toBe(200);
    expect(response.body).toEqual({ slug: "fresh-farm" });
  });

  test("rejects slug writes with the wrong action", async () => {
    const response = createMockResponse();
    const { pubkey, signedEvent } = createSignedAction(
      "notification-email-write"
    );

    await handler(
      {
        method: "POST",
        body: {
          pubkey,
          slug: "fresh-farm",
          signedEvent,
        },
      } as any,
      response as any
    );

    expect(response.statusCode).toBe(401);
    expect(response.body).toEqual(
      expect.objectContaining({ error: "Invalid auth action" })
    );
  });

  test("deletes a slug with a valid signed event", async () => {
    const response = createMockResponse();
    query.mockResolvedValue({});
    const { pubkey, signedEvent } = createSignedAction("storefront-slug-write");

    await handler(
      {
        method: "DELETE",
        body: {
          pubkey,
          signedEvent,
        },
      } as any,
      response as any
    );

    expect(query).toHaveBeenCalledTimes(2);
    expect(response.statusCode).toBe(200);
    expect(response.body).toEqual({ success: true });
  });
});
