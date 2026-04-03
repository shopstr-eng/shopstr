import {
  constructProfileReportTags,
  constructListingReportTags,
  constructReportEventTemplate,
  REPORT_REASONS,
  ReportReason,
} from "../reporting";

describe("NIP-56 Reporting Helpers", () => {
  const testPubkey =
    "abc123def456abc123def456abc123def456abc123def456abc123def456abc1";
  const testDTag = "unique-listing-id-123";

  describe("constructProfileReportTags", () => {
    it("should produce a p tag with the pubkey and reason as the third element", () => {
      const { tags } = constructProfileReportTags(testPubkey, "spam");

      expect(tags).toHaveLength(1);
      expect(tags[0]).toEqual(["p", testPubkey, "spam"]);
    });

    it("should return empty content when no content is provided", () => {
      const { content } = constructProfileReportTags(testPubkey, "spam");
      expect(content).toBe("");
    });

    it("should return the provided content string", () => {
      const { content } = constructProfileReportTags(
        testPubkey,
        "impersonation",
        "This account is pretending to be someone else"
      );
      expect(content).toBe("This account is pretending to be someone else");
    });

    it("should support all standard NIP-56 report reasons", () => {
      for (const reason of REPORT_REASONS) {
        const { tags } = constructProfileReportTags(testPubkey, reason);
        expect(tags[0]).toEqual(["p", testPubkey, reason]);
      }
    });
  });

  describe("constructListingReportTags", () => {
    it("should produce a p tag and an a tag with the reason as the third element of the a tag", () => {
      const { tags } = constructListingReportTags(
        testPubkey,
        testDTag,
        "illegal"
      );

      expect(tags).toHaveLength(2);
      expect(tags[0]).toEqual(["p", testPubkey]);
      expect(tags[1]).toEqual([
        "a",
        `30402:${testPubkey}:${testDTag}`,
        "illegal",
      ]);
    });

    it("should format the a tag address as 30402:<pubkey>:<d-tag>", () => {
      const { tags } = constructListingReportTags(testPubkey, testDTag, "spam");
      const aTag = tags.find((t) => t[0] === "a");

      expect(aTag).toBeDefined();
      expect(aTag![1]).toBe(`30402:${testPubkey}:${testDTag}`);
    });

    it("should return empty content when no content is provided", () => {
      const { content } = constructListingReportTags(
        testPubkey,
        testDTag,
        "spam"
      );
      expect(content).toBe("");
    });

    it("should return the provided content string", () => {
      const { content } = constructListingReportTags(
        testPubkey,
        testDTag,
        "spam",
        "This listing is spam"
      );
      expect(content).toBe("This listing is spam");
    });

    it("should support all standard NIP-56 report reasons", () => {
      for (const reason of REPORT_REASONS) {
        const { tags } = constructListingReportTags(
          testPubkey,
          testDTag,
          reason
        );
        const aTag = tags.find((t) => t[0] === "a");
        expect(aTag![2]).toBe(reason);
      }
    });
  });

  describe("constructReportEventTemplate", () => {
    it("should build a kind 1984 event template for a profile report", () => {
      const template = constructReportEventTemplate(
        "profile",
        testPubkey,
        "spam",
        "Spamming the network"
      );

      expect(template.kind).toBe(1984);
      expect(template.tags).toEqual([["p", testPubkey, "spam"]]);
      expect(template.content).toBe("Spamming the network");
      expect(typeof template.created_at).toBe("number");
    });

    it("should build a kind 1984 event template for a listing report", () => {
      const template = constructReportEventTemplate(
        "listing",
        testPubkey,
        "illegal",
        "Prohibited item",
        testDTag
      );

      expect(template.kind).toBe(1984);
      expect(template.tags).toEqual([
        ["p", testPubkey],
        ["a", `30402:${testPubkey}:${testDTag}`, "illegal"],
      ]);
      expect(template.content).toBe("Prohibited item");
    });

    it("should throw an error if dTag is missing for a listing report", () => {
      expect(() => {
        constructReportEventTemplate("listing", testPubkey, "spam");
      }).toThrow("dTag is required when reporting a listing");
    });

    it("should default content to an empty string when not provided", () => {
      const template = constructReportEventTemplate(
        "profile",
        testPubkey,
        "nudity"
      );
      expect(template.content).toBe("");
    });
  });

  describe("REPORT_REASONS constant", () => {
    it("should contain all standardized NIP-56 report types", () => {
      const expected: ReportReason[] = [
        "nudity",
        "malware",
        "profanity",
        "illegal",
        "spam",
        "impersonation",
        "other",
      ];
      expect(REPORT_REASONS).toEqual(expected);
    });
  });
});
