import { formatTimestampParts } from "../date-display";

// A fixed instant; tr-TR renders it without a comma between date and time.
const TIMESTAMP = 1757295520;

describe("formatTimestampParts", () => {
  it("returns both parts for locales that omit the comma separator", () => {
    // tr-TR renders "08.09.2025 07:08:40"; the previous comma-split
    // implementation produced `undefined` here and threw on `.trim()`.
    const [dateString, timeString] = formatTimestampParts(TIMESTAMP, "tr-TR");

    expect(dateString).not.toBe("");
    expect(timeString).not.toBe("");
    expect(dateString).not.toContain(timeString);
  });

  it("does not throw for a locale without a comma separator", () => {
    expect(() => formatTimestampParts(TIMESTAMP, "tr-TR")).not.toThrow();
  });

  it("returns separate parts for locales whose combined form uses a comma", () => {
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
