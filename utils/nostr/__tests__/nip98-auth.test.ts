import CryptoJS from "crypto-js";

const verifyEventMock = jest.fn();

jest.mock("nostr-tools", () => {
  const actual = jest.requireActual("nostr-tools");
  return {
    ...actual,
    verifyEvent: (event: any) => verifyEventMock(event),
  };
});

import { verifyNip98Request } from "@/utils/nostr/nip98-auth";

function buildAuthHeader(event: Record<string, unknown>): string {
  return `Nostr ${Buffer.from(JSON.stringify(event), "utf-8").toString(
    "base64"
  )}`;
}

describe("verifyNip98Request", () => {
  beforeEach(() => {
    verifyEventMock.mockReset();
    verifyEventMock.mockReturnValue(true);
  });

  it("rejects missing authorization headers", async () => {
    const req = {
      headers: {
        host: "localhost:3000",
      },
      url: "/api/db/update-order-status",
    } as any;

    await expect(
      verifyNip98Request(req, "POST", { orderId: "o1" })
    ).resolves.toEqual({
      ok: false,
      error: "Missing NIP-98 authorization header",
    });
  });

  it("rejects invalid signatures", async () => {
    verifyEventMock.mockReturnValue(false);

    const req = {
      headers: {
        host: "localhost:3000",
        authorization: buildAuthHeader({
          pubkey: "f".repeat(64),
          kind: 27235,
          created_at: Math.floor(Date.now() / 1000),
          tags: [
            ["u", "http://localhost:3000/api/db/update-order-status"],
            ["method", "POST"],
          ],
          content: "",
          sig: "invalid",
        }),
      },
      url: "/api/db/update-order-status",
    } as any;

    await expect(
      verifyNip98Request(req, "POST", { orderId: "o1" })
    ).resolves.toEqual({
      ok: false,
      error: "Invalid authorization signature",
    });
  });

  it("rejects URL mismatches", async () => {
    const req = {
      headers: {
        host: "localhost:3000",
        authorization: buildAuthHeader({
          pubkey: "f".repeat(64),
          kind: 27235,
          created_at: Math.floor(Date.now() / 1000),
          tags: [
            ["u", "http://localhost:3000/api/db/mark-messages-read"],
            ["method", "POST"],
          ],
          content: "",
          sig: "valid",
        }),
      },
      url: "/api/db/update-order-status",
    } as any;

    await expect(
      verifyNip98Request(req, "POST", { orderId: "o1" })
    ).resolves.toEqual({
      ok: false,
      error: "Authorization URL mismatch",
    });
  });

  it("rejects missing payload hashes for signed POST requests", async () => {
    const req = {
      headers: {
        host: "localhost:3000",
        authorization: buildAuthHeader({
          pubkey: "f".repeat(64),
          kind: 27235,
          created_at: Math.floor(Date.now() / 1000),
          tags: [
            ["u", "http://localhost:3000/api/db/update-order-status"],
            ["method", "POST"],
          ],
          content: "",
          sig: "valid",
        }),
      },
      url: "/api/db/update-order-status",
    } as any;

    await expect(
      verifyNip98Request(req, "POST", {
        orderId: "order-1",
        status: "confirmed",
      })
    ).resolves.toEqual({
      ok: false,
      error: "Missing authorization payload hash",
    });
  });

  it("rejects payload hash mismatches", async () => {
    const req = {
      headers: {
        host: "localhost:3000",
        authorization: buildAuthHeader({
          pubkey: "f".repeat(64),
          kind: 27235,
          created_at: Math.floor(Date.now() / 1000),
          tags: [
            ["u", "http://localhost:3000/api/db/update-order-status"],
            ["method", "POST"],
            ["payload", "0".repeat(64)],
          ],
          content: "",
          sig: "valid",
        }),
      },
      url: "/api/db/update-order-status",
    } as any;

    await expect(
      verifyNip98Request(req, "POST", {
        orderId: "order-1",
        status: "confirmed",
      })
    ).resolves.toEqual({
      ok: false,
      error: "Authorization payload mismatch",
    });
  });

  it("accepts valid signed authorization events", async () => {
    const body = JSON.stringify({
      orderId: "order-1",
      status: "confirmed",
    });
    const payloadHash = CryptoJS.SHA256(body).toString(CryptoJS.enc.Hex);

    const req = {
      headers: {
        host: "localhost:3000",
        authorization: buildAuthHeader({
          pubkey: "f".repeat(64),
          kind: 27235,
          created_at: Math.floor(Date.now() / 1000),
          tags: [
            ["u", "http://localhost:3000/api/db/update-order-status"],
            ["method", "POST"],
            ["payload", payloadHash],
          ],
          content: "",
          sig: "valid",
        }),
      },
      url: "/api/db/update-order-status",
    } as any;

    await expect(
      verifyNip98Request(req, "POST", JSON.parse(body))
    ).resolves.toEqual({
      ok: true,
      pubkey: "f".repeat(64),
    });
  });
});
