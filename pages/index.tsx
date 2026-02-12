import { Button } from "@nextui-org/react";
import Image from "next/image";
import {
  ShoppingCartIcon,
  CodeBracketIcon,
  ShieldCheckIcon,
  BoltIcon,
  EyeIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import { useRouter } from "next/router";
import { useContext, useEffect, useState } from "react";
import { ProductContext } from "@/utils/context/context";
import parseTags, {
  ProductData,
} from "@/utils/parsers/product-parser-functions";
import { SignerContext } from "@/components/utility-components/nostr-context-provider";
import Link from "next/link";
import { nip19 } from "nostr-tools";
import { NostrEvent } from "@/utils/types/types";
import { sanitizeUrl } from "@braintree/sanitize-url";
import { NEO_BTN } from "@/utils/STATIC-VARIABLES";

export default function Landing() {
  const router = useRouter();
  const productEventContext = useContext(ProductContext);

  const [parsedProducts, setParsedProducts] = useState<ProductData[]>([]);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);

  const signerContext = useContext(SignerContext);
  useEffect(() => {
    if (router.pathname === "/" && signerContext.isLoggedIn) {
      router.push("/marketplace");
    }
  }, [router, signerContext.isLoggedIn]);

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
    <div className="relative min-h-screen w-full bg-[#111] text-white selection:bg-yellow-400 selection:text-black">
      {/* Background Grid Pattern */}
      <div className="pointer-events-none absolute inset-0 z-0 h-[800px] w-full bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:24px_24px] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)]"></div>

      {/* Navigation */}
      <nav className="container mx-auto flex items-center justify-between px-6 py-6">
        <div className="flex items-center gap-2">
          <Image
            src="/shopstr-2000x2000.png"
            width={40}
            height={40}
            alt="Shopstr"
          />
          <span className="hidden text-xl font-black tracking-tighter text-white sm:block">
            SHOPSTR
          </span>
        </div>
        <div className="hidden items-center gap-8 text-sm font-bold uppercase tracking-wider text-zinc-400 md:flex">
          <Link href="#features" className="hover:text-white">
            Features
          </Link>
          <Link href="/marketplace" className="hover:text-white">
            Market
          </Link>
          <Link href="/faq" className="hover:text-white">
            FAQ
          </Link>
          <div className="flex gap-4 border-l border-zinc-800 pl-8">
            <a
              href="https://github.com/shopstr-eng/shopstr"
              target="_blank"
              rel="noreferrer"
            >
              <Image
                src="/github-mark-white.png"
                width={20}
                height={20}
                alt="Github"
                className="opacity-60 hover:opacity-100"
              />
            </a>
            <a
              href="https://x.com/shopstrmarkets"
              target="_blank"
              rel="noreferrer"
            >
              <Image
                src="/x-logo-white.png"
                width={20}
                height={20}
                alt="X"
                className="opacity-60 hover:opacity-100"
              />
            </a>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="container relative z-10 mx-auto flex flex-col items-center justify-center px-4 py-24 text-center">
        <div className="mb-8 inline-block rounded-full border border-yellow-400/30 bg-yellow-400/5 px-6 py-2 text-xs font-bold uppercase tracking-[0.2em] text-yellow-400 shadow-[0_0_15px_rgba(250,204,21,0.1)]">
          The Future of Commerce
        </div>
        <h1 className="mb-6 text-5xl font-black uppercase tracking-tighter text-white [text-shadow:4px_4px_0px_#45320b] md:text-7xl md:[text-shadow:6px_6px_0px_#45320b] lg:text-9xl">
          Shopstr
        </h1>
        <p className="mb-12 max-w-2xl text-xl font-medium text-zinc-400 md:text-2xl">
          Buy and sell{" "}
          <span className="rounded bg-[#710682] px-2 py-0.5 text-white shadow-sm">
            anything
          </span>
          ,{" "}
          <span className="rounded bg-[#710682] px-2 py-0.5 text-white shadow-sm">
            anywhere
          </span>
          ,{" "}
          <span className="rounded bg-[#710682] px-2 py-0.5 text-white shadow-sm">
            anytime
          </span>
          .
        </p>
        <div className="flex flex-col gap-4 sm:flex-row">
          <Button
            className={`${NEO_BTN} h-14 px-8 text-sm`}
            onClick={() => router.push("/marketplace")}
            startContent={<ShoppingCartIcon className="h-5 w-5" />}
          >
            Start Shopping
          </Button>
          <Button
            className={`${NEO_BTN} h-14 border-white bg-transparent px-8 text-sm text-white hover:bg-white hover:text-black`}
            onClick={() =>
              window.open("https://github.com/shopstr-eng/shopstr", "_blank")
            }
            startContent={<CodeBracketIcon className="h-5 w-5" />}
          >
            View Code
          </Button>
        </div>
      </section>

      {/* Features Grid */}
      <section id="features" className="container mx-auto px-4 py-24">
        <div className="mb-16 text-center">
          <h2 className="text-3xl font-black text-white md:text-5xl">
            Why Choose Shopstr?
          </h2>
          <div className="mx-auto mt-4 h-1.5 w-24 rounded-full bg-yellow-400"></div>
        </div>

        <div className="grid gap-6 md:grid-cols-3">
          {/* Feature 1 */}
          <div className="group rounded-2xl border border-zinc-800 bg-[#161616] p-8 transition-colors hover:border-zinc-700">
            <div className="mb-6 inline-block rounded-xl border border-yellow-400/20 bg-yellow-400/10 p-3">
              <ShieldCheckIcon className="h-8 w-8 text-yellow-400" />
            </div>
            <h3 className="mb-3 text-lg font-bold uppercase tracking-wider text-yellow-400">
              Permissionless
            </h3>
            <p className="leading-relaxed text-zinc-400">
              Built on{" "}
              <a
                href="https://nostr.com"
                target="_blank"
                rel="noreferrer"
                className="font-bold text-white underline decoration-yellow-400 decoration-2 transition-colors hover:text-yellow-400"
              >
                Nostr
              </a>{" "}
              to buy and sell without restrictions or central authority. Your
              keys, your shop.
            </p>
          </div>

          {/* Feature 2 */}
          <div className="group rounded-2xl border border-zinc-800 bg-[#161616] p-8 transition-colors hover:border-zinc-700">
            <div className="mb-6 inline-block rounded-xl border border-yellow-400/20 bg-yellow-400/10 p-3">
              <BoltIcon className="h-8 w-8 text-yellow-400" />
            </div>
            <h3 className="mb-3 text-lg font-bold uppercase tracking-wider text-yellow-400">
              Bitcoin Native
            </h3>
            <p className="leading-relaxed text-zinc-400">
              Secure transactions using{" "}
              <a
                href="https://lightning.network"
                target="_blank"
                rel="noreferrer"
                className="font-bold text-white underline decoration-yellow-400 decoration-2 transition-colors hover:text-yellow-400"
              >
                Lightning
              </a>{" "}
              and{" "}
              <a
                href="https://cashu.space"
                target="_blank"
                rel="noreferrer"
                className="font-bold text-white underline decoration-yellow-400 decoration-2 transition-colors hover:text-yellow-400"
              >
                Cashu
              </a>
              . Instant, low-fee global payments.
            </p>
          </div>

          {/* Feature 3 */}
          <div className="group rounded-2xl border border-zinc-800 bg-[#161616] p-8 transition-colors hover:border-zinc-700">
            <div className="mb-6 inline-block rounded-xl border border-yellow-400/20 bg-yellow-400/10 p-3">
              <EyeIcon className="h-8 w-8 text-yellow-400" />
            </div>
            <h3 className="mb-3 text-lg font-bold uppercase tracking-wider text-yellow-400">
              Privacy First
            </h3>
            <p className="leading-relaxed text-zinc-400">
              No purchases or sales are viewable by any third party. Your data
              is encrypted and stored on your selected relays.
            </p>
          </div>
        </div>
      </section>

      {/* Latest Products */}
      <section className="border-y border-zinc-900 bg-[#0a0a0a] py-24">
        <div className="container mx-auto px-4">
          <div className="mb-12 flex items-end justify-between">
            <div>
              <h2 className="mb-2 text-3xl font-black text-white md:text-4xl">
                Latest Products
              </h2>
              <p className="text-xs font-bold uppercase tracking-widest text-zinc-500">
                Fresh from the network
              </p>
            </div>
            <Link
              href="/marketplace"
              className="flex items-center gap-1 text-sm font-bold text-yellow-400 hover:text-yellow-300"
            >
              VIEW ALL <span className="text-lg">→</span>
            </Link>
          </div>

          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {parsedProducts.slice(0, 4).map((product) => (
              <div
                key={product.id}
                className="group relative overflow-hidden rounded-2xl border border-zinc-800 bg-[#161616] transition-all hover:-translate-y-1 hover:border-zinc-600 hover:shadow-2xl"
              >
                {/* Image Placeholder area */}
                <div className="relative h-48 w-full bg-[#1a1a1a]">
                  {product.images[0] && (
                    <img
                      src={sanitizeUrl(product.images[0])}
                      alt={product.title}
                      className="h-full w-full object-cover opacity-80 transition-opacity group-hover:opacity-100"
                    />
                  )}
                  <div className="absolute right-2 top-2 rounded bg-yellow-400 px-2 py-1 text-xs font-bold text-black shadow-lg">
                    {product.price} {product.currency}
                  </div>
                </div>

                <div className="p-5">
                  <h3 className="mb-1 line-clamp-1 text-lg font-bold text-white">
                    {product.title}
                  </h3>
                  <p className="mb-6 truncate text-xs text-zinc-500">
                    {nip19.npubEncode(product.pubkey).slice(0, 12)}...
                  </p>

                  <button
                    className="w-full rounded-lg border border-white/20 py-3 text-xs font-bold uppercase tracking-wider text-white transition-colors hover:bg-white hover:text-black"
                    onClick={() =>
                      router.push(
                        `/listing/${nip19.naddrEncode({
                          identifier: product.d as string,
                          pubkey: product.pubkey,
                          kind: 30402,
                        })}`
                      )
                    }
                  >
                    View <span className="ml-1">→</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="container mx-auto px-4 py-24">
        <div className="mb-16 text-center">
          <span className="mb-2 inline-block rounded-md bg-white px-2 py-1 text-[10px] font-bold uppercase tracking-widest text-black">
            Simple Process
          </span>
          <h2 className="text-4xl font-black text-white md:text-5xl">
            How It Works
          </h2>
        </div>

        <div className="mx-auto max-w-5xl">
          <div className="grid gap-12">
            {/* Step 1 */}
            <div className="grid items-center gap-8 md:grid-cols-2">
              <div>
                <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-yellow-400 text-xl font-bold text-black">
                  1
                </div>
                <h3 className="mb-2 text-2xl font-bold text-white">
                  Generate Identity
                </h3>
                <p className="text-zinc-400">
                  Generate new Nostr keys or sign in with an existing pair
                  (NSEC/NPUB). This is your portable reputation.
                </p>
              </div>
              <div
                className="group cursor-pointer rounded-2xl border border-zinc-800 bg-[#161616] p-4 transition-all hover:border-zinc-600 hover:shadow-2xl"
                onClick={() => setSelectedImage("/sign-in-step-dark.png")}
              >
                <Image
                  src="/sign-in-step-dark.png"
                  width={500}
                  height={300}
                  alt="Step 1"
                  className="h-auto w-full rounded-xl opacity-80"
                />
              </div>
            </div>

            {/* Step 2 */}
            <div className="grid items-center gap-8 md:grid-cols-2">
              <div>
                <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-yellow-400 text-xl font-bold text-black">
                  2
                </div>
                <h3 className="mb-2 text-2xl font-bold text-white">
                  Set Profile
                </h3>
                <p className="text-zinc-400">
                  Set up your user profile. Add a picture, bio, and lightning
                  address to start receiving funds.
                </p>
              </div>
              <div
                className="group cursor-pointer rounded-2xl border border-zinc-800 bg-[#161616] p-4 transition-all hover:border-zinc-600 hover:shadow-2xl"
                onClick={() => setSelectedImage("/profile-step-dark.png")}
              >
                <Image
                  src="/profile-step-dark.png"
                  width={500}
                  height={300}
                  alt="Step 2"
                  className="h-auto w-full rounded-xl opacity-80"
                />
              </div>
            </div>

            {/* Step 3 */}
            <div className="grid items-center gap-8 md:grid-cols-2">
              <div>
                <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-yellow-400 text-xl font-bold text-black">
                  3
                </div>
                <h3 className="mb-2 text-2xl font-bold text-white">
                  List Products
                </h3>
                <p className="text-zinc-400">
                  Create listings with images, descriptions, and prices in Sats.
                  Your shop is now live on the relay network.
                </p>
              </div>
              <div
                className="group cursor-pointer rounded-2xl border border-zinc-800 bg-[#161616] p-4 transition-all hover:border-zinc-600 hover:shadow-2xl"
                onClick={() => setSelectedImage("/listing-step-dark.png")}
              >
                <Image
                  src="/listing-step-dark.png"
                  alt="Step 3"
                  width={500}
                  height={300}
                  className="h-auto w-full rounded-xl opacity-80"
                />
              </div>
            </div>

            {/* Step 4 */}
            <div className="grid items-center gap-8 md:grid-cols-2">
              <div>
                <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-yellow-400 text-xl font-bold text-black">
                  4
                </div>
                <h3 className="mb-2 text-2xl font-bold text-white">
                  Start Trading
                </h3>
                <p className="text-zinc-400">
                  Buy and sell instantly. Communicate via encrypted DMs and
                  settle payments over the Lightning Network.
                </p>
              </div>
              <div
                className="group cursor-pointer rounded-2xl border border-zinc-800 bg-[#161616] p-4 transition-all hover:border-zinc-600 hover:shadow-2xl"
                onClick={() => setSelectedImage("/payment-step-dark.png")}
              >
                <Image
                  src="/payment-step-dark.png"
                  alt="Step 4"
                  width={500}
                  height={300}
                  className="h-auto w-full rounded-xl opacity-80"
                />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Call to Action */}
      <section className="bg-[#1a1915] py-24 text-center">
        <h2 className="mb-4 text-4xl font-black text-white md:text-5xl">
          Ready to be a part of the
        </h2>
        <h2 className="mb-10 text-4xl font-black text-yellow-400 md:text-5xl">
          free market?
        </h2>
        <Button
          className={`${NEO_BTN} h-14 px-12 text-sm`}
          onClick={() => router.push("/marketplace")}
        >
          JOIN NOW
        </Button>
      </section>

      {/* Footer */}
      <footer className="border-t border-zinc-900 bg-black py-12">
        <div className="container mx-auto">
          <div className="flex flex-col items-center justify-between gap-8 md:flex-row">
            <div className="flex items-center gap-2">
              <Image
                src="/shopstr-2000x2000.png"
                width={32}
                height={32}
                alt="Shopstr"
              />
              <span className="text-lg font-black tracking-tighter text-white">
                SHOPSTR
              </span>
            </div>

            <div className="flex flex-wrap justify-center gap-6 text-xs font-bold uppercase tracking-wider text-zinc-500 md:gap-8">
              <Link href="/faq" className="hover:text-white">
                FAQ
              </Link>
              <Link href="/terms" className="hover:text-white">
                Terms
              </Link>
              <Link href="/privacy" className="hover:text-white">
                Privacy
              </Link>
              <div className="flex items-center gap-4 border-l border-zinc-800 pl-6 md:pl-8">
                <a
                  href="https://github.com/shopstr-eng/shopstr"
                  target="_blank"
                  rel="noreferrer"
                >
                  <Image
                    src="/github-mark-white.png"
                    width={20}
                    height={20}
                    alt="Github"
                    className="opacity-60 hover:opacity-100"
                  />
                </a>
                <a
                  href="https://njump.me/npub15dc33fyg3cpd9r58vlqge2hh8dy6hkkrjxkhluv2xpyfreqkmsesesyv6e"
                  target="_blank"
                  rel="noreferrer"
                >
                  <Image
                    src="/nostr-icon-white-transparent-256x256.png"
                    width={20}
                    height={20}
                    alt="Nostr"
                    className="opacity-60 hover:opacity-100"
                  />
                </a>
                <a
                  href="https://x.com/shopstrmarkets"
                  target="_blank"
                  rel="noreferrer"
                >
                  <Image
                    src="/x-logo-white.png"
                    width={20}
                    height={20}
                    alt="X"
                    className="opacity-60 hover:opacity-100"
                  />
                </a>
              </div>
            </div>
          </div>

          <div className="mt-8 flex flex-col items-center justify-between gap-4 border-t border-zinc-900 pt-8 text-xs text-zinc-600 md:flex-row">
            <p>© 2025 Shopstr Market Inc.</p>
          </div>
        </div>
      </footer>

      {/* Image Lightbox */}
      {selectedImage && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4 backdrop-blur-sm"
          onClick={() => setSelectedImage(null)}
        >
          <button className="absolute right-6 top-6 text-zinc-400 transition-colors hover:text-white">
            <XMarkIcon className="h-10 w-10" />
          </button>
          <div className="relative max-h-[90vh] max-w-5xl overflow-hidden rounded-2xl border border-zinc-800 bg-[#161616] p-2 shadow-2xl">
            <img
              src={selectedImage}
              alt="Enlarged view"
              className="h-full w-full rounded-xl object-contain"
              onClick={(e) => e.stopPropagation()}
            />
          </div>
        </div>
      )}
    </div>
  );
}
