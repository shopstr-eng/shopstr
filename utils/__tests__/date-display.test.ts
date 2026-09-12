import { formatTimestampParts } from "../date-display";

// A fixed instant; tr-TR renders it without a comma between date and time.
const TIMESTAMP = 1757295520;

describe("formatTimestampParts", () => {
  it("returns both parts for locales that omit the comma separator", () => {
    // tr-TR renders "08.09.2026 01:38:40"; the previous comma-split
    // implementation produced `undefined` here and threw on `.trim()`.
    const [dateString, timeString] = formatTimestampParts(TIMESTAMP, "tr-TR");

    expect(dateString).not.toBe("");
    expect(timeString).not.toBe("");
    expect(dateString).not.toContain(timeString);
  });

  it("does not throw for a locale without a comma separator", () => {
    expect(() => formatTimestampParts(TIMESTAMP, "tr-TR")).not.toThrow();
  });

  it("still splits locales that do use a comma separator", () => {
    const [dateString, timeString] = formatTimestampParts(TIMESTAMP, "en-US");

    expect(dateString).not.toContain(",");
    expect(timeString).not.toContain(",");
    expect(timeString).toMatch(/\d/);
  });

  it("returns empty parts for a missing timestamp", () => {
    expect(formatTimestampParts(0)).toEqual(["", ""]);
    expect(formatTimestampParts(undefined as unknown as number)).toEqual([
      "",
      "",
    ]);
  });

  it("returns empty parts for an unrepresentable timestamp", () => {
    expect(formatTimestampParts(Number.MAX_SAFE_INTEGER)).toEqual(["", ""]);
  });
});
