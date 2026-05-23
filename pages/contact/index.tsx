import Head from "next/head";
import Link from "next/link";
import { safeJsonLdString } from "@/utils/safe-json-ld";
import {
  CodeBracketIcon,
  GlobeAltIcon,
  QuestionMarkCircleIcon,
  ArrowLeftIcon,
} from "@heroicons/react/24/outline";

const structuredData = {
  "@context": "https://schema.org",
  "@type": "ContactPage",
  name: "Contact Shopstr",
  url: "https://shopstr.market/contact",
  description:
    "Get in touch with the Shopstr team via Nostr, GitHub, or social media. We are a decentralized open-source project — all communication happens on open protocols.",
  mainEntity: {
    "@type": "Organization",
    name: "Shopstr",
    url: "https://shopstr.market",
    sameAs: ["https://github.com/shopstr-eng/shopstr"],
  },
};

const channels = [
  {
    icon: GlobeAltIcon,
    title: "Nostr",
    handle: "@shopstrmarkets on Nostr",
    description:
      "The best way to reach the team is directly on Nostr. Follow the official Shopstr account for announcements, updates, and community discussion.",
    cta: "Open on njump.me",
    href: "https://njump.me/npub15dc33fyg3cpd9r58vlqge2hh8dy6hkkrjxkhluv2xpyfreqkmsesesyv6e",
    external: true,
  },
  {
    icon: CodeBracketIcon,
    title: "GitHub",
    handle: "shopstr-eng/shopstr",
    description:
      "For bug reports, feature requests, or technical questions, open an issue or discussion on the GitHub repository. All development happens in the open.",
    cta: "Open an Issue",
    href: "https://github.com/shopstr-eng/shopstr/issues",
    external: true,
  },
  {
    icon: QuestionMarkCircleIcon,
    title: "FAQ",
    handle: "Frequently Asked Questions",
    description:
      "Before reaching out, check the FAQ page — it covers the most common questions about payments, privacy, selling, and account management.",
    cta: "Read the FAQ",
    href: "/faq",
    external: false,
  },
];

export default function Contact() {
  return (
    <>
      <Head>
        <title>Contact Shopstr | Get in Touch via Nostr & GitHub</title>
        <meta
          name="description"
          content="Contact the Shopstr team via Nostr, GitHub, or X. We are a decentralized open-source project — all communication happens on open protocols."
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: safeJsonLdString(structuredData) }}
        />
      </Head>

      <div className="bg-light-bg dark:bg-dark-bg min-h-screen">
        <div className="container mx-auto max-w-4xl px-4 pt-28 pb-24">
          <div className="mb-6 flex justify-end">
            <Link href="/" passHref legacyBehavior>
              <a className="border-shopstr-purple/30 text-shopstr-purple hover:bg-shopstr-purple/10 dark:border-shopstr-yellow/30 dark:text-shopstr-yellow dark:hover:bg-shopstr-yellow/10 inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors">
                <ArrowLeftIcon className="h-4 w-4" />
                Back to Home
              </a>
            </Link>
          </div>
          <h1 className="text-light-text dark:text-dark-text mb-6 text-center text-4xl font-bold md:text-5xl">
            Contact{" "}
            <span className="text-shopstr-purple dark:text-shopstr-yellow">
              Shopstr
            </span>
          </h1>
          <p className="text-light-text/80 dark:text-dark-text/80 mx-auto mb-16 max-w-2xl text-center text-xl leading-relaxed">
            Shopstr is a decentralized, open-source project. There is no central
            office — all communication happens on open protocols like Nostr and
            GitHub.
          </p>

          <div className="grid gap-6 sm:grid-cols-2">
            {channels.map(
              ({
                icon: Icon,
                title,
                handle,
                description,
                cta,
                href,
                external,
              }) => (
                <div
                  key={title}
                  className="bg-light-fg dark:bg-dark-fg flex flex-col rounded-2xl p-7 shadow-md"
                >
                  <div className="mb-5 flex items-start gap-4">
                    <div className="bg-shopstr-purple/10 dark:bg-shopstr-yellow/10 rounded-xl p-3">
                      <Icon className="text-shopstr-purple dark:text-shopstr-yellow h-7 w-7" />
                    </div>
                    <div>
                      <h2 className="text-light-text dark:text-dark-text text-xl font-bold">
                        {title}
                      </h2>
                      <p className="text-light-text/60 dark:text-dark-text/60 text-sm">
                        {handle}
                      </p>
                    </div>
                  </div>
                  <p className="text-light-text/80 dark:text-dark-text/80 mb-6 flex-1 leading-relaxed">
                    {description}
                  </p>
                  {external ? (
                    <Link href={href} passHref legacyBehavior>
                      <a
                        target="_blank"
                        rel="noopener noreferrer"
                        className="bg-shopstr-purple dark:bg-shopstr-yellow inline-flex w-fit items-center gap-2 rounded-lg px-5 py-2.5 font-semibold text-white transition-opacity hover:opacity-90 dark:text-black"
                      >
                        {cta}
                      </a>
                    </Link>
                  ) : (
                    <Link
                      href={href}
                      className="bg-shopstr-purple dark:bg-shopstr-yellow inline-flex w-fit items-center gap-2 rounded-lg px-5 py-2.5 font-semibold text-white transition-opacity hover:opacity-90 dark:text-black"
                    >
                      {cta}
                    </Link>
                  )}
                </div>
              )
            )}
          </div>

          {/* Response time */}
          <div className="bg-light-fg dark:bg-dark-fg mt-16 rounded-2xl p-8">
            <h2 className="text-light-text dark:text-dark-text mb-4 text-xl font-bold">
              What to expect
            </h2>
            <ul className="text-light-text/80 dark:text-dark-text/80 space-y-3">
              <li className="flex items-start gap-2">
                <span className="text-shopstr-purple dark:text-shopstr-yellow mt-1">
                  →
                </span>
                <span>
                  <strong>GitHub issues</strong> — typically reviewed within a
                  few days. Bug reports with reproduction steps are prioritized.
                </span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-shopstr-purple dark:text-shopstr-yellow mt-1">
                  →
                </span>
                <span>
                  <strong>Nostr messages</strong> — best-effort responses;
                  follow the official account to see announcements first.
                </span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-shopstr-purple dark:text-shopstr-yellow mt-1">
                  →
                </span>
                <span>
                  <strong>Feature requests</strong> — open a GitHub discussion
                  and the community can upvote and contribute to the
                  conversation.
                </span>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </>
  );
}
