import Head from "next/head";
import Image from "next/image";
import { Card, Divider, Text, Link } from "@nextui-org/react";
export default function LandingPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center py-2">
      <Head>
        <title>Shopstr</title>
        <meta
          name="description"
          content="Buy and sell anything, anywhere, anytime."
        />

        <meta property="og:url" content="https://shopstr.store" />
        <meta property="og:type" content="website" />
        <meta property="og:title" content="Shopstr" />
        <meta
          property="og:description"
          content="Buy and sell anything, anywhere, anytime."
        />
        <meta property="og:image" content="/shopstr.png" />

        <meta name="twitter:card" content="summary_large_image" />
        <meta property="twitter:domain" content="shopstr.store" />
        <meta property="twitter:url" content="https://shopstr.store" />
        <meta name="twitter:title" content="Shopstr" />
        <meta
          name="twitter:description"
          content="Buy and sell anything, anywhere, anytime."
        />
        <meta name="twitter:image" content="/shopstr.png" />
      </Head>
      <div className="flex flex-1 flex-col items-center justify-center px-20 text-center bg-light-bg dark:bg-dark-bg">
        <h1 className="text-6xl text-shopstr-purple-light dark:text-shopstr-yellow-light">
          Buy and sell anything, anywhere, anytime.
        </h1>
        <p className="mt-3 text-2xl text-shopstr-purple-light dark:text-shopstr-yellow-light">
          Shop and sell freely and anonymously with Bitcoin.
        </p>
        <div className="mt-6 flex w-full flex-wrap justify-around sm:w-5/6">
          <Card
            clickable
            bordered
            shadow={false}
            className="m-4 flex max-w-sm flex-col p-6"
          >
            <Link
              href="/home"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 text-shopstr-purple-light dark:text-shopstr-yellow-light"
            >
              <p h2 css={{ m: 0 }}>
                Explore &rarr;
              </p>
            </Link>
            <p>
              Discover items from all around the world, available for purchase
              with Bitcoin.
            </p>
          </Card>
          <Divider className="my-4" />
          <Card
            clickable
            bordered
            shadow={false}
            className="m-4 flex max-w-sm flex-col p-6"
          >
            <Link
              href="/home"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 text-shopstr-purple-light dark:text-shopstr-yellow-light"
            >
              <p h2 css={{ m: 0 }}>
                Sell &rarr;
              </p>
            </Link>
            <p>
              List your own items on the marketplace easily and with no hassle.
            </p>
          </Card>
          <Divider className="my-4" />
          <Card
            clickable
            bordered
            shadow={false}
            className="m-4 flex max-w-sm flex-col p-6"
          >
            <Link
              href="https://cashu.space/"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 text-shopstr-purple-light dark:text-shopstr-yellow-light"
            >
              <p h2 css={{ m: 0 }}>
                Privacy &rarr;
              </p>
            </Link>
            <p>Maintain anonymity while you transact, empowered by Cashu.</p>
          </Card>
          <Divider className="my-4" />
          <Card
            clickable
            bordered
            shadow={false}
            className="m-4 flex max-w-sm flex-col p-6"
          >
            <Link
              href="https://nostr.com/"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 text-shopstr-purple-light dark:text-shopstr-yellow-light"
            >
              <p h2 css={{ m: 0 }}>
                Decentralization &rarr;
              </p>
            </Link>
            <p>
              Listings and transactions are uncensorable and fully controlled by
              you thanks to the Nostr protocol.
            </p>
          </Card>
        </div>
      </div>
      <footer className="flex h-24 w-full items-center justify-center bg-light-bg dark:bg-dark-bg">
        <Link
          href="https://github.com/shopstr-eng/shopstr"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-center gap-2"
        >
          <span className="relative h-6 w-16">
            <Image
              src="/github-mark.png"
              alt="GitHub Logo"
              layout="fill"
              objectFit="contain"
            />
          </span>
        </Link>
        <Link
          href="https://github.com/shopstr-eng/shopstr"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-center gap-2"
        >
          <span className="relative h-8 w-16">
            <Image
              src="/nostr-icon-purple.png"
              alt="GitHub Logo"
              layout="fill"
              objectFit="contain"
            />
          </span>
        </Link>
      </footer>
    </div>
  );
}
