import type { ParsedP2PK, ProfileData } from "@/utils/types/types";
import {
  getSecretKind,
  getTags,
  getTagInt,
  P2PKTag,
  Proof,
  getDataField,
} from "@cashu/cashu-ts";

export type P2pkProfileSettings = NonNullable<ProfileData["content"]["p2pk"]>;

export type P2pkProofSetParseResult = {
  p2pk: ParsedP2PK | null;
  invalidReason?: string;
};

const HEX_32_BYTE = /^[0-9a-f]{64}$/;
const COMPRESSED_HEX_33_BYTE = /^(02|03)[0-9a-f]{64}$/;
const DEFAULT_P2PK_ESCROW_MAX_SATS = 100;
const P2PK_DISALLOWED_MINT_REASON =
  "This mint is not allowed for P2PK escrow checkout.";
const P2PK_INPUT_FEE_REASON =
  "This mint charges input fees, so P2PK escrow checkout is blocked for now.";

export function normalizeCashuPubkey(pubkey?: string | null): string | null {
  if (!pubkey) return null;

  const normalized = pubkey.trim().toLowerCase();
  if (HEX_32_BYTE.test(normalized)) return normalized;
  if (COMPRESSED_HEX_33_BYTE.test(normalized)) return normalized.slice(2);

  return null;
}

export function pubkeysEqual(
  left?: string | null,
  right?: string | null
): boolean {
  const normalizedLeft = normalizeCashuPubkey(left);
  const normalizedRight = normalizeCashuPubkey(right);
  return Boolean(normalizedLeft && normalizedLeft === normalizedRight);
}

export function isCashuCompatiblePubkey(pubkey?: string | null): boolean {
  return normalizeCashuPubkey(pubkey) !== null;
}

export function isP2pkEscrowFeatureEnabled(): boolean {
  return process.env.NEXT_PUBLIC_P2PK_ESCROW_ENABLED === "true";
}

export function getP2pkEscrowMaxSats(): number {
  const configured = Number(process.env.NEXT_PUBLIC_P2PK_ESCROW_MAX_SATS);
  if (!Number.isFinite(configured) || configured <= 0) {
    return DEFAULT_P2PK_ESCROW_MAX_SATS;
  }

  return Math.min(Math.floor(configured), DEFAULT_P2PK_ESCROW_MAX_SATS);
}

export function getP2pkTestLocktimeSeconds(): number | undefined {
  const configured = Number(
    process.env.NEXT_PUBLIC_P2PK_ESCROW_TEST_LOCKTIME_SECONDS
  );

  if (!Number.isFinite(configured) || configured <= 0) {
    return undefined;
  }

  return Math.floor(configured);
}

export function normalizeMintUrlForPolicy(mintUrl: string): string | null {
  try {
    const parsed = new URL(mintUrl.trim());
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:")
      return null;
    if (parsed.username || parsed.password || parsed.search || parsed.hash) {
      return null;
    }

    const normalizedPath = parsed.pathname.replace(/\/+$/, "");
    return normalizedPath && normalizedPath !== "/"
      ? `${parsed.origin}${normalizedPath}`
      : parsed.origin;
  } catch {
    return null;
  }
}

function getP2pkMintAllowlist(): Set<string> | null {
  const configured = process.env.NEXT_PUBLIC_P2PK_ESCROW_ALLOWED_MINTS;
  if (!configured?.trim()) return null;

  const allowedMints = configured
    .split(",")
    .map((entry) => normalizeMintUrlForPolicy(entry))
    .filter((entry): entry is string => Boolean(entry));

  return new Set(allowedMints);
}

export function isP2pkMintAllowed(mintUrl: string): boolean {
  const allowlist = getP2pkMintAllowlist();
  if (!allowlist) return true;

  const normalizedMintUrl = normalizeMintUrlForPolicy(mintUrl);
  return Boolean(normalizedMintUrl && allowlist.has(normalizedMintUrl));
}

export function getP2pkCheckoutPolicyError(
  sellerP2pk: P2pkProfileSettings | undefined,
  amountSats: number
): string | null {
  if (!isSellerP2pkEscrowActive(sellerP2pk)) return null;

  if (!isP2pkEscrowFeatureEnabled()) {
    return "P2PK escrow checkout is not enabled for this deployment.";
  }

  const maxSats = getP2pkEscrowMaxSats();
  if (amountSats > maxSats) {
    return `P2PK escrow test checkout is limited to ${maxSats} sats.`;
  }

  return null;
}

