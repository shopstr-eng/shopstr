import type { McpNostrSigner } from "@/utils/mcp/nostr-signing";
import { signAndPublishEvent } from "@/utils/mcp/nostr-signing";
import {
  deleteCachedEventsByIds,
  fetchAllWalletEventsFromDb,
} from "@/utils/db/db-service";
import { safeMeltProofs } from "@/utils/cashu/melt-retry-service";
import { safeSwap } from "@/utils/cashu/swap-retry-service";
import { resolveSafeMintUrl } from "@/utils/cashu/mint-url-safety";
import { getTokenMetadata, Wallet } from "@cashu/cashu-ts";
import {
  AgentWalletError,
  getAgentWalletBalance,
  payInvoiceFromAgentWallet,
  receiveAgentCashuToken,
} from "../agent-cashu-wallet";

jest.mock("@cashu/cashu-ts", () => ({
  Mint: jest.fn().mockImplementation(() => ({})),
  Wallet: jest.fn(),
  getTokenMetadata: jest.fn(),
  normalizeProofAmounts: jest.fn((proofs: unknown) => proofs),
}));

jest.mock("@/utils/mcp/nostr-signing", () => ({
  signAndPublishEvent: jest.fn(),
}));

jest.mock("@/utils/db/db-service", () => ({
  deleteCachedEventsByIds: jest.fn(),
  fetchAllWalletEventsFromDb: jest.fn(),
}));

jest.mock("@/utils/cashu/mint-retry-service", () => ({
  withMintRetry: jest.fn((fn: () => Promise<unknown>) => fn()),
}));

jest.mock("@/utils/cashu/melt-retry-service", () => ({
  safeMeltProofs: jest.fn(),
}));

jest.mock("@/utils/cashu/swap-retry-service", () => ({
  safeSwap: jest.fn(),
}));

jest.mock("@/utils/cashu/mint-url-safety", () => ({
  resolveSafeMintUrl: jest.fn(),
}));

jest.mock("@/utils/nostr/relay-config", () => ({
  getDefaultRelays: jest.fn(() => ["wss://relay.one"]),
  withBlastr: jest.fn((relays: string[]) => relays),
}));

const PUBKEY = "a".repeat(64);
const MINT = "https://mint.example.com";
const OTHER_MINT = "https://other.example.com";
const INVOICE = "lnbc1invoice";

type TestProof = { id: string; amount: unknown; secret: string; C: string };

const proof = (secret: string, amount: unknown = 1): TestProof => ({
  id: "00aabbccddeeff00",
  amount,
  secret,
  C: "02" + "c".repeat(64),
});

// The signer double "encrypts" by prefixing, so stored events stay readable.
const signer = {
  getPubKey: () => PUBKEY,
  encrypt: (_pubkey: string, text: string) => `enc:${text}`,
  decrypt: (_pubkey: string, text: string) => {
    if (!text.startsWith("enc:")) throw new Error("bad ciphertext");
    return text.slice(4);
  },
} as unknown as McpNostrSigner;

function storedEvent(id: string, mint: string, proofs: unknown[], kind = 7375) {
  return {
    id,
    pubkey: PUBKEY,
    kind,
    created_at: 1,
    tags: [],
    sig: "sig",
    content: `enc:${JSON.stringify({ mint, proofs })}`,
  };
}

let spent: Set<string>;
let walletMock: {
  loadMint: jest.Mock;
  checkProofsStates: jest.Mock;
  createMeltQuoteBolt11: jest.Mock;
  receive: jest.Mock;
  decodeToken: jest.Mock;
};
let publishCounter: number;

function published() {
  return jest.mocked(signAndPublishEvent).mock.calls.map(([, template]) => ({
    template,
    body: template.kind === 7375 ? JSON.parse(template.content.slice(4)) : null,
  }));
}

function publishedProofEvents() {
  return published().filter((entry) => entry.template.kind === 7375);
}

function publishedDeletions() {
  return published().filter((entry) => entry.template.kind === 5);
}

// Call order of each proof-event save, ignoring the kind 5 notices around it.
function proofSaveOrders() {
  const mock = jest.mocked(signAndPublishEvent).mock;
  return mock.calls.flatMap(([, template], i) =>
    template.kind === 7375 ? [mock.invocationCallOrder[i]!] : []
  );
}

function order(mock: jest.Mock, index = 0) {
  return mock.mock.invocationCallOrder[index];
}

