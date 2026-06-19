import { nip19 } from "nostr-tools";
import { z } from "zod";

const HEX_64_RE = /^[0-9a-f]{64}$/;
const PRODUCT_ADDRESS_KIND = "30402";

export type ProductAddressParts = {
  coordinate: string;
  pubkey: string;
  dTag: string;
};

export function isHex64(value: string): boolean {
  return HEX_64_RE.test(value);
}

export function canonicalizeHex(value: string): string {
  return value.trim().toLowerCase();
}

export function canonicalizePubkey(input: string): string {
  const cleaned = canonicalizeHex(
    input.startsWith("nostr:") ? input.slice("nostr:".length) : input
  );

  if (cleaned.startsWith("npub1")) {
    try {
      const decoded = nip19.decode(cleaned);
      if (decoded.type === "npub" && typeof decoded.data === "string") {
        return decoded.data.toLowerCase();
      }
    } catch {
      return cleaned;
    }
  }

  return cleaned;
}

export function canonicalizeSearch(input: string): string {
  return input.trim().replace(/\s+/g, " ");
}

export function parseProductAddress(
  input: string
): ProductAddressParts | undefined {
  const trimmed = input.trim();
  const coordinate =
    trimmed.slice(0, 2).toLowerCase() === "a:" ? trimmed.slice(2) : trimmed;
  const [kind, pubkeyInput, ...dTagParts] = coordinate.split(":");
  const pubkey = pubkeyInput?.toLowerCase() ?? "";
  const dTag = dTagParts.join(":");

  if (kind !== PRODUCT_ADDRESS_KIND || !isHex64(pubkey) || dTag.length === 0) {
    return;
  }

  return {
    coordinate: `${PRODUCT_ADDRESS_KIND}:${pubkey}:${dTag}`,
    pubkey,
    dTag,
  };
}

export function canonicalizeProductAddress(input: string): string {
  return parseProductAddress(input)?.coordinate ?? input.trim();
}

const hex64Schema = z
  .string()
  .transform(canonicalizeHex)
  .refine(isHex64, "Expected a 64-character lowercase hex string");

export const pubkeySchema = z
  .string()
  .transform(canonicalizePubkey)
  .refine(isHex64, "Expected a 64-character hex pubkey or npub");

export const eventIdSchema = hex64Schema;

export const productAddressSchema = z
  .string()
  .max(300)
  .transform(canonicalizeProductAddress)
  .refine(
    (value) => parseProductAddress(value) !== undefined,
    "Expected a product address like 30402:<seller-pubkey>:<product-d-tag>"
  );

export const searchSchema = z
  .string()
  .max(200)
  .transform(canonicalizeSearch)
  .refine((value) => value.length > 0, "Search query cannot be empty");

export const optionalSearchSchema = z
  .string()
  .max(200)
  .transform(canonicalizeSearch)
  .optional();

export const priceSchema = z.number().min(0).finite();

export const limitSchema = z.coerce.number().int().min(1).max(500);

export const currencySchema = z
  .string()
  .transform((value) => value.trim())
  .refine(
    (value) => value.length > 0 && value.length <= 10,
    "Currency must be 1-10 characters"
  );

export const searchProductsSchema = z
  .object({
    keyword: optionalSearchSchema,
    category: z.string().max(100).transform(canonicalizeSearch).optional(),
    location: z.string().max(100).transform(canonicalizeSearch).optional(),
    minPrice: priceSchema.optional(),
    maxPrice: priceSchema.optional(),
    currency: currencySchema.optional(),
    limit: limitSchema.default(50),
  })
  .refine(
    (data) =>
      data.minPrice === undefined ||
      data.maxPrice === undefined ||
      data.minPrice <= data.maxPrice,
    {
      message: "minPrice must be less than or equal to maxPrice",
      path: ["maxPrice"],
    }
  )
  .refine(
    (data) =>
      (data.minPrice === undefined && data.maxPrice === undefined) ||
      data.currency !== undefined,
    {
      message:
        "currency is required when using minPrice or maxPrice to avoid comparing mixed currencies",
      path: ["currency"],
    }
  );

export const productDetailsInputSchema = z
  .object({
    productId: eventIdSchema.optional(),
    productAddress: productAddressSchema.optional(),
  })
  .refine(
    (data) => data.productId !== undefined || data.productAddress !== undefined,
    { message: "Either productId or productAddress is required" }
  );

export const pubkeyInputSchema = z.object({
  pubkey: pubkeySchema,
});

export const reviewsInputSchema = z
  .object({
    productId: eventIdSchema.optional(),
    productAddress: productAddressSchema.optional(),
    sellerPubkey: pubkeySchema.optional(),
  })
  .refine(
    (data) =>
      data.productId !== undefined ||
      data.productAddress !== undefined ||
      data.sellerPubkey !== undefined,
    {
      message: "Either productId, productAddress, or sellerPubkey is required",
    }
  );
