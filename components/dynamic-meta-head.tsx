import Head from "next/head";
import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { NostrEvent, ProfileData, ShopProfile } from "@/utils/types/types";
import parseTags, {
  ProductData,
} from "@/utils/parsers/product-parser-functions";
import { nip19 } from "nostr-tools";
import {
  findProductBySlug,
  getListingSlug,
  isNpub,
  findPubkeyByProfileSlug,
  getProfileSlug,
} from "@/utils/url-slugs";

type MetaTagsType = {
  title: string;
  description: string;
  image: string;
  url: string;
};

const getMetaTags = (
  windowOrigin: string,
  pathname: string,
  query: { productId?: string[]; npub?: string[] },
  productEvents: NostrEvent[],
  shopEvents: Map<string, ShopProfile>,
  profileData: Map<string, ProfileData>
): MetaTagsType => {
  const defaultTags = {
    title: "Shopstr",
    description: "Shop freely.",
    image: "/shopstr-2000x2000.png",
    url: `${windowOrigin}`,
  };

  if (pathname.startsWith("/listing/")) {
    const productId = query.productId?.[0];
    if (!productId) return defaultTags;

    const allParsed = productEvents
      .filter((e) => e.kind !== 1)
      .map((e) => parseTags(e))
      .filter((p): p is ProductData => !!p);

    let productData: ProductData | undefined;

    productData = findProductBySlug(productId, allParsed);

    if (!productData) {
      const product = productEvents.find((event) => {
        const naddrMatch = (() => {
          try {
            return (
              nip19.naddrEncode({
                identifier:
                  event.tags.find((tag: string[]) => tag[0] === "d")?.[1] || "",
                pubkey: event.pubkey,
                kind: event.kind,
              }) === productId
            );
          } catch {
            return false;
          }
        })();
        const dTagMatch =
          event.tags.find((tag: string[]) => tag[0] === "d")?.[1] === productId;
        const idMatch = event.id === productId;
        return naddrMatch || dTagMatch || idMatch;
      });
      if (product) {
        productData = parseTags(product);
      }
    }

    if (productData) {
      const slug = getListingSlug(productData, allParsed);
      return {
        title: productData.title || "Shopstr Listing",
        description:
          productData.summary || "Check out this product on Shopstr!",
        image: productData.images?.[0] || "/shopstr-2000x2000.png",
        url: `${windowOrigin}/listing/${slug || productId}`,
      };
    }

    return {
      ...defaultTags,
      title: "Shopstr Listing",
      description: "Check out this listing on Shopstr!",
    };
  } else if (pathname.startsWith("/marketplace/") && query.npub?.[0]) {
    const slug = query.npub[0];
    let shopInfo: ShopProfile | undefined;

    if (isNpub(slug)) {
      shopInfo = Array.from(shopEvents.values()).find(
        (event) => nip19.npubEncode(event.pubkey) === slug
      );
    } else {
      const pubkey = findPubkeyByProfileSlug(slug, profileData);
      if (pubkey) {
        shopInfo = shopEvents.get(pubkey);
      }
    }

    if (shopInfo) {
      const profileSlug = getProfileSlug(shopInfo.pubkey, profileData);
      return {
        title: `${shopInfo.content.name} Shop` || "Shopstr Shop",
        description:
          shopInfo.content.about || "Check out this shop on Shopstr!",
        image: shopInfo.content.ui.picture || "/shopstr-2000x2000.png",
        url: `${windowOrigin}/marketplace/${profileSlug}`,
      };
    }
    return {
      ...defaultTags,
      title: "Shopstr Shop",
      description: "Check out this shop on Shopstr!",
    };
  }

  return defaultTags;
};

const DynamicHead = ({
  productEvents,
  shopEvents,
  profileData,
}: {
  productEvents: NostrEvent[];
  shopEvents: Map<string, ShopProfile>;
  profileData: Map<string, ProfileData>;
}) => {
  const router = useRouter();
  const [origin, setOrigin] = useState("");

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  const metaTags = getMetaTags(
    origin ? origin : "https://shopstr.store",
    router.pathname,
    router.query,
    productEvents,
    shopEvents,
    profileData
  );

  return (
    <Head>
      <meta
        name="viewport"
        content="width=device-width, initial-scale=1, maximum-scale=1"
      />
      <title>{metaTags.title}</title>
      <meta name="description" content={metaTags.description} />
      <meta property="og:url" content={metaTags.url} />
      <meta property="og:type" content="website" />
      <meta property="og:title" content={metaTags.title} />
      <meta property="og:description" content={metaTags.description} />
      <meta property="og:image" content={metaTags.image} />
      <meta name="twitter:card" content="summary_large_image" />
      <meta property="twitter:domain" content={origin} />
      <meta property="twitter:url" content={metaTags.url} />
      <meta name="twitter:title" content={metaTags.title} />
      <meta name="twitter:description" content={metaTags.description} />
      <meta name="twitter:image" content={metaTags.image} />
    </Head>
  );
};

export default DynamicHead;
