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
    title: "Shopstr | Bitcoin-Native Nostr Marketplace | Shop Freely",
    description:
      "Shopstr is a global, permissionless marketplace built on Nostr. Buy and sell goods with Bitcoin and Lightning — no KYC, no censorship, no middlemen.",
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
    origin ? origin : "https://shopstr.market",
    router.pathname,
    router.query,
    productEvents,
    shopEvents,
    profileData
  );

  const isHomepage = router.pathname === "/" || router.pathname === "/index";

  const structuredData = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        name: "Shopstr",
        url: "https://shopstr.market",
        logo: "https://shopstr.market/shopstr-2000x2000.png",
        description:
          "A global, permissionless Bitcoin-native marketplace built on the Nostr protocol for censorship-resistant commerce.",
        sameAs: [
          "https://github.com/shopstr-eng/shopstr",
          "https://x.com/shopstrmarkets",
        ],
        founder: {
          "@type": "Person",
          name: "Shopstr Team",
          description:
            "Bitcoin and Nostr protocol developers building permissionless, censorship-resistant commerce infrastructure.",
        },
      },
      {
        "@type": "SoftwareApplication",
        name: "Shopstr",
        url: "https://shopstr.market",
        applicationCategory: "ShoppingApplication",
        operatingSystem: "Web",
        offers: {
          "@type": "Offer",
          price: "0",
          priceCurrency: "USD",
          description:
            "Free to use — no mandatory platform fees; sellers may optionally set a donation rate at their discretion",
        },
        featureList: [
          "Bitcoin Lightning Network payments",
          "Nostr protocol integration",
          "No KYC or identity verification required",
          "Censorship-resistant listings",
          "Self-custodial payments via Cashu",
        ],
        description:
          "A permissionless, Bitcoin-native marketplace built on the Nostr protocol. Buy and sell globally with no account registration, no chargebacks, and no intermediaries.",
      },
      {
        "@type": "WebSite",
        name: "Shopstr",
        url: "https://shopstr.market",
        potentialAction: {
          "@type": "SearchAction",
          target: "https://shopstr.market/?q={search_term_string}",
          "query-input": "required name=search_term_string",
        },
      },
      {
        "@type": "FAQPage",
        mainEntity: [
          {
            "@type": "Question",
            name: "What is Shopstr?",
            acceptedAnswer: {
              "@type": "Answer",
              text: "Shopstr is a global, permissionless marketplace built on the Nostr protocol that enables Bitcoin-native commerce without censorship or intermediaries.",
            },
          },
          {
            "@type": "Question",
            name: "How do I pay on Shopstr?",
            acceptedAnswer: {
              "@type": "Answer",
              text: "Shopstr supports Bitcoin payments including Lightning Network for instant, low-fee transactions.",
            },
          },
          {
            "@type": "Question",
            name: "Do I need an account to use Shopstr?",
            acceptedAnswer: {
              "@type": "Answer",
              text: "No account registration is required. Shopstr uses Nostr cryptographic key pairs — you generate keys and start buying or selling immediately with no identity verification.",
            },
          },
          {
            "@type": "Question",
            name: "What makes Shopstr different from other marketplaces?",
            acceptedAnswer: {
              "@type": "Answer",
              text: "Shopstr is built on the open Nostr protocol and accepts only Bitcoin payments, meaning there is no central authority that can ban sellers, freeze funds, or censor listings. It is truly permissionless commerce.",
            },
          },
        ],
      },
    ],
  };

  return (
    <Head>
      <meta
        name="viewport"
        content="width=device-width, initial-scale=1, maximum-scale=1"
      />
      <title>{metaTags.title}</title>
      <meta name="description" content={metaTags.description} />
      <link rel="canonical" href={metaTags.url} />
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
      {isHomepage && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
        />
      )}
    </Head>
  );
};

export default DynamicHead;
