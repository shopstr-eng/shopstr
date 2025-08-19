import {
  timeSinceMessageDisplayText,
  countNumberOfUnreadMessagesFromChatsContext,
} from "../utils";
import { fetchChatMessagesFromCache } from "@/utils/nostr/cache-service";
import { ChatsMap } from "@/utils/context/context";
import { NostrMessageEvent } from "@/utils/types/types";

jest.mock("@/utils/nostr/cache-service", () => ({
  fetchChatMessagesFromCache: jest.fn(),
}));

const mockedFetchFromCache = fetchChatMessagesFromCache as jest.Mock;

describe("timeSinceMessageDisplayText", () => {
  jest.useFakeTimers();

  const MOCK_CURRENT_DATE = "2025-07-23T14:24:09Z";
  const MOCK_CURRENT_TIMESTAMP_SECONDS =
    new Date(MOCK_CURRENT_DATE).getTime() / 1000;

  beforeAll(() => {
    jest.setSystemTime(new Date(MOCK_CURRENT_DATE));
  });

  afterAll(() => {
    jest.useRealTimers();
  });

  test("should display time in minutes", () => {
    const fiveMinutesAgo = MOCK_CURRENT_TIMESTAMP_SECONDS - 5 * 60;
    const result = timeSinceMessageDisplayText(fiveMinutesAgo);
    expect(result.short).toBe("5m");
    expect(result.long).toBe("5 minutes ago");
  });

  test("should display time in hours", () => {
    const twoHoursAgo = MOCK_CURRENT_TIMESTAMP_SECONDS - 2 * 60 * 60;
    const result = timeSinceMessageDisplayText(twoHoursAgo);
    expect(result.short).toBe("2h");
    expect(result.long).toBe("2 hours ago");
  });

  test("should display time in days", () => {
    const threeDaysAgo = MOCK_CURRENT_TIMESTAMP_SECONDS - 3 * 24 * 60 * 60;
    const result = timeSinceMessageDisplayText(threeDaysAgo);
    expect(result.short).toBe("3d");
    expect(result.long).toBe("3 days ago");
  });

  test("should display time in weeks", () => {
    const fourWeeksAgo = MOCK_CURRENT_TIMESTAMP_SECONDS - 4 * 7 * 24 * 60 * 60;
    const result = timeSinceMessageDisplayText(fourWeeksAgo);
    expect(result.short).toBe("4w");
    expect(result.long).toBe("4 weeks ago");
  });

  test("should display 0 minutes for a very recent message", () => {
    const thirtySecondsAgo = MOCK_CURRENT_TIMESTAMP_SECONDS - 30;
    const result = timeSinceMessageDisplayText(thirtySecondsAgo);
    expect(result.short).toBe("0m");
    expect(result.long).toBe("0 minutes ago");
  });
});

describe("countNumberOfUnreadMessagesFromChatsContext", () => {
  beforeEach(() => {
    mockedFetchFromCache.mockClear();
  });

  const generateMockMessage = (id: string): NostrMessageEvent => ({
    id,
    pubkey: `pubkey-${id}`,
    created_at: Date.now() / 1000,
    kind: 4,
    tags: [],
    content: `message ${id}`,
    sig: `sig-${id}`,
  });

  test("should return 0 when all messages are read", async () => {
    const chatsMap: ChatsMap = new Map([
      ["chat1", [generateMockMessage("msg1"), generateMockMessage("msg2")]],
    ]);
    const cache = new Map([
      ["msg1", { ...generateMockMessage("msg1"), read: true }],
      ["msg2", { ...generateMockMessage("msg2"), read: true }],
    ]);
    mockedFetchFromCache.mockResolvedValue(cache);

    const unreadCount =
      await countNumberOfUnreadMessagesFromChatsContext(chatsMap);
    expect(unreadCount).toBe(0);
  });

  test("should return the correct count of unread messages", async () => {
    const chatsMap: ChatsMap = new Map([
      ["chat1", [generateMockMessage("msg1"), generateMockMessage("msg2")]],
      ["chat2", [generateMockMessage("msg3")]],
    ]);
    const cache = new Map([
      ["msg1", { ...generateMockMessage("msg1"), read: true }],
      ["msg2", { ...generateMockMessage("msg2"), read: false }], // Unread
      ["msg3", { ...generateMockMessage("msg3"), read: false }], // Unread
    ]);
    mockedFetchFromCache.mockResolvedValue(cache);

    const unreadCount =
      await countNumberOfUnreadMessagesFromChatsContext(chatsMap);
    expect(unreadCount).toBe(2);
  });

  test("should return 0 for an empty chats map", async () => {
    const chatsMap: ChatsMap = new Map();
    mockedFetchFromCache.mockResolvedValue(new Map());

    const unreadCount =
      await countNumberOfUnreadMessagesFromChatsContext(chatsMap);
    expect(unreadCount).toBe(0);
  });

  test("should not count messages that are not found in the cache", async () => {
    const chatsMap: ChatsMap = new Map([
      ["chat1", [generateMockMessage("msg1"), generateMockMessage("msg2")]],
    ]);
    const cache = new Map([
      ["msg2", { ...generateMockMessage("msg2"), read: false }],
    ]);
    mockedFetchFromCache.mockResolvedValue(cache);

    const unreadCount =
      await countNumberOfUnreadMessagesFromChatsContext(chatsMap);
    expect(unreadCount).toBe(1);
  });
});
