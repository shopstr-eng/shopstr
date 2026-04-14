import { Button, Image, useDisclosure } from "@heroui/react";
import SignInModal from "@/components/sign-in/SignInModal";
import {
  ArrowUpRightIcon,
  UserGroupIcon,
  ShieldCheckIcon,
  BoltIcon,
  UserCircleIcon,
  ShoppingCartIcon,
} from "@heroicons/react/24/outline";
import { useRouter } from "next/router";
import { SHOPSTRBUTTONCLASSNAMES } from "@/utils/STATIC-VARIABLES";
import { useContext, useEffect, useState } from "react";
import { motion } from "framer-motion";
import { ProductContext } from "@/utils/context/context";
import ProductCard from "@/components/utility-components/product-card";
import parseTags, {
  ProductData,
} from "@/utils/parsers/product-parser-functions";
import { SignerContext } from "@/components/utility-components/nostr-context-provider";
import Link from "next/link";
import { nip19 } from "nostr-tools";
import { NostrEvent } from "@/utils/types/types";

export default function Landing() {
  const router = useRouter();
  const { isOpen, onOpen, onClose } = useDisclosure();
  const [isSellerFlow, setIsSellerFlow] = useState(false);
  const productEventContext = useContext(ProductContext);

  const [parsedProducts, setParsedProducts] = useState<ProductData[]>([]);
  const [listingCount, setListingCount] = useState<number | null>(null);
  const [sellerCount, setSellerCount] = useState<number | null>(null);
  const productEventsLength = productEventContext.productEvents.length;

  const signerContext = useContext(SignerContext);

  useEffect(() => {
    fetch("/api/db/marketplace-stats", { cache: "no-store" })
      .then((r) => r.json())
      .then((data) => {
        if (typeof data.listingCount === "number")
          setListingCount(data.listingCount);
        if (typeof data.sellerCount === "number")
          setSellerCount(data.sellerCount);
      })
      .catch((error) => {
        console.error("Failed to fetch marketplace stats:", error);
      });
  }, [productEventsLength]);
  useEffect(() => {
    if (router.pathname === "/" && signerContext.isLoggedIn) {
      router.push("/marketplace");
    }
  }, [router.pathname, signerContext]);

  useEffect(() => {
    const parsedProductsArray: ProductData[] = [];
    const products = productEventContext.productEvents;
    products.forEach((product: NostrEvent) => {
      const parsedProduct = parseTags(product) as ProductData;
      if (
        parsedProduct.images.length > 0 &&
        parsedProduct.currency &&
        !parsedProduct.contentWarning
      ) {
        parsedProductsArray.push(parsedProduct);
      }
    });
    setParsedProducts(parsedProductsArray);
  }, [productEventContext.productEvents]);

  return (
    <div className="bg-light-bg from-light-bg to-light-fg dark:bg-dark-bg dark:from-dark-bg dark:to-dark-fg min-h-screen w-full bg-gradient-to-b">
      {/* Hero Section */}
      <div className="bg-pattern-grid pointer-events-none absolute inset-0 opacity-5"></div>
      <section className="container mx-auto flex flex-col items-center justify-center px-4 pt-28 pb-24 text-center">
        <div className="relative mb-8">
          <Image
            alt="Shopstr logo"
            height={120}
            width={120}
            src="/shopstr-2000x2000.png"
            className="relative z-10"
          />
          <div className="from-shopstr-purple/20 to-shopstr-yellow/20 dark:from-shopstr-yellow/20 dark:to-shopstr-purple/20 absolute -inset-4 -z-10 rounded-full bg-gradient-to-r opacity-70 blur-xl"></div>
        </div>
        <h1 className="from-shopstr-purple to-shopstr-purple/80 text-shopstr-purple dark:from-shopstr-yellow dark:to-shopstr-yellow/80 dark:text-shopstr-yellow mb-4 bg-gradient-to-r bg-clip-text text-4xl font-bold text-transparent md:text-5xl lg:text-6xl">
          Sell anything. Get paid in Bitcoin.
          <br className="hidden sm:block" /> No bans, no fees, no middlemen.
        </h1>
        <p className="text-light-text dark:text-dark-text mb-3 max-w-2xl text-xl leading-relaxed font-light">
          Traditional marketplaces freeze accounts, take cuts, and demand ID.
          Shopstr gives the power back to you.
        </p>
        <p className="text-shopstr-purple dark:text-shopstr-yellow mb-8 text-sm font-semibold tracking-wide uppercase">
          No account suspension possible · Your keys, your shop
        </p>
        <div className="flex flex-col items-center gap-4 sm:flex-row">
          <Button
            className={`${SHOPSTRBUTTONCLASSNAMES} flex items-center gap-2 px-10 py-7 text-lg shadow-lg transition-all duration-300 hover:shadow-xl md:px-12 md:text-xl`}
            onClick={() => router.push("/marketplace")}
            startContent={<ShoppingCartIcon className="mr-2 h-6 w-6" />}
          >
            Start Shopping
          </Button>
          <button
            onClick={() => {
              setIsSellerFlow(true);
              onOpen();
            }}
            className="text-shopstr-purple dark:text-shopstr-yellow flex items-center gap-1.5 text-lg font-medium underline-offset-4 hover:underline"
          >
            Start Selling
            <ArrowUpRightIcon className="h-5 w-5" />
          </button>
        </div>
        <p className="text-light-text/50 dark:text-dark-text/50 mt-6 text-sm">
          Free to use · No KYC · Self-custodial payments · Open source
        </p>
      </section>
      {/* Product Carousel */}
      <section className="bg-light-fg/80 dark:bg-dark-fg/80 w-full overflow-hidden py-12 backdrop-blur-sm">
        <h2 className="text-light-text dark:text-dark-text mb-8 text-center text-2xl font-bold">
          Latest Products
        </h2>
        <div className="mx-auto max-w-[95vw]">
          <motion.div
            className="flex"
            animate={{
              x: ["0%", "-210%"],
            }}
            transition={{
              duration: 30,
              repeat: Infinity,
              ease: "linear",
              restSpeed: 0.001,
              restDelta: 0.001,
            }}
          >
            <div className="flex gap-4 md:gap-8">
              {parsedProducts.slice(0, 21).map((product, index) => (
                <div
                  key={`${product.id}-${index}`}
                  className="min-w-[270px] transform transition-transform duration-300 hover:scale-105 md:min-w-[300px]"
                >
                  <ProductCard
                    key={product.id + "-" + index}
                    productData={product}
                    onProductClick={() =>
                      router.push(
                        `/listing/${nip19.naddrEncode({
                          identifier: product.d as string,
                          pubkey: product.pubkey,
                          kind: 30402,
                        })}`
                      )
                    }
                  />
                </div>
              ))}
            </div>
          </motion.div>
        </div>
      </section>

      {/* Features Grid */}
      <section className="container mx-auto px-4 py-24">
        <div className="mb-16 text-center">
          <p className="text-shopstr-purple dark:text-shopstr-yellow mb-3 text-sm font-semibold tracking-widest uppercase">
            The Problem
          </p>
          <h2 className="text-light-text dark:text-dark-text mb-6 text-3xl font-bold md:text-4xl">
            Your shop got suspended. Your funds got frozen.{" "}
            <span className="text-shopstr-purple dark:text-shopstr-yellow">
              You paid 15% fees on every sale.
            </span>
          </h2>
          <p className="text-light-text/80 dark:text-dark-text/80 mx-auto max-w-2xl text-lg">
            Shopstr was built because this kept happening. Here is what is
            different.
          </p>
        </div>
        <div className="grid gap-6 sm:gap-8 md:grid-cols-2 lg:grid-cols-3 lg:gap-10">
          {/* Feature 1 */}
          <div className="group bg-light-fg hover:border-shopstr-purple/20 dark:bg-dark-fg dark:hover:border-shopstr-yellow/20 rounded-xl border border-transparent p-6 shadow-lg transition-all duration-300 hover:shadow-xl md:p-8">
            <div className="mb-5 flex flex-col items-center">
              <div className="bg-shopstr-purple/10 dark:bg-shopstr-yellow/10 rounded-full p-3">
                <ShieldCheckIcon className="text-shopstr-purple dark:text-shopstr-yellow h-8 w-8" />
              </div>
              <h3 className="text-shopstr-purple dark:text-shopstr-yellow mt-3 text-center text-xl font-semibold transition-transform duration-300 group-hover:translate-x-1 md:text-2xl">
                <span className="block">No Account</span>
                <span className="block">Suspensions</span>
              </h3>
            </div>
            <p className="text-light-text dark:text-dark-text text-center leading-relaxed">
              Your shop cannot be banned, frozen, or deplatformed. Built on{" "}
              <Link href="https://nostr.com" passHref legacyBehavior>
                <a
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-shopstr-purple dark:text-shopstr-yellow underline decoration-dotted hover:decoration-solid"
                >
                  Nostr
                </a>
              </Link>
              , you hold your store keys — no company can take them from you.
            </p>
          </div>

          {/* Feature 2 */}
          <div className="group bg-light-fg hover:border-shopstr-purple/20 dark:bg-dark-fg dark:hover:border-shopstr-yellow/20 rounded-xl border border-transparent p-6 shadow-lg transition-all duration-300 hover:shadow-xl md:p-8">
            <div className="mb-5 flex flex-col items-center">
              <div className="bg-shopstr-purple/10 dark:bg-shopstr-yellow/10 rounded-full p-3">
                <BoltIcon className="text-shopstr-purple dark:text-shopstr-yellow h-8 w-8" />
              </div>
              <h3 className="text-shopstr-purple dark:text-shopstr-yellow mt-3 text-center text-xl font-semibold transition-transform duration-300 group-hover:translate-x-1 md:text-2xl">
                <span className="block">Get Paid</span>
                <span className="block">Instantly</span>
              </h3>
            </div>
            <p className="text-light-text dark:text-dark-text text-center leading-relaxed">
              Bitcoin settles in under a second via{" "}
              <Link href="https://lightning.network" passHref legacyBehavior>
                <a
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-shopstr-purple dark:text-shopstr-yellow underline decoration-dotted hover:decoration-solid"
                >
                  Lightning
                </a>
              </Link>{" "}
              or{" "}
              <Link href="https://cashu.space" passHref legacyBehavior>
                <a
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-shopstr-purple dark:text-shopstr-yellow underline decoration-dotted hover:decoration-solid"
                >
                  Cashu
                </a>
              </Link>
              . No waiting periods, no chargebacks, no payment processor
              approval.
            </p>
          </div>

          {/* Feature 3 */}
          <div className="group bg-light-fg hover:border-shopstr-purple/20 dark:bg-dark-fg dark:hover:border-shopstr-yellow/20 rounded-xl border border-transparent p-6 shadow-lg transition-all duration-300 hover:shadow-xl md:p-8">
            <div className="mb-5 flex flex-col items-center">
              <div className="bg-shopstr-purple/10 dark:bg-shopstr-yellow/10 rounded-full p-3">
                <UserCircleIcon className="text-shopstr-purple dark:text-shopstr-yellow h-8 w-8" />
              </div>
              <h3 className="text-shopstr-purple dark:text-shopstr-yellow mt-3 text-center text-xl font-semibold transition-transform duration-300 group-hover:translate-x-1 md:text-2xl">
                <span className="block">Your Business</span>
                <span className="block">is Private</span>
              </h3>
            </div>
            <p className="text-light-text dark:text-dark-text text-center leading-relaxed">
              No transaction surveillance. No third party watches your sales.
              Your data is encrypted and stored on{" "}
              <Link href="https://nostr.how/en/relays" passHref legacyBehavior>
                <a
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-shopstr-purple dark:text-shopstr-yellow underline decoration-dotted hover:decoration-solid"
                >
                  relays you choose
                </a>
              </Link>
              .
            </p>
          </div>
        </div>
      </section>

      {/* About Shopstr — GEO Content */}
      <section className="container mx-auto px-4 py-20">
        <div className="mx-auto max-w-4xl">
          <h2 className="text-light-text dark:text-dark-text mb-8 text-center text-3xl font-bold md:text-4xl">
            About{" "}
            <span className="text-shopstr-purple dark:text-shopstr-yellow">
              Shopstr
            </span>
          </h2>
          <div className="text-light-text dark:text-dark-text space-y-6 text-lg leading-relaxed">
            <p>
              Shopstr is a marketplace built on{" "}
              <Link href="https://nostr.com" passHref legacyBehavior>
                <a
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-shopstr-purple dark:text-shopstr-yellow underline decoration-dotted hover:decoration-solid"
                >
                  Nostr
                </a>
              </Link>{" "}
              — an open protocol that no company controls. You do not need an
              account, ID, or anyone&apos;s permission to buy or sell. Your
              listings live on a decentralized network and cannot be taken down.
            </p>
            <p>
              Buyers pay with Bitcoin via the{" "}
              <Link href="https://lightning.network" passHref legacyBehavior>
                <a
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-shopstr-purple dark:text-shopstr-yellow underline decoration-dotted hover:decoration-solid"
                >
                  Lightning Network
                </a>
              </Link>{" "}
              or{" "}
              <Link href="https://cashu.space" passHref legacyBehavior>
                <a
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-shopstr-purple dark:text-shopstr-yellow underline decoration-dotted hover:decoration-solid"
                >
                  Cashu
                </a>
              </Link>
              . Money goes directly from buyer to seller — no platform holds
              your funds, no chargeback is possible, and no mandatory fee is
              taken. Shopstr is{" "}
              <Link
                href="https://github.com/shopstr-eng/shopstr"
                passHref
                legacyBehavior
              >
                <a
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-shopstr-purple dark:text-shopstr-yellow underline decoration-dotted hover:decoration-solid"
                >
                  fully open source
                </a>
              </Link>
              .
            </p>
          </div>
        </div>
      </section>

      {/* Statistics Block */}
      <section className="bg-light-fg/60 dark:bg-dark-fg/60 w-full px-4 py-16">
        <div className="container mx-auto">
          <h2 className="text-light-text dark:text-dark-text mb-10 text-center text-2xl font-bold md:text-3xl">
            Shopstr by the{" "}
            <span className="text-shopstr-purple dark:text-shopstr-yellow">
              Numbers
            </span>
          </h2>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            <div className="bg-light-fg dark:bg-dark-fg rounded-xl p-6 text-center shadow-md">
              <p className="text-shopstr-purple dark:text-shopstr-yellow text-3xl font-bold">
                {listingCount === null ? "…" : listingCount.toLocaleString()}
              </p>
              <p className="text-light-text dark:text-dark-text mt-2 text-sm">
                Active listings on Shopstr right now
              </p>
            </div>
            <div className="bg-light-fg dark:bg-dark-fg rounded-xl p-6 text-center shadow-md">
              <p className="text-shopstr-purple dark:text-shopstr-yellow text-3xl font-bold">
                {sellerCount === null ? "…" : sellerCount.toLocaleString()}
              </p>
              <p className="text-light-text dark:text-dark-text mt-2 text-sm">
                Sellers with active shops on Shopstr
              </p>
            </div>
            <div className="bg-light-fg dark:bg-dark-fg rounded-xl p-6 text-center shadow-md">
              <p className="text-shopstr-purple dark:text-shopstr-yellow text-3xl font-bold">
                13M+ sats
              </p>
              <p className="text-light-text dark:text-dark-text mt-2 text-sm">
                Total sales volume on the platform
              </p>
            </div>
            <div className="bg-light-fg dark:bg-dark-fg rounded-xl p-6 text-center shadow-md">
              <p className="text-shopstr-purple dark:text-shopstr-yellow text-3xl font-bold">
                $0 Fees
              </p>
              <p className="text-light-text dark:text-dark-text mt-2 text-sm">
                No mandatory platform fees — sellers may optionally set a
                donation rate to support the site at their discretion.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Trust Signals */}
      <section className="container mx-auto px-4 py-10">
        <div className="text-light-text/60 dark:text-dark-text/60 mx-auto flex flex-wrap items-center justify-center gap-6 text-sm font-medium md:gap-10">
          <span className="flex items-center gap-2">
            <span className="bg-shopstr-purple dark:bg-shopstr-yellow h-2 w-2 rounded-full"></span>
            Open source &amp; auditable
          </span>
          <span className="flex items-center gap-2">
            <span className="bg-shopstr-purple dark:bg-shopstr-yellow h-2 w-2 rounded-full"></span>
            Self-custodial payments
          </span>
          <span className="flex items-center gap-2">
            <span className="bg-shopstr-purple dark:bg-shopstr-yellow h-2 w-2 rounded-full"></span>
            No KYC or identity verification
          </span>
          <span className="flex items-center gap-2">
            <span className="bg-shopstr-purple dark:bg-shopstr-yellow h-2 w-2 rounded-full"></span>
            Decentralized · no central server
          </span>
          <span className="flex items-center gap-2">
            <span className="bg-shopstr-purple dark:bg-shopstr-yellow h-2 w-2 rounded-full"></span>
            No mandatory platform fees
          </span>
        </div>
      </section>

      {/* How It Works */}
      <section className="from-light-fg/80 to-light-fg dark:from-dark-fg/80 dark:to-dark-fg w-full bg-gradient-to-b px-4 py-24">
        <div className="container mx-auto">
          <h2 className="text-light-text dark:text-dark-text mb-16 text-center text-3xl font-bold md:text-4xl">
            How It{" "}
            <span className="text-shopstr-purple dark:text-shopstr-yellow">
              Works
            </span>
          </h2>
          <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-4 lg:gap-8">
            <div className="group text-center">
              <div className="flex flex-col items-center">
                <div className="bg-shopstr-purple/10 text-shopstr-purple dark:bg-shopstr-yellow/10 dark:text-shopstr-yellow mb-6 flex h-16 w-16 items-center justify-center rounded-full text-2xl font-bold transition-transform duration-300 group-hover:scale-110 md:text-3xl">
                  1
                </div>
                <p className="text-light-text dark:text-dark-text mb-8 md:text-lg">
                  Generate new Nostr keys or sign in with an existing pair
                </p>
                <div className="relative overflow-hidden rounded-xl shadow-lg transition-all duration-300 hover:shadow-xl">
                  <Image
                    alt="Sign in to Shopstr using Nostr cryptographic keys — dark mode"
                    src="/sign-in-step-dark.png"
                    width={250}
                    height={180}
                    loading="lazy"
                    className="mx-auto hidden rounded-xl dark:flex"
                  />
                  <Image
                    alt="Sign in to Shopstr using Nostr cryptographic keys — light mode"
                    src="/sign-in-step-light.png"
                    width={250}
                    height={180}
                    loading="lazy"
                    className="mx-auto flex rounded-xl dark:hidden"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/30 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100"></div>
                </div>
              </div>
            </div>
            <div className="group text-center">
              <div className="flex flex-col items-center">
                <div className="bg-shopstr-purple/10 text-shopstr-purple dark:bg-shopstr-yellow/10 dark:text-shopstr-yellow mb-6 flex h-16 w-16 items-center justify-center rounded-full text-2xl font-bold transition-transform duration-300 group-hover:scale-110 md:text-3xl">
                  2
                </div>
                <p className="text-light-text dark:text-dark-text mb-8 md:text-lg">
                  Set up your profile
                </p>
                <div className="relative mt-6 overflow-hidden rounded-xl shadow-lg transition-all duration-300 hover:shadow-xl">
                  <Image
                    alt="Set up your Shopstr seller profile on Nostr — dark mode"
                    src="/profile-step-dark.png"
                    width={250}
                    height={180}
                    loading="lazy"
                    className="mx-auto hidden rounded-xl dark:flex"
                  />
                  <Image
                    alt="Set up your Shopstr seller profile on Nostr — light mode"
                    src="/profile-step-light.png"
                    width={250}
                    height={180}
                    loading="lazy"
                    className="mx-auto flex rounded-xl dark:hidden"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/30 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100"></div>
                </div>
              </div>
            </div>
            <div className="group text-center">
              <div className="flex flex-col items-center">
                <div className="bg-shopstr-purple/10 text-shopstr-purple dark:bg-shopstr-yellow/10 dark:text-shopstr-yellow mb-6 flex h-16 w-16 items-center justify-center rounded-full text-2xl font-bold transition-transform duration-300 group-hover:scale-110 md:text-3xl">
                  3
                </div>
                <p className="text-light-text dark:text-dark-text mb-8 md:text-lg">
                  List your products
                </p>
                <div className="relative mt-6 overflow-hidden rounded-xl shadow-lg transition-all duration-300 hover:shadow-xl">
                  <Image
                    alt="Create and publish a Bitcoin product listing on Shopstr — dark mode"
                    src="/listing-step-dark.png"
                    width={250}
                    height={180}
                    loading="lazy"
                    className="mx-auto hidden rounded-xl dark:flex"
                  />
                  <Image
                    alt="Create and publish a Bitcoin product listing on Shopstr — light mode"
                    src="/listing-step-light.png"
                    width={250}
                    height={180}
                    loading="lazy"
                    className="mx-auto flex rounded-xl dark:hidden"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/30 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100"></div>
                </div>
              </div>
            </div>
            <div className="group text-center">
              <div className="flex flex-col items-center">
                <div className="bg-shopstr-purple/10 text-shopstr-purple dark:bg-shopstr-yellow/10 dark:text-shopstr-yellow mb-6 flex h-16 w-16 items-center justify-center rounded-full text-2xl font-bold transition-transform duration-300 group-hover:scale-110 md:text-3xl">
                  4
                </div>
                <p className="text-light-text dark:text-dark-text mb-8 md:text-lg">
                  Start buying and selling
                </p>
                <div className="relative mt-6 overflow-hidden rounded-xl shadow-lg transition-all duration-300 hover:shadow-xl">
                  <Image
                    alt="Complete a Bitcoin Lightning Network payment on Shopstr — dark mode"
                    src="/payment-step-dark.png"
                    width={250}
                    height={180}
                    loading="lazy"
                    className="mx-auto hidden rounded-xl dark:flex"
                  />
                  <Image
                    alt="Complete a Bitcoin Lightning Network payment on Shopstr — light mode"
                    src="/payment-step-light.png"
                    width={250}
                    height={180}
                    loading="lazy"
                    className="mx-auto flex rounded-xl dark:hidden"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/30 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100"></div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Mini-FAQ */}
      <section className="container mx-auto px-4 py-16">
        <div className="mx-auto max-w-4xl">
          <h2 className="text-light-text dark:text-dark-text mb-10 text-center text-2xl font-bold md:text-3xl">
            Quick Answers
          </h2>
          <div className="grid gap-6 sm:grid-cols-2">
            {[
              {
                q: "Do I need Bitcoin to get started?",
                a: "Bitcoin is required to make purchases. No external wallet is needed — Shopstr has a built-in wallet ready to use. You can also send funds to an external wallet any time.",
              },
              {
                q: "Can my shop get banned or suspended?",
                a: "No. Shopstr runs on Nostr, a decentralized protocol. No single company controls your listings or your keys — there is nothing to ban.",
              },
              {
                q: "How do I actually get paid?",
                a: "Payment goes directly from the buyer to you via Lightning or Cashu. It is instant, final, and self-custodial — no platform holds your money.",
              },
              {
                q: "Is it really free to use?",
                a: "Yes — no mandatory platform fees. Sellers may optionally set a donation rate to support Shopstr, but it is never required.",
              },
            ].map(({ q, a }, i) => (
              <div
                key={i}
                className="bg-light-fg dark:bg-dark-fg rounded-xl p-6 shadow-sm"
              >
                <p className="text-light-text dark:text-dark-text mb-2 font-semibold">
                  {q}
                </p>
                <p className="text-light-text/75 dark:text-dark-text/75 leading-relaxed">
                  {a}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Call to Action */}
      <section className="container mx-auto flex flex-col items-center justify-center px-4 py-24 text-center">
        <div className="from-shopstr-purple/5 to-shopstr-purple/10 dark:from-shopstr-yellow/5 dark:to-shopstr-yellow/10 max-w-4xl rounded-2xl bg-gradient-to-r p-12 shadow-lg">
          <h2 className="text-light-text dark:text-dark-text mb-4 text-3xl font-bold md:text-4xl">
            Start selling in minutes.{" "}
            <span className="text-shopstr-purple dark:text-shopstr-yellow">
              No account required.
            </span>
          </h2>
          <p className="text-light-text/80 dark:text-dark-text/80 mb-8 max-w-xl text-lg">
            Join buyers and sellers already trading on a marketplace that can
            never be taken away from them.
          </p>
          <Button
            className={`${SHOPSTRBUTTONCLASSNAMES} px-10 py-7 text-lg shadow-lg transition-all duration-300 hover:shadow-xl md:px-12 md:text-xl`}
            onClick={() => router.push("/marketplace")}
            startContent={<UserGroupIcon className="mr-2 h-6 w-6" />}
          >
            Enter the Marketplace
          </Button>
          <p className="text-light-text/50 dark:text-dark-text/50 mt-6 text-sm">
            Free to use · No KYC · Payments settle in seconds
          </p>
        </div>
      </section>

      <SignInModal
        isOpen={isOpen}
        onClose={() => {
          setIsSellerFlow(false);
          onClose();
        }}
        sellerFlow={isSellerFlow}
      />

      {/* Footer */}
      <footer className="bg-light-fg dark:bg-dark-fg w-full px-4 py-8">
        <div className="container mx-auto">
          <div className="mb-6 flex flex-col items-center justify-between md:flex-row">
            <nav className="mb-4 flex flex-wrap items-center gap-6 md:mb-0">
              <Link
                href="/about"
                className="text-light-text hover:text-shopstr-purple dark:text-dark-text dark:hover:text-shopstr-yellow flex items-center gap-1 transition-colors"
              >
                About
                <ArrowUpRightIcon className="h-3 w-3" />
              </Link>
              <Link
                href="/contact"
                className="text-light-text hover:text-shopstr-purple dark:text-dark-text dark:hover:text-shopstr-yellow flex items-center gap-1 transition-colors"
              >
                Contact
                <ArrowUpRightIcon className="h-3 w-3" />
              </Link>
              <Link
                href="/faq"
                className="text-light-text hover:text-shopstr-purple dark:text-dark-text dark:hover:text-shopstr-yellow flex items-center gap-1 transition-colors"
              >
                FAQ
                <ArrowUpRightIcon className="h-3 w-3" />
              </Link>
              <Link
                href="/terms"
                className="text-light-text hover:text-shopstr-purple dark:text-dark-text dark:hover:text-shopstr-yellow flex items-center gap-1 transition-colors"
              >
                Terms
                <ArrowUpRightIcon className="h-3 w-3" />
              </Link>
              <Link
                href="/privacy"
                className="text-light-text hover:text-shopstr-purple dark:text-dark-text dark:hover:text-shopstr-yellow flex items-center gap-1 transition-colors"
              >
                Privacy
                <ArrowUpRightIcon className="h-3 w-3" />
              </Link>
              <div className="flex h-auto items-center gap-6">
                <a
                  href="https://github.com/shopstr-eng/shopstr"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="transition-transform hover:scale-110"
                >
                  <Image
                    src="/github-mark.png"
                    alt="GitHub"
                    width={24}
                    height={24}
                    className="block dark:hidden"
                  />
                  <Image
                    src="/github-mark-white.png"
                    alt="GitHub"
                    width={24}
                    height={24}
                    className="hidden dark:block"
                  />
                </a>
                <a
                  href="https://njump.me/npub15dc33fyg3cpd9r58vlqge2hh8dy6hkkrjxkhluv2xpyfreqkmsesesyv6e"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="transition-transform hover:scale-110"
                >
                  <Image
                    src="/nostr-icon-black-transparent-256x256.png"
                    alt="Nostr"
                    width={32}
                    height={32}
                    className="block dark:hidden"
                  />
                  <Image
                    src="/nostr-icon-white-transparent-256x256.png"
                    alt="Nostr"
                    width={32}
                    height={32}
                    className="hidden dark:block"
                  />
                </a>
              </div>
            </nav>
            <p className="text-light-text dark:text-dark-text">
              © 2025 Shopstr Markets Inc.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
