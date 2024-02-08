import Head from "next/head";
import Image from "next/image";
import { useTheme } from "next-themes";
import { Card, Divider, Text, Link } from "@nextui-org/react";

export default function LandingPage() {
  const { theme, setTheme } = useTheme();

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
      <div className="flex flex-1 flex-col items-center justify-center bg-light-bg px-20 text-center dark:bg-dark-bg">
        <div className="flex-none">
          <Image src="/shopstr.png" alt="Shopstr Logo" width={128} height={128} />
        </div>
        <div className="text-6xl text-shopstr-purple-light dark:text-shopstr-yellow-light">
          <div>Buy and sell</div>
          <div>anything, anywhere, anytime.</div>
        </div>
        <p className="mt-3 text-2xl text-black dark:text-white">
          Shop and sell freely and anonymously with Bitcoin.
        </p>
        <div className="mt-6 flex w-full flex-wrap justify-around sm:w-5/6">
          <div className="flex flex-1 items-center">
            <div className="flex-none mr-4">
              <Image src="/global-marketplace.png" alt="Global Marketplace" width={96} height={36} />
            </div>
            <div className="flex-auto">
              <Link
                href="/home"
                target="_blank"
                rel="noopener noreferrer"
                className="text-shopstr-purple-light dark:text-shopstr-yellow-light"
              >
                <p className="text-2xl">
                  Explore &rarr;
                </p>
              </Link>
              <p className="text-black dark:text-white">
                Discover items from all around the world.
              </p>
            </div>
          </div>
          <Divider className="my-4" />
          <div className="flex flex-1 items-center">
            <div className="flex-auto">
              <Link
                href="/home"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 text-shopstr-purple-light dark:text-shopstr-yellow-light"
              >
                <p className="text-2xl">
                  Sell &rarr;
                </p>
              </Link>
              <p className="text-black dark:text-white">
                List your items and start earning with no hassle.
              </p>
            </div>
            <div className="flex-none ml-4">
              <Image src="/bitcoin.png" alt="Bitcoin Logo" width={128} height={48} />
            </div>
          </div>
          <Divider className="my-4" />
          <div className="flex flex-1 items-center">
            <div className="flex-none mr-4">
              <Image src="/cashu.png" alt="Cashu Logo" width={64} height={24} />
            </div>
            <div className="flex-auto">
              <Link
                href="https://cashu.space/"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 text-shopstr-purple-light dark:text-shopstr-yellow-light"
              >
                <p className="text-2xl">
                  Privacy &rarr;
                </p>
              </Link>
              <p className="text-black dark:text-white">
                Maintain anonymity while you transact, empowered by Cashu.
              </p>
            </div>
          </div>
          <Divider className="my-4" />
          <div className="flex flex-1 items-center">
            <div className="flex-auto">
              <Link
                href="https://nostr.com/"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 text-shopstr-purple-light dark:text-shopstr-yellow-light"
              >
                <p className="text-2xl">
                  Decentralization &rarr;
                </p>
              </Link>
              <p className="text-black dark:text-white">
                Listings and transactions are uncensorable and fully controlled by
                you thanks to the Nostr protocol.
              </p>
            </div>
            <div className="flex-none ml-4">
              {theme === "dark" ? (
                <Image
                  src="/nostr-logo-dark.png"
                  alt="Nostr Logo"
                  width={64}
                  height={24}
                />
              ) : (
                <Image
                  src="/nostr-logo.png"
                  alt="Nostr Logo"
                  width={64}
                  height={24}
                />
              )}
            </div>
          </div>
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
            {theme === "dark" ? (
              <Image
                src="/github-mark-white.png"
                alt="GitHub Logo"
                layout="fill"
                objectFit="contain"
              />
            ) : (
              <Image
                src="/github-mark.png"
                alt="GitHub Logo"
                layout="fill"
                objectFit="contain"
              />
            )}
          </span>
        </Link>
        <Link
          href="https://njump.me/npub15dc33fyg3cpd9r58vlqge2hh8dy6hkkrjxkhluv2xpyfreqkmsesesyv6e"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-center gap-2"
        >
          <span className="relative h-8 w-16">
            {theme === "dark" ? (
              <Image
                src="/shaka-dark.png"
                alt="Nostr Shaka"
                layout="fill"
                objectFit="contain"
              />
            ) : (
              <Image
                src="/shaka-light.png"
                alt="Nostr Shaka"
                layout="fill"
                objectFit="contain"
              />
            )}
          </span>
        </Link>
      </footer>
    </div>
  );
}
