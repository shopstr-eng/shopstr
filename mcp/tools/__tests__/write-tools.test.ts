import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ApiKeyRecord } from "@/utils/mcp/auth";
import { getAgentSigner } from "@/utils/mcp/auth";
import { signAndPublishEvent } from "@/utils/mcp/nostr-signing";
import {
  cacheEvent,
  getDbPool,
  fetchAllMessagesFromDb,
  fetchCachedEvents,
} from "@/utils/db/db-service";
import { createGiftWrapEvent } from "@/utils/nostr/gift-wrap";
import { getDefaultRelays, withBlastr } from "@/utils/nostr/relay-config";
import {
  getMcpOrder,
  updateMcpOrderStatus,
  updateMcpOrderAddress,
} from "@/mcp/tools/purchase-tools";
import { getDecodedToken, Mint, Wallet } from "@cashu/cashu-ts";
import { withMintRetry } from "@/utils/cashu/mint-retry-service";
import { safeMeltProofs } from "@/utils/cashu/melt-retry-service";
import { registerWriteTools } from "@/mcp/tools/write-tools";

jest.mock("@/utils/mcp/auth", () => ({
  getAgentSigner: jest.fn(),
}));

const mockRelayManagerMethods = {
  publish: jest.fn(),
  close: jest.fn(),
  getRelayUrls: jest.fn(() => [] as string[]),
};

jest.mock("@/utils/mcp/nostr-signing", () => ({
  signAndPublishEvent: jest.fn(),
  McpRelayManager: jest.fn().mockImplementation(() => mockRelayManagerMethods),
}));

jest.mock("@/utils/db/db-service", () => ({
  cacheEvent: jest.fn(),
  getDbPool: jest.fn(),
  fetchAllMessagesFromDb: jest.fn(),
  fetchCachedEvents: jest.fn(),
}));

jest.mock("@/utils/nostr/gift-wrap", () => ({
  createGiftWrapEvent: jest.fn(),
}));

jest.mock("@/utils/nostr/relay-config", () => ({
  getDefaultRelays: jest.fn(),
  withBlastr: jest.fn((relays: string[]) => relays),
}));

jest.mock("@/mcp/tools/purchase-tools", () => ({
  getMcpOrder: jest.fn(),
  updateMcpOrderStatus: jest.fn(),
  updateMcpOrderAddress: jest.fn(),
}));

jest.mock("@cashu/cashu-ts", () => ({
  getDecodedToken: jest.fn(),
  Mint: jest.fn().mockImplementation(() => ({})),
  Wallet: jest.fn().mockImplementation(() => ({
    loadMint: jest.fn(),
    createMeltQuoteBolt11: jest.fn(),
  })),
}));

jest.mock("@/utils/cashu/mint-retry-service", () => ({
  withMintRetry: jest.fn((fn: () => Promise<unknown>) => fn()),
}));

jest.mock("@/utils/cashu/melt-retry-service", () => ({
  safeMeltProofs: jest.fn(),
}));

type ToolResult = {
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
};

type ToolCallback = (
  args: Record<string, unknown>,
  extra?: unknown
) => Promise<ToolResult>;

const TEST_PUBKEY = "a".repeat(64);

function createMockSigner(pubkey = TEST_PUBKEY) {
  return {
    getPubKey: jest.fn(() => pubkey),
    sign: jest.fn((template: any) => ({
      ...template,
      id: "signed-id",
      pubkey,
      sig: "mock-sig",
    })),
    encrypt: jest.fn((_pk: string, text: string) => `encrypted(${text})`),
    decrypt: jest.fn((_pk: string, text: string) =>
      text.replace(/^encrypted\((.*)\)$/, "$1")
    ),
  };
}

function makeApiKey(overrides: Partial<ApiKeyRecord> = {}): ApiKeyRecord {
  return {
    id: 1,
    key_prefix: "abcd1234",
    key_hash: "hash",
    name: "test key",
    pubkey: TEST_PUBKEY,
    permissions: "full_access",
    created_at: new Date(0).toISOString(),
    last_used_at: null,
    is_active: true,
    encrypted_nsec: "encrypted-nsec",
    ...overrides,
  };
}

const fullAccessApiKey = makeApiKey();
const readOnlyApiKey = makeApiKey({ permissions: "read" });

function registerToolsForTest(apiKey: ApiKeyRecord) {
  const callbacks = new Map<string, ToolCallback>();
  const server = {
    registerTool: jest.fn(
      (name: string, _options: unknown, callback: ToolCallback) => {
        callbacks.set(name, callback);
      }
    ),
  };
  registerWriteTools(server as unknown as McpServer, apiKey);
  return callbacks;
}

function getTool(callbacks: Map<string, ToolCallback>, name: string) {
  const tool = callbacks.get(name);
  if (!tool) throw new Error(`Tool "${name}" was not registered`);
  return tool;
}

function textPayload(result: ToolResult) {
  return JSON.parse(result.content[0]!.text);
}

function mockMcpOrder(overrides: Record<string, any> = {}) {
  return {
    id: 1,
    order_id: "order-1",
    api_key_id: 1,
    buyer_pubkey: "buyer-pubkey",
    seller_pubkey: TEST_PUBKEY,
    product_id: "prod-1",
    product_title: "Raw Milk",
    quantity: 1,
    amount_total: 1000,
    currency: "sats",
    shipping_address: null,
    payment_ref: null,
    payment_status: "paid",
    order_status: "pending",
    created_at: new Date(0).toISOString(),
    updated_at: new Date(0).toISOString(),
    ...overrides,
  };
}

function encryptForMock(plainText: string) {
  return `encrypted(${plainText})`;
}

function buildMockProofEvent(overrides: {
  pubkey?: string;
  mint?: string;
  proofs?: Array<{ amount: number }>;
}) {
  const {
    pubkey = TEST_PUBKEY,
    mint = "https://mint.example",
    proofs = [],
  } = overrides;
  return {
    pubkey,
    content: encryptForMock(JSON.stringify({ mint, proofs })),
  };
}

function buildMockMessage(
  overrides: Partial<{
    id: string;
    senderPubkey: string;
    content: string;
    tags: string[][];
    createdAt: number;
    isRead: boolean;
  }> = {}
) {
  const {
    id = "msg-1",
    senderPubkey = "sender-pubkey",
    content = "Hello",
    tags = [],
    createdAt = 1000,
    isRead = false,
  } = overrides;

  const innerMessage = {
    pubkey: senderPubkey,
    created_at: createdAt,
    content,
    kind: 14,
    tags,
  };
  const sealEvent = {
    pubkey: senderPubkey,
    content: encryptForMock(JSON.stringify(innerMessage)),
  };

  return {
    id,
    pubkey: "wrap-ephemeral-pubkey",
    content: encryptForMock(JSON.stringify(sealEvent)),
    created_at: createdAt,
    kind: 1059,
    tags: [] as string[][],
    sig: "sig",
    is_read: isRead,
  };
}

const WRITE_TOOL_NAMES = [
  "set_user_profile",
  "set_shop_profile",
  "register_shop_slug",
  "create_product_listing",
  "update_product_listing",
  "delete_listing",
  "publish_review",
];

let mockSigner: ReturnType<typeof createMockSigner>;
let publishCallCount: number;
let auditLogSpy: jest.SpyInstance;
const originalFetch = global.fetch;

beforeAll(() => {
  auditLogSpy = jest
    .spyOn(console, "error")
    .mockImplementation(() => undefined);
});

afterAll(() => {
  auditLogSpy.mockRestore();
  global.fetch = originalFetch;
});

beforeEach(() => {
  jest.clearAllMocks();
  mockSigner = createMockSigner();
  publishCallCount = 0;
  jest
    .mocked(getAgentSigner)
    .mockResolvedValue({ signer: mockSigner as any, pubkey: TEST_PUBKEY });
  jest
    .mocked(signAndPublishEvent)
    .mockImplementation(async (_signer: any, template: any) => {
      publishCallCount += 1;
      return {
        ...template,
        id: `signed-${template.kind}-${publishCallCount}`,
        pubkey: TEST_PUBKEY,
        sig: "mock-sig",
      };
    });
  jest.mocked(cacheEvent).mockResolvedValue(undefined);
  jest.mocked(fetchCachedEvents).mockResolvedValue([]);
  jest.mocked(withMintRetry).mockImplementation((fn: any) => fn());
  global.fetch = jest.fn() as any;
});

