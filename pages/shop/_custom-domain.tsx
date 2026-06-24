import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import Link from "next/link";
import StorefrontLayout from "@/components/storefront/storefront-layout";
import ShopstrSpinner from "@/components/utility-components/shopstr-spinner";

export default function CustomDomainPage() {
  const router = useRouter();
  const { domain } = router.query;
  const [shopPubkey, setShopPubkey] = useState<string>("");
  const [initialShopConfig, setInitialShopConfig] = useState<Record<
    string,
    unknown
  > | null>(null);
  const [initialCreatedAt, setInitialCreatedAt] = useState<number>(0);
  const [isLoading, setIsLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!domain || typeof domain !== "string") return;

    const lookupDomain = async () => {
      try {
        const res = await fetch(
          `/api/storefront/lookup?domain=${encodeURIComponent(domain)}`
        );
        if (res.ok) {
          const data = await res.json();
          if (data.pubkey) {
            setShopPubkey(data.pubkey);
            if (data.shopConfig) setInitialShopConfig(data.shopConfig);
            if (data.createdAt) setInitialCreatedAt(Number(data.createdAt));
            setIsLoading(false);
            return;
          }
        }
      } catch {}
      setNotFound(true);
      setIsLoading(false);
    };

    lookupDomain();
  }, [domain]);

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <ShopstrSpinner />
      </div>
    );
  }

  if (notFound || !shopPubkey) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center">
        <h1 className="text-3xl font-bold">Domain Not Configured</h1>
        <p className="mt-4 text-gray-500">
          This domain is not connected to any shop.
        </p>
        <Link
          href="/"
          className="bg-shopstr-purple mt-6 rounded-lg px-6 py-3 font-bold text-white"
        >
          Visit Shopstr
        </Link>
      </div>
    );
  }

  return (
    <StorefrontLayout
      shopPubkey={shopPubkey}
      initialShopConfig={initialShopConfig}
      initialCreatedAt={initialCreatedAt}
    />
  );
}
