import { NostrEvent } from "@/utils/types/types";
import { resolveProductEventByTitleSlug } from "@/utils/db/db-service";

type ProductEventSlugLookupRow = Pick<
  NostrEvent,
  "id" | "pubkey" | "created_at" | "kind" | "tags" | "content" | "sig"
>;

function buildProductRow({
  id,
  pubkey,
  title,
  created_at,
  dTag,
}: {
  id: string;
  pubkey: string;
  title: string;
  created_at: number;
  dTag: string;
}): ProductEventSlugLookupRow {
  return {
    id,
    pubkey,
    created_at,
    kind: 30402,
    tags: [
      ["d", dTag],
      ["title", title],
    ],
    content: "",
    sig: "sig",
  };
}

describe("resolveProductEventByTitleSlug", () => {
  it("returns the latest row when the same listing has multiple cached revisions", () => {
    const rows = [
      buildProductRow({
        id: "newer-event",
        pubkey: "a".repeat(64),
        title: "Last Brick",
        created_at: 200,
        dTag: "listing-1",
      }),
      buildProductRow({
        id: "older-event",
        pubkey: "a".repeat(64),
        title: "Last Brick",
        created_at: 100,
        dTag: "listing-1",
      }),
    ];

    const result = resolveProductEventByTitleSlug("Last-Brick", rows);

    expect(result?.id).toBe("newer-event");
  });

  it("returns null when two distinct listings share the same exact slug", () => {
    const rows = [
      buildProductRow({
        id: "listing-a",
        pubkey: "a".repeat(64),
        title: "Last Brick",
        created_at: 200,
        dTag: "listing-a",
      }),
      buildProductRow({
        id: "listing-b",
        pubkey: "b".repeat(64),
        title: "Last Brick",
        created_at: 150,
        dTag: "listing-b",
      }),
    ];

    const result = resolveProductEventByTitleSlug("Last-Brick", rows);

    expect(result).toBeNull();
  });

  it("preserves exact slug matches even when the slug ends with 8 hex characters", () => {
    const rows = [
      buildProductRow({
        id: "listing-deadbeef",
        pubkey: "c".repeat(64),
        title: "Camera deadbeef",
        created_at: 200,
        dTag: "listing-c",
      }),
      buildProductRow({
        id: "other-listing",
        pubkey: `deadbeef${"d".repeat(56)}`,
        title: "Camera",
        created_at: 150,
        dTag: "listing-d",
      }),
    ];

    const result = resolveProductEventByTitleSlug("Camera-deadbeef", rows);

    expect(result?.id).toBe("listing-deadbeef");
  });
});
