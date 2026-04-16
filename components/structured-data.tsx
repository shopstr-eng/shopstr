import Head from "next/head";
import { useRouter } from "next/router";
import { safeJsonLdString } from "@/utils/safe-json-ld";

const organizationSchema = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: "Milk Market",
  url: "https://milk.market",
  logo: "https://milk.market/milk-market.png",
  description:
    "Milk Market is a decentralized, permissionless marketplace connecting local dairy farmers directly with consumers. Zero platform fees, direct payments via Bitcoin and traditional methods.",
  foundingDate: "2024",
  contactPoint: {
    "@type": "ContactPoint",
    email: "freemilk@milk.market",
    contactType: "customer service",
    availableLanguage: "English",
  },
  sameAs: [
    "https://github.com/shopstr-eng/milk-market",
    "https://x.com/milkmarketmedia",
    "https://www.youtube.com/@milkmarketmedia",
    "https://www.instagram.com/milkmarketmedia/",
    "https://www.tiktok.com/@milkmarket.media",
  ],
  founder: {
    "@type": "Person",
    name: "Milk Market Team",
    description:
      "Advocates for food sovereignty and direct farm-to-consumer commerce, with expertise in decentralized marketplace technology and dairy supply chains.",
  },
};

const localBusinessSchema = {
  "@context": "https://schema.org",
  "@type": "LocalBusiness",
  name: "Milk Market",
  url: "https://milk.market",
  logo: "https://milk.market/milk-market.png",
  image: "https://milk.market/milk-market.png",
  description:
    "Farm-fresh dairy marketplace connecting local farmers with buyers. Browse raw milk, cheese, butter, and more from trusted local producers with zero platform fees.",
  address: {
    "@type": "PostalAddress",
    addressLocality: "Seattle",
    addressRegion: "WA",
    addressCountry: "US",
  },
  priceRange: "$$",
  openingHoursSpecification: {
    "@type": "OpeningHoursSpecification",
    dayOfWeek: [
      "Monday",
      "Tuesday",
      "Wednesday",
      "Thursday",
      "Friday",
      "Saturday",
      "Sunday",
    ],
    opens: "00:00",
    closes: "23:59",
  },
  areaServed: {
    "@type": "Country",
    name: "United States",
  },
};

const homepageFaqSchema = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: [
    {
      "@type": "Question",
      name: "Is raw milk legal in my state?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Raw milk laws vary by state. Some states allow retail sales, others permit farm sales only, and some restrict it entirely. Check your local regulations. Milk Market simply connects buyers with local farmers - you arrange the transaction directly.",
      },
    },
    {
      "@type": "Question",
      name: "How do I pay the farmer?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "You pay the farmer directly using whatever method you both agree on - Bitcoin, cash, or other digital payment methods. There are no mandatory platform fees. Farmers may choose to set an optional donation rate to help support the site, but that's entirely up to them.",
      },
    },
    {
      "@type": "Question",
      name: "Is my information private?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Yes. All your data is encrypted and private. We never share user data with third parties or regulators. Our platform is built on Nostr, a decentralized protocol that prioritizes privacy.",
      },
    },
    {
      "@type": "Question",
      name: "How fresh is the dairy?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "That depends on the farmer you choose. Most farms offer dairy that's just days old - far fresher than the weeks-old products you'd find at a grocery store. You can ask your farmer directly about their freshness and handling practices.",
      },
    },
    {
      "@type": "Question",
      name: "I'm a farmer. How do I list my products?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "It's free and takes just a few minutes. Click 'Sell Your Dairy' in the navigation, create your profile, and start adding products. You set your own prices, delivery options, and payment methods.",
      },
    },
  ],
};

const websiteSchema = {
  "@context": "https://schema.org",
  "@type": "WebSite",
  name: "Milk Market",
  url: "https://milk.market",
  description:
    "Farm-fresh dairy marketplace. Buy raw milk, cheese, and dairy products direct from local farmers with zero platform fees.",
  potentialAction: {
    "@type": "SearchAction",
    target: {
      "@type": "EntryPoint",
      urlTemplate: "https://milk.market/marketplace?q={search_term_string}",
    },
    "query-input": "required name=search_term_string",
  },
};

export default function StructuredData() {
  const router = useRouter();
  const isHomePage = router.pathname === "/";
  const isAboutPage = router.pathname === "/about";
  const isContactPage = router.pathname === "/contact";

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
      {(isHomePage || isAboutPage || isContactPage) && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(localBusinessSchema),
          }}
        />
      )}
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
