import Head from "next/head";
import Link from "next/link";
import { safeJsonLdString } from "@/utils/safe-json-ld";
import {
  ShieldCheckIcon,
  CodeBracketIcon,
  BoltIcon,
  GlobeAltIcon,
  LockClosedIcon,
  UserGroupIcon,
  ArrowLeftIcon,
  ArrowTopRightOnSquareIcon,
} from "@heroicons/react/24/outline";
import { NEO_BTN } from "@/utils/STATIC-VARIABLES";

const structuredData = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "AboutPage",
      name: "About Shopstr",
      url: "https://shopstr.market/about",
      description:
        "Learn about Shopstr — the permissionless, Bitcoin-native marketplace built on the Nostr protocol. Discover our mission, technology, and open-source foundations.",
      mainEntity: {
        "@type": "Organization",
        name: "Shopstr",
        url: "https://shopstr.market",
        logo: "https://shopstr.market/shopstr-2000x2000.png",
        foundingDate: "2023",
        description:
          "Shopstr is a censorship-resistant, Bitcoin-native marketplace built on the Nostr protocol, enabling global permissionless peer-to-peer commerce.",
        sameAs: [
          "https://github.com/shopstr-eng/shopstr",
          "https://x.com/shopstrmarkets",
        ],
        knowsAbout: [
          "Bitcoin",
          "Lightning Network",
          "Nostr protocol",
          "Decentralized commerce",
          "Peer-to-peer payments",
          "Cashu",
        ],
        areaServed: "Worldwide",
        slogan: "Shop freely.",
      },
    },
  ],
};

const values = [
  {
    icon: ShieldCheckIcon,
    title: "Permissionless",
    body: "No application required. Generate a Nostr key pair and start buying or selling immediately.",
  },
  {
    icon: LockClosedIcon,
    title: "Self-Sovereign",
    body: "Your keys control your shop. Listings are signed cryptographic events tied to your Nostr key pair.",
  },
  {
    icon: BoltIcon,
    title: "Bitcoin Native",
    body: "Payments settle in Bitcoin via Lightning and Cashu: instant, final, and independent of traditional processors.",
  },
  {
    icon: GlobeAltIcon,
    title: "Globally Open",
    body: "Accessible to anyone with an internet connection. No geographic restrictions or currency conversion lock-in.",
  },
  {
    icon: CodeBracketIcon,
    title: "Open Source",
    body: "Every line is publicly auditable. Shopstr implements interoperable Nostr and Bitcoin standards.",
  },
  {
    icon: UserGroupIcon,
    title: "Community Driven",
    body: "Built by and for Bitcoin and Nostr users, with product direction shaped by real marketplace needs.",
  },
];

const stats = [
  {
    stat: "5,000+ BTC",
    label: "Lightning Network public capacity",
    detail:
      "A global payment network with deep public channel capacity for instant Bitcoin settlement.",
    source: "1ML.com",
    href: "https://1ml.com/statistics",
  },
  {
    stat: "1M+ Keys",
    label: "Nostr registered public keys",
    detail:
      "A fast-growing decentralized identity and messaging network with a large ecosystem of compatible clients.",
    source: "Nostr.band",
    href: "https://nostr.band/stats",
  },
  {
    stat: "100+ Countries",
    label: "Where Bitcoin is legal or accessible",
    detail:
      "Shopstr is designed for global buyer and seller access without platform-controlled borders.",
    source: "Atlantic Council",
    href: "https://www.atlanticcouncil.org/programs/geoeconomics-center/cryptoregulationtracker/",
  },
  {
    stat: "0% Fees",
    label: "Mandatory platform fee",
    detail:
      "Sellers keep the sale amount minus standard Bitcoin network fees, with optional donations to support the project.",
    source: null,
    href: null,
  },
];