describe("registerWriteTools — (core listing & shop lifecycle)", () => {
  describe.each(WRITE_TOOL_NAMES)("%s — shared guards", (toolName) => {
    it("returns a permission error when apiKey.permissions is not full_access", async () => {
      const callbacks = registerToolsForTest(readOnlyApiKey);
      const tool = getTool(callbacks, toolName);

      const result = await tool({});

      expect(result.isError).toBe(true);
      expect(textPayload(result).error).toMatch(/Insufficient permissions/i);
      expect(getAgentSigner).not.toHaveBeenCalled();
      expect(signAndPublishEvent).not.toHaveBeenCalled();
    });

    it("returns a no-signer error when getAgentSigner resolves null", async () => {
      jest.mocked(getAgentSigner).mockResolvedValueOnce(null);
      const callbacks = registerToolsForTest(fullAccessApiKey);
      const tool = getTool(callbacks, toolName);

      const result = await tool({});

      expect(result.isError).toBe(true);
      expect(textPayload(result).error).toMatch(/No signing key configured/i);
      expect(signAndPublishEvent).not.toHaveBeenCalled();
    });
  });

  describe("set_user_profile", () => {
    function getCallback() {
      return getTool(
        registerToolsForTest(fullAccessApiKey),
        "set_user_profile"
      );
    }

    it("omits unset optional fields from the event content", async () => {
      const tool = getCallback();
      const result = await tool({ name: "Alice" });

      const template = jest.mocked(signAndPublishEvent).mock
        .calls[0]![1] as any;
      expect(template.kind).toBe(0);
      expect(JSON.parse(template.content)).toEqual({ name: "Alice" });

      const payload = textPayload(result);
      expect(payload.success).toBe(true);
      expect(payload.profile).toEqual({ name: "Alice" });
      expect(payload.pubkey).toBe(TEST_PUBKEY);
    });

    it("includes every provided field in the event content", async () => {
      const tool = getCallback();
      const params = {
        name: "Alice",
        display_name: "Alice A",
        about: "Farm owner",
        picture: "https://example.com/pic.png",
        banner: "https://example.com/banner.png",
        lud16: "alice@getalby.com",
        nip05: "alice@example.com",
        website: "https://example.com",
        fiat_options: { venmo: "alice-v" },
        payment_preference: "lightning",
      };

      await tool(params);

      const template = jest.mocked(signAndPublishEvent).mock
        .calls[0]![1] as any;
      expect(JSON.parse(template.content)).toEqual(params);
    });

    it("returns errorResponse when signAndPublishEvent throws", async () => {
      jest
        .mocked(signAndPublishEvent)
        .mockRejectedValueOnce(new Error("relay down"));
      const tool = getCallback();

      const result = await tool({ name: "Alice" });

      expect(result.isError).toBe(true);
      const payload = textPayload(result);
      expect(payload.error).toBe("Failed to set user profile");
      expect(payload.details).toBe("relay down");
    });
  });

  describe("set_shop_profile", () => {
    function getCallback() {
      return getTool(
        registerToolsForTest(fullAccessApiKey),
        "set_shop_profile"
      );
    }

    it("omits ui and storefront keys entirely when no related fields are provided", async () => {
      const tool = getCallback();
      await tool({ name: "Shop" });

      const template = jest.mocked(signAndPublishEvent).mock
        .calls[0]![1] as any;
      const content = JSON.parse(template.content);
      expect(content).toEqual({ name: "Shop" });
      expect(content.ui).toBeUndefined();
      expect(content.storefront).toBeUndefined();
    });

    it("nests picture/banner/theme/darkMode under content.ui when any is provided", async () => {
      const tool = getCallback();
      await tool({ picture: "p.png", theme: "green" });

      const template = jest.mocked(signAndPublishEvent).mock
        .calls[0]![1] as any;
      const content = JSON.parse(template.content);
      expect(content.ui).toEqual({ picture: "p.png", theme: "green" });
    });

    it("includes darkMode:false explicitly (not treated as unset like a falsy check would)", async () => {
      const tool = getCallback();
      await tool({ darkMode: false });

      const template = jest.mocked(signAndPublishEvent).mock
        .calls[0]![1] as any;
      const content = JSON.parse(template.content);
      expect(content.ui).toEqual({ darkMode: false });
    });

    it("nests storefront fields under content.storefront when any is provided", async () => {
      const tool = getCallback();
      await tool({
        shopSlug: "fresh-farm",
        storefrontProductLayout: "grid",
        showCommunityPage: true,
      });

      const template = jest.mocked(signAndPublishEvent).mock
        .calls[0]![1] as any;
      const content = JSON.parse(template.content);
      expect(content.storefront).toEqual({
        shopSlug: "fresh-farm",
        productLayout: "grid",
        showCommunityPage: true,
      });
    });

    it("builds a kind:30019 event tagged with the signer's pubkey as d", async () => {
      const tool = getCallback();
      await tool({ name: "Shop" });

      const template = jest.mocked(signAndPublishEvent).mock
        .calls[0]![1] as any;
      expect(template.kind).toBe(30019);
      expect(template.tags).toEqual([["d", TEST_PUBKEY]]);
    });

    it("calls cacheEvent in addition to signAndPublishEvent's own caching", async () => {
      const tool = getCallback();
      await tool({ name: "Shop" });

      expect(cacheEvent).toHaveBeenCalledTimes(1);
    });

    it("returns errorResponse when signAndPublishEvent throws", async () => {
      jest
        .mocked(signAndPublishEvent)
        .mockRejectedValueOnce(new Error("relay down"));
      const tool = getCallback();

      const result = await tool({ name: "Shop" });

      expect(result.isError).toBe(true);
      expect(textPayload(result).error).toBe("Failed to set shop profile");
    });
  });

  describe("register_shop_slug", () => {
    function getCallback() {
      return getTool(
        registerToolsForTest(fullAccessApiKey),
        "register_shop_slug"
      );
    }

    function mockPool() {
      const pool = { query: jest.fn() };
      jest.mocked(getDbPool).mockReturnValue(pool as any);
      return pool;
    }

    it("action='delete' deletes from shop_slugs and custom_domains without slug validation", async () => {
      const pool = mockPool();
      pool.query.mockResolvedValue({ rows: [], rowCount: 0 });
      const tool = getCallback();

      const result = await tool({ action: "delete" });

      expect(pool.query).toHaveBeenNthCalledWith(
        1,
        expect.stringContaining("DELETE FROM shop_slugs"),
        [TEST_PUBKEY]
      );
      expect(pool.query).toHaveBeenNthCalledWith(
        2,
        expect.stringContaining("DELETE FROM custom_domains"),
        [TEST_PUBKEY]
      );
      const payload = textPayload(result);
      expect(payload.deleted).toBe(true);
      expect(payload.pubkey).toBe(TEST_PUBKEY);
    });

    it("rejects when slug is missing and action is not 'delete'", async () => {
      mockPool();
      const tool = getCallback();

      const result = await tool({});

      expect(result.isError).toBe(true);
      expect(textPayload(result).error).toBe("Missing slug");
    });

    it.each([
      ["ab", "shorter than 3 characters"],
      ["a".repeat(51), "longer than 50 characters"],
      ["-abc", "starts with a hyphen"],
      ["abc-", "ends with a hyphen"],
      ["ab_c", "contains a disallowed character"],
    ])("rejects an invalid slug '%s' (%s)", async (slug) => {
      mockPool();
      const tool = getCallback();

      const result = await tool({ slug });

      expect(result.isError).toBe(true);
      expect(textPayload(result).error).toBe("Invalid slug");
    });

    it("lowercases and trims the slug before validating and storing it", async () => {
      const pool = mockPool();
      pool.query.mockResolvedValueOnce({ rows: [] }); // taken-check
      pool.query.mockResolvedValueOnce({ rows: [] }); // insert
      const tool = getCallback();

      const result = await tool({ slug: "  Fresh-Farm  " });

      const payload = textPayload(result);
      expect(payload.slug).toBe("fresh-farm");
      expect(payload.storefrontUrl).toBe("/shop/fresh-farm");
    });

    it.each([
      "shop",
      "admin",
      "api",
      "www",
      "mail",
      "ftp",
      "app",
      "dashboard",
      "settings",
      "marketplace",
      "login",
      "signup",
      "auth",
      "checkout",
      "orders",
      "cart",
      "help",
      "support",
      "about",
      "contact",
      "blog",
      "news",
      "terms",
      "privacy",
      "legal",
    ])("rejects the reserved slug '%s'", async (slug) => {
      mockPool();
      const tool = getCallback();

      const result = await tool({ slug });

      expect(result.isError).toBe(true);
      expect(textPayload(result).error).toBe("Reserved slug");
    });

    it("rejects when the slug is already registered to a different pubkey", async () => {
      const pool = mockPool();
      pool.query.mockResolvedValueOnce({ rows: [{ pubkey: "other-pubkey" }] });
      const tool = getCallback();

      const result = await tool({ slug: "fresh-farm" });

      expect(result.isError).toBe(true);
      expect(textPayload(result).error).toBe("Slug taken");
    });

    it("allows re-registering the same slug already owned by this pubkey", async () => {
      const pool = mockPool();
      pool.query.mockResolvedValueOnce({ rows: [] }); // self-exclusion means no match
      pool.query.mockResolvedValueOnce({ rows: [] }); // upsert
      const tool = getCallback();

      const result = await tool({ slug: "fresh-farm" });

      const payload = textPayload(result);
      expect(payload.slug).toBe("fresh-farm");
    });

    it("returns errorResponse when the db query throws", async () => {
      const pool = mockPool();
      pool.query.mockRejectedValueOnce(new Error("db offline"));
      const tool = getCallback();

      const result = await tool({ slug: "fresh-farm" });

      expect(result.isError).toBe(true);
      const payload = textPayload(result);
      expect(payload.error).toBe("Failed to register shop slug");
      expect(payload.details).toBe("db offline");
    });
  });

  describe("create_product_listing", () => {
    const baseParams = {
      title: "Raw Milk",
      description: "Fresh from the farm",
      price: "10",
      currency: "USD",
    };

    function getCallback() {
      return getTool(
        registerToolsForTest(fullAccessApiKey),
        "create_product_listing"
      );
    }

    it("generates a 16-char hex dTag from the title when dTag is omitted", async () => {
      const tool = getCallback();
      const result = await tool(baseParams);

      const payload = textPayload(result);
      expect(payload.dTag).toMatch(/^[0-9a-f]{16}$/);
    });

    it("uses the provided dTag when given", async () => {
      const tool = getCallback();
      const result = await tool({ ...baseParams, dTag: "custom-tag" });

      expect(textPayload(result).dTag).toBe("custom-tag");
    });

    it("builds tags for every provided optional field", async () => {
      const tool = getCallback();
      await tool({
        ...baseParams,
        images: ["img1", "img2"],
        categories: ["dairy"],
        quantity: "5",
        sizes: [{ size: "S", quantity: "2" }],
        volumes: [{ volume: "1L", price: "5" }],
        bulk: [{ units: "10", price: "40" }],
        condition: "new",
        status: "active",
        expiration: "2030-01-01T00:00:00.000Z",
        pickupLocations: [" 123 Farm Rd "],
        weights: [{ weight: "1lb", price: "12" }],
        herdshareAgreement: "https://example.com/agreement",
        requiredCustomerInfo: ["phone"],
        subscriptionEnabled: true,
        subscriptionDiscount: 10,
        subscriptionFrequencies: ["weekly"],
      });

      const template = jest.mocked(signAndPublishEvent).mock
        .calls[0]![1] as any;
      const tags = template.tags as string[][];

      expect(tags).toEqual(
        expect.arrayContaining([
          ["image", "img1"],
          ["image", "img2"],
          ["t", "dairy"],
          ["t", "MilkMarket"],
          ["quantity", "5"],
          ["size", "S", "2"],
          ["volume", "1L", "5"],
          ["bulk", "10", "40"],
          ["condition", "new"],
          ["status", "active"],
          ["valid_until", "1893456000"],
          ["pickup_location", "123 Farm Rd"],
          ["weight", "1lb", "12"],
          ["herdshare_agreement", "https://example.com/agreement"],
          ["required_customer_info", "phone"],
          ["subscription_enabled", "true"],
          ["subscription_discount", "10"],
          ["subscription_frequency", "weekly"],
        ])
      );
    });

    it("always appends the MilkMarket category tag even when no categories are given", async () => {
      const tool = getCallback();
      await tool(baseParams);

      const template = jest.mocked(signAndPublishEvent).mock
        .calls[0]![1] as any;
      expect(template.tags).toEqual(
        expect.arrayContaining([["t", "MilkMarket"]])
      );
    });

    it("publishes the main listing, then fire-and-forgets NIP-89 recommendation and handler events", async () => {
      const tool = getCallback();
      await tool(baseParams);

      expect(signAndPublishEvent).toHaveBeenCalledTimes(3);
      const kinds = jest
        .mocked(signAndPublishEvent)
        .mock.calls.map((call) => (call[1] as any).kind);
      expect(kinds).toEqual([30402, 31989, 31990]);
    });

    it("does not fail the tool call when the fire-and-forget rec/handler publishes reject", async () => {
      jest
        .mocked(signAndPublishEvent)
        .mockImplementationOnce(async (_signer: any, template: any) => ({
          ...template,
          id: "main-id",
          pubkey: TEST_PUBKEY,
          sig: "mock-sig",
        }))
        .mockRejectedValueOnce(new Error("rec publish failed"))
        .mockRejectedValueOnce(new Error("handler publish failed"));
      const tool = getCallback();

      const result = await tool(baseParams);

      const payload = textPayload(result);
      expect(payload.success).toBe(true);
      expect(payload.eventId).toBe("main-id");
    });

    it("returns errorResponse when the main listing publish throws", async () => {
      jest
        .mocked(signAndPublishEvent)
        .mockRejectedValueOnce(new Error("relay down"));
      const tool = getCallback();

      const result = await tool(baseParams);

      expect(result.isError).toBe(true);
      expect(textPayload(result).error).toBe(
        "Failed to create product listing"
      );
    });
  });

  describe("update_product_listing", () => {
    function getCallback() {
      return getTool(
        registerToolsForTest(fullAccessApiKey),
        "update_product_listing"
      );
    }

    it("always includes the d tag even when no other fields are provided", async () => {
      const tool = getCallback();
      const result = await tool({ dTag: "existing-tag" });

      const template = jest.mocked(signAndPublishEvent).mock
        .calls[0]![1] as any;
      expect(template.tags).toEqual(
        expect.arrayContaining([["d", "existing-tag"]])
      );
      expect(textPayload(result).updated).toBe(true);
    });

    it("only includes the shipping tag when shippingOption is provided", async () => {
      const tool = getCallback();
      await tool({ dTag: "t", shippingOption: "Free" });

      const template = jest.mocked(signAndPublishEvent).mock
        .calls[0]![1] as any;
      expect(template.tags).toEqual(
        expect.arrayContaining([["shipping", "Free", "0", ""]])
      );
    });

    it("does not include a shipping tag when shippingOption is omitted", async () => {
      const tool = getCallback();
      await tool({ dTag: "t", price: "5", currency: "USD" });

      const template = jest.mocked(signAndPublishEvent).mock
        .calls[0]![1] as any;
      expect(
        (template.tags as string[][]).some((t) => t[0] === "shipping")
      ).toBe(false);
    });

    it("only includes the price tag when both price and currency are provided", async () => {
      const tool = getCallback();
      await tool({ dTag: "t", price: "5" });

      const template = jest.mocked(signAndPublishEvent).mock
        .calls[0]![1] as any;
      expect((template.tags as string[][]).some((t) => t[0] === "price")).toBe(
        false
      );
    });

    it("appends the MilkMarket tag only when categories are provided", async () => {
      const tool = getCallback();
      await tool({ dTag: "no-categories" });
      await tool({ dTag: "with-categories", categories: ["dairy"] });

      const withoutCategories = jest.mocked(signAndPublishEvent).mock
        .calls[0]![1] as any;
      const withCategories = jest.mocked(signAndPublishEvent).mock
        .calls[1]![1] as any;

      expect(
        (withoutCategories.tags as string[][]).some((t) => t[0] === "t")
      ).toBe(false);
      expect(withCategories.tags).toEqual(
        expect.arrayContaining([
          ["t", "dairy"],
          ["t", "MilkMarket"],
        ])
      );
    });

    it("returns errorResponse when signAndPublishEvent throws", async () => {
      jest
        .mocked(signAndPublishEvent)
        .mockRejectedValueOnce(new Error("relay down"));
      const tool = getCallback();

      const result = await tool({ dTag: "t" });

      expect(result.isError).toBe(true);
      expect(textPayload(result).error).toBe(
        "Failed to update product listing"
      );
    });
  });

  describe("delete_listing", () => {
    function getCallback() {
      return getTool(registerToolsForTest(fullAccessApiKey), "delete_listing");
    }

    it("builds one e tag per eventId and defaults content to 'Deletion request'", async () => {
      const tool = getCallback();
      const result = await tool({ eventIds: ["id1", "id2"] });

      const template = jest.mocked(signAndPublishEvent).mock
        .calls[0]![1] as any;
      expect(template.kind).toBe(5);
      expect(template.tags).toEqual([
        ["e", "id1"],
        ["e", "id2"],
      ]);
      expect(template.content).toBe("Deletion request");
      expect(textPayload(result).deletedEventIds).toEqual(["id1", "id2"]);
    });

    it("uses the provided reason as content when given", async () => {
      const tool = getCallback();
      await tool({ eventIds: ["id1"], reason: "duplicate listing" });

      const template = jest.mocked(signAndPublishEvent).mock
        .calls[0]![1] as any;
      expect(template.content).toBe("duplicate listing");
    });

    it("returns errorResponse when signAndPublishEvent throws", async () => {
      jest
        .mocked(signAndPublishEvent)
        .mockRejectedValueOnce(new Error("relay down"));
      const tool = getCallback();

      const result = await tool({ eventIds: ["id1"] });

      expect(result.isError).toBe(true);
      expect(textPayload(result).error).toBe("Failed to delete listing");
    });
  });

  describe("publish_review", () => {
    function getCallback() {
      return getTool(registerToolsForTest(fullAccessApiKey), "publish_review");
    }

    it("rejects when neither productId nor sellerPubkey is provided", async () => {
      const tool = getCallback();
      const result = await tool({ content: "great!" });

      expect(result.isError).toBe(true);
      expect(textPayload(result).error).toBe("Missing target");
      expect(signAndPublishEvent).not.toHaveBeenCalled();
    });

    it("builds dTag as '<pubkey>:<productId>' and tags the product when productId is given", async () => {
      const tool = getCallback();
      await tool({ content: "great!", productId: "prod-1" });

      const template = jest.mocked(signAndPublishEvent).mock
        .calls[0]![1] as any;
      expect(template.tags).toEqual(
        expect.arrayContaining([
          ["d", `${TEST_PUBKEY}:prod-1`],
          ["e", "prod-1"],
        ])
      );
    });

    it("builds dTag as '<pubkey>:<sellerPubkey>' and tags the seller when only sellerPubkey is given", async () => {
      const tool = getCallback();
      await tool({ content: "great!", sellerPubkey: "seller-1" });

      const template = jest.mocked(signAndPublishEvent).mock
        .calls[0]![1] as any;
      expect(template.tags).toEqual(
        expect.arrayContaining([
          ["d", `${TEST_PUBKEY}:seller-1`],
          ["p", "seller-1"],
        ])
      );
    });

    it("builds one rating tag per rating entry", async () => {
      const tool = getCallback();
      await tool({
        content: "great!",
        productId: "prod-1",
        ratings: [
          { category: "quality", value: 5 },
          { category: "shipping", value: 4 },
        ],
      });

      const template = jest.mocked(signAndPublishEvent).mock
        .calls[0]![1] as any;
      expect(template.tags).toEqual(
        expect.arrayContaining([
          ["rating", "5", "quality"],
          ["rating", "4", "shipping"],
        ])
      );
      expect(template.kind).toBe(31555);
      expect(template.content).toBe("great!");
    });

    it("calls cacheEvent in addition to signAndPublishEvent", async () => {
      const tool = getCallback();
      await tool({ content: "great!", productId: "prod-1" });

      expect(cacheEvent).toHaveBeenCalledTimes(1);
    });

    it("returns errorResponse when signAndPublishEvent throws", async () => {
      jest
        .mocked(signAndPublishEvent)
        .mockRejectedValueOnce(new Error("relay down"));
      const tool = getCallback();

      const result = await tool({ content: "great!", productId: "prod-1" });

      expect(result.isError).toBe(true);
      expect(textPayload(result).error).toBe("Failed to publish review");
    });
  });
});

