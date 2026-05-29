import {
  compareReplaceableEvents,
  pickPreferredReplaceableEvent,
  selectPreferredReplaceableEvent,
} from "../replaceable-events";

describe("replaceable event ordering", () => {
  it("prefers newer created_at values", () => {
    const older = { id: "b".repeat(64), created_at: 100 };
    const newer = { id: "a".repeat(64), created_at: 200 };

    expect(compareReplaceableEvents(newer, older)).toBeLessThan(0);
    expect(selectPreferredReplaceableEvent(newer, older)).toBe(newer);
    expect(pickPreferredReplaceableEvent([older, newer])).toBe(newer);
  });

  it("prefers the lower event id when created_at is tied", () => {
    const lowerId = { id: "0".repeat(64), created_at: 100 };
    const higherId = { id: "f".repeat(64), created_at: 100 };

    expect(compareReplaceableEvents(lowerId, higherId)).toBeLessThan(0);
    expect(selectPreferredReplaceableEvent(higherId, lowerId)).toBe(lowerId);
    expect(pickPreferredReplaceableEvent([higherId, lowerId])).toBe(lowerId);
  });
});
