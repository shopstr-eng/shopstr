import { Button, Image } from "@nextui-org/react";
import { ArrowUpRightIcon } from "@heroicons/react/24/outline";
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
  const productEventContext = useContext(ProductContext);

  const [parsedProducts, setParsedProducts] = useState<ProductData[]>([]);

  const signerContext = useContext(SignerContext);
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
    <div className="min-h-screen w-full bg-light-bg dark:bg-dark-bg">
      {/* Hero Section */}
      <section className="container mx-auto flex flex-col items-center justify-center px-4 pb-16 pt-20 text-center">
        <Image
          alt="Shopstr logo"
          height={100}
          width={100}
          src="/shopstr-2000x2000.png"
          className="mb-6"
        />
        <h1 className="mb-4 text-4xl font-bold text-shopstr-purple dark:text-shopstr-yellow md:text-6xl lg:text-7xl">
          Shop freely.
        </h1>
        <p className="mb-8 max-w-2xl text-xl text-light-text dark:text-dark-text">
          A permissionless marketplace, powered by Nostr and Bitcoin
        </p>
        <Button
          className={`${SHOPSTRBUTTONCLASSNAMES} px-8 py-6 text-lg md:px-12 md:text-xl`}
          onClick={() => router.push("/marketplace")}
        >
          Start Shopping
        </Button>
      </section>

      <section className="w-full overflow-hidden bg-light-fg py-7 dark:bg-dark-fg">
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
                  className="min-w-[250px] md:min-w-[300px]"
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
      <section className="container mx-auto px-4 py-16">
        <h2 className="mb-12 text-center text-2xl font-bold text-light-text dark:text-dark-text md:text-3xl">
          Why Choose Shopstr?
        </h2>
        <div className="grid gap-4 sm:gap-6 md:grid-cols-2 lg:grid-cols-3 lg:gap-8">
          {/* Feature 1 */}
          <div className="rounded-lg bg-light-fg p-4 dark:bg-dark-fg md:p-6">
            <h3 className="mb-3 text-lg font-semibold text-shopstr-purple dark:text-shopstr-yellow md:text-xl">
              Permissionless Commerce
            </h3>
            <p className="text-sm text-light-text dark:text-dark-text md:text-base">
              Built on{" "}
              <Link href="https://njump.me" passHref legacyBehavior>
                <a
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline"
                >
                  Nostr
                </a>
              </Link>{" "}
              to buy and sell without restrictions or central authority. Your
              keys, your shop.
            </p>
          </div>

          {/* Feature 2 */}
          <div className="rounded-lg bg-light-fg p-4 dark:bg-dark-fg md:p-6">
            <h3 className="mb-3 text-lg font-semibold text-shopstr-purple dark:text-shopstr-yellow md:text-xl">
              Bitcoin Native
            </h3>
            <p className="text-sm text-light-text dark:text-dark-text md:text-base">
              Secure transactions using{" "}
              <Link href="https://lightning.network" passHref legacyBehavior>
                <a
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline"
                >
                  Lightning
                </a>
              </Link>{" "}
              and{" "}
              <Link href="https://cashu.space" passHref legacyBehavior>
                <a
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline"
                >
                  Cashu
                </a>
              </Link>
              . Fast, low-fee payments.
            </p>
          </div>

          {/* Feature 3 */}
          <div className="rounded-lg bg-light-fg p-4 dark:bg-dark-fg md:p-6">
            <h3 className="mb-3 text-lg font-semibold text-shopstr-purple dark:text-shopstr-yellow md:text-xl">
              Privacy First
            </h3>
            <p className="text-sm text-light-text dark:text-dark-text md:text-base">
              No purchases or sales are viewable by any third-party. Your data
              is encrypted and stored on your selected{" "}
              <Link href="https://nostr.how/en/relays" passHref legacyBehavior>
                <a
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline"
                >
                  relays
                </a>
              </Link>
              .
            </p>
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="w-full bg-light-fg px-4 py-16 dark:bg-dark-fg">
        <div className="container mx-auto">
          <h2 className="mb-12 text-center text-2xl font-bold text-light-text dark:text-dark-text md:text-3xl">
            How It Works
          </h2>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4 lg:gap-8">
            <div className="text-center">
              <div className="flex flex-col items-center">
                <div className="mb-4 text-2xl font-bold text-shopstr-purple dark:text-shopstr-yellow md:text-3xl">
                  1
                </div>
                <p className="mb-5 text-sm text-light-text dark:text-dark-text md:text-base">
                  Generate new Nostr keys or sign in with an existing pair
                </p>
                <Image
                  alt="Step 1"
                  src="/sign-in-step-dark.png"
                  width={200}
                  height={150}
                  className="mx-auto hidden rounded-lg dark:flex"
                />
                <Image
                  alt="Step 1"
                  src="/sign-in-step-light.png"
                  width={200}
                  height={150}
                  className="mx-auto flex rounded-lg dark:hidden"
                />
              </div>
            </div>
            <div className="flex flex-col items-center">
              <div className="mb-4 text-2xl font-bold text-shopstr-purple dark:text-shopstr-yellow md:text-3xl">
                2
              </div>
              <p className="mb-10 text-sm text-light-text dark:text-dark-text md:text-base">
                Set up your profile
              </p>
              <Image
                alt="Step 2"
                src="/profile-step-dark.png"
                width={200}
                height={150}
                className="mx-auto hidden rounded-lg dark:flex"
              />
              <Image
                alt="Step 2"
                src="/profile-step-light.png"
                width={200}
                height={150}
                className="mx-auto flex rounded-lg dark:hidden"
              />
            </div>
            <div className="flex flex-col items-center">
              <div className="mb-4 text-2xl font-bold text-shopstr-purple dark:text-shopstr-yellow md:text-3xl">
                3
              </div>
              <p className="mb-10 text-sm text-light-text dark:text-dark-text md:text-base">
                List your products
              </p>
              <Image
                alt="Step 3"
                src="/listing-step-dark.png"
                width={200}
                height={150}
                className="mx-auto hidden rounded-lg dark:flex"
              />
              <Image
                alt="Step 3"
                src="/listing-step-light.png"
                width={200}
                height={150}
                className="mx-auto flex rounded-lg dark:hidden"
              />
            </div>
            <div className="flex flex-col items-center">
              <div className="mb-4 text-2xl font-bold text-shopstr-purple dark:text-shopstr-yellow md:text-3xl">
                4
              </div>
              <p className="mb-10 text-sm text-light-text dark:text-dark-text md:text-base">
                Start buying and selling
              </p>
              <Image
                alt="Step 4"
                src="/payment-step-dark.png"
                width={200}
                height={150}
                className="mx-auto hidden rounded-lg dark:flex"
              />
              <Image
                alt="Step 4"
                src="/payment-step-light.png"
                width={200}
                height={150}
                className="mx-auto flex rounded-lg dark:hidden"
              />
            </div>
          </div>
        </div>
      </section>

      {/* Call to Action */}
      <section className="container mx-auto flex flex-col items-center justify-center px-4 py-16 text-center md:py-20">
        <h2 className="mb-8 text-2xl font-bold text-light-text dark:text-dark-text md:text-3xl">
          Ready to be a part of the free market?
        </h2>
        <Button
          className={`${SHOPSTRBUTTONCLASSNAMES} px-8 py-6 text-lg md:px-12 md:text-xl`}
          onClick={() => router.push("/marketplace")}
        >
          Join Now
        </Button>
      </section>

      {/* Footer */}
      <footer className="w-full bg-light-fg px-4 py-6 text-center text-sm text-light-text dark:bg-dark-fg dark:text-dark-text md:text-base">
        © 2023-2025, Shopstr Market Inc. or its affiliates
      </footer>

      {/* FAQ Link */}
      <div className="flex items-center justify-center bg-light-fg pb-4 dark:bg-dark-fg">
        <button
          onClick={() => router.push("/faq")}
          className="flex items-center gap-1 text-light-text hover:text-shopstr-purple dark:text-dark-text dark:hover:text-shopstr-yellow"
        >
          FAQ
          <ArrowUpRightIcon className="h-3 w-3 text-light-text dark:text-dark-text" />
        </button>
      </div>

      {/* Social Icons */}
      <div className="flex items-center justify-center bg-light-fg pb-6 dark:bg-dark-fg">
        <div className="flex h-auto w-full items-center justify-center gap-4">
          <a
            href="https://github.com/shopstr-eng/shopstr"
            target="_blank"
            rel="noopener noreferrer"
          >
            <Image
              src="/github-mark.png"
              alt="GitHub"
              width={23}
              height={23}
              className="block dark:hidden"
            />
            <Image
              src="/github-mark-white.png"
              alt="GitHub"
              width={23}
              height={23}
              className="hidden dark:block"
            />
          </a>
          <a
            href="https://njump.me/npub15dc33fyg3cpd9r58vlqge2hh8dy6hkkrjxkhluv2xpyfreqkmsesesyv6e"
            target="_blank"
            rel="noopener noreferrer"
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
          <a
            href="https://x.com/_shopstr"
            target="_blank"
            rel="noopener noreferrer"
          >
            <Image
              src="/x-logo-black.png"
              alt="X"
              width={23}
              height={23}
              className="block dark:hidden"
            />
            <Image
              src="/x-logo-white.png"
              alt="X"
              width={23}
              height={23}
              className="hidden dark:block"
            />
          </a>
        </div>
      </div>
    </div>
  );
}
