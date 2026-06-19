import {
  CACHE_EVENTS_MAX_BATCH_SIZE,
  isCacheableEventShape,
  isCacheableKind,
} from "../cache-event-policy";

describe("cache event policy", () => {
  it("allows the hot-path Nostr event kinds that the app caches", () => {
    expect(isCacheableKind(0)).toBe(true);
    expect(isCacheableKind(1059)).toBe(true);
    expect(isCacheableKind(30402)).toBe(true);
    expect(isCacheableKind(1984)).toBe(true);
    expect(isCacheableKind(7375)).toBe(true);
    expect(isCacheableKind(7376)).toBe(true);
  });

  it("rejects unknown kinds and malformed event shapes", () => {
    expect(isCacheableKind("30402")).toBe(false);
    expect(isCacheableKind(9735)).toBe(false);
    expect(isCacheableEventShape(null)).toBe(false);
    expect(isCacheableEventShape({})).toBe(false);
    expect(isCacheableEventShape({ kind: "30402" })).toBe(false);
    expect(isCacheableEventShape({ kind: 9735 })).toBe(false);
  });

  it("keeps cache writes bounded to the API batch limit", () => {
    expect(CACHE_EVENTS_MAX_BATCH_SIZE).toBe(500);
  });
});
