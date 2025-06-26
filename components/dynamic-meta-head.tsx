import Head from "next/head";
import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { NostrEvent, ShopProfile } from "@/utils/types/types";
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
  shopEvents: Map<string, ShopProfile>
): MetaTagsType => {
  const defaultTags = {
    title: "Milk Market",
    description: "FREE MILK",
    image: "/milk-market.png",
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
          title: productData.title || "Milk Market Listing",
          description:
            productData.summary || "Check out this product on Milk Makret!",
          image: productData.images?.[0] || "/milk-market.png",
          url: `${windowOrigin}/listing/${naddr}`,
        };
      }
      return {
        ...defaultTags,
        title: "Milk Market Listing",
        description: "Check out this listing on Milk Market!",
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
        title: `${shopInfo.content.name} Shop` || "Milk Market Shop",
        description:
          shopInfo.content.about || "Check out this shop on Milk Market!",
        image: shopInfo.content.ui.picture || "/milk-market.png",
        url: `${windowOrigin}/marketplace/${npub}`,
      };
    }
    return {
      ...defaultTags,
      title: "Milk Market Shop",
      description: "Check out this shop on Milk Market!",
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
  shopEvents: Map<string, ShopProfile>;
}) => {
  const router = useRouter();
  const [origin, setOrigin] = useState("");

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  const metaTags = getMetaTags(
    origin ? origin : "https://milk.marekt",
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
