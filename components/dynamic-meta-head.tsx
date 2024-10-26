import Head from "next/head";
import { useRouter } from "next/router";
import React, { useState, useEffect } from "react";
import parseTags from "./utility/product-parser-functions";
import { NostrEvent, ShopSettings } from "@/utils/types/types";

const DynamicHead = ({
  productEvents,
  shopEvents,
}: {
  productEvents: NostrEvent[];
  shopEvents: Map<string, ShopSettings>;
}) => {
  const router = useRouter();
  const [metaTags, setMetaTags] = useState({
    title: "Shopstr",
    description: "Shop freely.",
    image: "/shopstr-2000x2000.png",
    url: "https://shopstr.store",
  });

  useEffect(() => {
    if (!router.isReady) return;

    if (router.pathname.startsWith("/listing/")) {
      const productId = router.query.productId?.[0];
      const product = productEvents.find((event) => event.id === productId);

      if (product) {
        const productData = parseTags(product);
        if (productData) {
          setMetaTags({
            title: productData.title || "Shopstr Listing",
            description:
              productData.summary || "Check out this product on Shopstr!",
            image: productData.images?.[0] || "/shopstr-2000x2000.png",
            url: `https://shopstr.store/listing/${productId}`,
          });
        } else {
          setMetaTags({
            title: "Shopstr Listing",
            description: "Check out this listing on Shopstr!",
            image: "/shopstr-2000x2000.png",
            url: `https://shopstr.store/listing/${productId}`,
          });
        }
      }
    } else if (router.pathname.includes("/npub")) {
      const pubkey = router.query.pubkey?.[0];
      const shopInfo = pubkey
        ? Array.from(shopEvents.values()).find(
            (event) => event.pubkey === pubkey,
          )
        : undefined;

      if (shopInfo) {
        setMetaTags({
          title: `${shopInfo.content.name} Shop` || "Shopstr Shop",
          description:
            `${shopInfo.content.about}` || "Check out this shop on Shopstr!",
          image: `${shopInfo.content.ui.picture}` || "/shopstr-2000x2000.png",
          url: `https://shopstr.store/${pubkey}`,
        });
      } else {
        setMetaTags({
          title: "Shopstr Shop",
          description: "Check out this shop on Shopstr!",
          image: "/shopstr-2000x2000.png",
          url: `https://shopstr.store/${pubkey}`,
        });
      }
    }
  }, [router.isReady, router.pathname, router.query, productEvents]);

  return (
    <Head>
      <meta
        name="viewport"
        content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no"
      />
      <title>{metaTags.title}</title>
      <meta name="description" content={metaTags.description} />
      <meta property="og:url" content={metaTags.url} />
      <meta property="og:type" content="website" />
      <meta property="og:title" content={metaTags.title} />
      <meta property="og:description" content={metaTags.description} />
      <meta property="og:image" content={metaTags.image} />
      <meta name="twitter:card" content="summary_large_image" />
      <meta property="twitter:domain" content="shopstr.store" />
      <meta property="twitter:url" content={metaTags.url} />
      <meta name="twitter:title" content={metaTags.title} />
      <meta name="twitter:description" content={metaTags.description} />
      <meta name="twitter:image" content={metaTags.image} />
    </Head>
  );
};

export default DynamicHead;