function nutSettingSupported(setting: unknown): boolean {
  if (setting === true) return true;

  return (
    typeof setting === "object" &&
    setting !== null &&
    (setting as { supported?: unknown }).supported === true
  );
}

export function mintInfoSupportsP2pk(info: unknown): boolean {
  const nuts =
    typeof info === "object" && info !== null
      ? (info as { nuts?: Record<string, unknown> }).nuts
      : undefined;

  if (!nuts || typeof nuts !== "object") return false;

  return nutSettingSupported(nuts["10"]) && nutSettingSupported(nuts["11"]);
}

function getInputFeePpk(keyset: unknown): number | null {
  if (!keyset || typeof keyset !== "object" || Array.isArray(keyset)) {
    return null;
  }

  const candidate = keyset as {
    active?: unknown;
    isActive?: unknown;
    input_fee_ppk?: unknown;
    fee?: unknown;
  };
  const active = candidate.active ?? candidate.isActive;
  if (active === false) return 0;

  const rawFee = candidate.input_fee_ppk ?? candidate.fee ?? 0;
  const fee = typeof rawFee === "string" ? Number(rawFee) : rawFee;
  if (typeof fee !== "number" || !Number.isFinite(fee) || fee < 0) {
    return null;
  }

  return fee;
}

export function mintKeysetsHaveZeroInputFees(
  keysetsResponse: unknown
): boolean {
  if (
    !keysetsResponse ||
    typeof keysetsResponse !== "object" ||
    Array.isArray(keysetsResponse)
  ) {
    return false;
  }

  const keysets = (keysetsResponse as { keysets?: unknown }).keysets;
  if (!Array.isArray(keysets) || keysets.length === 0) return false;

  let sawSpendableKeyset = false;
  for (const keyset of keysets) {
    const fee = getInputFeePpk(keyset);
    if (fee === null) return false;

    const candidate = keyset as { active?: unknown; isActive?: unknown };
    const active = candidate.active ?? candidate.isActive;
    if (active !== false) {
      sawSpendableKeyset = true;
    }

    if (fee > 0) return false;
  }

  return sawSpendableKeyset;
}

export async function checkMintP2pkSupport(
  mintUrl: string,
  fetchImpl: typeof fetch = fetch
): Promise<{ supported: boolean; reason?: string }> {
  try {
    if (!isP2pkMintAllowed(mintUrl)) {
      return {
        supported: false,
        reason: P2PK_DISALLOWED_MINT_REASON,
      };
    }

    const baseUrl = mintUrl.replace(/\/+$/, "");
    const response = await fetchImpl(`${baseUrl}/v1/info`);
    if (!response.ok) {
      return {
        supported: false,
        reason: "Could not verify mint P2PK support.",
      };
    }

    const mintInfo = await response.json();
    if (!mintInfoSupportsP2pk(mintInfo)) {
      return {
        supported: false,
        reason:
          "This mint does not advertise NUT-10 and NUT-11 support, so escrow checkout is blocked.",
      };
    }

    const keysetsResponse = await fetchImpl(`${baseUrl}/v1/keysets`);
    if (!keysetsResponse.ok) {
      return {
        supported: false,
        reason: "Could not verify mint input fees.",
      };
    }

    const keysets = await keysetsResponse.json();
    if (!mintKeysetsHaveZeroInputFees(keysets)) {
      return {
        supported: false,
        reason: P2PK_INPUT_FEE_REASON,
      };
    }

    return { supported: true };
  } catch {
    return {
      supported: false,
      reason: "Could not verify mint P2PK support.",
    };
  }
}

export function getBuyerReclaimKeys(
  buyerContent: ProfileData["content"] | undefined,
  buyerCashuPubkey?: string
): string[] | null {
  // Escrow reclaim authorizes spending Cashu proofs, so it must use the
  // buyer's Cashu wallet key. There is no Nostr identity fallback.
  const normalizedBuyerKey = normalizeCashuPubkey(buyerCashuPubkey);
  if (!normalizedBuyerKey) return null;

  const profileKeys = buyerContent?.p2pk?.reclaimKeys?.filter(Boolean) ?? [];
  const normalizedProfileKeys: string[] = [];
  for (const profileKey of profileKeys) {
    const normalizedProfileKey = normalizeCashuPubkey(profileKey);
    if (!normalizedProfileKey) return null;
    if (!normalizedProfileKeys.includes(normalizedProfileKey)) {
      normalizedProfileKeys.push(normalizedProfileKey);
    }
  }

  if (normalizedProfileKeys.length === 0) return [normalizedBuyerKey];
  if (normalizedProfileKeys.includes(normalizedBuyerKey)) {
    return normalizedProfileKeys;
  }
  return [...normalizedProfileKeys, normalizedBuyerKey];
}

