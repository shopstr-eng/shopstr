import Head from "next/head";
import Link from "next/link";
import { useRouter } from "next/router";
import { ArrowLeftIcon } from "@heroicons/react/24/outline";
import {
  PRIMARYBUTTONCLASSNAMES,
  WHITEBUTTONCLASSNAMES,
} from "@/utils/STATIC-VARIABLES";

export default function AboutPage() {
  const router = useRouter();
  return (
    <>
      <Head>
        <title>About Milk Market - Our Mission & Story</title>
        <meta
          name="description"
          content="Milk Market is a decentralized marketplace connecting local dairy farmers directly with consumers. Learn about our mission for food sovereignty, zero-fee commerce, and empowering local producers."
        />
        <link rel="canonical" href="https://milk.market/about" />
        <meta
          property="og:title"
          content="About Milk Market - Our Mission & Story"
        />
        <meta
          property="og:description"
          content="Milk Market is a decentralized marketplace connecting local dairy farmers directly with consumers. Learn about our mission for food sovereignty."
        />
        <meta property="og:url" content="https://milk.market/about" />
        <meta
          property="og:image"
          content="https://milk.market/milk-market.png"
        />
        <meta name="twitter:card" content="summary_large_image" />
        <meta
          name="twitter:title"
          content="About Milk Market - Our Mission & Story"
        />
        <meta
          name="twitter:description"
          content="Decentralized marketplace connecting local dairy farmers directly with consumers. Zero platform fees."
        />
      </Head>

      <div className="min-h-screen bg-white font-sans text-black">
        <div className="mx-auto max-w-4xl px-4 py-12 sm:px-6 lg:px-8">
          <div className="mb-4">
            <button
              onClick={() => router.back()}
              className={`${WHITEBUTTONCLASSNAMES} mb-8 flex items-center gap-2`}
            >
              <ArrowLeftIcon className="h-4 w-4" />
              Back
            </button>
          </div>

          <h1 className="mb-8 text-4xl font-black md:text-5xl">
            About Milk Market
          </h1>

          <section className="mb-12">
            <h2 className="mb-4 text-2xl font-black">Our Mission</h2>
            <p className="mb-4 text-lg text-zinc-700">
              Milk Market exists to restore the direct connection between local
              dairy farmers and the people they feed. We believe everyone
              deserves access to fresh, high-quality dairy products without
              middlemen inflating prices or dictating what you can buy.
            </p>
            <p className="mb-4 text-lg text-zinc-700">
              According to the{" "}
              <a
                href="https://www.ers.usda.gov/data-products/charts-of-note/chart-detail?chartId=82244"
                target="_blank"
                rel="noopener noreferrer"
                className="font-bold text-blue-700 underline"
              >
                USDA Economic Research Service
              </a>
              , the U.S. dairy industry generated $45.9 billion in cash receipts
              in 2023, yet the{" "}
              <a
                href="https://www.ers.usda.gov/data-products/food-dollar-series/quick-facts"
                target="_blank"
                rel="noopener noreferrer"
                className="font-bold text-blue-700 underline"
              >
                USDA Food Dollar Series
              </a>{" "}
              shows farmers receive just 15.9 cents of every food dollar. Direct
              food sales from farms reached $17.5 billion in 2022, up 25% since
              2017, reflecting growing demand for transparency and freshness in
              the food supply chain.
            </p>
          </section>

          <section className="mb-12 rounded-lg border-2 border-black bg-zinc-50 p-8 shadow-neo">
            <h2 className="mb-4 text-2xl font-black">Why We Built This</h2>
            <p className="mb-4 text-zinc-700">
              The modern dairy supply chain is broken. Large processors and
              retailers capture most of the value, while small farmers struggle
              to survive and consumers pay premium prices for products that may
              be weeks old. The{" "}
              <a
                href="https://www.ers.usda.gov/data-products/food-dollar-series/quick-facts"
                target="_blank"
                rel="noopener noreferrer"
                className="font-bold text-blue-700 underline"
              >
                USDA Food Dollar Series
              </a>{" "}
              shows that 84.1 cents of every food dollar goes to marketing,
              processing, and retail &mdash; leaving farmers with just 15.9
              cents. Direct sales cut out those middlemen.
            </p>
            <blockquote className="my-6 border-l-4 border-black bg-white p-4 italic text-zinc-600">
              &ldquo;The shorter the chain between raw food and fork, the
              fresher it is and the more transparent the system is.&rdquo;
              <br />
              <span className="mt-2 block text-sm font-bold not-italic text-black">
                &mdash; Joel Salatin,{" "}
                <span className="font-normal italic">
                  Everything I Want To Do Is Illegal
                </span>
              </span>
            </blockquote>
            <p className="text-zinc-700">
              Milk Market solves this by creating a permissionless marketplace
              where farmers list products, set their own prices, and keep their
              earnings. There are no mandatory platform fees &mdash; farmers can
              optionally elect a donation rate to support the site, but
              it&apos;s always their choice. No gatekeepers. No middlemen.
            </p>
          </section>

          <section className="mb-12">
            <h2 className="mb-6 text-2xl font-black">
              What Makes Us Different
            </h2>
            <div className="grid gap-6 md:grid-cols-2">
              <div className="rounded-lg border-2 border-black bg-white p-6 shadow-neo">
                <h3 className="mb-2 text-xl font-bold">No Mandatory Fees</h3>
                <p className="text-zinc-600">
                  There are no mandatory platform fees. Farmers can elect an
                  optional donation rate to give back to the site if they wish,
                  but every sale defaults to 100% going to the farmer.
                </p>
              </div>
              <div className="rounded-lg border-2 border-black bg-white p-6 shadow-neo">
                <h3 className="mb-2 text-xl font-bold">Privacy-First</h3>
                <p className="text-zinc-600">
                  Built on the Nostr protocol, all communications are encrypted
                  end-to-end. Your data is never sold or shared with third
                  parties.
                </p>
              </div>
              <div className="rounded-lg border-2 border-black bg-white p-6 shadow-neo">
                <h3 className="mb-2 text-xl font-bold">
                  Multiple Payment Options
                </h3>
                <p className="text-zinc-600">
                  Pay with Bitcoin (Lightning Network), credit cards via Stripe,
                  or arrange cash and other methods directly with your farmer.
                </p>
              </div>
              <div className="rounded-lg border-2 border-black bg-white p-6 shadow-neo">
                <h3 className="mb-2 text-xl font-bold">
                  Decentralized & Censorship-Resistant
                </h3>
                <p className="text-zinc-600">
                  No central authority can shut down the marketplace or prevent
                  farmers from selling legal products. Food freedom is a core
                  value.
                </p>
              </div>
            </div>
          </section>

          <section className="mb-12 rounded-lg border-2 border-black bg-zinc-50 p-8 shadow-neo">
            <h2 className="mb-4 text-2xl font-black">Our Team</h2>
            <p className="mb-4 text-zinc-700">
              Milk Market was founded by a team of technologists and food
              sovereignty advocates who believe that the future of food commerce
              is decentralized, private, and fair. Our team brings together
              expertise in:
            </p>
            <ul className="mb-4 list-disc space-y-2 pl-6 text-zinc-700">
              <li>
                <strong>Decentralized protocols</strong> &mdash; Deep experience
                building on the Nostr protocol and Bitcoin payment
                infrastructure
              </li>
              <li>
                <strong>Agricultural economics</strong> &mdash; Understanding
                the challenges facing small-scale dairy farmers in the modern
                supply chain
              </li>
              <li>
                <strong>Privacy engineering</strong> &mdash; Commitment to
                end-to-end encryption and user data sovereignty
              </li>
              <li>
                <strong>E-commerce platforms</strong> &mdash; Years of
                experience building marketplace technology at scale
              </li>
            </ul>
            <p className="text-zinc-700">
              We are headquartered in the greater Seattle area and serve dairy
              farms and consumers across the United States, with plans to expand
              internationally.
            </p>
          </section>

          <section className="mb-12">
            <h2 className="mb-4 text-2xl font-black">Industry Context</h2>
            <p className="mb-4 text-zinc-700">
              The direct-to-consumer dairy movement is accelerating. Key
              statistics:
            </p>
            <div className="grid gap-4 md:grid-cols-3">
              <div className="rounded-lg border-2 border-black bg-white p-4 text-center shadow-neo">
                <span className="block text-3xl font-black">$45.9B</span>
                <span className="text-sm text-zinc-600">
                  U.S. dairy cash receipts in 2023 (
                  <a
                    href="https://www.ers.usda.gov/data-products/charts-of-note/chart-detail?chartId=82244"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-700 underline"
                  >
                    USDA ERS
                  </a>
                  )
                </span>
              </div>
              <div className="rounded-lg border-2 border-black bg-white p-4 text-center shadow-neo">
                <span className="block text-3xl font-black">25%</span>
                <span className="text-sm text-zinc-600">
                  Growth in direct farm sales, 2017-2022 (
                  <a
                    href="https://www.ers.usda.gov/data-products/charts-of-note/chart-detail?chartId=108821"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-700 underline"
                  >
                    USDA Census
                  </a>
                  )
                </span>
              </div>
              <div className="rounded-lg border-2 border-black bg-white p-4 text-center shadow-neo">
                <span className="block text-3xl font-black">15.9¢</span>
                <span className="text-sm text-zinc-600">
                  Farm share of each food dollar in 2023 (
                  <a
                    href="https://www.ers.usda.gov/data-products/food-dollar-series/quick-facts"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-700 underline"
                  >
                    USDA ERS
                  </a>
                  )
                </span>
              </div>
            </div>
          </section>

          <section className="rounded-lg border-2 border-black bg-black p-8 text-center text-white">
            <h2 className="mb-4 text-2xl font-black">Ready to Get Started?</h2>
            <p className="mb-6 text-zinc-300">
              Whether you&apos;re a farmer looking to sell or a consumer seeking
              fresh local dairy, Milk Market is here for you.
            </p>
            <div className="flex flex-wrap items-center justify-center gap-4">
              <Link href="/marketplace">
                <button className={PRIMARYBUTTONCLASSNAMES}>
                  Browse Marketplace
                </button>
              </Link>
              <Link href="/producers">
                <button className={WHITEBUTTONCLASSNAMES}>Start Selling</button>
              </Link>
              <Link href="/contact">
                <button className={WHITEBUTTONCLASSNAMES}>Contact Us</button>
              </Link>
            </div>
          </section>
        </div>
      </div>
    </>
  );
}
