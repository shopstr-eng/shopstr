import { useEffect, useState, useContext, useRef } from "react";
import { useRouter } from "next/router";
import { ShopMapContext } from "@/utils/context/context";
import StorefrontLayout from "@/components/storefront/storefront-layout";
import ThemedStallOrders from "@/components/storefront/themed-stall-orders";
import MilkMarketSpinner from "@/components/utility-components/mm-spinner";
import { GetServerSideProps } from "next";
import { OgMetaProps, DEFAULT_OG } from "@/components/og-head";
import {
  fetchShopPubkeyBySlug,
  fetchShopProfileByPubkeyFromDb,
  fetchProfileByPubkeyFromDb,
} from "@/utils/db/db-service";
import {
  resolveStallBranding,
  buildStallOgMeta,
} from "@/utils/storefront/stall-branding";

type ShopSubPageProps = {
  ogMeta: OgMetaProps;
};

export const getServerSideProps: GetServerSideProps<ShopSubPageProps> = async (
  context
) => {
  const { stallPath } = context.query;
  const pathParts = Array.isArray(stallPath) ? stallPath : [];
  const slug = pathParts[0] || "";

  if (!slug) {
    return { props: { ogMeta: DEFAULT_OG } };
  }

  const subPage = pathParts[1] || "";

  try {
    const pubkey = await fetchShopPubkeyBySlug(slug);
    if (pubkey) {
      const [shopEvent, profileEvent] = await Promise.all([
        fetchShopProfileByPubkeyFromDb(pubkey),
        fetchProfileByPubkeyFromDb(pubkey),
      ]);
      if (shopEvent) {
        const content = JSON.parse(shopEvent.content);
        let profileContent: Record<string, unknown> | null = null;
        if (profileEvent) {
          try {
            profileContent = JSON.parse(profileEvent.content);
          } catch {
            profileContent = null;
          }
        }

        const branding = resolveStallBranding(content, profileContent);

        const pageSuffix = subPage
          ? ` — ${subPage.charAt(0).toUpperCase() + subPage.slice(1)}`
          : "";
        const title = branding.seo?.metaTitle
          ? `${branding.seo.metaTitle}${pageSuffix}`
          : `${branding.shopName}${pageSuffix} | Milk Market`;

        return {
          props: {
            ogMeta: buildStallOgMeta({
              branding,
              title,
              url: `/stall/${pathParts.join("/")}`,
              keywordSeed: slug,
            }),
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
        title: "Milk Market Stall",
        description: "Check out this shop on Milk Market!",
        url: `/stall/${pathParts.join("/")}`,
      },
    },
  };
};

export default function ShopSubPage() {
  const router = useRouter();
  const { stallPath } = router.query;
  const shopMapContext = useContext(ShopMapContext);
  const [shopPubkey, setShopPubkey] = useState<string>("");
  const [isLoading, setIsLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const apiLookupDone = useRef(false);
  const lastSlug = useRef<string>("");

  const pathParts = Array.isArray(stallPath) ? stallPath : [];
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
          href={`/stall/${slug}`}
          className="bg-primary-blue mt-6 rounded-lg px-6 py-3 font-bold text-white transition-transform hover:-translate-y-0.5"
        >
          Back to Stall
        </a>
      </div>
    );
  }

  if (subPage === "orders") {
    const tabParam = router.query.tab;
    const initialTab = typeof tabParam === "string" ? tabParam : undefined;
    return (
      <ThemedStallOrders
        sellerPubkey={shopPubkey}
        shopSlug={slug}
        {...(initialTab ? { initialTab } : {})}
      />
    );
  }

  return <StorefrontLayout shopPubkey={shopPubkey} currentPage={subPage} />;
}
