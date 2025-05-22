import Head from "next/head";
import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { NostrEvent, ShopSettings } from "@/utils/types/types";
import parseTags from "@/utils/parsers/product-parser-functions";
import { nip19 } from "nostr-tools";

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
  shopEvents: Map<string, ShopSettings>
): MetaTagsType => {
    const defaultTags = {
      title: "Fundstr",
      description: "Shop freely.",
    image: "/shopstr-2000x2000.png",
    url: `${windowOrigin}`,
  };

  if (pathname.startsWith("/listing/")) {
    const productId = query.productId?.[0];
    const product = productEvents.find((event) => {
      const dTagMatch =
        event.tags.find((tag: string[]) => tag[0] === "d")?.[1] === productId;
      const idMatch = event.id === productId;
      return dTagMatch || idMatch;
    });

    if (product) {
      const naddr = nip19.naddrEncode({
        identifier: productId as string,
        pubkey: product.pubkey,
        kind: 30402,
      });
      const productData = parseTags(product);
      if (productData) {
        return {
          title: productData.title || "Fundstr Listing",
          description:
            productData.summary || "Check out this product on Fundstr!",
          image: productData.images?.[0] || "/shopstr-2000x2000.png",
          url: `${windowOrigin}/listing/${naddr}`,
        };
      }
      return {
        ...defaultTags,
        title: "Fundstr Listing",
        description: "Check out this listing on Fundstr!",
        url: `${windowOrigin}/listing/${naddr}`,
      };
    }
  } else if (pathname.includes("/npub")) {
    const npub = query.npub?.[0];
    const shopInfo = npub
      ? Array.from(shopEvents.values()).find(
          (event) => nip19.npubEncode(event.pubkey) === npub
        )
      : undefined;

    if (shopInfo) {
      return {
          title: `${shopInfo.content.name} Shop` || "Fundstr Shop",
        description:
          shopInfo.content.about || "Check out this shop on Fundstr!",
        image: shopInfo.content.ui.picture || "/shopstr-2000x2000.png",
        url: `${windowOrigin}/marketplace/${npub}`,
      };
    }
    return {
      ...defaultTags,
      title: "Fundstr Shop",
      description: "Check out this shop on Fundstr!",
      url: `${windowOrigin}/marketplace/${npub}`,
    };
  }

  return defaultTags;
};

const DynamicHead = ({
  productEvents,
  shopEvents,
}: {
  productEvents: NostrEvent[];
  shopEvents: Map<string, ShopSettings>;
}) => {
  const router = useRouter();
  const [origin, setOrigin] = useState("");

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  const metaTags = getMetaTags(
    origin ? origin : "https://fundstr.com",
    router.pathname,
    router.query,
    productEvents,
    shopEvents
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