beforeEach(() => {
  jest.clearAllMocks();
  spent = new Set();
  publishCounter = 0;

  walletMock = {
    loadMint: jest.fn().mockResolvedValue(undefined),
    checkProofsStates: jest.fn(async (proofs: TestProof[]) =>
      proofs.map((p) => ({
        Y: p.secret,
        state: spent.has(p.secret) ? "SPENT" : "UNSPENT",
      }))
    ),
    createMeltQuoteBolt11: jest.fn().mockResolvedValue({
      quote: "melt-quote",
      amount: { toNumber: () => 1000 },
      fee_reserve: { toNumber: () => 10 },
    }),
    receive: jest.fn(),
    decodeToken: jest.fn((token: string) => ({ token })),
  };
  jest.mocked(Wallet).mockImplementation(() => walletMock as never);

  jest.mocked(resolveSafeMintUrl).mockImplementation(async (url) => ({
    ok: true,
    mintUrl: String(url).replace(/\/+$/, ""),
  }));
  jest.mocked(fetchAllWalletEventsFromDb).mockResolvedValue([]);
  jest.mocked(deleteCachedEventsByIds).mockResolvedValue(undefined);
  jest
    .mocked(signAndPublishEvent)
    .mockImplementation(async (_signer, template) => ({
      ...template,
      id: `evt-${++publishCounter}`,
      pubkey: PUBKEY,
      sig: "sig",
    }));
});

describe("getAgentWalletBalance", () => {
  it("sums numeric and string amounts as numbers, per mint", async () => {
    jest
      .mocked(fetchAllWalletEventsFromDb)
      .mockResolvedValue([
        storedEvent("e1", MINT, [proof("a", 8), proof("b", "4")]),
        storedEvent("e2", MINT, [proof("c", "2")]),
        storedEvent("e3", OTHER_MINT, [proof("d", 100)]),
      ] as never);

    const balance = await getAgentWalletBalance(signer);

    expect(balance).toEqual({
      totalBalance: 114,
      mintBalances: { [MINT]: 14, [OTHER_MINT]: 100 },
      proofEventCount: 3,
    });
    expect(typeof balance.totalBalance).toBe("number");
  });

  it("filters to one mint, ignoring a trailing slash", async () => {
    jest
      .mocked(fetchAllWalletEventsFromDb)
      .mockResolvedValue([
        storedEvent("e1", `${MINT}/`, [proof("a", 8)]),
        storedEvent("e2", OTHER_MINT, [proof("b", 100)]),
      ] as never);

    const balance = await getAgentWalletBalance(signer, MINT);

    expect(balance.totalBalance).toBe(8);
    expect(balance.mintBalances).toEqual({ [`${MINT}/`]: 8 });
    expect(balance.proofEventCount).toBe(2);
  });

  it("only reads this agent's wallet events", async () => {
    await getAgentWalletBalance(signer);

    expect(fetchAllWalletEventsFromDb).toHaveBeenCalledWith(PUBKEY);
  });

  it("skips other kinds, undecryptable events and events without a mint", async () => {
    jest.mocked(fetchAllWalletEventsFromDb).mockResolvedValue([
      storedEvent("history", MINT, [proof("a", 50)], 7376),
      { ...storedEvent("garbled", MINT, []), content: "not encrypted" },
      {
        ...storedEvent("no-mint", MINT, []),
        content: `enc:${JSON.stringify({ proofs: [proof("b", 9)] })}`,
      },
      storedEvent("good", MINT, [proof("c", 3)]),
    ] as never);

    const balance = await getAgentWalletBalance(signer);

    expect(balance.totalBalance).toBe(3);
    expect(balance.proofEventCount).toBe(1);
  });

  it("drops proofs that cannot be spent: missing fields or no usable amount", async () => {
    jest
      .mocked(fetchAllWalletEventsFromDb)
      .mockResolvedValue([
        storedEvent("e1", MINT, [
          proof("ok", 5),
          { id: "x", amount: 7, C: "c" },
          { id: "x", amount: 7, secret: "s" },
          { amount: 7, secret: "s", C: "c" },
          { id: "x", secret: "s2", C: "c" },
          { id: "x", amount: "lots", secret: "s3", C: "c" },
          null,
        ]),
        { ...storedEvent("e2", MINT, []), content: `enc:{"mint":"${MINT}"}` },
      ] as never);

    const balance = await getAgentWalletBalance(signer);

    expect(balance.totalBalance).toBe(5);
  });
});

