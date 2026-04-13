import { useEffect, useState, useContext, useRef } from "react";
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
              title: content.name ? `${content.name} Shop` : "Milk Market Shop",
              description:
                content.about || "Check out this shop on Milk Market!",
              image: content.ui?.picture || "/milk-market.png",
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
        title: "Milk Market Shop",
        description: "Check out this shop on Milk Market!",
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
  const [isLoading, setIsLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const apiLookupDone = useRef(false);
  const lastSlug = useRef<string>("");

  useEffect(() => {
    if (!slug || typeof slug !== "string") return;

    if (slug !== lastSlug.current) {
      lastSlug.current = slug;
      apiLookupDone.current = false;
      setShopPubkey("");
      setNotFound(false);
      setIsLoading(true);
    }

    let cancelled = false;

    const doApiLookup = async () => {
      if (apiLookupDone.current) return;
      try {
        const res = await fetch(
          `/api/storefront/lookup?slug=${encodeURIComponent(slug)}`
        );
        if (!cancelled && res.ok) {
          const data = await res.json();
          if (data.pubkey) {
            apiLookupDone.current = true;
            setShopPubkey(data.pubkey);
            setIsLoading(false);
            return;
          }
        }
      } catch {}
    };

    doApiLookup();

    return () => {
      cancelled = true;
    };
  }, [slug]);

  useEffect(() => {
    if (!slug || typeof slug !== "string") return;
    if (shopPubkey) return;
    if (shopMapContext.isLoading) return;

    for (const [pubkey, shop] of shopMapContext.shopData.entries()) {
      if (shop?.content?.storefront?.shopSlug === slug) {
        setShopPubkey(pubkey);
        setIsLoading(false);
        return;
      }
    }

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

    if (apiLookupDone.current) {
      setNotFound(true);
      setIsLoading(false);
    }
  }, [slug, shopPubkey, shopMapContext.shopData, shopMapContext.isLoading]);

  useEffect(() => {
    if (shopPubkey) return;
    const timeout = setTimeout(() => {
      if (!shopPubkey) {
        setNotFound(true);
        setIsLoading(false);
      }
    }, 15000);
    return () => clearTimeout(timeout);
  }, [shopPubkey]);

  if (isLoading && !shopPubkey) {
    return (
      <div className="flex min-h-screen items-center justify-center pt-20">
        <MilkMarketSpinner />
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

  return <StorefrontLayout shopPubkey={shopPubkey} />;
}
