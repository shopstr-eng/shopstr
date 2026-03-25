import { useEffect, useRef, useState, useContext } from "react";
import { useRouter } from "next/router";
import { ShopMapContext } from "@/utils/context/context";
import StorefrontLayout from "@/components/storefront/storefront-layout";
import ShopstrSpinner from "@/components/utility-components/shopstr-spinner";

export default function ShopSubPage() {
  const router = useRouter();
  const { shopPath } = router.query;
  const shopMapContext = useContext(ShopMapContext);
  const [shopPubkey, setShopPubkey] = useState<string>("");
  const [initialShopConfig, setInitialShopConfig] = useState<Record<
    string,
    unknown
  > | null>(null);
  const [initialCreatedAt, setInitialCreatedAt] = useState<number>(0);
  const [isLoading, setIsLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const resolvedRef = useRef(false);

  const pathParts = Array.isArray(shopPath) ? shopPath : [];
  const slug = pathParts[0] || "";
  const subPage = pathParts[1] || "";

  useEffect(() => {
    if (!slug || resolvedRef.current) return;

    const lookupBySlug = async () => {
      // 1. Check in-memory map immediately (instant if relay already loaded)
      if (!shopMapContext.isLoading) {
        for (const [pubkey, shop] of shopMapContext.shopData.entries()) {
          if (shop?.content?.storefront?.shopSlug === slug) {
            resolvedRef.current = true;
            setShopPubkey(pubkey);
            setIsLoading(false);
            return;
          }
        }
      }

      // 2. Always hit the DB — fast path, doesn't wait for relay
      try {
        const res = await fetch(
          `/api/storefront/lookup?slug=${encodeURIComponent(slug)}`
        );
        if (res.ok) {
          const data = await res.json();
          if (data.pubkey) {
            resolvedRef.current = true;
            setShopPubkey(data.pubkey);
            if (data.shopConfig) setInitialShopConfig(data.shopConfig);
            if (data.createdAt) setInitialCreatedAt(Number(data.createdAt));
            setIsLoading(false);
            return;
          }
        }
      } catch {}

      // 3. If relay is still loading, wait — effect re-runs when it settles
      if (shopMapContext.isLoading) return;

      // 4. Fall back to generated-slug name matching
      for (const [pubkey, shop] of shopMapContext.shopData.entries()) {
        const shopName = shop?.content?.name;
        if (shopName) {
          const generatedSlug = shopName
            .toLowerCase()
            .replace(/[^a-z0-9-]/g, "-")
            .replace(/-+/g, "-")
            .replace(/^-|-$/g, "");
          if (generatedSlug === slug) {
            resolvedRef.current = true;
            setShopPubkey(pubkey);
            setIsLoading(false);
            return;
          }
        }
      }

      setNotFound(true);
      setIsLoading(false);
    };

    lookupBySlug();
  }, [slug, shopMapContext.shopData, shopMapContext.isLoading]);

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center pt-20">
        <ShopstrSpinner />
      </div>
    );
  }

  if (notFound || !shopPubkey) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center pt-20">
        <h1 className="text-3xl font-bold">Page Not Found</h1>
        <p className="mt-4 text-gray-500">This page doesn&apos;t exist.</p>
        <a
          href={`/shop/${slug}`}
          className="bg-primary-blue mt-6 rounded-lg px-6 py-3 font-bold text-white transition-transform hover:-translate-y-0.5"
        >
          Back to Shop
        </a>
      </div>
    );
  }

  return (
    <StorefrontLayout
      shopPubkey={shopPubkey}
      currentPage={subPage}
      initialSlug={slug}
      initialShopConfig={initialShopConfig}
      initialCreatedAt={initialCreatedAt}
    />
  );
}