describe("registerWriteTools — (community & messaging)", () => {
  const PHASE_2_SIGNER_TOOLS = [
    "create_community_post",
    "send_direct_message",
    "update_order_address",
    "send_shipping_update",
    "update_order_status",
    "list_messages",
  ];

  beforeEach(() => {
    jest
      .mocked(getDefaultRelays)
      .mockReturnValue(["wss://relay.damus.io", "wss://nos.lol"]);
    jest.mocked(withBlastr).mockImplementation((relays: string[]) => relays);

    let wrapCallCount = 0;
    jest
      .mocked(createGiftWrapEvent)
      .mockImplementation(async (_content: string, recipientPubkey: string) => {
        wrapCallCount += 1;
        return {
          id: `wrap-${wrapCallCount}`,
          kind: 1059,
          pubkey: "ephemeral-wrap-pubkey",
          content: "wrapped",
          tags: [["p", recipientPubkey]],
          sig: "wrap-sig",
          created_at: 0,
        } as any;
      });

    mockRelayManagerMethods.publish.mockResolvedValue(undefined);
    mockRelayManagerMethods.close.mockReturnValue(undefined);
    mockRelayManagerMethods.getRelayUrls.mockReturnValue([]);

    jest.mocked(getMcpOrder).mockResolvedValue(null);
    jest.mocked(updateMcpOrderStatus).mockResolvedValue(null);
    jest.mocked(updateMcpOrderAddress).mockResolvedValue(null);
    jest.mocked(fetchAllMessagesFromDb).mockResolvedValue([]);
  });

  describe.each(PHASE_2_SIGNER_TOOLS)("%s — shared guards", (toolName) => {
    it("returns a permission error when apiKey.permissions is not full_access", async () => {
      const callbacks = registerToolsForTest(readOnlyApiKey);
      const tool = getTool(callbacks, toolName);

      const result = await tool({});

      expect(result.isError).toBe(true);
      expect(textPayload(result).error).toMatch(/Insufficient permissions/i);
      expect(getAgentSigner).not.toHaveBeenCalled();
    });

    it("returns a no-signer error when getAgentSigner resolves null", async () => {
      jest.mocked(getAgentSigner).mockResolvedValueOnce(null);
      const callbacks = registerToolsForTest(fullAccessApiKey);
      const tool = getTool(callbacks, toolName);

      const result = await tool({});

      expect(result.isError).toBe(true);
      expect(textPayload(result).error).toMatch(/No signing key configured/i);
    });
  });

  describe("create_community_post", () => {
    const communityId = "34550:community-owner-pubkey:my-community";

    function getCallback() {
      return getTool(
        registerToolsForTest(fullAccessApiKey),
        "create_community_post"
      );
    }

    it("builds top-level post tags with lowercase a/p/k referencing the community itself", async () => {
      const tool = getCallback();
      await tool({
        content: "Hello community",
        communityId,
        communityPubkey: "community-owner-pubkey",
      });

      const template = jest.mocked(signAndPublishEvent).mock
        .calls[0]![1] as any;
      expect(template.kind).toBe(1111);
      expect(template.tags).toEqual([
        ["A", communityId],
        ["P", "community-owner-pubkey"],
        ["K", "34550"],
        ["a", communityId],
        ["p", "community-owner-pubkey"],
        ["k", "34550"],
      ]);
    });

    it("builds reply tags referencing the parent event when parentEventId is given", async () => {
      const tool = getCallback();
      await tool({
        content: "A reply",
        communityId,
        communityPubkey: "community-owner-pubkey",
        parentEventId: "parent-event-id",
        parentPubkey: "parent-author-pubkey",
        parentKind: 1111,
      });

      const template = jest.mocked(signAndPublishEvent).mock
        .calls[0]![1] as any;
      expect(template.tags).toEqual([
        ["A", communityId],
        ["P", "community-owner-pubkey"],
        ["K", "34550"],
        ["a", communityId],
        ["e", "parent-event-id", ""],
        ["p", "parent-author-pubkey", ""],
        ["k", "1111"],
      ]);
    });

    it("omits parent p/k tags when parentPubkey/parentKind are not provided, even for a reply", async () => {
      const tool = getCallback();
      await tool({
        content: "A reply",
        communityId,
        communityPubkey: "community-owner-pubkey",
        parentEventId: "parent-event-id",
      });

      const template = jest.mocked(signAndPublishEvent).mock
        .calls[0]![1] as any;
      expect(template.tags).toEqual([
        ["A", communityId],
        ["P", "community-owner-pubkey"],
        ["K", "34550"],
        ["a", communityId],
        ["e", "parent-event-id", ""],
      ]);
    });

    it("sets isReply true only when parentEventId was provided", async () => {
      const tool = getCallback();

      const topLevel = await tool({
        content: "Hello",
        communityId,
        communityPubkey: "community-owner-pubkey",
      });
      expect(textPayload(topLevel).isReply).toBe(false);

      const reply = await tool({
        content: "Reply",
        communityId,
        communityPubkey: "community-owner-pubkey",
        parentEventId: "parent-event-id",
      });
      expect(textPayload(reply).isReply).toBe(true);
    });

    it("calls cacheEvent in addition to signAndPublishEvent", async () => {
      const tool = getCallback();
      await tool({
        content: "Hello",
        communityId,
        communityPubkey: "community-owner-pubkey",
      });

      expect(cacheEvent).toHaveBeenCalledTimes(1);
    });

    it("returns errorResponse when signAndPublishEvent throws", async () => {
      jest
        .mocked(signAndPublishEvent)
        .mockRejectedValueOnce(new Error("relay down"));
      const tool = getCallback();

      const result = await tool({
        content: "Hello",
        communityId,
        communityPubkey: "community-owner-pubkey",
      });

      expect(result.isError).toBe(true);
      expect(textPayload(result).error).toBe("Failed to create community post");
    });
  });

  describe("send_direct_message", () => {
    function getCallback() {
      return getTool(
        registerToolsForTest(fullAccessApiKey),
        "send_direct_message"
      );
    }

    it("defaults subject to 'general' and adds no order tags for a plain message", async () => {
      const tool = getCallback();
      await tool({ recipientPubkey: "recipient-pubkey", message: "Hi there" });

      const innerEvent = JSON.parse(
        jest.mocked(createGiftWrapEvent).mock.calls[0]![0] as string
      );
      expect(innerEvent.tags).toEqual(
        expect.arrayContaining([["subject", "general"]])
      );
      expect(innerEvent.tags.some((t: string[]) => t[0] === "order")).toBe(
        false
      );
    });

    it("adds order tags, including an item tag for productAddress, only when isOrder is true", async () => {
      const tool = getCallback();
      await tool({
        recipientPubkey: "recipient-pubkey",
        message: "Payment received",
        isOrder: true,
        orderId: "order-1",
        orderAmount: 5000,
        status: "confirmed",
        tracking: "1Z999",
        carrier: "UPS",
        address: "123 Main St",
        productAddress: "30402:seller:dtag",
      });

      const innerEvent = JSON.parse(
        jest.mocked(createGiftWrapEvent).mock.calls[0]![0] as string
      );
      expect(innerEvent.tags).toEqual(
        expect.arrayContaining([
          ["order", "order-1"],
          ["amount", "5000"],
          ["status", "confirmed"],
          ["tracking", "1Z999"],
          ["carrier", "UPS"],
          ["address", "123 Main St"],
          ["item", "30402:seller:dtag", "1"],
        ])
      );
    });

    it("generates a random orderId via uuid when isOrder is true but orderId is omitted", async () => {
      const tool = getCallback();
      await tool({
        recipientPubkey: "recipient-pubkey",
        message: "Payment received",
        isOrder: true,
      });

      const innerEvent = JSON.parse(
        jest.mocked(createGiftWrapEvent).mock.calls[0]![0] as string
      );
      const orderTag = innerEvent.tags.find((t: string[]) => t[0] === "order");
      expect(orderTag[1]).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
      );
    });

    it("adds an 'a' tag (not 'item') for a non-order message with a productAddress", async () => {
      const tool = getCallback();
      await tool({
        recipientPubkey: "recipient-pubkey",
        message: "Is this still available?",
        subject: "listing-inquiry",
        productAddress: "30402:seller:dtag",
      });

      const innerEvent = JSON.parse(
        jest.mocked(createGiftWrapEvent).mock.calls[0]![0] as string
      );
      expect(innerEvent.tags).toEqual(
        expect.arrayContaining([
          ["a", "30402:seller:dtag", "wss://relay.damus.io"],
        ])
      );
      expect(innerEvent.tags.some((t: string[]) => t[0] === "item")).toBe(
        false
      );
    });

    it("publishes a recipient gift-wrap and a distinct sender self-wrap", async () => {
      const tool = getCallback();
      await tool({ recipientPubkey: "recipient-pubkey", message: "Hi" });

      expect(createGiftWrapEvent).toHaveBeenCalledTimes(2);
      const calls = jest.mocked(createGiftWrapEvent).mock.calls;
      expect(calls[0]![1]).toBe("recipient-pubkey");
      expect(calls[1]![1]).toBe(TEST_PUBKEY);
      expect(mockRelayManagerMethods.publish).toHaveBeenCalledTimes(2);
    });

    it("closes the relay manager in finally even when publish rejects, and surfaces an error response", async () => {
      mockRelayManagerMethods.publish.mockRejectedValueOnce(
        new Error("relay timeout")
      );
      const tool = getCallback();

      const result = await tool({
        recipientPubkey: "recipient-pubkey",
        message: "Hi",
      });

      expect(mockRelayManagerMethods.close).toHaveBeenCalledTimes(1);
      expect(result.isError).toBe(true);
      expect(textPayload(result).error).toBe("Failed to send direct message");
    });

    it("returns errorResponse when createGiftWrapEvent throws", async () => {
      jest
        .mocked(createGiftWrapEvent)
        .mockRejectedValueOnce(new Error("encrypt failed"));
      const tool = getCallback();

      const result = await tool({
        recipientPubkey: "recipient-pubkey",
        message: "Hi",
      });

      expect(result.isError).toBe(true);
      expect(textPayload(result).error).toBe("Failed to send direct message");
    });
  });

  describe("update_order_address", () => {
    function getCallback() {
      return getTool(
        registerToolsForTest(fullAccessApiKey),
        "update_order_address"
      );
    }

    it("returns 'Order not found' when updateMcpOrderAddress resolves null", async () => {
      jest.mocked(updateMcpOrderAddress).mockResolvedValueOnce(null);
      const tool = getCallback();

      const result = await tool({
        orderId: "order-1",
        sellerPubkey: "seller-pubkey",
        newAddress: "456 New St",
      });

      expect(result.isError).toBe(true);
      expect(textPayload(result).error).toBe("Order not found");
      expect(createGiftWrapEvent).not.toHaveBeenCalled();
    });

    it("sends a gift-wrapped DM to the seller with the new address and reports orderUpdated true", async () => {
      jest
        .mocked(updateMcpOrderAddress)
        .mockResolvedValueOnce(mockMcpOrder() as any);
      const tool = getCallback();

      const result = await tool({
        orderId: "order-1",
        sellerPubkey: "seller-pubkey",
        newAddress: "456 New St",
        productTitle: "Raw Milk",
      });

      expect(createGiftWrapEvent).toHaveBeenCalledWith(
        expect.stringContaining("456 New St"),
        "seller-pubkey"
      );
      expect(mockRelayManagerMethods.publish).toHaveBeenCalledTimes(1);
      const payload = textPayload(result);
      expect(payload.orderUpdated).toBe(true);
      expect(payload.addressChangeMessageSent).toBe(true);
      expect(payload.newAddress).toBe("456 New St");
    });

    it("closes the relay manager in finally even when publish rejects", async () => {
      jest
        .mocked(updateMcpOrderAddress)
        .mockResolvedValueOnce(mockMcpOrder() as any);
      mockRelayManagerMethods.publish.mockRejectedValueOnce(
        new Error("relay down")
      );
      const tool = getCallback();

      const result = await tool({
        orderId: "order-1",
        sellerPubkey: "seller-pubkey",
        newAddress: "456 New St",
      });

      expect(mockRelayManagerMethods.close).toHaveBeenCalledTimes(1);
      expect(result.isError).toBe(true);
      expect(textPayload(result).error).toBe("Failed to update order address");
    });
  });

  describe("send_shipping_update", () => {
    function getCallback() {
      return getTool(
        registerToolsForTest(fullAccessApiKey),
        "send_shipping_update"
      );
    }

    const baseParams = {
      orderId: "order-1",
      buyerPubkey: "buyer-pubkey",
      trackingNumber: "1Z999",
      shippingCarrier: "UPS",
      deliveryDays: 3,
    };

    it("returns 'Order not found' when getMcpOrder resolves null", async () => {
      jest.mocked(getMcpOrder).mockResolvedValueOnce(null);
      const tool = getCallback();

      const result = await tool(baseParams);

      expect(result.isError).toBe(true);
      expect(textPayload(result).error).toBe("Order not found");
    });

    it("returns 'Unauthorized order update' when the actor is not this order's seller", async () => {
      jest.mocked(getMcpOrder).mockResolvedValueOnce(
        mockMcpOrder({
          seller_pubkey: "someone-else",
          buyer_pubkey: "buyer-pubkey",
        }) as any
      );
      const tool = getCallback();

      const result = await tool(baseParams);

      expect(result.isError).toBe(true);
      expect(textPayload(result).error).toBe("Unauthorized order update");
      expect(createGiftWrapEvent).not.toHaveBeenCalled();
    });

    it("returns 'Unauthorized order update' when buyerPubkey param does not match the order's recorded buyer", async () => {
      jest.mocked(getMcpOrder).mockResolvedValueOnce(
        mockMcpOrder({
          seller_pubkey: TEST_PUBKEY,
          buyer_pubkey: "actual-buyer",
        }) as any
      );
      const tool = getCallback();

      const result = await tool({ ...baseParams, buyerPubkey: "wrong-buyer" });

      expect(result.isError).toBe(true);
      expect(textPayload(result).error).toBe("Unauthorized order update");
    });

    it("computes etaTimestamp from deliveryDays and marks the order shipped after sending the DM", async () => {
      const order = mockMcpOrder({
        seller_pubkey: TEST_PUBKEY,
        buyer_pubkey: "buyer-pubkey",
      });
      jest.mocked(getMcpOrder).mockResolvedValueOnce(order as any);
      jest
        .mocked(updateMcpOrderStatus)
        .mockResolvedValueOnce({ ...order, order_status: "shipped" } as any);
      const tool = getCallback();

      const result = await tool(baseParams);

      expect(updateMcpOrderStatus).toHaveBeenCalledWith(
        "order-1",
        "shipped",
        TEST_PUBKEY
      );
      const payload = textPayload(result);
      expect(payload.status).toBe("shipped");
      expect(payload.etaTimestamp).toBeGreaterThan(
        Math.floor(Date.now() / 1000)
      );
    });

    it("returns 'Unauthorized order update' when the final updateMcpOrderStatus resolves null despite passing the initial check", async () => {
      const order = mockMcpOrder({
        seller_pubkey: TEST_PUBKEY,
        buyer_pubkey: "buyer-pubkey",
      });
      jest.mocked(getMcpOrder).mockResolvedValueOnce(order as any);
      jest.mocked(updateMcpOrderStatus).mockResolvedValueOnce(null);
      const tool = getCallback();

      const result = await tool(baseParams);

      expect(result.isError).toBe(true);
      expect(textPayload(result).error).toBe("Unauthorized order update");
    });

    it("does not call updateMcpOrderStatus when the gift-wrap publish fails", async () => {
      const order = mockMcpOrder({
        seller_pubkey: TEST_PUBKEY,
        buyer_pubkey: "buyer-pubkey",
      });
      jest.mocked(getMcpOrder).mockResolvedValueOnce(order as any);
      mockRelayManagerMethods.publish.mockRejectedValueOnce(
        new Error("relay down")
      );
      const tool = getCallback();

      const result = await tool(baseParams);

      expect(updateMcpOrderStatus).not.toHaveBeenCalled();
      expect(mockRelayManagerMethods.close).toHaveBeenCalledTimes(1);
      expect(result.isError).toBe(true);
      expect(textPayload(result).error).toBe("Failed to send shipping update");
    });
  });

  describe("update_order_status", () => {
    function getCallback() {
      return getTool(
        registerToolsForTest(fullAccessApiKey),
        "update_order_status"
      );
    }

    it("returns 'Order not found' when getMcpOrder resolves null", async () => {
      jest.mocked(getMcpOrder).mockResolvedValueOnce(null);
      const tool = getCallback();

      const result = await tool({ orderId: "order-1", status: "confirmed" });

      expect(result.isError).toBe(true);
      expect(textPayload(result).error).toBe("Order not found");
    });

    it("blocks an unauthorized seller-managed status transition with a seller-specific message", async () => {
      jest.mocked(getMcpOrder).mockResolvedValueOnce(
        mockMcpOrder({
          seller_pubkey: "someone-else",
          buyer_pubkey: TEST_PUBKEY,
        }) as any
      );
      const tool = getCallback();

      const result = await tool({ orderId: "order-1", status: "confirmed" });

      expect(result.isError).toBe(true);
      const payload = textPayload(result);
      expect(payload.error).toBe("Unauthorized order update");
      expect(payload.details).toMatch(/Only the seller/);
    });

    it("blocks an unauthorized cancellation with a buyer-specific message", async () => {
      jest.mocked(getMcpOrder).mockResolvedValueOnce(
        mockMcpOrder({
          seller_pubkey: TEST_PUBKEY,
          buyer_pubkey: "someone-else",
        }) as any
      );
      const tool = getCallback();

      const result = await tool({ orderId: "order-1", status: "cancelled" });

      expect(result.isError).toBe(true);
      const payload = textPayload(result);
      expect(payload.details).toMatch(/Only the buyer/);
    });

    it("rejects with 'Buyer mismatch' when buyerPubkey param does not match order.buyer_pubkey", async () => {
      jest.mocked(getMcpOrder).mockResolvedValueOnce(
        mockMcpOrder({
          seller_pubkey: TEST_PUBKEY,
          buyer_pubkey: "actual-buyer",
        }) as any
      );
      const tool = getCallback();

      const result = await tool({
        orderId: "order-1",
        status: "confirmed",
        buyerPubkey: "wrong-buyer",
      });

      expect(result.isError).toBe(true);
      expect(textPayload(result).error).toBe("Buyer mismatch");
      expect(updateMcpOrderStatus).not.toHaveBeenCalled();
    });

    it("returns 'Unauthorized order update' when updateMcpOrderStatus resolves null", async () => {
      jest.mocked(getMcpOrder).mockResolvedValueOnce(
        mockMcpOrder({
          seller_pubkey: TEST_PUBKEY,
          buyer_pubkey: "actual-buyer",
        }) as any
      );
      jest.mocked(updateMcpOrderStatus).mockResolvedValueOnce(null);
      const tool = getCallback();

      const result = await tool({ orderId: "order-1", status: "confirmed" });

      expect(result.isError).toBe(true);
      expect(textPayload(result).error).toBe("Unauthorized order update");
    });

    it("sends a notification DM only when both buyerPubkey and message are provided", async () => {
      const order = mockMcpOrder({
        seller_pubkey: TEST_PUBKEY,
        buyer_pubkey: "actual-buyer",
      });
      const tool = getCallback();

      jest.mocked(getMcpOrder).mockResolvedValueOnce(order as any);
      jest
        .mocked(updateMcpOrderStatus)
        .mockResolvedValueOnce({ ...order, order_status: "confirmed" } as any);
      const withoutMessage = await tool({
        orderId: "order-1",
        status: "confirmed",
      });
      expect(textPayload(withoutMessage).notificationSent).toBe(false);
      expect(createGiftWrapEvent).not.toHaveBeenCalled();

      jest.mocked(getMcpOrder).mockResolvedValueOnce(order as any);
      jest
        .mocked(updateMcpOrderStatus)
        .mockResolvedValueOnce({ ...order, order_status: "confirmed" } as any);
      const withMessage = await tool({
        orderId: "order-1",
        status: "confirmed",
        buyerPubkey: "actual-buyer",
        message: "Your order is confirmed!",
      });
      expect(textPayload(withMessage).notificationSent).toBe(true);
      expect(createGiftWrapEvent).toHaveBeenCalledTimes(1);
    });

    it("reports notificationSent=false without failing the whole call when the DM send throws", async () => {
      const order = mockMcpOrder({
        seller_pubkey: TEST_PUBKEY,
        buyer_pubkey: "actual-buyer",
      });
      jest.mocked(getMcpOrder).mockResolvedValueOnce(order as any);
      jest
        .mocked(updateMcpOrderStatus)
        .mockResolvedValueOnce({ ...order, order_status: "confirmed" } as any);
      jest
        .mocked(createGiftWrapEvent)
        .mockRejectedValueOnce(new Error("encrypt failed"));
      const tool = getCallback();

      const result = await tool({
        orderId: "order-1",
        status: "confirmed",
        buyerPubkey: "actual-buyer",
        message: "Your order is confirmed!",
      });

      expect(result.isError).toBeFalsy();
      const payload = textPayload(result);
      expect(payload.orderUpdated).toBe(true);
      expect(payload.notificationSent).toBe(false);
    });

    it.each([
      ["confirmed", "order-info"],
      ["shipped", "shipping-info"],
      ["delivered", "order-completed"],
      ["cancelled", "order-info"],
    ])(
      "maps status '%s' to subject '%s' in the notification DM",
      async (status, expectedSubject) => {
        const order = mockMcpOrder({
          seller_pubkey: status === "cancelled" ? "someone-else" : TEST_PUBKEY,
          buyer_pubkey: status === "cancelled" ? TEST_PUBKEY : "actual-buyer",
        });
        jest.mocked(getMcpOrder).mockResolvedValueOnce(order as any);
        jest
          .mocked(updateMcpOrderStatus)
          .mockResolvedValueOnce({ ...order, order_status: status } as any);
        const tool = getCallback();

        await tool({
          orderId: "order-1",
          status,
          buyerPubkey: order.buyer_pubkey,
          message: "Update",
        });

        const innerEvent = JSON.parse(
          jest.mocked(createGiftWrapEvent).mock.calls[0]![0] as string
        );
        const subjectTag = innerEvent.tags.find(
          (t: string[]) => t[0] === "subject"
        );
        expect(subjectTag[1]).toBe(expectedSubject);
      }
    );
  });

  describe("list_messages", () => {
    function getCallback() {
      return getTool(registerToolsForTest(fullAccessApiKey), "list_messages");
    }

    it("filters to unreadOnly when requested", async () => {
      jest
        .mocked(fetchAllMessagesFromDb)
        .mockResolvedValueOnce([
          buildMockMessage({ id: "read-msg", isRead: true }),
          buildMockMessage({ id: "unread-msg", isRead: false }),
        ] as any);
      const tool = getCallback();

      const result = await tool({ unreadOnly: true });

      const payload = textPayload(result);
      expect(payload.messages).toHaveLength(1);
      expect(payload.messages[0].eventId).toBe("unread-msg");
    });

    it("skips a message when the outer gift-wrap layer fails to decode as JSON", async () => {
      jest.mocked(fetchAllMessagesFromDb).mockResolvedValueOnce([
        {
          id: "bad-outer",
          pubkey: "x",
          content: "not json at all",
          is_read: false,
        },
        buildMockMessage({ id: "good-msg" }),
      ] as any);
      const tool = getCallback();

      const result = await tool({});

      const payload = textPayload(result);
      expect(payload.messages.map((m: any) => m.eventId)).toEqual(["good-msg"]);
    });

    it("skips a message when the seal layer fails to decode as JSON", async () => {
      const badSeal = {
        id: "bad-seal",
        pubkey: "wrap-pubkey",
        content: encryptForMock(
          JSON.stringify({ pubkey: "sender", content: "not json" })
        ),
        is_read: false,
      };
      jest
        .mocked(fetchAllMessagesFromDb)
        .mockResolvedValueOnce([
          badSeal,
          buildMockMessage({ id: "good-msg" }),
        ] as any);
      const tool = getCallback();

      const result = await tool({});

      const payload = textPayload(result);
      expect(payload.messages.map((m: any) => m.eventId)).toEqual(["good-msg"]);
    });

    it("filters by subject and by senderPubkey", async () => {
      const fixture = () => [
        buildMockMessage({
          id: "inquiry",
          senderPubkey: "sender-a",
          tags: [["subject", "listing-inquiry"]],
        }),
        buildMockMessage({
          id: "order-msg",
          senderPubkey: "sender-b",
          tags: [["subject", "order-info"]],
        }),
      ];
      const tool = getCallback();

      jest
        .mocked(fetchAllMessagesFromDb)
        .mockResolvedValueOnce(fixture() as any);
      const bySubject = await tool({ subject: "order-info" });
      expect(
        textPayload(bySubject).messages.map((m: any) => m.eventId)
      ).toEqual(["order-msg"]);

      jest
        .mocked(fetchAllMessagesFromDb)
        .mockResolvedValueOnce(fixture() as any);
      const bySender = await tool({ senderPubkey: "sender-a" });
      expect(textPayload(bySender).messages.map((m: any) => m.eventId)).toEqual(
        ["inquiry"]
      );
    });

    it("respects limit and sets hasMore based on the pre-limit candidate count", async () => {
      jest
        .mocked(fetchAllMessagesFromDb)
        .mockResolvedValueOnce([
          buildMockMessage({ id: "m1" }),
          buildMockMessage({ id: "m2" }),
          buildMockMessage({ id: "m3" }),
          buildMockMessage({ id: "m4" }),
        ] as any);
      const tool = getCallback();

      const result = await tool({ limit: 2 });

      const payload = textPayload(result);
      expect(payload.messages).toHaveLength(2);
      expect(payload.total).toBe(2);
      expect(payload.hasMore).toBe(true);
    });

    it("extracts orderId/productAddress/address from tags, defaulting to null when absent", async () => {
      jest.mocked(fetchAllMessagesFromDb).mockResolvedValueOnce([
        buildMockMessage({
          id: "with-order-tags",
          tags: [
            ["order", "order-1"],
            ["a", "30402:seller:dtag"],
            ["address", "123 Main St"],
          ],
        }),
        buildMockMessage({ id: "plain", tags: [] }),
      ] as any);
      const tool = getCallback();

      const result = await tool({});

      const payload = textPayload(result);
      const withTags = payload.messages.find(
        (m: any) => m.eventId === "with-order-tags"
      );
      expect(withTags).toMatchObject({
        orderId: "order-1",
        productAddress: "30402:seller:dtag",
        address: "123 Main St",
      });
      const plain = payload.messages.find((m: any) => m.eventId === "plain");
      expect(plain).toMatchObject({
        orderId: null,
        productAddress: null,
        address: null,
      });
    });
  });

  describe("mark_messages_read", () => {
    function getCallback() {
      return getTool(
        registerToolsForTest(fullAccessApiKey),
        "mark_messages_read"
      );
    }

    function mockPool() {
      const client = { query: jest.fn(), release: jest.fn() };
      const pool = { connect: jest.fn().mockResolvedValue(client) };
      jest.mocked(getDbPool).mockReturnValue(pool as any);
      return { pool, client };
    }

    it("does not call getAgentSigner — no signer is required for this tool", async () => {
      mockPool();
      const tool = getCallback();

      await tool({ messageIds: ["msg-1"] });

      expect(getAgentSigner).not.toHaveBeenCalled();
    });

    it("returns a permission error for a non-full_access key without touching the db", async () => {
      const { pool } = mockPool();
      const callbacks = registerToolsForTest(readOnlyApiKey);
      const tool = getTool(callbacks, "mark_messages_read");

      const result = await tool({ messageIds: ["msg-1"] });

      expect(result.isError).toBe(true);
      expect(textPayload(result).error).toMatch(/Insufficient permissions/i);
      expect(pool.connect).not.toHaveBeenCalled();
    });

    it("marks the given message ids as read and releases the client", async () => {
      const { client } = mockPool();
      client.query.mockResolvedValue({ rowCount: 2 });
      const tool = getCallback();

      const result = await tool({ messageIds: ["msg-1", "msg-2"] });

      expect(client.query).toHaveBeenCalledWith(
        expect.stringContaining("UPDATE message_events SET is_read = TRUE"),
        [["msg-1", "msg-2"]]
      );
      expect(client.release).toHaveBeenCalledTimes(1);
      const payload = textPayload(result);
      expect(payload.markedRead).toBe(2);
      expect(payload.messageIds).toEqual(["msg-1", "msg-2"]);
    });

    it("releases the client even when the query throws, and returns errorResponse", async () => {
      const { client } = mockPool();
      client.query.mockRejectedValueOnce(new Error("db offline"));
      const tool = getCallback();

      const result = await tool({ messageIds: ["msg-1"] });

      expect(client.release).toHaveBeenCalledTimes(1);
      expect(result.isError).toBe(true);
      expect(textPayload(result).error).toBe("Failed to mark messages as read");
    });
  });
});

