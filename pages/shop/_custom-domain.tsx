import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import StorefrontLayout from "@/components/storefront/storefront-layout";
import ShopstrSpinner from "@/components/utility-components/shopstr-spinner";

export default function CustomDomainPage() {
  const router = useRouter();
  const { domain } = router.query;
  const [shopPubkey, setShopPubkey] = useState<string>("");
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
        <a
          href="/"
          className="mt-6 rounded-lg bg-shopstr-purple px-6 py-3 font-bold text-white"
        >
          Visit Shopstr
        </a>
      </div>
    );
  }

  return <StorefrontLayout shopPubkey={shopPubkey} />;
}
