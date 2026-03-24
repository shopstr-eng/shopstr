import { parseZapsnagNote } from "@/utils/parsers/zapsnag-parser";
import { NostrEvent } from "@/utils/types/types";

const createEvent = (content: string, id = "event-123"): NostrEvent => ({
  id,
  pubkey: "pubkey-123",
  created_at: 1620000000,
  kind: 1,
  tags: [],
  content,
  sig: "sig",
});

describe("parseZapsnagNote", () => {
  it("extracts price and default currency (sats) correctly", () => {
    const event = createEvent(
      "Selling a cool hat price: 5000 sats #milk-market-zapsnag"
    );
    const result = parseZapsnagNote(event);

    expect(result.price).toBe(5000);
    expect(result.currency).toBe("sats");
  });

  it("extracts USD currency correctly", () => {
    const event = createEvent("Consultation cost: 50 USD");
    const result = parseZapsnagNote(event);

    expect(result.price).toBe(50);
    expect(result.currency).toBe("USD");
  });

  it("handles prices with commas", () => {
    const event = createEvent("Lambo price: 1,000,000 sats");
    const result = parseZapsnagNote(event);

    expect(result.price).toBe(1000000);
  });

  it("extracts the first image URL found", () => {
    const event = createEvent(
      "Check this https://example.com/image.jpg and https://example.com/other.png"
    );
    const result = parseZapsnagNote(event);

    expect(result.images[0]).toBe("https://example.com/image.jpg");
  });

  it("uses RoboHash fallback when no image is present", () => {
    const event = createEvent("Just text, no images", "unique-id-999");
    const result = parseZapsnagNote(event);

    expect(result.images[0]).toBe("https://robohash.org/unique-id-999");
  });

  it("generates a clean title by removing price, tags, and URLs", () => {
    const content =
      "Super Cool Item price: 100 https://img.com/a.jpg #milk-market-zapsnag";
    const event = createEvent(content);
    const result = parseZapsnagNote(event);

    expect(result.title).toBe("Super Cool Item");
  });

  it("truncates very long titles", () => {
    const longText =
      "This is a very very very long description that should be truncated because it is used as a title and is definitely over fifty characters long";
    const event = createEvent(longText);
    const result = parseZapsnagNote(event);

    expect(result.title.length).toBeLessThanOrEqual(53);
    expect(result.title).toContain("...");
  });

  it("defaults to 'Flash Sale Item' if content is empty after cleaning", () => {
    const event = createEvent("https://img.com/a.jpg #milk-market-zapsnag");
    const result = parseZapsnagNote(event);

    expect(result.title).toBe("Flash Sale Item");
  });
});
