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

  const subPage = pathParts[1] || "";

  try {
    const pubkey = await fetchShopPubkeyBySlug(slug);
    if (pubkey) {
      const shopEvent = await fetchShopProfileByPubkeyFromDb(pubkey);
      if (shopEvent) {
        const content = JSON.parse(shopEvent.content);
        const seo = content.storefront?.seoMeta;
        const shopName = content.name || "Shop";
        const shopAbout = content.about || "";

        const pageSuffix = subPage
          ? ` — ${subPage.charAt(0).toUpperCase() + subPage.slice(1)}`
          : "";
        const autoTitle = `${shopName}${pageSuffix} | Milk Market`;
        const autoDescription = shopAbout
          ? shopAbout.length > 160
            ? shopAbout.slice(0, 157) + "..."
            : shopAbout
          : `Shop farm-fresh products from ${shopName} on Milk Market. Direct from the producer to your door.`;

        return {
          props: {
            ogMeta: {
              title: seo?.metaTitle
                ? `${seo.metaTitle}${pageSuffix}`
                : autoTitle,
              description: seo?.metaDescription || autoDescription,
              image:
                seo?.ogImage ||
                content.ui?.banner ||
                content.ui?.picture ||
                "/milk-market.png",
              url: `/shop/${pathParts.join("/")}`,
              keywords:
                seo?.keywords ||
                `${shopName}, farm fresh, raw milk, dairy, local farm, ${slug}`,
              locale: seo?.locale || "en_US",
              locationRegion: seo?.locationRegion || undefined,
              locationCity: seo?.locationCity || undefined,
              siteName: shopName,
              type: "business.business",
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
  const apiLookupDone = useRef(false);
  const lastSlug = useRef<string>("");

  const pathParts = Array.isArray(shopPath) ? shopPath : [];
  const slug = pathParts[0] || "";
  const subPage = pathParts[1] || "";

  useEffect(() => {
    if (!slug) return;

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
    if (!slug) return;
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
