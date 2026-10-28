const createNip98AuthorizationHeaderMock = jest.fn();

jest.mock("@/utils/nostr/nip98-auth", () => ({
  createNip98AuthorizationHeader: (...args: unknown[]) =>
    createNip98AuthorizationHeaderMock(...args),
}));

import { registerOrderParticipantsOnServer } from "../order-participants-client";

const SELLER = "2".repeat(64);
const ORDER_ID = "7f0c1a52-3d4e-4b6f-8a9b-0c1d2e3f4a5b";
const signer = { sign: jest.fn(), getPubKey: jest.fn() } as any;

const listing = { pubkey: SELLER, d: "listing-1" };
const zapsnagNote = {
  id: "a".repeat(64),
  pubkey: SELLER,
  created_at: 1_700_000_000,
  kind: 1,
  tags: [],
  content: "price: 5000 sats #zapsnag",
  sig: "b".repeat(128),
};

describe("registerOrderParticipantsOnServer", () => {
  const fetchMock = jest.fn();
  let warnSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    createNip98AuthorizationHeaderMock.mockResolvedValue("Nostr auth");
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({}) });
    global.fetch = fetchMock as any;
    warnSpy = jest.spyOn(console, "warn").mockImplementation(() => undefined);
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  it("registers a listing by address with a NIP-98 header over the body", async () => {
    await expect(
      registerOrderParticipantsOnServer(signer, ORDER_ID, listing)
    ).resolves.toBe(true);

    const body = JSON.stringify({
      orderId: ORDER_ID,
      productAddress: `30402:${SELLER}:listing-1`,
    });
    expect(createNip98AuthorizationHeaderMock).toHaveBeenCalledWith(
      signer,
      `${window.location.origin}/api/db/register-order-participants`,
      "POST",
      body
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/db/register-order-participants",
      expect.objectContaining({
        method: "POST",
        body,
        headers: expect.objectContaining({ Authorization: "Nostr auth" }),
      })
    );
  });

  it("sends the signed note for zapsnag listings", async () => {
    await registerOrderParticipantsOnServer(signer, ORDER_ID, {
      pubkey: SELLER,
      d: "zapsnag",
      rawEvent: zapsnagNote,
    });

    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
      orderId: ORDER_ID,
      productEvent: zapsnagNote,
    });
  });

  it("skips registration without a signer or product reference", async () => {
    await expect(
      registerOrderParticipantsOnServer(undefined, ORDER_ID, listing)
    ).resolves.toBe(false);
    await expect(
      registerOrderParticipantsOnServer(signer, ORDER_ID, { pubkey: SELLER })
    ).resolves.toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("resolves false instead of throwing when the server refuses", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 409,
      json: async () => ({ error: "conflict" }),
    });

    await expect(
      registerOrderParticipantsOnServer(signer, ORDER_ID, listing)
    ).resolves.toBe(false);
    expect(warnSpy).toHaveBeenCalled();
  });

  it("resolves false instead of throwing when the request fails", async () => {
    fetchMock.mockRejectedValue(new Error("offline"));

    await expect(
      registerOrderParticipantsOnServer(signer, ORDER_ID, listing)
    ).resolves.toBe(false);
  });
});
