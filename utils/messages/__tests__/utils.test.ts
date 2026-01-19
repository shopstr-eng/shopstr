import {
  timeSinceMessageDisplayText,
  countNumberOfUnreadMessagesFromChatsContext,
} from "../utils";
import { ChatsMap } from "@/utils/context/context";
import { NostrMessageEvent } from "@/utils/types/types";

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
