import { nip19 } from "nostr-tools";
import {
  titleToSlug,
  getListingSlug,
  findListingBySlug,
  findProductBySlug,
  profileNameToSlug,
  getProfileSlug,
  findPubkeyByProfileSlug,
  isNaddr,
  isNpub,
  type ListingSlugCandidate,
} from "@/utils/url-slugs";
import type { ProfileData } from "@/utils/types/types";
import type { ProductData } from "@/utils/parsers/product-parser-functions";

const PUBKEY_A = "a".repeat(64);
const PUBKEY_B = "b".repeat(64);
const PUBKEY_C = "c".repeat(64);

describe("titleToSlug", () => {
  it("returns empty string for an empty title", () => {
    expect(titleToSlug("")).toBe("");
  });

  it("replaces whitespace runs with a single hyphen", () => {
    expect(titleToSlug("Hello   World")).toBe("Hello-World");
  });

  it("strips special characters: # ? & / % = + < > { } | ^ ~ [ ] ` @ ! $ * ( ) \" ' ; : ,", () => {
    expect(titleToSlug(`#?&/\\%=+<>{}|^~[]\`@!$*()"';:,Mug`)).toBe("Mug");
  });

  it("collapses whitespace left behind after stripping special characters", () => {
    expect(titleToSlug("Mug #1 & Saucer?")).toBe("Mug-1-Saucer");
  });

  it("trims leading and trailing hyphens", () => {
    expect(titleToSlug("-Leading and Trailing-")).toBe("Leading-and-Trailing");
  });

  it("collapses consecutive hyphens", () => {
    expect(titleToSlug("Hello --- World")).toBe("Hello-World");
  });
});

describe("getListingSlug", () => {
  it("returns baseSlug when the product is the only one with that title", () => {
    const product: ListingSlugCandidate = {
      id: "prod-a",
      title: "Handmade Mug",
      pubkey: PUBKEY_A,
    };
    expect(getListingSlug(product, [product])).toBe("Handmade-Mug");
  });

  it("appends first-8-chars of pubkey when two products share the same title-slug", () => {
    const productA: ListingSlugCandidate = {
      id: "prod-a",
      title: "Handmade Mug",
      pubkey: PUBKEY_A,
    };
    const productB: ListingSlugCandidate = {
      id: "prod-b",
      title: "Handmade Mug",
      pubkey: PUBKEY_B,
    };
    const all = [productA, productB];
    expect(getListingSlug(productA, all)).toBe("Handmade-Mug-aaaaaaaa");
    expect(getListingSlug(productB, all)).toBe("Handmade-Mug-bbbbbbbb");
  });

  it("returns product.id when the title produces an empty slug", () => {
    const product: ListingSlugCandidate = {
      id: "prod-a",
      title: "???",
      pubkey: PUBKEY_A,
    };
    expect(getListingSlug(product, [product])).toBe("prod-a");
  });
});

describe("findListingBySlug", () => {
  it("returns the product whose title slug matches a plain slug", () => {
    const product: ListingSlugCandidate = {
      id: "prod-a",
      title: "Handmade Mug",
      pubkey: PUBKEY_A,
    };
    expect(findListingBySlug("Handmade-Mug", [product])).toBe(product);
  });

  it("returns the product whose title slug and pubkey prefix match a suffixed slug", () => {
    const productA: ListingSlugCandidate = {
      id: "prod-a",
      title: "Handmade Mug",
      pubkey: PUBKEY_A,
    };
    const productB: ListingSlugCandidate = {
      id: "prod-b",
      title: "Handmade Mug",
      pubkey: PUBKEY_B,
    };
    const all = [productA, productB];
    expect(findListingBySlug("Handmade-Mug-bbbbbbbb", all)).toBe(productB);
  });

  it("returns undefined when no product matches", () => {
    const product: ListingSlugCandidate = {
      id: "prod-a",
      title: "Handmade Mug",
      pubkey: PUBKEY_A,
    };
    expect(findListingBySlug("nonexistent-slug", [product])).toBeUndefined();
  });

  it("falls back to a literal match when a suffix-shaped slug has no pubkey match", () => {
    const product: ListingSlugCandidate = {
      id: "prod-a",
      title: "Test Item-aaaaaaaa",
      pubkey: PUBKEY_C,
    };

    const slug = getListingSlug(product, [product]);
    expect(slug).toBe("Test-Item-aaaaaaaa");
    expect(findListingBySlug(slug, [product])).toBe(product);
  });
});

describe("findProductBySlug", () => {
  it("delegates to findListingBySlug against real ProductData objects", () => {
    const product: ProductData = {
      id: "prod-a",
      pubkey: PUBKEY_A,
      createdAt: 0,
      title: "Handmade Mug",
      summary: "A nice mug.",
      publishedAt: "",
      images: [],
      categories: [],
      location: "Online",
      price: 500,
      currency: "SATS",
      totalCost: 500,
    };
    expect(findProductBySlug("Handmade-Mug", [product])).toBe(product);
    expect(findProductBySlug("nonexistent-slug", [product])).toBeUndefined();
  });
});

