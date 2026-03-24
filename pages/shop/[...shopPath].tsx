import { useEffect, useState, useContext } from "react";
import { useRouter } from "next/router";
import { ShopMapContext } from "@/utils/context/context";
import StorefrontLayout from "@/components/storefront/storefront-layout";
import MilkMarketSpinner from "@/components/utility-components/mm-spinner";
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
              title: content.name ? `${content.name} Shop` : "Milk Market Shop",
              description:
                content.about || "Check out this shop on Milk Market!",
              image: content.ui?.picture || "/milk-market.png",
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
        title: "Milk Market Shop",
        description: "Check out this shop on Milk Market!",
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
        <MilkMarketSpinner />
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
          className="mt-6 rounded-lg bg-primary-blue px-6 py-3 font-bold text-white transition-transform hover:-translate-y-0.5"
        >
          Back to Shop
        </a>
      </div>
    );
  }

  return <StorefrontLayout shopPubkey={shopPubkey} currentPage={subPage} />;
}