describe("registerWriteTools — (relay & media configuration)", () => {
  const PHASE_3_TOOLS = [
    "set_relay_list",
    "set_blossom_servers",
    "upload_media",
  ];

  describe.each(PHASE_3_TOOLS)("%s — shared guards", (toolName) => {
    it("returns a permission error when apiKey.permissions is not full_access", async () => {
      const callbacks = registerToolsForTest(readOnlyApiKey);
      const tool = getTool(callbacks, toolName);

      const result = await tool({});

      expect(result.isError).toBe(true);
      expect(textPayload(result).error).toMatch(/Insufficient permissions/i);
      expect(getAgentSigner).not.toHaveBeenCalled();
    });

    it("returns a no-signer error when getAgentSigner resolves null", async () => {
      jest.mocked(getAgentSigner).mockResolvedValueOnce(null);
      const callbacks = registerToolsForTest(fullAccessApiKey);
      const tool = getTool(callbacks, toolName);

      const result = await tool({});

      expect(result.isError).toBe(true);
      expect(textPayload(result).error).toMatch(/No signing key configured/i);
    });
  });

  describe("set_relay_list", () => {
    function getCallback() {
      return getTool(registerToolsForTest(fullAccessApiKey), "set_relay_list");
    }

    it("maps type='read'/'write' to a 3-element tag and omits the type element for 'both'/unset", async () => {
      const tool = getCallback();

      const result = await tool({
        relays: [
          { url: "wss://read.example", type: "read" },
          { url: "wss://write.example", type: "write" },
          { url: "wss://both.example", type: "both" },
          { url: "wss://unset.example" },
        ],
      });

      const template = jest.mocked(signAndPublishEvent).mock
        .calls[0]![1] as any;
      expect(template.kind).toBe(10002);
      expect(template.tags).toEqual([
        ["r", "wss://read.example", "read"],
        ["r", "wss://write.example", "write"],
        ["r", "wss://both.example"],
        ["r", "wss://unset.example"],
      ]);
      expect(cacheEvent).toHaveBeenCalledTimes(1);
      const payload = textPayload(result);
      expect(payload.relayCount).toBe(4);
      expect(payload.relays).toEqual([
        { url: "wss://read.example", type: "read" },
        { url: "wss://write.example", type: "write" },
        { url: "wss://both.example", type: "both" },
        { url: "wss://unset.example" },
      ]);
    });

    it("returns errorResponse when signAndPublishEvent throws", async () => {
      jest
        .mocked(signAndPublishEvent)
        .mockRejectedValueOnce(new Error("relay down"));
      const tool = getCallback();

      const result = await tool({
        relays: [{ url: "wss://read.example", type: "read" }],
      });

      expect(result.isError).toBe(true);
      expect(textPayload(result).error).toBe("Failed to set relay list");
    });
  });

  describe("set_blossom_servers", () => {
    function getCallback() {
      return getTool(
        registerToolsForTest(fullAccessApiKey),
        "set_blossom_servers"
      );
    }

    it("builds one ['server', url] tag per server on a kind:10063 event and caches it", async () => {
      const tool = getCallback();

      const result = await tool({
        servers: ["https://cdn1.example", "https://cdn2.example"],
      });

      const template = jest.mocked(signAndPublishEvent).mock
        .calls[0]![1] as any;
      expect(template.kind).toBe(10063);
      expect(template.tags).toEqual([
        ["server", "https://cdn1.example"],
        ["server", "https://cdn2.example"],
      ]);
      expect(cacheEvent).toHaveBeenCalledTimes(1);
      expect(textPayload(result).serverCount).toBe(2);
    });

    it("returns errorResponse when signAndPublishEvent throws", async () => {
      jest
        .mocked(signAndPublishEvent)
        .mockRejectedValueOnce(new Error("relay down"));
      const tool = getCallback();

      const result = await tool({ servers: ["https://cdn1.example"] });

      expect(result.isError).toBe(true);
      expect(textPayload(result).error).toBe("Failed to set blossom servers");
    });
  });

  describe("upload_media", () => {
    function getCallback() {
      return getTool(registerToolsForTest(fullAccessApiKey), "upload_media");
    }

    function mockFetchResponse(
      body: unknown,
      overrides: Partial<{ ok: boolean; status: number; text: string }> = {}
    ) {
      const response = {
        ok: overrides.ok ?? true,
        status: overrides.status ?? 200,
        json: jest.fn().mockResolvedValue(body),
        text: jest.fn().mockResolvedValue(overrides.text ?? ""),
      };
      jest.mocked(global.fetch as jest.Mock).mockResolvedValue(response as any);
      return response;
    }

    it("computes the sha256 hash of the decoded base64 file and includes it in the auth event's x tag", async () => {
      mockFetchResponse({
        url: "https://blossom.example/file.png",
        sha256: "server-hash",
        size: 3,
      });
      const tool = getCallback();

      await tool({
        fileBase64: Buffer.from("abc").toString("base64"),
        fileName: "file.png",
        mimeType: "image/png",
        serverUrl: "https://blossom.example",
      });

      expect(mockSigner.sign).toHaveBeenCalledWith(
        expect.objectContaining({
          kind: 24242,
          content: "Upload file.png",
          tags: expect.arrayContaining([
            ["t", "upload"],
            [
              "x",
              "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
            ],
            ["size", "3"],
          ]),
        })
      );
    });

    it("defaults serverUrl to https://cdn.nostrcheck.me when not provided", async () => {
      mockFetchResponse({ url: "https://cdn.nostrcheck.me/file.png" });
      const tool = getCallback();

      await tool({
        fileBase64: Buffer.from("abc").toString("base64"),
        fileName: "file.png",
        mimeType: "image/png",
      });

      expect(global.fetch).toHaveBeenCalledWith(
        "https://cdn.nostrcheck.me/upload",
        expect.objectContaining({ method: "PUT" })
      );
    });

    it("returns errorResponse with the server's status and body when the upload response is not ok", async () => {
      mockFetchResponse({}, { ok: false, status: 413, text: "file too large" });
      const tool = getCallback();

      const result = await tool({
        fileBase64: Buffer.from("abc").toString("base64"),
        fileName: "file.png",
        mimeType: "image/png",
      });

      expect(result.isError).toBe(true);
      const payload = textPayload(result);
      expect(payload.error).toBe("Upload failed");
      expect(payload.details).toContain("413");
      expect(payload.details).toContain("file too large");
    });

    it("falls back to the locally-computed hash and size when the server omits them", async () => {
      mockFetchResponse({ url: "https://blossom.example/file.png" });
      const tool = getCallback();

      const result = await tool({
        fileBase64: Buffer.from("abc").toString("base64"),
        fileName: "file.png",
        mimeType: "image/png",
        serverUrl: "https://blossom.example",
      });

      const payload = textPayload(result);
      expect(payload.sha256).toBe(
        "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
      );
      expect(payload.size).toBe(3);
    });

    it("returns the server's own url/sha256/size when provided", async () => {
      mockFetchResponse({
        url: "https://blossom.example/file.png",
        sha256: "server-hash",
        size: 999,
      });
      const tool = getCallback();

      const result = await tool({
        fileBase64: Buffer.from("abc").toString("base64"),
        fileName: "file.png",
        mimeType: "image/png",
        serverUrl: "https://blossom.example",
      });

      const payload = textPayload(result);
      expect(payload).toMatchObject({
        url: "https://blossom.example/file.png",
        sha256: "server-hash",
        size: 999,
        serverUrl: "https://blossom.example",
      });
    });

    it("returns errorResponse when the upload throws (e.g. network failure)", async () => {
      jest
        .mocked(global.fetch as jest.Mock)
        .mockRejectedValueOnce(new Error("network down"));
      const tool = getCallback();

      const result = await tool({
        fileBase64: Buffer.from("abc").toString("base64"),
        fileName: "file.png",
        mimeType: "image/png",
      });

      expect(result.isError).toBe(true);
      expect(textPayload(result).error).toBe("Failed to upload media");
    });
  });
});

