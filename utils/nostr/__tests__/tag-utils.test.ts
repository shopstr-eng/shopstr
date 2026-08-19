import {
  getTagValue,
  getAllTagValues,
  getDTag,
  hasTag,
} from "@/utils/nostr/tag-utils";

describe("getTagValue", () => {
  it("returns the value of the first matching tag", () => {
    const tags = [
      ["title", "Handmade Mug"],
      ["price", "500", "SATS"],
    ];
    expect(getTagValue(tags, "title")).toBe("Handmade Mug");
  });

  it("returns the value of the first tag when multiple tags share the key", () => {
    const tags = [
      ["t", "pottery"],
      ["t", "ceramics"],
    ];
    expect(getTagValue(tags, "t")).toBe("pottery");
  });

  it("returns undefined when no tag matches the key", () => {
    const tags = [["title", "Handmade Mug"]];
    expect(getTagValue(tags, "price")).toBeUndefined();
  });

  it("returns undefined for an empty tags array", () => {
    expect(getTagValue([], "title")).toBeUndefined();
  });

  it("does not confuse the key with the value position", () => {
    // A tag whose *value* happens to equal the key being looked up must not
    // be mistaken for a match — only tag[0] is compared against `key`.
    const tags = [["d", "title"]];
    expect(getTagValue(tags, "title")).toBeUndefined();
    expect(getTagValue(tags, "d")).toBe("title");
  });
});

describe("getAllTagValues", () => {
  it("returns all second elements for matching tags", () => {
    const tags = [
      ["t", "pottery"],
      ["price", "500"],
      ["t", "ceramics"],
      ["t", "handmade"],
    ];
    expect(getAllTagValues(tags, "t")).toEqual([
      "pottery",
      "ceramics",
      "handmade",
    ]);
  });

  it("returns an empty array when no tags match", () => {
    const tags = [["title", "Handmade Mug"]];
    expect(getAllTagValues(tags, "t")).toEqual([]);
  });

  it("returns an empty array for an empty tags array", () => {
    expect(getAllTagValues([], "t")).toEqual([]);
  });

  it("filters out tags where the second element is falsy", () => {
    const tags = [
      ["t", "pottery"],
      ["t", ""],
      ["t"] as unknown as string[],
      ["t", "ceramics"],
    ];
    expect(getAllTagValues(tags, "t")).toEqual(["pottery", "ceramics"]);
  });
});

describe("getDTag", () => {
  it("delegates to getTagValue with key 'd'", () => {
    const tags = [
      ["d", "listing-id-123"],
      ["title", "Handmade Mug"],
    ];
    expect(getDTag(tags)).toBe("listing-id-123");
  });

  it("returns undefined when no d tag exists", () => {
    const tags = [["title", "Handmade Mug"]];
    expect(getDTag(tags)).toBeUndefined();
  });

  it("returns undefined for an empty tags array", () => {
    expect(getDTag([])).toBeUndefined();
  });
});

describe("hasTag", () => {
  it("returns true when a matching key+value pair exists", () => {
    const tags = [
      ["t", "pottery"],
      ["status", "active"],
    ];
    expect(hasTag(tags, "status", "active")).toBe(true);
  });

  it("returns false when the key matches but the value does not", () => {
    const tags = [["status", "active"]];
    expect(hasTag(tags, "status", "sold")).toBe(false);
  });

  it("returns false when neither key nor value matches", () => {
    const tags = [["status", "active"]];
    expect(hasTag(tags, "t", "pottery")).toBe(false);
  });

  it("returns false for an empty tags array", () => {
    expect(hasTag([], "status", "active")).toBe(false);
  });

  it("matches only when both key and value align on the same tag", () => {
    // key matches on one tag, value matches on a different tag — neither
    // alone should count as a match.
    const tags = [
      ["status", "sold"],
      ["condition", "active"],
    ];
    expect(hasTag(tags, "status", "active")).toBe(false);
  });
});
