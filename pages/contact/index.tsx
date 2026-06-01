import Head from "next/head";
import Link from "next/link";
import { safeJsonLdString } from "@/utils/safe-json-ld";
import {
  CodeBracketIcon,
  GlobeAltIcon,
  QuestionMarkCircleIcon,
  ArrowLeftIcon,
  ArrowTopRightOnSquareIcon,
} from "@heroicons/react/24/outline";
import { NEO_BTN } from "@/utils/STATIC-VARIABLES";

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

      <div className="relative min-h-screen overflow-hidden bg-[#111] pt-24 text-white selection:bg-yellow-400 selection:text-black">
        <div className="pointer-events-none absolute inset-0 z-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] [mask-image:radial-gradient(ellipse_70%_55%_at_50%_0%,#000_65%,transparent_100%)] bg-[size:24px_24px]" />
        <div className="relative z-10 mx-auto max-w-5xl px-4 pb-24">
          <div className="mb-8 flex justify-end">
            <Link
              href="/"
              className="inline-flex items-center gap-2 rounded-full border border-zinc-800 bg-[#161616] px-4 py-2 text-xs font-black tracking-widest text-zinc-300 uppercase transition-colors hover:border-yellow-400 hover:text-yellow-300"
            >
              <ArrowLeftIcon className="h-4 w-4" />
              Back to Home
            </Link>
          </div>

          <div className="mx-auto mb-14 max-w-3xl text-center">
            <h1 className="text-5xl font-black tracking-tight text-white uppercase md:text-7xl">
              Contact Shopstr
            </h1>
            <p className="mx-auto mt-5 max-w-2xl text-lg leading-relaxed text-zinc-400">
              Shopstr is a decentralized, open-source project. There is no
              central office. The best conversations happen through open
              protocols like Nostr and GitHub.
            </p>
          </div>

          <div className="grid gap-5 md:grid-cols-3">
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
                  className="flex min-h-80 flex-col rounded-xl border border-zinc-800 bg-[#161616] p-6 shadow-2xl shadow-black/20 transition-all hover:-translate-y-1 hover:border-yellow-400/60"
                >
                  <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-lg border border-yellow-400/30 bg-yellow-400/10">
                    <Icon className="h-6 w-6 text-yellow-300" />
                  </div>
                  <h2 className="text-2xl font-black tracking-tight text-white uppercase">
                    {title}
                  </h2>
                  <p className="mt-1 text-xs font-bold tracking-widest text-zinc-500 uppercase">
                    {handle}
                  </p>
                  <p className="mt-5 flex-1 text-sm leading-6 text-zinc-400">
                    {description}
                  </p>
                  <Link
                    href={href}
                    target={external ? "_blank" : undefined}
                    rel={external ? "noopener noreferrer" : undefined}
                    className={`${NEO_BTN} mt-6 inline-flex h-11 w-fit items-center gap-2 px-5 text-xs`}
                  >
                    {cta}
                    {external && (
                      <ArrowTopRightOnSquareIcon className="h-4 w-4" />
                    )}
                  </Link>
                </div>
              )
            )}
          </div>

          <div className="mt-16 rounded-xl border border-zinc-800 bg-[#161616] p-6 md:p-8">
            <h2 className="text-2xl font-black tracking-tight text-white uppercase">
              What to expect
            </h2>
            <div className="mt-5 grid gap-4 md:grid-cols-3">
              {[
                [
                  "GitHub issues",
                  "Typically reviewed within a few days. Bug reports with reproduction steps are prioritized.",
                ],
                [
                  "Nostr messages",
                  "Best-effort responses; follow the official account to see announcements first.",
                ],
                [
                  "Feature requests",
                  "Open a GitHub discussion so the community can upvote and contribute.",
                ],
              ].map(([title, body]) => (
                <div
                  key={title}
                  className="rounded-lg border border-zinc-800 bg-[#111] p-4"
                >
                  <p className="font-black text-yellow-300 uppercase">
                    {title}
                  </p>
                  <p className="mt-2 text-sm leading-6 text-zinc-400">{body}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