describe("profileNameToSlug", () => {
  it("behaves identically to titleToSlug for the same input", () => {
    const input = `Ada  Lovelace! #1 --- "The" Analyst`;
    expect(profileNameToSlug(input)).toBe(titleToSlug(input));
  });

  it("returns empty string for an empty name", () => {
    expect(profileNameToSlug("")).toBe("");
  });
});

function makeProfile(
  pubkey: string,
  overrides: Partial<ProfileData["content"]> = {}
): ProfileData {
  return {
    pubkey,
    content: { ...overrides },
    created_at: 0,
  };
}

describe("getProfileSlug", () => {
  it("returns npub encoding when the profile has no name", () => {
    const profileData = new Map([[PUBKEY_A, makeProfile(PUBKEY_A)]]);
    expect(getProfileSlug(PUBKEY_A, profileData)).toBe(
      nip19.npubEncode(PUBKEY_A)
    );
  });

  it("returns npub encoding when the profile is missing entirely", () => {
    const profileData = new Map<string, ProfileData>();
    expect(getProfileSlug(PUBKEY_A, profileData)).toBe(
      nip19.npubEncode(PUBKEY_A)
    );
  });

  it("returns npub encoding when the name slugifies to an empty string", () => {
    const profileData = new Map([
      [PUBKEY_A, makeProfile(PUBKEY_A, { name: "???" })],
    ]);
    expect(getProfileSlug(PUBKEY_A, profileData)).toBe(
      nip19.npubEncode(PUBKEY_A)
    );
  });

  it("returns the slug when the name is unique", () => {
    const profileData = new Map([
      [PUBKEY_A, makeProfile(PUBKEY_A, { name: "Ada Lovelace" })],
    ]);
    expect(getProfileSlug(PUBKEY_A, profileData)).toBe("Ada-Lovelace");
  });

  it("appends pubkey prefix when two profiles share the same name slug", () => {
    const profileData = new Map([
      [PUBKEY_A, makeProfile(PUBKEY_A, { name: "Ada Lovelace" })],
      [PUBKEY_B, makeProfile(PUBKEY_B, { name: "Ada Lovelace" })],
    ]);
    expect(getProfileSlug(PUBKEY_A, profileData)).toBe("Ada-Lovelace-aaaaaaaa");
    expect(getProfileSlug(PUBKEY_B, profileData)).toBe("Ada-Lovelace-bbbbbbbb");
  });
});

describe("findPubkeyByProfileSlug", () => {
  it("returns the pubkey for a unique slug match", () => {
    const profileData = new Map([
      [PUBKEY_A, makeProfile(PUBKEY_A, { name: "Ada Lovelace" })],
    ]);
    expect(findPubkeyByProfileSlug("Ada-Lovelace", profileData)).toBe(PUBKEY_A);
  });

  it("returns undefined when multiple profiles share the slug and no suffix is present", () => {
    const profileData = new Map([
      [PUBKEY_A, makeProfile(PUBKEY_A, { name: "Ada Lovelace" })],
      [PUBKEY_B, makeProfile(PUBKEY_B, { name: "Ada Lovelace" })],
    ]);
    expect(
      findPubkeyByProfileSlug("Ada-Lovelace", profileData)
    ).toBeUndefined();
  });

  it("resolves suffix-disambiguated slug to the correct pubkey", () => {
    const profileData = new Map([
      [PUBKEY_A, makeProfile(PUBKEY_A, { name: "Ada Lovelace" })],
      [PUBKEY_B, makeProfile(PUBKEY_B, { name: "Ada Lovelace" })],
    ]);
    expect(findPubkeyByProfileSlug("Ada-Lovelace-bbbbbbbb", profileData)).toBe(
      PUBKEY_B
    );
  });

  it("returns undefined when no profile matches", () => {
    const profileData = new Map([
      [PUBKEY_A, makeProfile(PUBKEY_A, { name: "Ada Lovelace" })],
    ]);
    expect(
      findPubkeyByProfileSlug("nonexistent-slug", profileData)
    ).toBeUndefined();
  });
});

describe("isNaddr / isNpub", () => {
  it("returns true for strings starting with 'naddr1' / 'npub1'", () => {
    expect(isNaddr("naddr1qqxxxx")).toBe(true);
    expect(isNpub("npub1qqxxxx")).toBe(true);
  });

  it("returns false otherwise", () => {
    expect(isNaddr("npub1qqxxxx")).toBe(false);
    expect(isNaddr("")).toBe(false);
    expect(isNpub("naddr1qqxxxx")).toBe(false);
    expect(isNpub("")).toBe(false);
  });
});
