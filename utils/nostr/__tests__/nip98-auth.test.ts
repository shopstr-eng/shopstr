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

  it("rejects missing authorization headers", () => {
    const req = {
      headers: {
        host: "localhost:3000",
      },
      url: "/api/db/update-order-status",
    } as any;

    expect(verifyNip98Request(req, "POST")).toEqual({
      ok: false,
      error: "Missing NIP-98 authorization header",
    });
  });

  it("rejects invalid signatures", () => {
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

    expect(verifyNip98Request(req, "POST")).toEqual({
      ok: false,
      error: "Invalid authorization signature",
    });
  });

  it("rejects URL mismatches", () => {
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

    expect(verifyNip98Request(req, "POST")).toEqual({
      ok: false,
      error: "Authorization URL mismatch",
    });
  });

  it("accepts valid signed authorization events", () => {
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

    expect(verifyNip98Request(req, "POST")).toEqual({
      ok: true,
      pubkey: "f".repeat(64),
    });
  });
});
