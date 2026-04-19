import {
  buildSrcSet,
  normalizeProductImageUrl,
  normalizeProductImageUrls,
} from "../images";

describe("normalizeProductImageUrl", () => {
  it("proxies external https product images through the app", () => {
    expect(normalizeProductImageUrl("https://example.com/image.jpg")).toBe(
      "/api/product-image?url=https%3A%2F%2Fexample.com%2Fimage.jpg"
    );
  });

  it("keeps local image paths unchanged", () => {
    expect(normalizeProductImageUrl("/images/local-image.jpg")).toBe(
      "/images/local-image.jpg"
    );
  });

  it("falls back for blocked schemes", () => {
    expect(normalizeProductImageUrl("javascript:alert(1)")).toBe(
      "/no-image-placeholder.png"
    );
  });

  it("falls back for non-http remote values", () => {
    expect(normalizeProductImageUrl("not-a-url")).toBe(
      "/no-image-placeholder.png"
    );
  });
});

describe("normalizeProductImageUrls", () => {
  it("normalizes each product image in the array", () => {
    expect(
      normalizeProductImageUrls([
        "https://example.com/a.jpg",
        "/images/local-image.jpg",
      ])
    ).toEqual([
      "/api/product-image?url=https%3A%2F%2Fexample.com%2Fa.jpg",
      "/images/local-image.jpg",
    ]);
  });

  it("returns an empty array when no images are provided", () => {
    expect(normalizeProductImageUrls(undefined)).toEqual([]);
  });
});

describe("buildSrcSet", () => {
  it("should return a formatted srcset for image.nostr.build URLs", () => {
    const imageUrl =
      "https://image.nostr.build/d8d59524f2f49a2a72a15c54f4a9b3c3e2b2b1a8f9a2a72a15c54f4a9b3c3e2b.jpg";
    const expectedSrcSet =
      "https://image.nostr.build/resp/240p/d8d59524f2f49a2a72a15c54f4a9b3c3e2b2b1a8f9a2a72a15c54f4a9b3c3e2b.jpg 240w, " +
      "https://image.nostr.build/resp/480p/d8d59524f2f49a2a72a15c54f4a9b3c3e2b2b1a8f9a2a72a15c54f4a9b3c3e2b.jpg 480w, " +
      "https://image.nostr.build/resp/720p/d8d59524f2f49a2a72a15c54f4a9b3c3e2b2b1a8f9a2a72a15c54f4a9b3c3e2b.jpg 720w, " +
      "https://image.nostr.build/resp/1080p/d8d59524f2f49a2a72a15c54f4a9b3c3e2b2b1a8f9a2a72a15c54f4a9b3c3e2b.jpg 1080w";

    expect(buildSrcSet(imageUrl)).toBe(expectedSrcSet);
  });

  it("should return a formatted srcset for i.nostr.build URLs", () => {
    const imageUrl = "https://i.nostr.build/another-image.png";
    const expectedSrcSet =
      "https://i.nostr.build/resp/240p/another-image.png 240w, " +
      "https://i.nostr.build/resp/480p/another-image.png 480w, " +
      "https://i.nostr.build/resp/720p/another-image.png 720w, " +
      "https://i.nostr.build/resp/1080p/another-image.png 1080w";

    expect(buildSrcSet(imageUrl)).toBe(expectedSrcSet);
  });

  it("should return the original URL for an unknown but valid host", () => {
    const imageUrl = "https://example.com/images/photo.gif";
    expect(buildSrcSet(imageUrl)).toBe(imageUrl);
  });

  it("should return the original string if it is not a valid URL", () => {
    const invalidUrl = "not-a-url";
    expect(buildSrcSet(invalidUrl)).toBe(invalidUrl);
  });

  it("should return the original string for a local path", () => {
    const localPath = "/images/local-image.jpg";
    expect(buildSrcSet(localPath)).toBe(localPath);
  });

  it("should return an empty string if the input is empty", () => {
    const emptyString = "";
    expect(buildSrcSet(emptyString)).toBe(emptyString);
  });
});