describe("receiveAgentCashuToken", () => {
  const TOKEN = "cashuBtoken";

  beforeEach(() => {
    jest.mocked(getTokenMetadata).mockReturnValue({
      mint: `${MINT}/`,
      unit: "sat",
    } as never);
    walletMock.receive.mockResolvedValue([
      proof("fresh1", { toNumber: () => 8, toString: () => "8" }),
      proof("fresh2", { toNumber: () => 2, toString: () => "2" }),
    ]);
  });

  it("swaps the token at the mint and stores only the fresh proofs", async () => {
    const result = await receiveAgentCashuToken(signer, TOKEN);

    expect(walletMock.decodeToken).toHaveBeenCalledWith(TOKEN);
    expect(walletMock.receive).toHaveBeenCalledWith({ token: TOKEN });
    const [saved] = publishedProofEvents();
    expect(saved!.body).toEqual({
      mint: MINT,
      unit: "sat",
      proofs: [
        { ...proof("fresh1"), amount: 8 },
        { ...proof("fresh2"), amount: 2 },
      ],
    });
    expect(saved!.template.tags).toEqual([
      ["mint", MINT],
      ["relay", "wss://relay.one"],
    ]);
    expect(result).toEqual({
      eventId: "evt-1",
      amount: 10,
      mint: MINT,
      proofCount: 2,
    });
  });

  it("writes the proof event durably and does not wait for relays", async () => {
    await receiveAgentCashuToken(signer, TOKEN);

    expect(signAndPublishEvent).toHaveBeenCalledWith(
      signer,
      expect.objectContaining({ kind: 7375 }),
      undefined,
      { requireDurableCache: true, waitForRelayPublish: false }
    );
  });

  it("does not retry the swap", async () => {
    walletMock.receive.mockRejectedValue(new Error("network down"));

    await expect(receiveAgentCashuToken(signer, TOKEN)).rejects.toThrow(
      "network down"
    );

    expect(walletMock.receive).toHaveBeenCalledTimes(1);
  });

  it("rejects a token that cannot be parsed, before any network call", async () => {
    jest.mocked(getTokenMetadata).mockImplementation(() => {
      throw new Error("invalid token encoding");
    });

    await expect(receiveAgentCashuToken(signer, "garbage")).rejects.toEqual(
      new AgentWalletError(
        "Failed to receive Cashu tokens",
        "invalid token encoding"
      )
    );

    expect(Wallet).not.toHaveBeenCalled();
  });

  it("rejects tokens that are not denominated in sats", async () => {
    jest
      .mocked(getTokenMetadata)
      .mockReturnValue({ mint: MINT, unit: "usd" } as never);

    await expect(receiveAgentCashuToken(signer, TOKEN)).rejects.toMatchObject({
      title: "Failed to receive Cashu tokens",
      details: 'Only sat tokens are supported, got "usd"',
    });
    expect(Wallet).not.toHaveBeenCalled();
  });

  it("refuses a mint the safety policy rejects without contacting it", async () => {
    jest.mocked(resolveSafeMintUrl).mockResolvedValue({
      ok: false,
      error: "Mint host is not allowed",
    });

    await expect(receiveAgentCashuToken(signer, TOKEN)).rejects.toMatchObject({
      title: "Failed to receive Cashu tokens",
      details: "Mint host is not allowed",
    });

    expect(Wallet).not.toHaveBeenCalled();
    expect(signAndPublishEvent).not.toHaveBeenCalled();
  });

  it("stores nothing when the mint cannot be reached", async () => {
    walletMock.loadMint.mockRejectedValue(new Error("fetch failed"));

    await expect(receiveAgentCashuToken(signer, TOKEN)).rejects.toMatchObject({
      title: "Failed to receive Cashu tokens",
      details: `Could not reach mint ${MINT}: fetch failed`,
    });

    expect(walletMock.receive).not.toHaveBeenCalled();
    expect(signAndPublishEvent).not.toHaveBeenCalled();
  });

  it.each(["Token already spent.", "proofs could not be verified"])(
    "stores nothing when the mint rejects the token (%s)",
    async (reason) => {
      walletMock.receive.mockRejectedValue(new Error(reason));

      await expect(receiveAgentCashuToken(signer, TOKEN)).rejects.toMatchObject(
        { title: "Failed to receive Cashu tokens", details: reason }
      );

      expect(signAndPublishEvent).not.toHaveBeenCalled();
    }
  );

  it("surfaces a failed durable save instead of reporting success", async () => {
    jest
      .mocked(signAndPublishEvent)
      .mockRejectedValueOnce(new Error("database offline"));

    await expect(receiveAgentCashuToken(signer, TOKEN)).rejects.toThrow(
      "database offline"
    );
  });

  it("falls back to 'Unknown error' when a non-Error is thrown", async () => {
    walletMock.receive.mockRejectedValue("boom");

    await expect(receiveAgentCashuToken(signer, TOKEN)).rejects.toMatchObject({
      details: "Unknown error",
    });
  });
});