export function buildP2pkSwapOptions(
  sellerP2pk: P2pkProfileSettings | undefined,
  buyerReclaimKeys: string[],
  buyerCashuPubkey?: string
):
  | {
      pubkey: string;
      pubkeys: string[];
      nSigs: number;
      locktime: number;
      refundKeys: string[];
    }
  | undefined {
  const sellerPubkey = normalizeCashuPubkey(sellerP2pk?.pubkey);
  if (!sellerP2pk?.enabled || !sellerPubkey) return undefined;

  const days = sellerP2pk.refundDelayDays;
  if (!days || days <= 0) return undefined;

  const arbiterPubkey = getArbiterPubkey();
  if (!arbiterPubkey) return undefined;

  const normalizedBuyerPubkey = normalizeCashuPubkey(buyerCashuPubkey);
  if (!normalizedBuyerPubkey) return undefined;

  const testLocktimeSeconds = getP2pkTestLocktimeSeconds();
  const locktimeOffsetSeconds = testLocktimeSeconds ?? days * 24 * 60 * 60;

  return {
    pubkey: sellerPubkey, // primary (data field)
    pubkeys: [normalizedBuyerPubkey, arbiterPubkey], // additional keys
    nSigs: 2, // 2-of-3
    locktime: Math.floor(Date.now() / 1000) + locktimeOffsetSeconds,
    refundKeys: buyerReclaimKeys,
  };
}

export function buildP2pkOutputConfig(
  sellerP2pk: P2pkProfileSettings | undefined,
  buyerContent: ProfileData["content"] | undefined,
  buyerCashuPubkey?: string
) {
  const reclaimKeys = getBuyerReclaimKeys(buyerContent, buyerCashuPubkey);
  if (!reclaimKeys) return undefined;

  const options = buildP2pkSwapOptions(
    sellerP2pk,
    reclaimKeys,
    buyerCashuPubkey
  );
  if (!options) return undefined;

  return {
    send: {
      type: "p2pk" as const,
      options,
    },
  };
}

export function isSellerP2pkEscrowActive(
  sellerP2pk: P2pkProfileSettings | undefined
): boolean {
  return Boolean(
    sellerP2pk?.enabled &&
    sellerP2pk.pubkey &&
    sellerP2pk.refundDelayDays &&
    sellerP2pk.refundDelayDays > 0
  );
}

// Single entry point for the buyer-side escrow checkout gate. Runs every
// safety check in one place — feature flag + amount cap, mint NUT-10/NUT-11 +
// input-fee support, and the buyer's reclaim identity — so a caller can never
// apply one gate and forget another before locking ecash. Throws a descriptive
// Error on the first failed check; returns the P2PK output config to hand to the
// swap (or undefined when the seller has not enabled escrow).
export async function resolveP2pkCheckoutOutputConfig(params: {
  sellerP2pk: P2pkProfileSettings | undefined;
  amountSats: number;
  mintUrl: string | undefined;
  buyerContent: ProfileData["content"] | undefined;
  buyerCashuPubkey: string | undefined;
  fetchImpl?: typeof fetch;
}): Promise<ReturnType<typeof buildP2pkOutputConfig>> {
  const {
    sellerP2pk,
    amountSats,
    mintUrl,
    buyerContent,
    buyerCashuPubkey,
    fetchImpl,
  } = params;

  const policyError = getP2pkCheckoutPolicyError(sellerP2pk, amountSats);
  if (policyError) {
    throw new Error(policyError);
  }

  if (!isSellerP2pkEscrowActive(sellerP2pk)) {
    return undefined;
  }

  if (!mintUrl) {
    throw new Error("A Cashu mint is required for escrow checkout.");
  }

  const mintSupport = await checkMintP2pkSupport(mintUrl, fetchImpl);
  if (!mintSupport.supported) {
    throw new Error(
      mintSupport.reason ?? "This mint does not advertise P2PK escrow support."
    );
  }

  const outputConfig = buildP2pkOutputConfig(
    sellerP2pk,
    buyerContent,
    buyerCashuPubkey
  );
  if (!outputConfig) {
    throw new Error(
      "A Cashu wallet identity is required to pay for an escrow listing. Please wait for your wallet to finish loading and try again."
    );
  }

  return outputConfig;
}