export default function About() {
  return (
    <>
      <Head>
        <title>About Shopstr | Bitcoin-Native Nostr Marketplace</title>
        <meta
          name="description"
          content="Shopstr is a global, permissionless marketplace built on the Nostr protocol. Learn about our mission to enable censorship-resistant Bitcoin commerce worldwide."
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: safeJsonLdString(structuredData) }}
        />
      </Head>

      <div className="relative min-h-screen overflow-hidden bg-[#111] pt-24 text-white selection:bg-yellow-400 selection:text-black">
        <div className="pointer-events-none absolute inset-0 z-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] [mask-image:radial-gradient(ellipse_70%_55%_at_50%_0%,#000_65%,transparent_100%)] bg-[size:24px_24px]" />
        <div className="relative z-10 mx-auto max-w-6xl px-4 pb-24">
          <div className="mb-8 flex justify-end">
            <Link
              href="/"
              className="inline-flex items-center gap-2 rounded-full border border-zinc-800 bg-[#161616] px-4 py-2 text-xs font-black tracking-widest text-zinc-300 uppercase transition-colors hover:border-yellow-400 hover:text-yellow-300"
            >
              <ArrowLeftIcon className="h-4 w-4" />
              Back to Home
            </Link>
          </div>

          <section className="mx-auto mb-16 max-w-4xl text-center">
            <h1 className="text-5xl font-black tracking-tight text-white uppercase md:text-7xl">
              About Shopstr
            </h1>
            <p className="mx-auto mt-6 max-w-3xl text-lg leading-relaxed text-zinc-400 md:text-xl">
              A permissionless, Bitcoin-native marketplace built on the open
              Nostr protocol, enabling censorship-resistant global commerce for
              everyone.
            </p>
          </section>

          <section className="mb-16 grid gap-6 lg:grid-cols-[0.8fr_1.2fr]">
            <div>
              <h2 className="text-3xl font-black tracking-tight text-white uppercase">
                Our Mission
              </h2>
              <p className="mt-4 text-sm font-bold tracking-widest text-yellow-300 uppercase">
                Commerce without gatekeepers
              </p>
            </div>
            <div className="space-y-5 rounded-2xl border border-zinc-800 bg-[#161616] p-6 text-base leading-7 text-zinc-300 md:p-8">
              <p>
                Shopstr exists to make commerce as free as the internet was
                originally intended to be. Traditional e-commerce platforms can
                require identity documents, approvals, and rules that change
                without warning. Shopstr removes those barriers.
              </p>
              <p>
                Built on the open Nostr protocol, Shopstr gives merchants
                censorship-resistant storefronts controlled by their own
                cryptographic keys. Payments settle in Bitcoin via Lightning or
                Cashu, without chargebacks, processor approvals, or mandatory
                platform fees.
              </p>
            </div>
          </section>

          <section className="mb-16">
            <h2 className="mb-6 text-3xl font-black tracking-tight text-white uppercase">
              Core Values
            </h2>
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {values.map(({ icon: Icon, title, body }) => (
                <div
                  key={title}
                  className="rounded-xl border border-zinc-800 bg-[#161616] p-6 transition-all hover:-translate-y-1 hover:border-yellow-400/60"
                >
                  <div className="mb-5 flex h-11 w-11 items-center justify-center rounded-lg border border-yellow-400/30 bg-yellow-400/10">
                    <Icon className="h-6 w-6 text-yellow-300" />
                  </div>
                  <h3 className="text-xl font-black tracking-tight text-white uppercase">
                    {title}
                  </h3>
                  <p className="mt-3 text-sm leading-6 text-zinc-400">{body}</p>
                </div>
              ))}
            </div>
          </section>

          <section className="mb-16 grid gap-6 lg:grid-cols-2">
            <div className="rounded-2xl border border-zinc-800 bg-[#161616] p-6 md:p-8">
              <h2 className="text-3xl font-black tracking-tight text-white uppercase">
                Technology & Standards
              </h2>
              <div className="mt-5 space-y-4 text-sm leading-7 text-zinc-400">
                <p>
                  Product listings are Nostr kind-30402 events (NIP-99), so any
                  Nostr-compatible client can display them. Payments use NIP-57
                  Zaps, NIP-47 Nostr Wallet Connect, Lightning, and Cashu.
                </p>
                <p>
                  Merchant and buyer communication uses NIP-17 direct messages
                  with NIP-44 encryption. Reviews use NIP-85 so reputations can
                  remain portable across compatible marketplaces.
                </p>
              </div>
            </div>
            <div className="rounded-2xl border border-yellow-400/30 bg-yellow-400 p-6 text-black md:p-8">
              <h2 className="text-3xl font-black tracking-tight uppercase">
                Fully Open Source
              </h2>
              <p className="mt-5 text-sm leading-7 font-medium text-black/75">
                Shopstr is not a walled garden. The source can be inspected,
                forked, and improved, and marketplace data lives on public Nostr
                relays so listings and reputation are not trapped in one site.
              </p>
              <div className="mt-6 flex flex-wrap gap-3">
                <Link
                  href="https://github.com/shopstr-eng/shopstr"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex h-11 items-center gap-2 rounded-md border-2 border-black bg-black px-5 text-xs font-black tracking-widest text-white uppercase shadow-[3px_3px_0_0_rgba(0,0,0,0.25)] transition-transform hover:-translate-y-0.5"
                >
                  View Source
                  <ArrowTopRightOnSquareIcon className="h-4 w-4" />
                </Link>
                <Link
                  href="/faq"
                  className="inline-flex h-11 items-center rounded-md border-2 border-black px-5 text-xs font-black tracking-widest uppercase transition-transform hover:-translate-y-0.5"
                >
                  Read FAQ
                </Link>
              </div>
            </div>
          </section>

          <section className="mb-16">
            <h2 className="mb-6 text-3xl font-black tracking-tight text-white uppercase">
              The Network Powering Shopstr
            </h2>
            <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-4">
              {stats.map(({ stat, label, detail, source, href }) => (
                <div
                  key={stat}
                  className="rounded-xl border border-zinc-800 bg-[#161616] p-5"
                >
                  <p className="text-3xl font-black tracking-tight text-yellow-300">
                    {stat}
                  </p>
                  <p className="mt-2 font-black text-white uppercase">
                    {label}
                  </p>
                  <p className="mt-3 text-sm leading-6 text-zinc-400">
                    {detail}
                  </p>
                  {source && href && (
                    <Link
                      href={href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-3 inline-flex text-xs font-bold text-yellow-300 underline decoration-dotted underline-offset-4"
                    >
                      Source: {source}
                    </Link>
                  )}
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-2xl border border-zinc-800 bg-[#161616] p-8 text-center md:p-10">
            <h2 className="text-3xl font-black tracking-tight text-white uppercase">
              Ready to experience permissionless commerce?
            </h2>
            <p className="mx-auto mt-4 max-w-2xl text-zinc-400">
              No account required. Generate a key pair and start buying or
              selling in minutes.
            </p>
            <Link
              href="/marketplace"
              className={`${NEO_BTN} mt-7 inline-flex h-12 px-8`}
            >
              Browse the Marketplace
            </Link>
          </section>
        </div>
      </div>
    </>
  );
}
