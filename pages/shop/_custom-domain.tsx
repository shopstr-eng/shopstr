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
      <div className="relative flex min-h-screen items-center justify-center bg-[#111] text-white">
        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] [mask-image:radial-gradient(ellipse_70%_55%_at_50%_0%,#000_65%,transparent_100%)] bg-[size:24px_24px]" />
        <div className="relative z-10">
          <ShopstrSpinner />
        </div>
      </div>
    );
  }

  if (notFound || !shopPubkey) {
    return (
      <div className="relative flex min-h-screen flex-col items-center justify-center bg-[#111] px-4 text-center text-white selection:bg-yellow-400 selection:text-black">
        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] [mask-image:radial-gradient(ellipse_70%_55%_at_50%_0%,#000_65%,transparent_100%)] bg-[size:24px_24px]" />
        <div className="relative z-10 rounded-2xl border border-zinc-800 bg-[#161616] p-8 shadow-2xl shadow-black/30">
          <h1 className="text-4xl font-black tracking-tight text-white uppercase">
            Domain Not Configured
          </h1>
          <p className="mt-4 max-w-md text-zinc-400">
            This domain is not connected to any shop.
          </p>
          <Link
            href="/"
            className="mt-6 inline-flex h-11 items-center justify-center rounded-md border-2 border-black bg-yellow-400 px-6 text-sm font-black tracking-widest text-black uppercase shadow-[3px_3px_0_0_#000] transition-all hover:-translate-y-0.5 hover:shadow-[5px_5px_0_0_#000]"
          >
            Visit Shopstr
          </Link>
        </div>
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
