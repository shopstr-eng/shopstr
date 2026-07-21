/**
 * @jest-environment node
 */

import CryptoJS from "crypto-js";

const verifyEventMock = jest.fn();

jest.mock("nostr-tools", () => {
  const actual = jest.requireActual("nostr-tools");
  return {
    ...actual,
    verifyEvent: (event: any) => verifyEventMock(event),
  };
});

import {
  createNip98AuthorizationHeader,
  verifyNip98Request,
} from "@/utils/nostr/nip98-auth";

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

  it("creates UTF-8 NIP-98 authorization headers in the Node runtime", async () => {
    const originalWindow = (globalThis as { window?: unknown }).window;
    delete (globalThis as { window?: unknown }).window;
    const url = "http://localhost:3000/api/db/update-order-status?note=€";

    const signer = {
      sign: jest.fn().mockResolvedValue({
        id: "auth-event-1",
        pubkey: "f".repeat(64),
        kind: 27235,
        created_at: 1710000000,
        tags: [
          ["u", url],
          ["method", "POST"],
        ],
        content: "",
        sig: "valid",
      }),
    } as any;

    try {
      const header = await createNip98AuthorizationHeader(signer, url, "post");

      expect(signer.sign).toHaveBeenCalledWith(
        expect.objectContaining({
          kind: 27235,
          content: "",
          tags: [
            ["u", url],
            ["method", "POST"],
          ],
        })
      );

      expect(header.startsWith("Nostr ")).toBe(true);
      const decoded = JSON.parse(
        Buffer.from(header.substring(6), "base64").toString("utf-8")
      );
      expect(decoded).toMatchObject({
        id: "auth-event-1",
        pubkey: "f".repeat(64),
        kind: 27235,
        tags: [
          ["u", url],
          ["method", "POST"],
        ],
      });
    } finally {
      (globalThis as { window?: unknown }).window = originalWindow;
    }
  });

  it("creates NIP-98 authorization headers with payloads in the browser runtime", async () => {
    const originalWindow = (globalThis as any).window;
    const originalBtoa = (globalThis as any).btoa;
    (globalThis as any).window = {};
    (globalThis as any).btoa = jest.fn().mockReturnValue("browser-base64");

    const signer = {
      sign: jest.fn().mockResolvedValue({
        id: "auth-event-2",
        pubkey: "f".repeat(64),
        kind: 27235,
        created_at: 1710000000,
        tags: [
          ["u", "https://localhost:3000/api/db/update-order-status"],
          ["method", "POST"],
          [
            "payload",
            CryptoJS.SHA256('{"orderId":"o1"}').toString(CryptoJS.enc.Hex),
          ],
        ],
        content: "",
        sig: "valid",
      }),
    } as any;

    try {
      const header = await createNip98AuthorizationHeader(
        signer,
        "https://localhost:3000/api/db/update-order-status",
        "POST",
        JSON.stringify({ orderId: "o1" })
      );

      expect((globalThis as any).btoa).toHaveBeenCalledTimes(1);
      expect(header).toBe("Nostr browser-base64");
      expect(signer.sign).toHaveBeenCalledWith(
        expect.objectContaining({
          kind: 27235,
          content: "",
          tags: [
            ["u", "https://localhost:3000/api/db/update-order-status"],
            ["method", "POST"],
            [
              "payload",
              CryptoJS.SHA256('{"orderId":"o1"}').toString(CryptoJS.enc.Hex),
            ],
          ],
        })
      );
    } finally {
      if (originalWindow === undefined) {
        delete (globalThis as any).window;
      } else {
        (globalThis as any).window = originalWindow;
      }
      (globalThis as any).btoa = originalBtoa;
    }
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

  it("rejects malformed authorization payloads", async () => {
    const req = {
      headers: {
        host: "localhost:3000",
        authorization: `Nostr ${Buffer.from("not-json", "utf-8").toString(
          "base64"
        )}`,
      },
      url: "/api/db/update-order-status",
    } as any;

    await expect(
      verifyNip98Request(req, "POST", { orderId: "o1" })
    ).resolves.toEqual({
      ok: false,
      error: "Malformed NIP-98 authorization",
    });
  });

  it("rejects invalid authorization event kinds", async () => {
    const req = {
      headers: {
        host: "localhost:3000",
        authorization: buildAuthHeader({
          pubkey: "f".repeat(64),
          kind: 1,
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
      verifyNip98Request(req, "POST", { orderId: "o1" })
    ).resolves.toEqual({
      ok: false,
      error: "Invalid authorization event kind",
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

  it("rejects method mismatches", async () => {
    const req = {
      headers: {
        host: "localhost:3000",
        authorization: buildAuthHeader({
          pubkey: "f".repeat(64),
          kind: 27235,
          created_at: Math.floor(Date.now() / 1000),
          tags: [
            ["u", "http://localhost:3000/api/db/update-order-status"],
            ["method", "GET"],
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
      error: "Authorization method mismatch",
    });
  });

  it("rejects expired authorization events", async () => {
    const req = {
      headers: {
        host: "localhost:3000",
        authorization: buildAuthHeader({
          pubkey: "f".repeat(64),
          kind: 27235,
          created_at: Math.floor(Date.now() / 1000) - 999,
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
      verifyNip98Request(req, "POST", { orderId: "o1" })
    ).resolves.toEqual({
      ok: false,
      error: "Authorization event expired",
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

  it("accepts GET requests without a payload hash", async () => {
    const req = {
      headers: {
        host: "localhost:3000",
        authorization: buildAuthHeader({
          pubkey: "f".repeat(64),
          kind: 27235,
          created_at: Math.floor(Date.now() / 1000),
          tags: [
            ["u", "http://localhost:3000/api/db/update-order-status"],
            ["method", "GET"],
          ],
          content: "",
          sig: "valid",
        }),
      },
      url: "/api/db/update-order-status",
    } as any;

    await expect(verifyNip98Request(req, "GET")).resolves.toEqual({
      ok: true,
      pubkey: "f".repeat(64),
    });
  });

  it("accepts string request bodies when the payload hash matches", async () => {
    const body = JSON.stringify({ orderId: "order-1", status: "confirmed" });
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
      body,
    } as any;

    await expect(verifyNip98Request(req, "POST")).resolves.toEqual({
      ok: true,
      pubkey: "f".repeat(64),
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
        "x-forwarded-proto": ["https"],
        host: "localhost:3000",
        authorization: buildAuthHeader({
          pubkey: "f".repeat(64),
          kind: 27235,
          created_at: Math.floor(Date.now() / 1000),
          tags: [
            ["u", "https://localhost:3000/api/db/update-order-status"],
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
