import { useEffect, useState, useContext } from "react";
import { useRouter } from "next/router";
import { ShopMapContext } from "@/utils/context/context";
import StorefrontLayout from "@/components/storefront/storefront-layout";
import ShopstrSpinner from "@/components/utility-components/shopstr-spinner";
import { GetServerSideProps } from "next";
import { OgMetaProps, DEFAULT_OG } from "@/components/og-head";
import {
  fetchShopPubkeyBySlug,
  fetchShopProfileByPubkeyFromDb,
} from "@/utils/db/db-service";

type ShopSubPageProps = {
  ogMeta: OgMetaProps;
};

export const getServerSideProps: GetServerSideProps<ShopSubPageProps> = async (
  context
) => {
  const { shopPath } = context.query;
  const pathParts = Array.isArray(shopPath) ? shopPath : [];
  const slug = pathParts[0] || "";

  if (!slug) {
    return { props: { ogMeta: DEFAULT_OG } };
  }

  try {
    const pubkey = await fetchShopPubkeyBySlug(slug);
    if (pubkey) {
      const shopEvent = await fetchShopProfileByPubkeyFromDb(pubkey);
      if (shopEvent) {
        const content = JSON.parse(shopEvent.content);
        return {
          props: {
            ogMeta: {
              title: content.name ? `${content.name} Shop` : "Shopstr Shop",
              description: content.about || "Check out this shop on Shopstr!",
              image: content.ui?.picture || "/shopstr-2000x2000.png",
              url: `/shop/${pathParts.join("/")}`,
            },
          },
        };
      }
    }
  } catch (error) {
    console.error("SSR OG fetch error for shop sub-page:", error);
  }

  return {
    props: {
      ogMeta: {
        ...DEFAULT_OG,
        title: "Shopstr Shop",
        description: "Check out this shop on Shopstr!",
        url: `/shop/${pathParts.join("/")}`,
      },
    },
  };
};

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

  const pathParts = Array.isArray(shopPath) ? shopPath : [];
  const slug = pathParts[0] || "";
  const subPage = pathParts[1] || "";

  useEffect(() => {
    if (!slug) return;
    let isActive = true;

    setIsLoading(true);
    setNotFound(false);
    setShopPubkey("");
    setInitialShopConfig(null);
    setInitialCreatedAt(0);

    const lookupBySlug = async () => {
      if (!shopMapContext.isLoading) {
        for (const [pubkey, shop] of shopMapContext.shopData.entries()) {
          if (shop?.content?.storefront?.shopSlug === slug) {
            if (!isActive) return;
            setShopPubkey(pubkey);
            setIsLoading(false);
            return;
          }
        }
      }

      try {
        const res = await fetch(
          `/api/storefront/lookup?slug=${encodeURIComponent(slug)}`
        );
        if (!isActive) return;
        if (res.ok) {
          const data = await res.json();
          if (!isActive) return;
          if (data.pubkey) {
            setShopPubkey(data.pubkey);
            if (data.shopConfig) setInitialShopConfig(data.shopConfig);
            if (data.createdAt) setInitialCreatedAt(Number(data.createdAt));
            setIsLoading(false);
            return;
          }
        }
      } catch {}

      if (!isActive || shopMapContext.isLoading) return;

      for (const [pubkey, shop] of shopMapContext.shopData.entries()) {
        const shopName = shop?.content?.name;
        if (shopName) {
          const generatedSlug = shopName
            .toLowerCase()
            .replace(/[^a-z0-9-]/g, "-")
            .replace(/-+/g, "-")
            .replace(/^-|-$/g, "");
          if (generatedSlug === slug) {
            if (!isActive) return;
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
    return () => {
      isActive = false;
    };
  }, [slug, shopMapContext.shopData, shopMapContext.isLoading]);

  if (isLoading) {
    return (
      <div className="relative flex min-h-screen items-center justify-center bg-[#111] pt-20 text-white">
        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] [mask-image:radial-gradient(ellipse_70%_55%_at_50%_0%,#000_65%,transparent_100%)] bg-[size:24px_24px]" />
        <div className="relative z-10">
          <ShopstrSpinner />
        </div>
      </div>
    );
  }

  if (notFound || !shopPubkey) {
    return (
      <div className="relative flex min-h-screen flex-col items-center justify-center bg-[#111] px-4 pt-20 text-center text-white selection:bg-yellow-400 selection:text-black">
        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] [mask-image:radial-gradient(ellipse_70%_55%_at_50%_0%,#000_65%,transparent_100%)] bg-[size:24px_24px]" />
        <div className="relative z-10 rounded-2xl border border-zinc-800 bg-[#161616] p-8 shadow-2xl shadow-black/30">
          <h1 className="text-4xl font-black tracking-tight text-white uppercase">
            Page Not Found
          </h1>
          <p className="mt-4 max-w-md text-zinc-400">
            This page doesn&apos;t exist.
          </p>
          <a
            href={`/shop/${slug}`}
            className="mt-6 inline-flex h-11 items-center justify-center rounded-md border-2 border-black bg-yellow-400 px-6 text-sm font-black tracking-widest text-black uppercase shadow-[3px_3px_0_0_#000] transition-all hover:-translate-y-0.5 hover:shadow-[5px_5px_0_0_#000]"
          >
            Back to Shop
          </a>
        </div>
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