describe("payInvoiceFromAgentWallet", () => {
  const a = proof("a", 1024);
  const b = proof("b", 16);
  const c = proof("c", 4);

  function seed(...events: ReturnType<typeof storedEvent>[]) {
    jest.mocked(fetchAllWalletEventsFromDb).mockResolvedValue(events as never);
  }

  beforeEach(() => {
    seed(storedEvent("old1", MINT, [a, b]), storedEvent("old2", MINT, [c]));
    jest.mocked(safeSwap).mockResolvedValue({
      status: "swapped",
      keep: [proof("keep1", { toNumber: () => 60, toString: () => "60" })],
      send: [proof("send1", 24)],
    } as never);
    jest.mocked(safeMeltProofs).mockResolvedValue({
      status: "paid",
      changeProofs: [
        proof("change1", { toNumber: () => 9, toString: () => "9" }),
      ],
    } as never);
  });

  describe("on success", () => {
    it("spends only what the invoice needs and keeps the change", async () => {
      const result = await payInvoiceFromAgentWallet(signer, INVOICE, MINT);

      expect(safeSwap).toHaveBeenCalledWith(walletMock, 1010, [a, b, c], {
        sendConfig: { includeFees: true },
      });
      expect(safeMeltProofs).toHaveBeenCalledWith(
        walletMock,
        expect.objectContaining({ quote: "melt-quote" }),
        [expect.objectContaining({ secret: "send1" })]
      );
      const final = publishedProofEvents().at(-1)!;
      expect(final.body.proofs.map((p: TestProof) => p.secret)).toEqual([
        "keep1",
        "change1",
      ]);
      expect(result).toEqual({
        paid: true,
        amount: 1000,
        fee: 10,
        mintUrl: MINT,
        change: 9,
        eventId: "evt-3",
      });
    });

    it("saves every proof before melting, so a failed melt cannot lose any", async () => {
      await payInvoiceFromAgentWallet(signer, INVOICE, MINT);

      const [staged] = publishedProofEvents();
      expect(staged!.body.proofs.map((p: TestProof) => p.secret)).toEqual([
        "keep1",
        "send1",
      ]);
      expect(staged!.body.del).toEqual(["old1", "old2"]);
      const melt = order(jest.mocked(safeMeltProofs) as jest.Mock)!;
      expect(order(jest.mocked(safeSwap) as jest.Mock)).toBeLessThan(
        proofSaveOrders()[0]!
      );
      expect(proofSaveOrders()[0]).toBeLessThan(melt);
      expect(melt).toBeLessThan(proofSaveOrders()[1]!);
    });

    it("replaces the staged event with keep + change and retires it", async () => {
      await payInvoiceFromAgentWallet(signer, INVOICE, MINT);

      const events = publishedProofEvents();
      expect(events).toHaveLength(2);
      expect(events[1]!.body.del).toEqual(["evt-1"]);
      expect(deleteCachedEventsByIds).toHaveBeenNthCalledWith(1, [
        "old1",
        "old2",
      ]);
      expect(deleteCachedEventsByIds).toHaveBeenNthCalledWith(2, ["evt-1"]);
    });

    it("saves the replacement before deleting what it replaces", async () => {
      await payInvoiceFromAgentWallet(signer, INVOICE, MINT);

      const deletes = jest.mocked(deleteCachedEventsByIds) as jest.Mock;
      const saves = proofSaveOrders();
      expect(saves).toHaveLength(2);
      expect(saves[0]).toBeLessThan(order(deletes, 0)!);
      expect(saves[1]).toBeLessThan(order(deletes, 1)!);
    });

    it("publishes NIP-09 deletions for the retired events", async () => {
      await payInvoiceFromAgentWallet(signer, INVOICE, MINT);

      expect(publishedDeletions().map((d) => d.template.tags)).toEqual([
        [
          ["e", "old1"],
          ["e", "old2"],
          ["k", "7375"],
        ],
        [
          ["e", "evt-1"],
          ["k", "7375"],
        ],
      ]);
    });

    it("stores numeric amounts even when cashu-ts hands back Amount objects", async () => {
      await payInvoiceFromAgentWallet(signer, INVOICE, MINT);

      for (const event of publishedProofEvents()) {
        for (const p of event.body.proofs) {
          expect(typeof p.amount).toBe("number");
        }
      }
    });

    it("leaves other mints' events alone", async () => {
      seed(
        storedEvent("old1", MINT, [a, b, c]),
        storedEvent("elsewhere", OTHER_MINT, [proof("z", 500)])
      );

      await payInvoiceFromAgentWallet(signer, INVOICE, MINT);

      expect(walletMock.checkProofsStates).toHaveBeenCalledWith([a, b, c]);
      expect(deleteCachedEventsByIds).not.toHaveBeenCalledWith(
        expect.arrayContaining(["elsewhere"])
      );
    });

    it("matches a stored mint URL that differs by a trailing slash", async () => {
      seed(storedEvent("old1", `${MINT}/`, [a, b, c]));

      await expect(
        payInvoiceFromAgentWallet(signer, INVOICE, MINT)
      ).resolves.toMatchObject({ paid: true });
    });

    it("defaults to the Minibits mint", async () => {
      seed(
        storedEvent("old1", "https://mint.minibits.cash/Bitcoin", [a, b, c])
      );

      await payInvoiceFromAgentWallet(signer, INVOICE);

      expect(resolveSafeMintUrl).toHaveBeenCalledWith(
        "https://mint.minibits.cash/Bitcoin"
      );
    });

    it("treats a missing fee reserve as zero and handles an exact spend", async () => {
      walletMock.createMeltQuoteBolt11.mockResolvedValue({
        quote: "q",
        amount: { toNumber: () => 1000 },
      });
      jest.mocked(safeSwap).mockResolvedValue({
        status: "swapped",
        keep: [],
        send: [proof("send1", 1000)],
      } as never);
      jest
        .mocked(safeMeltProofs)
        .mockResolvedValue({ status: "paid", changeProofs: [] } as never);

      const result = await payInvoiceFromAgentWallet(signer, INVOICE, MINT);

      expect(result).toMatchObject({ fee: 0, change: 0, eventId: null });
      expect(deleteCachedEventsByIds).toHaveBeenLastCalledWith(["evt-1"]);
    });

    it("does not fail the payment when the deletion notice cannot be published", async () => {
      jest
        .mocked(signAndPublishEvent)
        .mockImplementation(async (_signer, template) => {
          if (template.kind === 5) throw new Error("relay down");
          return { ...template, id: `evt-${++publishCounter}` } as never;
        });
      const warn = jest.spyOn(console, "warn").mockImplementation(() => {});

      await expect(
        payInvoiceFromAgentWallet(signer, INVOICE, MINT)
      ).resolves.toMatchObject({ paid: true });

      expect(deleteCachedEventsByIds).toHaveBeenCalledTimes(2);
      warn.mockRestore();
    });
  });

  describe("when the melt does not complete", () => {
    it.each([
      ["unpaid", "Cashu payment failed"],
      ["pending", "Mint payment pending"],
      ["unknown", "Cashu payment outcome unknown"],
    ])("reports '%s' and leaves every proof stored", async (status, title) => {
      jest.mocked(safeMeltProofs).mockResolvedValue({
        status,
        changeProofs: [],
        errorMessage: "mint says no",
      } as never);

      await expect(
        payInvoiceFromAgentWallet(signer, INVOICE, MINT)
      ).rejects.toEqual(new AgentWalletError(title, "mint says no"));

      // only the staged event exists: nothing is written or deleted after it
      expect(publishedProofEvents()).toHaveLength(1);
      expect(deleteCachedEventsByIds).toHaveBeenCalledTimes(1);
      expect(deleteCachedEventsByIds).toHaveBeenCalledWith(["old1", "old2"]);
    });

    it("explains the status when the mint gave no message", async () => {
      jest
        .mocked(safeMeltProofs)
        .mockResolvedValue({ status: "unpaid", changeProofs: [] } as never);

      await expect(
        payInvoiceFromAgentWallet(signer, INVOICE, MINT)
      ).rejects.toMatchObject({
        details: "Mint reported melt status: unpaid",
      });
    });
  });

  describe("when the swap does not complete", () => {
    it("reports an unswapped failure and changes nothing", async () => {
      jest.mocked(safeSwap).mockResolvedValue({
        status: "unswapped",
        keep: [],
        send: [],
        errorMessage: "insufficient funds",
      } as never);

      await expect(
        payInvoiceFromAgentWallet(signer, INVOICE, MINT)
      ).rejects.toEqual(
        new AgentWalletError("Cashu payment failed", "insufficient funds")
      );

      expect(signAndPublishEvent).not.toHaveBeenCalled();
      expect(deleteCachedEventsByIds).not.toHaveBeenCalled();
      expect(safeMeltProofs).not.toHaveBeenCalled();
    });

    it("keeps the stored events when the swap outcome is unknown", async () => {
      jest.mocked(safeSwap).mockResolvedValue({
        status: "unknown",
        keep: [],
        send: [],
      } as never);

      await expect(
        payInvoiceFromAgentWallet(signer, INVOICE, MINT)
      ).rejects.toMatchObject({ title: "Cashu payment outcome unknown" });

      expect(signAndPublishEvent).not.toHaveBeenCalled();
      expect(deleteCachedEventsByIds).not.toHaveBeenCalled();
      expect(safeMeltProofs).not.toHaveBeenCalled();
    });

    it("supplies default messages when safeSwap gives none", async () => {
      jest.mocked(safeSwap).mockResolvedValue({
        status: "unswapped",
        keep: [],
        send: [],
      } as never);
      await expect(
        payInvoiceFromAgentWallet(signer, INVOICE, MINT)
      ).rejects.toMatchObject({ details: "The mint did not accept the swap" });

      jest
        .mocked(safeSwap)
        .mockResolvedValue({ status: "unknown", keep: [], send: [] } as never);
      await expect(
        payInvoiceFromAgentWallet(signer, INVOICE, MINT)
      ).rejects.toMatchObject({
        details: expect.stringContaining("could not be confirmed"),
      });
    });
  });

  describe("before any money moves", () => {
    it("refuses an unsafe mint without reading the wallet or contacting the mint", async () => {
      jest.mocked(resolveSafeMintUrl).mockResolvedValue({
        ok: false,
        error: "Mint host is not allowed",
      });

      await expect(
        payInvoiceFromAgentWallet(signer, INVOICE, "http://169.254.169.254")
      ).rejects.toEqual(
        new AgentWalletError(
          "Failed to send Cashu payment",
          "Mint host is not allowed"
        )
      );

      expect(fetchAllWalletEventsFromDb).not.toHaveBeenCalled();
      expect(Wallet).not.toHaveBeenCalled();
    });

    it("reports no proofs, without contacting the mint, when none are stored for it", async () => {
      seed(storedEvent("elsewhere", OTHER_MINT, [proof("z", 5)]));

      await expect(
        payInvoiceFromAgentWallet(signer, INVOICE, MINT)
      ).rejects.toEqual(
        new AgentWalletError(
          "No available proofs",
          `No Cashu proofs found for mint ${MINT}`
        )
      );

      expect(Wallet).not.toHaveBeenCalled();
    });

    it("reports a mint that cannot be reached", async () => {
      walletMock.loadMint.mockRejectedValue(new Error("fetch failed"));

      await expect(
        payInvoiceFromAgentWallet(signer, INVOICE, MINT)
      ).rejects.toMatchObject({
        title: "Failed to send Cashu payment",
        details: `Could not reach mint ${MINT}: fetch failed`,
      });
      expect(signAndPublishEvent).not.toHaveBeenCalled();
    });

    it("reports insufficient balance with needed vs available, touching nothing", async () => {
      walletMock.createMeltQuoteBolt11.mockResolvedValue({
        quote: "q",
        amount: { toNumber: () => 100 },
        fee_reserve: { toNumber: () => 5 },
      });
      seed(storedEvent("old1", MINT, [proof("tiny", 10)]));

      await expect(
        payInvoiceFromAgentWallet(signer, INVOICE, MINT)
      ).rejects.toEqual(
        new AgentWalletError(
          "Insufficient balance",
          "Need 105 sats but only have 10 sats"
        )
      );

      expect(safeSwap).not.toHaveBeenCalled();
      expect(signAndPublishEvent).not.toHaveBeenCalled();
      expect(deleteCachedEventsByIds).not.toHaveBeenCalled();
    });
  });

  describe("wallets holding spent proofs", () => {
    it("retires events that are entirely spent, then reports no proofs", async () => {
      seed(storedEvent("old1", MINT, [a, b]));
      spent.add("a").add("b");

      await expect(
        payInvoiceFromAgentWallet(signer, INVOICE, MINT)
      ).rejects.toMatchObject({ title: "No available proofs" });

      expect(publishedProofEvents()).toHaveLength(0);
      expect(publishedDeletions()[0]!.template.tags).toEqual([
        ["e", "old1"],
        ["k", "7375"],
      ]);
      expect(deleteCachedEventsByIds).toHaveBeenCalledWith(["old1"]);
      expect(walletMock.createMeltQuoteBolt11).not.toHaveBeenCalled();
    });

    it("rewrites a partly spent event with its surviving proofs and carries on", async () => {
      seed(storedEvent("old1", MINT, [a, b, c]));
      spent.add("b");

      await payInvoiceFromAgentWallet(signer, INVOICE, MINT);

      const [rewrite] = publishedProofEvents();
      expect(rewrite!.body.proofs.map((p: TestProof) => p.secret)).toEqual([
        "a",
        "c",
      ]);
      expect(rewrite!.body.del).toEqual(["old1"]);
      expect(safeSwap).toHaveBeenCalledWith(
        walletMock,
        1010,
        [
          expect.objectContaining({ secret: "a" }),
          expect.objectContaining({ secret: "c" }),
        ],
        expect.anything()
      );
    });

    it("leaves clean events untouched while pruning dirty ones", async () => {
      seed(storedEvent("clean", MINT, [a]), storedEvent("dirty", MINT, [b, c]));
      spent.add("c");

      await payInvoiceFromAgentWallet(signer, INVOICE, MINT);

      const [rewrite] = publishedProofEvents();
      expect(rewrite!.body.del).toEqual(["dirty"]);
      expect(deleteCachedEventsByIds).toHaveBeenNthCalledWith(1, ["dirty"]);
    });

    it("does not rewrite anything when no proof is spent", async () => {
      await payInvoiceFromAgentWallet(signer, INVOICE, MINT);

      // the first write is the staged swap output, not a prune rewrite
      expect(publishedProofEvents()[0]!.body.del).toEqual(["old1", "old2"]);
    });

    it("does not pay when the spent-proof check fails", async () => {
      walletMock.checkProofsStates.mockRejectedValue(new Error("mint down"));

      await expect(
        payInvoiceFromAgentWallet(signer, INVOICE, MINT)
      ).rejects.toThrow("mint down");

      expect(safeSwap).not.toHaveBeenCalled();
      expect(signAndPublishEvent).not.toHaveBeenCalled();
    });
  });

  describe("concurrency", () => {
    it("runs one wallet operation at a time per agent", async () => {
      let release!: () => void;
      jest.mocked(safeMeltProofs).mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            release = () =>
              resolve({ status: "paid", changeProofs: [] } as never);
          })
      );

      const first = payInvoiceFromAgentWallet(signer, INVOICE, MINT);
      const second = payInvoiceFromAgentWallet(signer, INVOICE, MINT);
      await new Promise((resolve) => setTimeout(resolve, 20));

      expect(fetchAllWalletEventsFromDb).toHaveBeenCalledTimes(1);

      release();
      await first;
      await second;
      expect(fetchAllWalletEventsFromDb).toHaveBeenCalledTimes(2);
    });

    it("keeps going after an earlier operation failed", async () => {
      jest.mocked(safeMeltProofs).mockRejectedValueOnce(new Error("boom"));

      await expect(
        payInvoiceFromAgentWallet(signer, INVOICE, MINT)
      ).rejects.toThrow("boom");
      await expect(
        payInvoiceFromAgentWallet(signer, INVOICE, MINT)
      ).resolves.toMatchObject({ paid: true });
    });
  });
});

describe("AgentWalletError", () => {
  it("carries a title and details and reads as an Error", () => {
    const error = new AgentWalletError("Title", "Details");

    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe("AgentWalletError");
    expect(error.title).toBe("Title");
    expect(error.details).toBe("Details");
    expect(error.message).toBe("Details");
  });
});
