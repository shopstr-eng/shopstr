import Head from "next/head";
import { useRouter } from "next/router";
import { safeJsonLdString } from "@/utils/safe-json-ld";

const organizationSchema = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: "Shopstr",
  url: "https://shopstr.market",
  logo: "https://shopstr.market/shopstr-2000x2000.png",
  description:
    "Shopstr is a censorship-resistant, Bitcoin-native marketplace built on the Nostr protocol. Buy and sell anything with no account suspensions, no mandatory platform fees, and instant Bitcoin payments via Lightning.",
  foundingDate: "2023",
  sameAs: [
    "https://github.com/shopstr-eng/shopstr",
    "https://x.com/shopstrmarkets",
    "https://njump.me/npub15dc33fyg3cpd9r58vlqge2hh8dy6hkkrjxkhluv2xpyfreqkmsesesyv6e",
  ],
  founder: {
    "@type": "Person",
    name: "Shopstr Team",
    description:
      "Advocates for permissionless commerce and financial sovereignty, with expertise in decentralized marketplace technology, Bitcoin Lightning payments, and the Nostr protocol.",
  },
};

const websiteSchema = {
  "@context": "https://schema.org",
  "@type": "WebSite",
  name: "Shopstr",
  url: "https://shopstr.market",
  description:
    "The permissionless Bitcoin marketplace. Sell anything, get paid in Bitcoin via Lightning — no bans, no fees, no middlemen.",
  potentialAction: {
    "@type": "SearchAction",
    target: {
      "@type": "EntryPoint",
      urlTemplate:
        "https://shopstr.market/marketplace?search={search_term_string}",
    },
    "query-input": "required name=search_term_string",
  },
};

const homepageFaqSchema = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: [
    {
      "@type": "Question",
      name: "Do I need Bitcoin to get started on Shopstr?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Bitcoin is required to make purchases. No external wallet is needed — Shopstr has a built-in wallet ready to use. You can also send funds to an external wallet any time.",
      },
    },
    {
      "@type": "Question",
      name: "Can my shop get banned or suspended on Shopstr?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "No. Shopstr runs on Nostr, a decentralized protocol. No single company controls your listings or your keys — there is nothing to ban.",
      },
    },
    {
      "@type": "Question",
      name: "How do I get paid on Shopstr?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Payment goes directly from the buyer to you via Lightning or Cashu. It is instant, final, and self-custodial — no platform holds your money.",
      },
    },
    {
      "@type": "Question",
      name: "Is Shopstr really free to use?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Yes — there are no mandatory platform fees. Sellers may optionally set a donation rate to support Shopstr, but it is never required.",
      },
    },
  ],
};

export default function StructuredData() {
  const router = useRouter();
  const isHomePage = router.pathname === "/";

  return (
    <Head>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: safeJsonLdString(organizationSchema),
        }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: safeJsonLdString(websiteSchema),
        }}
      />
      {isHomePage && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: safeJsonLdString(homepageFaqSchema),
          }}
        />
      )}
    </Head>
  );
}
