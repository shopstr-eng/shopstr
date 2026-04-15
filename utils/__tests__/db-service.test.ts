import { buildReviewDTagFilter } from "../db/db-service";

describe("db-service review helpers", () => {
  it("builds a JSONB containment filter for review d tags", () => {
    expect(buildReviewDTagFilter("30402:merchant-pubkey:listing-d-tag")).toBe(
      '[["d","30402:merchant-pubkey:listing-d-tag"]]'
    );
  });
});
