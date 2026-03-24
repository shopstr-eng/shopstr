import Head from "next/head";
import Link from "next/link";
import {
  ShieldCheckIcon,
  CodeBracketIcon,
  BoltIcon,
  GlobeAltIcon,
  LockClosedIcon,
  UserGroupIcon,
  ArrowLeftIcon,
} from "@heroicons/react/24/outline";

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

export default function About() {
  return (
    <>
      <Head>
        <title>About Shopstr | Bitcoin-Native Nostr Marketplace</title>
        <meta
          name="description"
          content="Shopstr is a global, permissionless marketplace built on the Nostr protocol. Learn about our mission to enable censorship-resistant Bitcoin commerce worldwide."
        />
        <link rel="canonical" href="https://shopstr.market/about" />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
        />
      </Head>

      <div className="min-h-screen bg-light-bg dark:bg-dark-bg">
        <div className="container mx-auto max-w-5xl px-4 pb-24 pt-28">
          <div className="mb-6 flex justify-end">
            <Link href="/" passHref legacyBehavior>
              <a className="inline-flex items-center gap-1.5 rounded-lg border border-shopstr-purple/30 px-3 py-1.5 text-sm font-medium text-shopstr-purple transition-colors hover:bg-shopstr-purple/10 dark:border-shopstr-yellow/30 dark:text-shopstr-yellow dark:hover:bg-shopstr-yellow/10">
                <ArrowLeftIcon className="h-4 w-4" />
                Back to Home
              </a>
            </Link>
          </div>
          <h1 className="mb-6 text-center text-4xl font-bold text-light-text dark:text-dark-text md:text-5xl">
            About{" "}
            <span className="text-shopstr-purple dark:text-shopstr-yellow">
              Shopstr
            </span>
          </h1>
          <p className="mx-auto mb-16 max-w-3xl text-center text-xl leading-relaxed text-light-text/80 dark:text-dark-text/80">
            A permissionless, Bitcoin-native marketplace built on the open Nostr
            protocol — enabling censorship-resistant global commerce for
            everyone.
          </p>

          {/* Mission */}
          <section className="mb-16">
            <h2 className="mb-6 text-2xl font-bold text-light-text dark:text-dark-text md:text-3xl">
              Our Mission
            </h2>
            <div className="space-y-5 rounded-2xl bg-light-fg p-8 text-lg leading-relaxed text-light-text dark:bg-dark-fg dark:text-dark-text">
              <p>
                Shopstr exists to make commerce as free as the internet was
                originally intended to be. Traditional e-commerce platforms
                require merchants to register accounts, submit identity
                documents, and operate under terms that can be changed or
                revoked at any time. Shopstr removes all of those barriers.
              </p>
              <p>
                Built on the{" "}
                <Link href="https://nostr.com" passHref legacyBehavior>
                  <a
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-shopstr-purple underline decoration-dotted hover:decoration-solid dark:text-shopstr-yellow"
                  >
                    Nostr protocol
                  </a>
                </Link>{" "}
                — an open, decentralized communication standard — Shopstr gives
                merchants permanent, censorship-resistant storefronts controlled
                by their own cryptographic keys. No one can delete your listings
                or freeze your funds.
              </p>
              <p>
                All payments are settled in Bitcoin via the{" "}
                <Link href="https://lightning.network" passHref legacyBehavior>
                  <a
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-shopstr-purple underline decoration-dotted hover:decoration-solid dark:text-shopstr-yellow"
                  >
                    Lightning Network
                  </a>
                </Link>{" "}
                or{" "}
                <Link href="https://cashu.space" passHref legacyBehavior>
                  <a
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-shopstr-purple underline decoration-dotted hover:decoration-solid dark:text-shopstr-yellow"
                  >
                    Cashu
                  </a>
                </Link>
                , enabling sub-second, sub-cent transactions anywhere in the
                world with no chargebacks, no payment processor approval, and no
                mandatory platform fees on peer-to-peer transactions. Sellers
                may optionally set a donation rate to support the platform at
                their discretion.
              </p>
            </div>
          </section>

          {/* Core Values */}
          <section className="mb-16">
            <h2 className="mb-8 text-2xl font-bold text-light-text dark:text-dark-text md:text-3xl">
              Core Values
            </h2>
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {[
                {
                  icon: ShieldCheckIcon,
                  title: "Permissionless",
                  body: "No application required. Generate a Nostr key pair and start buying or selling immediately — no KYC, no identity verification, no approval process.",
                },
                {
                  icon: LockClosedIcon,
                  title: "Self-Sovereign",
                  body: "Your keys control your shop. All listings are signed cryptographic events tied to your Nostr key pair. No platform can revoke your access.",
                },
                {
                  icon: BoltIcon,
                  title: "Bitcoin Native",
                  body: "Payments settle in Bitcoin via Lightning (NIP-57 Zaps) and Cashu tokens — instant, final, and free of traditional financial intermediaries.",
                },
                {
                  icon: GlobeAltIcon,
                  title: "Globally Open",
                  body: "Shopstr is accessible to anyone with an internet connection. No geographic restrictions, no currency conversion fees, no country blocks.",
                },
                {
                  icon: CodeBracketIcon,
                  title: "Open Source",
                  body: "Every line of code is publicly auditable on GitHub. Shopstr implements NIP-02, NIP-99, NIP-47, NIP-57, and NIP-85 for maximum interoperability.",
                },
                {
                  icon: UserGroupIcon,
                  title: "Community Driven",
                  body: "Shopstr is built by and for the Bitcoin and Nostr communities. Feature development is informed by real users, not investors or advertisers.",
                },
              ].map(({ icon: Icon, title, body }) => (
                <div
                  key={title}
                  className="rounded-xl bg-light-fg p-6 shadow-md dark:bg-dark-fg"
                >
                  <div className="mb-4 flex items-center gap-3">
                    <div className="rounded-full bg-shopstr-purple/10 p-2 dark:bg-shopstr-yellow/10">
                      <Icon className="h-6 w-6 text-shopstr-purple dark:text-shopstr-yellow" />
                    </div>
                    <h3 className="text-lg font-semibold text-light-text dark:text-dark-text">
                      {title}
                    </h3>
                  </div>
                  <p className="leading-relaxed text-light-text/80 dark:text-dark-text/80">
                    {body}
                  </p>
                </div>
              ))}
            </div>
          </section>

          {/* Technology */}
          <section className="mb-16">
            <h2 className="mb-6 text-2xl font-bold text-light-text dark:text-dark-text md:text-3xl">
              Technology & Standards
            </h2>
            <div className="space-y-5 rounded-2xl bg-light-fg p-8 text-lg leading-relaxed text-light-text dark:bg-dark-fg dark:text-dark-text">
              <p>
                Shopstr is built entirely on open standards. Product listings
                are published as{" "}
                <Link
                  href="https://github.com/nostr-protocol/nostr"
                  passHref
                  legacyBehavior
                >
                  <a
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-shopstr-purple underline decoration-dotted hover:decoration-solid dark:text-shopstr-yellow"
                  >
                    Nostr
                  </a>
                </Link>{" "}
                kind-30402 events (NIP-99), meaning any Nostr-compatible client
                can display them. Payments use NIP-57 Zaps for Lightning
                invoices and NIP-47 for Nostr Wallet Connect, allowing buyers to
                pay directly from their own Lightning wallets without copying
                invoices.
              </p>
              <p>
                Merchant and buyer communication is end-to-end encrypted using
                NIP-17 direct messages with NIP-44 encryption — the most secure
                Nostr messaging standard available. Reviews are implemented via
                NIP-85, allowing seller reputations to be portable across any
                marketplace that supports the standard.
              </p>
              <p>
                The full source code is available at{" "}
                <Link
                  href="https://github.com/shopstr-eng/shopstr"
                  passHref
                  legacyBehavior
                >
                  <a
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-shopstr-purple underline decoration-dotted hover:decoration-solid dark:text-shopstr-yellow"
                  >
                    github.com/shopstr-eng/shopstr
                  </a>
                </Link>
                . Developers are encouraged to audit the code, report issues,
                and contribute improvements.
              </p>
            </div>
          </section>

          {/* Network Stats with Citations */}
          <section className="mb-16">
            <h2 className="mb-8 text-2xl font-bold text-light-text dark:text-dark-text md:text-3xl">
              The Network Powering Shopstr
            </h2>
            <div className="grid gap-5 sm:grid-cols-2">
              {[
                {
                  stat: "5,000+ BTC",
                  label: "Lightning Network public capacity",
                  detail:
                    "The Lightning Network has grown to over 5,500 BTC in public channel capacity across more than 45,000 payment channels, enabling instant Bitcoin payments globally.",
                  source: "1ML.com",
                  href: "https://1ml.com/statistics",
                },
                {
                  stat: "1M+ Keys",
                  label: "Nostr registered public keys",
                  detail:
                    "Over one million public keys have been registered on the Nostr network across more than 100 compatible clients, making it one of the fastest-growing decentralized protocols.",
                  source: "Nostr.band",
                  href: "https://nostr.band/stats",
                },
                {
                  stat: "100+ Countries",
                  label: "Where Bitcoin is legal or accessible",
                  detail:
                    "Bitcoin is fully legal in at least 45 of the 75 major economies studied by the Atlantic Council, with no outright ban in the vast majority of countries worldwide, making Shopstr accessible to a global buyer and seller base.",
                  source: "Atlantic Council",
                  href: "https://www.atlanticcouncil.org/programs/geoeconomics-center/cryptoregulationtracker/",
                },
                {
                  stat: "0% Fees",
                  label: "Mandatory platform fee on transactions",
                  detail:
                    "Shopstr has no mandatory platform fees on peer-to-peer transactions. Sellers keep the full sale amount, minus only standard Bitcoin network fees, and may optionally specify a donation rate to give back to the site on their sales at their discretion.",
                  source: null,
                  href: null,
                },
              ].map(({ stat, label, detail, source, href }) => (
                <div
                  key={stat}
                  className="rounded-xl bg-light-fg p-6 shadow-md dark:bg-dark-fg"
                >
                  <p className="mb-1 text-3xl font-bold text-shopstr-purple dark:text-shopstr-yellow">
                    {stat}
                  </p>
                  <p className="mb-3 font-semibold text-light-text dark:text-dark-text">
                    {label}
                  </p>
                  <p className="mb-2 text-sm leading-relaxed text-light-text/80 dark:text-dark-text/80">
                    {detail}
                  </p>
                  {source && href && (
                    <Link href={href} passHref legacyBehavior>
                      <a
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-shopstr-purple underline decoration-dotted hover:decoration-solid dark:text-shopstr-yellow"
                      >
                        Source: {source}
                      </a>
                    </Link>
                  )}
                </div>
              ))}
            </div>
          </section>

          {/* Open Source Trust Signal */}
          <section className="mb-16 rounded-2xl bg-gradient-to-r from-shopstr-purple/5 to-shopstr-purple/10 p-8 dark:from-shopstr-yellow/5 dark:to-shopstr-yellow/10">
            <h2 className="mb-4 text-2xl font-bold text-light-text dark:text-dark-text">
              Fully Open Source
            </h2>
            <p className="mb-6 text-lg leading-relaxed text-light-text/90 dark:text-dark-text/90">
              Shopstr is not a walled garden — it is an open-source project
              anyone can inspect, fork, and build upon. The codebase is licensed
              under open-source terms and all marketplace data lives on public
              Nostr relays. This means even if the Shopstr website went offline,
              your listings and reputation would remain accessible through any
              Nostr client.
            </p>
            <div className="flex flex-wrap gap-4">
              <Link
                href="https://github.com/shopstr-eng/shopstr"
                passHref
                legacyBehavior
              >
                <a
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 rounded-lg bg-shopstr-purple px-5 py-3 font-semibold text-white transition-opacity hover:opacity-90 dark:bg-shopstr-yellow dark:text-black"
                >
                  View Source on GitHub
                </a>
              </Link>
              <Link
                href="/faq"
                className="inline-flex items-center gap-2 rounded-lg border border-shopstr-purple/30 px-5 py-3 font-semibold text-shopstr-purple transition-colors hover:bg-shopstr-purple/5 dark:border-shopstr-yellow/30 dark:text-shopstr-yellow dark:hover:bg-shopstr-yellow/5"
              >
                Read the FAQ
              </Link>
            </div>
          </section>

          {/* CTA */}
          <section className="text-center">
            <h2 className="mb-4 text-2xl font-bold text-light-text dark:text-dark-text">
              Ready to experience permissionless commerce?
            </h2>
            <p className="mb-8 text-light-text/80 dark:text-dark-text/80">
              No account required. Generate a key pair and start buying or
              selling in minutes.
            </p>
            <Link
              href="/marketplace"
              className="inline-flex items-center gap-2 rounded-xl bg-shopstr-purple px-8 py-4 text-lg font-semibold text-white shadow-lg transition-all hover:opacity-90 hover:shadow-xl dark:bg-shopstr-yellow dark:text-black"
            >
              Browse the Marketplace
            </Link>
          </section>
        </div>
      </div>
    </>
  );
}
