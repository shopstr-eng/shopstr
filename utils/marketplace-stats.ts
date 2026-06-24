import type { NostrEvent } from "@/utils/types/types";

export type MarketplaceStats = {
  listingCount: number | null;
  sellerCount: number | null;
};

type ProductEventStats = {
  listingCount: number;
  sellerCount: number;
};

type ProductEventForStats = Pick<NostrEvent, "kind" | "pubkey">;

export function getProductEventStats(
  productEvents: readonly ProductEventForStats[]
): ProductEventStats {
  const sellerPubkeys = new Set<string>();
  let listingCount = 0;

  for (const event of productEvents) {
    if (event.kind !== 30402) continue;

    listingCount += 1;
    if (event.pubkey) {
      sellerPubkeys.add(event.pubkey);
    }
  }

  return {
    listingCount,
    sellerCount: sellerPubkeys.size,
  };
}

export function resolveMarketplaceStats(
  apiStats: MarketplaceStats,
  productEvents: readonly ProductEventForStats[]
): MarketplaceStats {
  const productStats = getProductEventStats(productEvents);

  return {
    listingCount: resolveCount(
      apiStats.listingCount,
      productStats.listingCount
    ),
    sellerCount: resolveCount(apiStats.sellerCount, productStats.sellerCount),
  };
}

function resolveCount(apiCount: number | null, productCount: number) {
  if (productCount === 0) return apiCount;
  if (apiCount === null) return productCount;
  return Math.max(apiCount, productCount);
}
