const createApiKeyMock = jest.fn();
const initializeApiKeysTableMock = jest.fn();
const encryptNsecMock = jest.fn();
const checkOnboardRateLimitMock = jest.fn();
const generateSecretKeyMock = jest.fn();
const getPublicKeyMock = jest.fn();
const nsecEncodeMock = jest.fn();
const npubEncodeMock = jest.fn();
const bytesToHexMock = jest.fn();

jest.mock("@/utils/mcp/auth", () => ({
  createApiKey: (...args: unknown[]) => createApiKeyMock(...args),
  initializeApiKeysTable: (...args: unknown[]) =>
    initializeApiKeysTableMock(...args),
}));

jest.mock("@/utils/mcp/nostr-signing", () => ({
  encryptNsec: (...args: unknown[]) => encryptNsecMock(...args),
}));

jest.mock("@/utils/mcp/metrics", () => ({
  checkOnboardRateLimit: (...args: unknown[]) =>
    checkOnboardRateLimitMock(...args),
}));

jest.mock("nostr-tools", () => ({
  generateSecretKey: (...args: unknown[]) => generateSecretKeyMock(...args),
  getPublicKey: (...args: unknown[]) => getPublicKeyMock(...args),
  nip19: {
    nsecEncode: (...args: unknown[]) => nsecEncodeMock(...args),
    npubEncode: (...args: unknown[]) => npubEncodeMock(...args),
    decode: jest.fn(),
  },
}));

jest.mock("@noble/hashes/utils", () => ({
  bytesToHex: (...args: unknown[]) => bytesToHexMock(...args),
  hexToBytes: jest.fn(),
}));

import type { NextApiRequest, NextApiResponse } from "next";

const FIXED_SECRET_KEY = new Uint8Array([1, 2, 3, 4]);
const FIXED_PUBKEY = "a".repeat(64);
const FIXED_API_KEY = "sk_test_onboard_key";
const FIXED_NSEC = "nsec1testonboard";
const FIXED_NPUB = "npub1testonboard";
const FIXED_AGENT_NAME = "Test Agent";

type MockResponse = NextApiResponse & {
  statusCode: number;
  jsonBody: unknown;
};

function createMockRequest(
  overrides: Partial<NextApiRequest> = {}
): NextApiRequest {
  return {
    method: "POST",
    headers: {
      host: "localhost:5000",
    },
    socket: {
      remoteAddress: "127.0.0.1",
      encrypted: false,
    },
    body: {
      name: FIXED_AGENT_NAME,
    },
    ...overrides,
  } as NextApiRequest;
}

function createMockResponse(): MockResponse {
  const res = {
    statusCode: 200,
    jsonBody: undefined,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      this.jsonBody = payload;
      return this;
    },
  } as MockResponse;

  return res;
}

describe("MCP onboard API quick-start correctness", () => {
  const originalBaseUrl = process.env.NEXT_PUBLIC_BASE_URL;
  let handler: typeof import("../onboard").default;

  beforeEach(async () => {
    jest.resetModules();
    jest.clearAllMocks();

    delete process.env.NEXT_PUBLIC_BASE_URL;

    checkOnboardRateLimitMock.mockReturnValue(true);
    initializeApiKeysTableMock.mockResolvedValue(undefined);
    encryptNsecMock.mockReturnValue("encrypted-nsec");
    createApiKeyMock.mockResolvedValue({
      key: FIXED_API_KEY,
      record: { id: 1 },
    });

    generateSecretKeyMock.mockReturnValue(FIXED_SECRET_KEY);
    getPublicKeyMock.mockReturnValue(FIXED_PUBKEY);
    bytesToHexMock.mockReturnValue("11".repeat(32));
    nsecEncodeMock.mockReturnValue(FIXED_NSEC);
    npubEncodeMock.mockReturnValue(FIXED_NPUB);

    handler = (await import("../onboard")).default;
  });

  afterEach(() => {
    if (originalBaseUrl === undefined) {
      delete process.env.NEXT_PUBLIC_BASE_URL;
    } else {
      process.env.NEXT_PUBLIC_BASE_URL = originalBaseUrl;
    }
  });

  it("returns local HTTP onboarding URLs and MCP-compatible curl examples", async () => {
    const req = createMockRequest();
    const res = createMockResponse();

    await handler(req, res);

    expect(res.statusCode).toBe(201);
    expect(res.jsonBody).toMatchObject({
      apiKey: FIXED_API_KEY,
      pubkey: FIXED_PUBKEY,
      npub: FIXED_NPUB,
      mcpEndpoint: "http://localhost:5000/api/mcp",
      manifestUrl: "http://localhost:5000/.well-known/agent.json",
      quickStart: {
        notes: expect.arrayContaining([
          "Run the initialize command with -i so curl prints the Mcp-Session-Id response header for follow-up requests.",
        ]),
      },
    });

    const body = res.jsonBody as {
      quickStart: { examples: Record<string, string> };
    };

    expect(body.quickStart.examples.curl_initialize).toContain(
      'curl -i -X POST http://localhost:5000/api/mcp'
    );
    expect(body.quickStart.examples.curl_initialize).toContain(
      'Accept: application/json, text/event-stream'
    );
    expect(body.quickStart.examples.curl_list_tools).toContain(
      'Mcp-Session-Id: <session-id-from-initialize>'
    );
    expect(body.quickStart.examples.curl_search).toContain(
      'Accept: application/json, text/event-stream'
    );
  });

  it("prefers NEXT_PUBLIC_BASE_URL and normalizes trailing slashes", async () => {
    process.env.NEXT_PUBLIC_BASE_URL = "https://shopstr.example/";

    const req = createMockRequest({
      headers: {
        host: "localhost:5000",
      },
    });
    const res = createMockResponse();

    await handler(req, res);

    expect(res.statusCode).toBe(201);
    expect(res.jsonBody).toMatchObject({
      mcpEndpoint: "https://shopstr.example/api/mcp",
      manifestUrl: "https://shopstr.example/.well-known/agent.json",
    });
  });

  it("uses forwarded host and protocol when present", async () => {
    const req = createMockRequest({
      headers: {
        host: "127.0.0.1:5000",
        "x-forwarded-host": "shopstr.example",
        "x-forwarded-proto": "https",
      },
    });
    const res = createMockResponse();

    await handler(req, res);

    expect(res.statusCode).toBe(201);
    expect(res.jsonBody).toMatchObject({
      mcpEndpoint: "https://shopstr.example/api/mcp",
      manifestUrl: "https://shopstr.example/.well-known/agent.json",
    });
  });
});
