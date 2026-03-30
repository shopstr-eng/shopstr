/** @jest-environment node */

import { finalizeEvent, generateSecretKey, getPublicKey } from "nostr-tools";

import readHandler from "@/pages/api/email/notification-email/read";
import writeHandler from "@/pages/api/email/notification-email";
import { createAuthEventTemplate } from "@/utils/stripe/verify-nostr-auth";
import {
  getSellerNotificationEmail,
  saveNotificationEmail,
} from "@/utils/db/db-service";

jest.mock("@/utils/db/db-service", () => ({
  getSellerNotificationEmail: jest.fn(),
  getUserAuthEmail: jest.fn(),
  saveNotificationEmail: jest.fn(),
}));

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
    signedEvent: finalizeEvent(createAuthEventTemplate(pubkey, action), secretKey),
  };
}

describe("notification email api", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("reads notification email with a valid signed event", async () => {
    (getSellerNotificationEmail as jest.Mock).mockResolvedValue(
      "seller@example.com"
    );
    const response = createMockResponse();
    const { pubkey, signedEvent } = createSignedAction("notification-email-read");

    await readHandler(
      {
        method: "POST",
        body: {
          pubkey,
          role: "seller",
          signedEvent,
        },
      } as any,
      response as any
    );

    expect(response.statusCode).toBe(200);
    expect(response.body).toEqual({ email: "seller@example.com" });
  });

  test("rejects read requests with the wrong action", async () => {
    const response = createMockResponse();
    const { pubkey, signedEvent } = createSignedAction("notification-email-write");

    await readHandler(
      {
        method: "POST",
        body: {
          pubkey,
          role: "seller",
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

  test("saves notification email with a valid signed event", async () => {
    const response = createMockResponse();
    const { pubkey, signedEvent } = createSignedAction("notification-email-write");

    await writeHandler(
      {
        method: "POST",
        body: {
          pubkey,
          role: "seller",
          email: "seller@example.com",
          signedEvent,
        },
      } as any,
      response as any
    );

    expect(saveNotificationEmail).toHaveBeenCalledWith(
      "seller@example.com",
      "seller",
      pubkey,
      undefined
    );
    expect(response.statusCode).toBe(200);
    expect(response.body).toEqual({ success: true });
  });

  test("rejects write requests with a missing signed event", async () => {
    const response = createMockResponse();

    await writeHandler(
      {
        method: "POST",
        body: {
          pubkey: "seller-pubkey",
          role: "seller",
          email: "seller@example.com",
        },
      } as any,
      response as any
    );

    expect(response.statusCode).toBe(400);
    expect(response.body).toEqual(
      expect.objectContaining({
        error: "email, role, pubkey, and signedEvent are required",
      })
    );
  });
});
