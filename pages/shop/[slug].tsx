/* eslint-disable @next/next/no-img-element */

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

type ShopPageProps = {
  ogMeta: OgMetaProps;
};

export const getServerSideProps: GetServerSideProps<ShopPageProps> = async (
  context
) => {
  const { slug } = context.query;
  const shopSlug = typeof slug === "string" ? slug : "";

  if (!shopSlug) {
    return { props: { ogMeta: DEFAULT_OG } };
  }

  try {
    const pubkey = await fetchShopPubkeyBySlug(shopSlug);
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
              url: `/shop/${shopSlug}`,
            },
          },
        };
      }
    }
  } catch (error) {
    console.error("SSR OG fetch error for shop:", error);
  }

  return {
    props: {
      ogMeta: {
        ...DEFAULT_OG,
        title: "Shopstr Shop",
        description: "Check out this shop on Shopstr!",
        url: `/shop/${shopSlug}`,
      },
    },
  };
};

export default function ShopPage() {
  const router = useRouter();
  const { slug } = router.query;
  const shopMapContext = useContext(ShopMapContext);
  const [shopPubkey, setShopPubkey] = useState<string>("");
  const [initialShopConfig, setInitialShopConfig] = useState<Record<
    string,
    unknown
  > | null>(null);
  const [initialCreatedAt, setInitialCreatedAt] = useState<number>(0);
  const [isLoading, setIsLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!slug || typeof slug !== "string") return;
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
      <div className="flex min-h-screen items-center justify-center pt-20">
        <ShopstrSpinner />
      </div>
    );
  }

  if (notFound || !shopPubkey) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center pt-20">
        <h1 className="text-3xl font-bold">Shop Not Found</h1>
        <p className="mt-4 text-gray-500">
          This shop doesn&apos;t exist or hasn&apos;t been set up yet.
        </p>
        <a
          href="/marketplace"
          className="bg-primary-blue mt-6 rounded-lg px-6 py-3 font-bold text-white transition-transform hover:-translate-y-0.5"
        >
          Browse Marketplace
        </a>
      </div>
    );
  }

  return (
    <StorefrontLayout
      shopPubkey={shopPubkey}
      initialSlug={typeof slug === "string" ? slug : undefined}
      initialShopConfig={initialShopConfig}
      initialCreatedAt={initialCreatedAt}
    />
  );
}