describe("registerWriteTools — (discount codes)", () => {
  const PHASE_4_TOOLS = [
    "create_discount_code",
    "delete_discount_code",
    "list_discount_codes",
  ];

  function mockFetchJson(
    body: unknown,
    overrides: Partial<{ ok: boolean; status: number }> = {}
  ) {
    const response = {
      ok: overrides.ok ?? true,
      status: overrides.status ?? 200,
      json: jest.fn().mockResolvedValue(body),
    };
    jest.mocked(global.fetch as jest.Mock).mockResolvedValue(response as any);
    return response;
  }

  describe.each(PHASE_4_TOOLS)("%s — shared guards", (toolName) => {
    it("returns a permission error when apiKey.permissions is not full_access", async () => {
      const callbacks = registerToolsForTest(readOnlyApiKey);
      const tool = getTool(callbacks, toolName);

      const result = await tool({});

      expect(result.isError).toBe(true);
      expect(textPayload(result).error).toMatch(/Insufficient permissions/i);
      expect(getAgentSigner).not.toHaveBeenCalled();
    });

    it("returns a no-signer error when getAgentSigner resolves null", async () => {
      jest.mocked(getAgentSigner).mockResolvedValueOnce(null);
      const callbacks = registerToolsForTest(fullAccessApiKey);
      const tool = getTool(callbacks, toolName);

      const result = await tool({});

      expect(result.isError).toBe(true);
      expect(textPayload(result).error).toMatch(/No signing key configured/i);
    });
  });

  describe("create_discount_code", () => {
    function getCallback() {
      return getTool(
        registerToolsForTest(fullAccessApiKey),
        "create_discount_code"
      );
    }

    it("POSTs the signed create-proof header and code/pubkey/discountPercentage/expiration in the body", async () => {
      mockFetchJson({});
      const tool = getCallback();

      const result = await tool({
        code: "SUMMER20",
        discountPercentage: 20,
        expiration: 2_000_000_000,
      });

      expect(global.fetch).toHaveBeenCalledWith(
        "http://localhost:5000/api/db/discount-codes",
        expect.objectContaining({
          method: "POST",
          headers: expect.objectContaining({
            "Content-Type": "application/json",
          }),
          body: JSON.stringify({
            code: "SUMMER20",
            pubkey: TEST_PUBKEY,
            discountPercentage: 20,
            expiration: 2_000_000_000,
          }),
        })
      );
      const [, init] = jest.mocked(global.fetch as jest.Mock).mock.calls[0]!;
      const signedEvent = JSON.parse(init.headers["x-signed-event"]);
      expect(signedEvent.tags).toEqual(
        expect.arrayContaining([
          ["action", "create_discount_code"],
          ["method", "POST"],
          ["path", "/api/db/discount-codes"],
          ["pubkey", TEST_PUBKEY],
          ["code", "SUMMER20"],
          ["discountPercentage", "20"],
        ])
      );
      const payload = textPayload(result);
      expect(payload).toMatchObject({
        code: "SUMMER20",
        discountPercentage: 20,
        expiration: 2_000_000_000,
      });
    });

    it("omits the expiration field from the signed proof when not provided", async () => {
      mockFetchJson({});
      const tool = getCallback();

      await tool({ code: "SUMMER20", discountPercentage: 20 });

      const [, init] = jest.mocked(global.fetch as jest.Mock).mock.calls[0]!;
      const signedEvent = JSON.parse(init.headers["x-signed-event"]);
      expect(
        signedEvent.tags.some((t: string[]) => t[0] === "expiration")
      ).toBe(false);
    });

    it("returns errorResponse with the API's error message when the response is not ok", async () => {
      mockFetchJson(
        { error: "Code already exists" },
        { ok: false, status: 409 }
      );
      const tool = getCallback();

      const result = await tool({ code: "SUMMER20", discountPercentage: 20 });

      expect(result.isError).toBe(true);
      const payload = textPayload(result);
      expect(payload.error).toBe("Failed to create discount code");
      expect(payload.details).toBe("Code already exists");
    });

    it("returns errorResponse when fetch throws", async () => {
      jest
        .mocked(global.fetch as jest.Mock)
        .mockRejectedValueOnce(new Error("network down"));
      const tool = getCallback();

      const result = await tool({ code: "SUMMER20", discountPercentage: 20 });

      expect(result.isError).toBe(true);
      expect(textPayload(result).error).toBe("Failed to create discount code");
    });
  });

  describe("delete_discount_code", () => {
    function getCallback() {
      return getTool(
        registerToolsForTest(fullAccessApiKey),
        "delete_discount_code"
      );
    }

    it("sends a DELETE with the signed delete-proof header and code/pubkey in the body", async () => {
      mockFetchJson({});
      const tool = getCallback();

      const result = await tool({ code: "SUMMER20" });

      expect(global.fetch).toHaveBeenCalledWith(
        "http://localhost:5000/api/db/discount-codes",
        expect.objectContaining({
          method: "DELETE",
          body: JSON.stringify({ code: "SUMMER20", pubkey: TEST_PUBKEY }),
        })
      );
      const [, init] = jest.mocked(global.fetch as jest.Mock).mock.calls[0]!;
      const signedEvent = JSON.parse(init.headers["x-signed-event"]);
      expect(signedEvent.tags).toEqual(
        expect.arrayContaining([
          ["action", "delete_discount_code"],
          ["method", "DELETE"],
          ["code", "SUMMER20"],
        ])
      );
      expect(textPayload(result)).toMatchObject({
        code: "SUMMER20",
        deleted: true,
      });
    });

    it("returns errorResponse with the API's error message when the response is not ok", async () => {
      mockFetchJson({ error: "Code not found" }, { ok: false, status: 404 });
      const tool = getCallback();

      const result = await tool({ code: "UNKNOWN" });

      expect(result.isError).toBe(true);
      const payload = textPayload(result);
      expect(payload.error).toBe("Failed to delete discount code");
      expect(payload.details).toBe("Code not found");
    });

    it("returns errorResponse when fetch throws", async () => {
      jest
        .mocked(global.fetch as jest.Mock)
        .mockRejectedValueOnce(new Error("network down"));
      const tool = getCallback();

      const result = await tool({ code: "SUMMER20" });

      expect(result.isError).toBe(true);
      expect(textPayload(result).error).toBe("Failed to delete discount code");
    });
  });

  describe("list_discount_codes", () => {
    function getCallback() {
      return getTool(
        registerToolsForTest(fullAccessApiKey),
        "list_discount_codes"
      );
    }

    it("requests with pubkey as a query param and a signed list-proof header", async () => {
      mockFetchJson([]);
      const tool = getCallback();

      await tool({});

      expect(global.fetch).toHaveBeenCalledWith(
        `http://localhost:5000/api/db/discount-codes?pubkey=${TEST_PUBKEY}`,
        expect.objectContaining({
          headers: expect.objectContaining({
            "x-signed-event": expect.any(String),
          }),
        })
      );
      const [, init] = jest.mocked(global.fetch as jest.Mock).mock.calls[0]!;
      const signedEvent = JSON.parse(init.headers["x-signed-event"]);
      expect(signedEvent.tags).toEqual(
        expect.arrayContaining([
          ["action", "list_discount_codes"],
          ["method", "GET"],
          ["pubkey", TEST_PUBKEY],
        ])
      );
    });

    it("returns count=data.length and codes=data for a normal array response", async () => {
      mockFetchJson([{ code: "SUMMER20" }, { code: "VIP" }]);
      const tool = getCallback();

      const result = await tool({});

      expect(textPayload(result)).toMatchObject({
        count: 2,
        codes: [{ code: "SUMMER20" }, { code: "VIP" }],
      });
    });

    it("returns count=0 and codes=data when the API response is not an array", async () => {
      mockFetchJson({ error: "unexpected shape" });
      const tool = getCallback();

      const result = await tool({});

      expect(textPayload(result)).toMatchObject({
        count: 0,
        codes: { error: "unexpected shape" },
      });
    });

    it("returns errorResponse when fetch throws", async () => {
      jest
        .mocked(global.fetch as jest.Mock)
        .mockRejectedValueOnce(new Error("network down"));
      const tool = getCallback();

      const result = await tool({});

      expect(result.isError).toBe(true);
      expect(textPayload(result).error).toBe("Failed to list discount codes");
    });
  });
});

