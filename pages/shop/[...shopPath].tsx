import { useEffect, useState, useContext } from "react";
import { useRouter } from "next/router";
import { ShopMapContext } from "@/utils/context/context";
import StorefrontLayout from "@/components/storefront/storefront-layout";
import ShopstrSpinner from "@/components/utility-components/shopstr-spinner";

export default function ShopSubPage() {
  const router = useRouter();
  const { shopPath } = router.query;
  const shopMapContext = useContext(ShopMapContext);
  const [shopPubkey, setShopPubkey] = useState<string>("");
  const [isLoading, setIsLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  const pathParts = Array.isArray(shopPath) ? shopPath : [];
  const slug = pathParts[0] || "";
  const subPage = pathParts[1] || "";

  useEffect(() => {
    if (!slug) return;

    const lookupBySlug = async () => {
      for (const [pubkey, shop] of shopMapContext.shopData.entries()) {
        if (shop?.content?.storefront?.shopSlug === slug) {
          setShopPubkey(pubkey);
          setIsLoading(false);
          return;
        }
      }

      try {
        const res = await fetch(
          `/api/storefront/lookup?slug=${encodeURIComponent(slug)}`
        );
        if (res.ok) {
          const data = await res.json();
          if (data.pubkey) {
            setShopPubkey(data.pubkey);
            setIsLoading(false);
            return;
          }
        }
      } catch {}

      for (const [pubkey, shop] of shopMapContext.shopData.entries()) {
        const shopName = shop?.content?.name;
        if (shopName) {
          const generatedSlug = shopName
            .toLowerCase()
            .replace(/[^a-z0-9-]/g, "-")
            .replace(/-+/g, "-")
            .replace(/^-|-$/g, "");
          if (generatedSlug === slug) {
            setShopPubkey(pubkey);
            setIsLoading(false);
            return;
          }
        }
      }

      setNotFound(true);
      setIsLoading(false);
    };

    if (!shopMapContext.isLoading) {
      lookupBySlug();
    }
  }, [slug, shopMapContext.shopData, shopMapContext.isLoading]);

  if (isLoading || shopMapContext.isLoading) {
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

  return <StorefrontLayout shopPubkey={shopPubkey} currentPage={subPage} />;
}