export function parseP2PK(proof: Proof): ParsedP2PK | null {
  try {
    const kind = getSecretKind(proof.secret);

    if (kind !== "P2PK") {
      return null;
    }

    const pubkey = normalizeCashuPubkey(getDataField(proof.secret));
    if (!pubkey) return null;

    const tags = getTags(proof.secret) as P2PKTag[];

    const locktime = getTagInt(proof.secret, "locktime") ?? 0;

    const refundKeys: string[] = [];
    for (const tag of tags) {
      if (tag[0] !== "refund") continue;

      for (const value of tag.slice(1)) {
        if (typeof value !== "string") return null;
        const refundKey = normalizeCashuPubkey(value);
        if (!refundKey) return null;
        refundKeys.push(refundKey);
      }
    }

    const now = Math.floor(Date.now() / 1000);
    // parse additional pubkeys for multisig
    const additionalPubkeys: string[] = [];
    for (const tag of tags) {
      if (tag[0] !== "pubkeys") continue;
      for (const value of tag.slice(1)) {
        if (typeof value !== "string") return null;
        const additionalKey = normalizeCashuPubkey(value);
        if (!additionalKey) return null;
        additionalPubkeys.push(additionalKey);
      }
    }

    // parse nSigs for multisig threshold
    const nSigs = getTagInt(proof.secret, "n_sigs") ?? undefined;

    return {
      pubkey,
      pubkeys: additionalPubkeys.length > 0 ? additionalPubkeys : undefined,
      nSigs,
      locktime,
      refundKeys,
      expired: locktime > 0 ? now >= locktime : false,
      rawTags: tags,
    };
  } catch {
    return null;
  }
}

function hasP2pkKind(proof: Proof): boolean {
  try {
    return getSecretKind(proof.secret) === "P2PK";
  } catch {
    return false;
  }
}

function p2pkConstraintFingerprint(p2pk: ParsedP2PK): string {
  return JSON.stringify({
    pubkey: normalizeCashuPubkey(p2pk.pubkey),
    pubkeys: p2pk.pubkeys?.map(normalizeCashuPubkey).sort(),
    nSigs: p2pk.nSigs,
    locktime: p2pk.locktime,
    refundKeys: p2pk.refundKeys.map(normalizeCashuPubkey).sort(),
  });
}

export function parseP2PKProofSet(proofs: Proof[]): P2pkProofSetParseResult {
  let parsedP2pk: ParsedP2PK | null = null;
  let fingerprint: string | null = null;
  let sawPlainProof = false;

  for (const proof of proofs) {
    const proofHasP2pkKind = hasP2pkKind(proof);
    const parsedProof = parseP2PK(proof);

    if (proofHasP2pkKind && !parsedProof) {
      return {
        p2pk: null,
        invalidReason: "Malformed P2PK proof.",
      };
    }

    if (!parsedProof) {
      sawPlainProof = true;
      if (parsedP2pk) {
        return {
          p2pk: null,
          invalidReason: "Token mixes P2PK and non-P2PK proofs.",
        };
      }
      continue;
    }

    if (sawPlainProof) {
      return {
        p2pk: null,
        invalidReason: "Token mixes P2PK and non-P2PK proofs.",
      };
    }

    const nextFingerprint = p2pkConstraintFingerprint(parsedProof);
    if (fingerprint && fingerprint !== nextFingerprint) {
      return {
        p2pk: null,
        invalidReason: "Token contains inconsistent P2PK proof locks.",
      };
    }

    fingerprint = nextFingerprint;
    parsedP2pk = parsedProof;
  }

  return {
    p2pk: parsedP2pk ? { ...parsedP2pk, proofCount: proofs.length } : null,
  };
}

export function getArbiterPubkey(): string | null {
  return normalizeCashuPubkey(process.env.NEXT_PUBLIC_ARBITER_PUBKEY);
}
