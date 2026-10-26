import {
  extractProductDeletionTargets,
  isProductTombstoned,
} from "../product-deletions";
import type { NostrEvent } from "../../types/types";

const AUTHOR = "a".repeat(64);
const OTHER = "b".repeat(64);

function deletion(tags: string[][], pubkey = AUTHOR): NostrEvent {
  return {
    id: "del",
    pubkey,
    created_at: 100,
    kind: 5,
    tags,
    content: "",
    sig: "sig",
  };
}

function product(overrides: Partial<NostrEvent> = {}): NostrEvent {
  return {
    id: "p1",
    pubkey: AUTHOR,
    created_at: 50,
    kind: 30402,
    tags: [["d", "listing"]],
    content: "",
    sig: "sig",
    ...overrides,
  };
}

describe("extractProductDeletionTargets", () => {
  it("collects e ids and own-address d tags", () => {
    expect(
      extractProductDeletionTargets(
        deletion([
          ["e", "p1"],
          ["a", `30402:${AUTHOR}:listing`],
          ["k", "30402"],
        ])
      )
    ).toEqual({ eventIds: ["p1"], dTags: ["listing"] });
  });

  it("ignores a tags pointing at another author's listing", () => {
    expect(
      extractProductDeletionTargets(deletion([["a", `30402:${OTHER}:listing`]]))
        .dTags
    ).toEqual([]);
  });

  it("ignores a tags for other kinds", () => {
    expect(
      extractProductDeletionTargets(deletion([["a", `30023:${AUTHOR}:post`]]))
        .dTags
    ).toEqual([]);
  });

  it("leaves wallet and gift wrap deletions alone", () => {
    expect(
      extractProductDeletionTargets(
        deletion([
          ["e", "w1"],
          ["k", "7375"],
        ])
      )
    ).toEqual({ eventIds: [], dTags: [] });
  });

  it("returns nothing for non-deletion events", () => {
    expect(
      extractProductDeletionTargets({ ...deletion([["e", "p1"]]), kind: 1 })
    ).toEqual({ eventIds: [], dTags: [] });
  });

  it("keeps colons inside the d tag", () => {
    expect(
      extractProductDeletionTargets(deletion([["a", `30402:${AUTHOR}:a:b`]]))
        .dTags
    ).toEqual(["a:b"]);
  });
});

describe("isProductTombstoned", () => {
  const address = `30402:${AUTHOR}:listing`;

  it("blocks an exact event id tombstone", () => {
    expect(
      isProductTombstoned(product(), [
        { pubkey: AUTHOR, targetType: "event", target: "p1", deletedAt: 1 },
      ])
    ).toBe(true);
  });

  it("blocks versions at or before the address deletion time", () => {
    const tombstones = [
      {
        pubkey: AUTHOR,
        targetType: "address" as const,
        target: address,
        deletedAt: 50,
      },
    ];
    expect(isProductTombstoned(product({ created_at: 50 }), tombstones)).toBe(
      true
    );
    expect(isProductTombstoned(product({ created_at: 10 }), tombstones)).toBe(
      true
    );
  });

  it("allows a newer re-listing of the same address", () => {
    expect(
      isProductTombstoned(product({ created_at: 51 }), [
        {
          pubkey: AUTHOR,
          targetType: "address",
          target: address,
          deletedAt: 50,
        },
      ])
    ).toBe(false);
  });

  it("ignores tombstones from a different pubkey", () => {
    expect(
      isProductTombstoned(product(), [
        { pubkey: OTHER, targetType: "event", target: "p1", deletedAt: 1 },
      ])
    ).toBe(false);
  });
});