describe("registerWriteTools — (Cashu payments)", () => {
  const PHASE_5_TOOLS = [
    "get_cashu_balance",
    "receive_cashu_tokens",
    "set_cashu_mints",
    "send_cashu_payment",
  ];

  beforeEach(() => {
    jest
      .mocked(getDefaultRelays)
      .mockReturnValue(["wss://relay.damus.io", "wss://nos.lol"]);
  });

  function mockCashuWallet(meltQuote: {
    amount: number;
    fee_reserve?: number;
  }) {
    const wallet = {
      loadMint: jest.fn().mockResolvedValue(undefined),
      createMeltQuoteBolt11: jest.fn().mockResolvedValue(meltQuote),
    };
    jest.mocked(Mint).mockImplementationOnce(() => ({}) as any);
    jest.mocked(Wallet).mockImplementationOnce(() => wallet as any);
    return wallet;
  }

  describe.each(PHASE_5_TOOLS)("%s — shared guards", (toolName) => {
    it("returns a permission error when apiKey.permissions is not full_access", async () => {
      const callbacks = registerToolsForTest(readOnlyApiKey);
      const tool = getTool(callbacks, toolName);

      const result = await tool({});

      expect(result.isError).toBe(true);
      expect(textPayload(result).error).toMatch(/Insufficient permissions/i);
      expect(getAgentSigner).not.toHaveBeenCalled();
    });

    it("returns a no-signer error when getAgentSigner resolves null", async () => {
      jest.mocked(getAgentSigner).mockResolvedValueOnce(null);
      const callbacks = registerToolsForTest(fullAccessApiKey);
      const tool = getTool(callbacks, toolName);

      const result = await tool({});

      expect(result.isError).toBe(true);
      expect(textPayload(result).error).toMatch(/No signing key configured/i);
    });
  });

  describe("get_cashu_balance", () => {
    function getCallback() {
      return getTool(
        registerToolsForTest(fullAccessApiKey),
        "get_cashu_balance"
      );
    }

    it("filters proof events to only ones authored by the signer's own pubkey", async () => {
      jest.mocked(fetchCachedEvents).mockResolvedValueOnce([
        buildMockProofEvent({
          pubkey: TEST_PUBKEY,
          proofs: [{ amount: 5 }],
        }),
        buildMockProofEvent({
          pubkey: "other-pubkey",
          proofs: [{ amount: 999 }],
        }),
      ] as any);
      const tool = getCallback();

      const result = await tool({});

      expect(fetchCachedEvents).toHaveBeenCalledWith(7375);
      const payload = textPayload(result);
      expect(payload.totalBalance).toBe(5);
      expect(payload.proofEventCount).toBe(1);
    });

    it("skips a proof event when decrypt/JSON.parse fails, without failing the whole call", async () => {
      jest
        .mocked(fetchCachedEvents)
        .mockResolvedValueOnce([
          { pubkey: TEST_PUBKEY, content: "not encrypted json" },
          buildMockProofEvent({ proofs: [{ amount: 7 }] }),
        ] as any);
      const tool = getCallback();

      const result = await tool({});

      expect(textPayload(result).totalBalance).toBe(7);
    });

    it("aggregates across mints by default, and filters to one mint when mintUrl is provided", async () => {
      jest.mocked(fetchCachedEvents).mockResolvedValueOnce([
        buildMockProofEvent({
          mint: "https://mint-a.example",
          proofs: [{ amount: 3 }],
        }),
        buildMockProofEvent({
          mint: "https://mint-b.example",
          proofs: [{ amount: 4 }],
        }),
      ] as any);
      const tool = getCallback();

      const all = await tool({});
      expect(textPayload(all)).toMatchObject({
        totalBalance: 7,
        mintBalances: {
          "https://mint-a.example": 3,
          "https://mint-b.example": 4,
        },
      });

      jest.mocked(fetchCachedEvents).mockResolvedValueOnce([
        buildMockProofEvent({
          mint: "https://mint-a.example",
          proofs: [{ amount: 3 }],
        }),
        buildMockProofEvent({
          mint: "https://mint-b.example",
          proofs: [{ amount: 4 }],
        }),
      ] as any);
      const filtered = await tool({ mintUrl: "https://mint-a.example" });
      expect(textPayload(filtered)).toMatchObject({
        totalBalance: 3,
        mintBalances: { "https://mint-a.example": 3 },
      });
    });

    it("returns errorResponse when fetchCachedEvents throws", async () => {
      jest
        .mocked(fetchCachedEvents)
        .mockRejectedValueOnce(new Error("db offline"));
      const tool = getCallback();

      const result = await tool({});

      expect(result.isError).toBe(true);
      expect(textPayload(result).error).toBe("Failed to get Cashu balance");
    });
  });

  describe("receive_cashu_tokens", () => {
    function getCallback() {
      return getTool(
        registerToolsForTest(fullAccessApiKey),
        "receive_cashu_tokens"
      );
    }

    it("decodes the token, sums proof amounts, and publishes an encrypted kind:7375 event tagged with mint + relay hints", async () => {
      const proofs = [{ amount: 7 }, { amount: 8 }];
      jest.mocked(getDecodedToken).mockReturnValueOnce({
        mint: "https://mint.example",
        proofs,
      } as any);
      const tool = getCallback();

      const result = await tool({ token: "cashu-token" });

      expect(mockSigner.encrypt).toHaveBeenCalledWith(
        TEST_PUBKEY,
        JSON.stringify({ mint: "https://mint.example", proofs })
      );
      const template = jest.mocked(signAndPublishEvent).mock
        .calls[0]![1] as any;
      expect(template.kind).toBe(7375);
      expect(template.tags).toEqual([
        ["mint", "https://mint.example"],
        ["relay", "wss://relay.damus.io"],
        ["relay", "wss://nos.lol"],
      ]);
      expect(textPayload(result)).toMatchObject({
        amount: 15,
        mint: "https://mint.example",
        proofCount: 2,
      });
    });

    it("returns errorResponse when getDecodedToken throws on a malformed token", async () => {
      jest.mocked(getDecodedToken).mockImplementationOnce(() => {
        throw new Error("invalid token encoding");
      });
      const tool = getCallback();

      const result = await tool({ token: "garbage" });

      expect(result.isError).toBe(true);
      expect(textPayload(result).error).toBe("Failed to receive Cashu tokens");
    });
  });

  describe("set_cashu_mints", () => {
    function getCallback() {
      return getTool(registerToolsForTest(fullAccessApiKey), "set_cashu_mints");
    }

    it("encrypts the mint list to self and tags relay hints on a kind:17375 event keyed by d=pubkey", async () => {
      const tool = getCallback();

      const result = await tool({ mints: ["https://mint.example"] });

      expect(mockSigner.encrypt).toHaveBeenCalledWith(
        TEST_PUBKEY,
        JSON.stringify([["mint", "https://mint.example"]])
      );
      const template = jest.mocked(signAndPublishEvent).mock
        .calls[0]![1] as any;
      expect(template.kind).toBe(17375);
      expect(template.tags).toEqual([
        ["d", TEST_PUBKEY],
        ["relay", "wss://relay.damus.io"],
        ["relay", "wss://nos.lol"],
      ]);
      expect(textPayload(result)).toMatchObject({
        mints: ["https://mint.example"],
        mintCount: 1,
      });
    });

    it("returns errorResponse when signAndPublishEvent throws", async () => {
      jest
        .mocked(signAndPublishEvent)
        .mockRejectedValueOnce(new Error("relay down"));
      const tool = getCallback();

      const result = await tool({ mints: ["https://mint.example"] });

      expect(result.isError).toBe(true);
      expect(textPayload(result).error).toBe("Failed to set Cashu mints");
    });
  });

  describe("send_cashu_payment", () => {
    function getCallback() {
      return getTool(
        registerToolsForTest(fullAccessApiKey),
        "send_cashu_payment"
      );
    }

    it("returns 'No available proofs' when no cached proof event matches the target mint", async () => {
      mockCashuWallet({ amount: 10, fee_reserve: 1 });
      jest.mocked(fetchCachedEvents).mockResolvedValueOnce([
        buildMockProofEvent({
          mint: "https://other-mint.example",
          proofs: [{ amount: 100 }],
        }),
      ] as any);
      const tool = getCallback();

      const result = await tool({
        invoice: "lnbc1invoice",
        mintUrl: "https://mint.example",
      });

      expect(result.isError).toBe(true);
      const payload = textPayload(result);
      expect(payload.error).toBe("No available proofs");
      expect(safeMeltProofs).not.toHaveBeenCalled();
    });

    it("returns 'Insufficient balance' with needed vs. available amounts, without melting", async () => {
      mockCashuWallet({ amount: 100, fee_reserve: 5 });
      jest.mocked(fetchCachedEvents).mockResolvedValueOnce([
        buildMockProofEvent({
          mint: "https://mint.example",
          proofs: [{ amount: 10 }],
        }),
      ] as any);
      const tool = getCallback();

      const result = await tool({
        invoice: "lnbc1invoice",
        mintUrl: "https://mint.example",
      });

      expect(result.isError).toBe(true);
      const payload = textPayload(result);
      expect(payload.error).toBe("Insufficient balance");
      expect(payload.details).toBe("Need 105 sats but only have 10 sats");
      expect(safeMeltProofs).not.toHaveBeenCalled();
    });

    it("skips a malformed proof event while aggregating available proofs", async () => {
      mockCashuWallet({ amount: 5, fee_reserve: 0 });
      jest.mocked(fetchCachedEvents).mockResolvedValueOnce([
        { pubkey: TEST_PUBKEY, content: "not encrypted json" },
        buildMockProofEvent({
          mint: "https://mint.example",
          proofs: [{ amount: 5 }],
        }),
      ] as any);
      jest.mocked(safeMeltProofs).mockResolvedValueOnce({
        status: "paid",
        changeProofs: [],
      } as any);
      const tool = getCallback();

      const result = await tool({
        invoice: "lnbc1invoice",
        mintUrl: "https://mint.example",
      });

      expect(safeMeltProofs).toHaveBeenCalledWith(
        expect.any(Object),
        expect.any(Object),
        [{ amount: 5 }]
      );
      expect(textPayload(result).paid).toBe(true);
    });

    it.each([
      ["pending", "Mint payment pending"],
      ["unknown", "Cashu payment outcome unknown"],
      ["failed", "Cashu payment failed"],
    ])(
      "maps a '%s' melt outcome to the error '%s'",
      async (status, expectedError) => {
        mockCashuWallet({ amount: 5, fee_reserve: 0 });
        jest.mocked(fetchCachedEvents).mockResolvedValueOnce([
          buildMockProofEvent({
            mint: "https://mint.example",
            proofs: [{ amount: 5 }],
          }),
        ] as any);
        jest.mocked(safeMeltProofs).mockResolvedValueOnce({
          status,
          changeProofs: [],
        } as any);
        const tool = getCallback();

        const result = await tool({
          invoice: "lnbc1invoice",
          mintUrl: "https://mint.example",
        });

        expect(result.isError).toBe(true);
        expect(textPayload(result).error).toBe(expectedError);
      }
    );

    it("surfaces meltOutcome.errorMessage as details when the mint provides one", async () => {
      mockCashuWallet({ amount: 5, fee_reserve: 0 });
      jest.mocked(fetchCachedEvents).mockResolvedValueOnce([
        buildMockProofEvent({
          mint: "https://mint.example",
          proofs: [{ amount: 5 }],
        }),
      ] as any);
      jest.mocked(safeMeltProofs).mockResolvedValueOnce({
        status: "failed",
        changeProofs: [],
        errorMessage: "mint rejected the melt request",
      } as any);
      const tool = getCallback();

      const result = await tool({
        invoice: "lnbc1invoice",
        mintUrl: "https://mint.example",
      });

      expect(textPayload(result).details).toBe(
        "mint rejected the melt request"
      );
    });

    it("sums changeProofs, handling both plain-number and .toNumber()-style amounts", async () => {
      mockCashuWallet({ amount: 5, fee_reserve: 0 });
      jest.mocked(fetchCachedEvents).mockResolvedValueOnce([
        buildMockProofEvent({
          mint: "https://mint.example",
          proofs: [{ amount: 5 }],
        }),
      ] as any);
      jest.mocked(safeMeltProofs).mockResolvedValueOnce({
        status: "paid",
        changeProofs: [{ amount: 4 }, { amount: { toNumber: () => 6 } }],
      } as any);
      const tool = getCallback();

      const result = await tool({
        invoice: "lnbc1invoice",
        mintUrl: "https://mint.example",
      });

      expect(textPayload(result).change).toBe(10);
    });

    it("defaults mintUrl to https://mint.minibits.cash/Bitcoin when not provided", async () => {
      mockCashuWallet({ amount: 5, fee_reserve: 0 });
      jest.mocked(fetchCachedEvents).mockResolvedValueOnce([
        buildMockProofEvent({
          mint: "https://mint.minibits.cash/Bitcoin",
          proofs: [{ amount: 5 }],
        }),
      ] as any);
      jest.mocked(safeMeltProofs).mockResolvedValueOnce({
        status: "paid",
        changeProofs: [],
      } as any);
      const tool = getCallback();

      const result = await tool({ invoice: "lnbc1invoice" });

      expect(Mint).toHaveBeenCalledWith("https://mint.minibits.cash/Bitcoin");
      expect(textPayload(result).mintUrl).toBe(
        "https://mint.minibits.cash/Bitcoin"
      );
    });

    it("calls withMintRetry with the documented retry configuration", async () => {
      mockCashuWallet({ amount: 5, fee_reserve: 0 });
      jest.mocked(fetchCachedEvents).mockResolvedValueOnce([
        buildMockProofEvent({
          mint: "https://mint.example",
          proofs: [{ amount: 5 }],
        }),
      ] as any);
      jest.mocked(safeMeltProofs).mockResolvedValueOnce({
        status: "paid",
        changeProofs: [],
      } as any);
      const tool = getCallback();

      await tool({ invoice: "lnbc1invoice", mintUrl: "https://mint.example" });

      expect(withMintRetry).toHaveBeenCalledWith(
        expect.any(Function),
        expect.objectContaining({
          maxAttempts: 4,
          perAttemptTimeoutMs: 15000,
          totalTimeoutMs: 60000,
        })
      );
    });

    it("returns errorResponse when wallet.loadMint throws", async () => {
      const wallet = mockCashuWallet({ amount: 5, fee_reserve: 0 });
      wallet.loadMint.mockRejectedValueOnce(new Error("mint unreachable"));
      const tool = getCallback();

      const result = await tool({
        invoice: "lnbc1invoice",
        mintUrl: "https://mint.example",
      });

      expect(result.isError).toBe(true);
      expect(textPayload(result).error).toBe("Failed to send Cashu payment");
    });
  });
});
