import { ProductData } from "@/utils/parsers/product-parser-functions";
import { ProfileData } from "@/utils/types/types";
import { nip19 } from "nostr-tools";

export function titleToSlug(title: string): string {
  if (!title) return "";
  return title
    .trim()
    .replace(/[#?&\/\\%=+<>{}|^~\[\]`@!$*()"';:,]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

export function getListingSlug(
  product: ProductData,
  allProducts: ProductData[]
): string {
  const baseSlug = titleToSlug(product.title);
  if (!baseSlug) {
    return product.id;
  }

  const collisions = allProducts.filter(
    (p) => titleToSlug(p.title) === baseSlug
  );

  if (collisions.length <= 1) {
    return baseSlug;
  }

  return `${baseSlug}-${product.pubkey.substring(0, 8)}`;
}

export function findProductBySlug(
  slug: string,
  allProducts: ProductData[]
): ProductData | undefined {
  const pubkeySuffixMatch = slug.match(/^(.+)-([a-f0-9]{8})$/);
  if (pubkeySuffixMatch) {
    const baseSlug = pubkeySuffixMatch[1]!;
    const pubkeyFragment = pubkeySuffixMatch[2]!;
    const match = allProducts.find(
      (p) =>
        titleToSlug(p.title) === baseSlug && p.pubkey.startsWith(pubkeyFragment)
    );
    if (match) return match;
  }

  const exactMatches = allProducts.filter((p) => titleToSlug(p.title) === slug);
  if (exactMatches.length === 1) {
    return exactMatches[0];
  }

  if (exactMatches.length > 1) {
    return exactMatches[0];
  }

  return undefined;
}

export function profileNameToSlug(name: string): string {
  if (!name) return "";
  return name
    .trim()
    .replace(/[#?&\/\\%=+<>{}|^~\[\]`@!$*()"';:,]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

export function getProfileSlug(
  pubkey: string,
  profileData: Map<string, ProfileData>
): string {
  const profile = profileData.get(pubkey);
  const name = profile?.content?.name;
  if (!name) {
    return nip19.npubEncode(pubkey);
  }

  const baseSlug = profileNameToSlug(name);
  if (!baseSlug) {
    return nip19.npubEncode(pubkey);
  }

  const collisions = Array.from(profileData.values()).filter(
    (p) => p.content?.name && profileNameToSlug(p.content.name) === baseSlug
  );

  if (collisions.length <= 1) {
    return baseSlug;
  }

  return `${baseSlug}-${pubkey.substring(0, 8)}`;
}

export function findPubkeyByProfileSlug(
  slug: string,
  profileData: Map<string, ProfileData>
): string | undefined {
  const pubkeySuffixMatch = slug.match(/^(.+)-([a-f0-9]{8})$/);
  if (pubkeySuffixMatch) {
    const baseSlug = pubkeySuffixMatch[1]!;
    const pubkeyFragment = pubkeySuffixMatch[2]!;
    for (const [pubkey, profile] of profileData.entries()) {
      if (
        profile.content?.name &&
        profileNameToSlug(profile.content.name) === baseSlug &&
        pubkey.startsWith(pubkeyFragment)
      ) {
        return pubkey;
      }
    }
  }

  const matches: string[] = [];
  for (const [pubkey, profile] of profileData.entries()) {
    if (
      profile.content?.name &&
      profileNameToSlug(profile.content.name) === slug
    ) {
      matches.push(pubkey);
    }
  }

  if (matches.length >= 1) {
    return matches[0];
  }

  return undefined;
}

export function isNaddr(str: string): boolean {
  return str.startsWith("naddr1");
}

export function isNpub(str: string): boolean {
  return str.startsWith("npub1");
}
