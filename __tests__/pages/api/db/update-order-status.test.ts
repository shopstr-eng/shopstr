import type { NextApiRequest, NextApiResponse } from "next";
import { IncomingMessage, ServerResponse } from "http";
import { Socket } from "net";

const verifyNip98RequestMock = jest.fn();
const getOrderParticipantsMock = jest.fn();
const updateOrderStatusMock = jest.fn();

jest.mock("@/utils/nostr/nip98-auth", () => ({
  verifyNip98Request: (...args: unknown[]) => verifyNip98RequestMock(...args),
}));

jest.mock("@/utils/db/db-service", () => ({
  getOrderParticipants: (...args: unknown[]) =>
    getOrderParticipantsMock(...args),
  updateOrderStatus: (...args: unknown[]) => updateOrderStatusMock(...args),
}));

import handler from "@/pages/api/db/update-order-status";

type MockResponse = NextApiResponse & {
  jsonBody: unknown;
};

function createResponse(): MockResponse {
  const response = new ServerResponse(
    new IncomingMessage(new Socket())
  ) as MockResponse;
  response.statusCode = 200;
  response.jsonBody = undefined;
  response.status = function status(code: number) {
    this.statusCode = code;
    return this;
  };
  response.json = function json(payload: unknown) {
    this.jsonBody = payload;
    return this;
  };
  return response;
}

function createRequest(body: unknown): NextApiRequest {
  const request = new IncomingMessage(new Socket()) as NextApiRequest;
  request.method = "POST";
  request.body = body;
  return request;
}

describe("/api/db/update-order-status", () => {
  beforeEach(() => {
    verifyNip98RequestMock.mockReset();
    getOrderParticipantsMock.mockReset();
    updateOrderStatusMock.mockReset();
  });

  it("authorizes status changes using the target order participants only", async () => {
    verifyNip98RequestMock.mockResolvedValue({
      ok: true,
      pubkey: "buyer-on-target-order",
    });
    getOrderParticipantsMock.mockResolvedValue({
      buyerPubkey: "buyer-on-target-order",
      sellerPubkey: "seller-on-target-order",
    });

    const req = createRequest({
      orderId: "order-123",
      status: "shipped",
      messageId: "foreign-message-id",
    });
    const res = createResponse();

    await handler(req, res);

    expect(getOrderParticipantsMock).toHaveBeenCalledWith("order-123");
    expect(updateOrderStatusMock).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(403);
    expect(res.jsonBody).toEqual({
      error:
        "You are not allowed to set this order status for the current order role.",
    });
  });
});
