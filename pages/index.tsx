"use client"

import { Button, Image } from "@nextui-org/react"
import { ArrowUpRightIcon } from "@heroicons/react/24/outline"
import { useRouter } from "next/router"
import { SHOPSTRBUTTONCLASSNAMES } from "@/utils/STATIC-VARIABLES"
import { useContext, useEffect, useState } from "react"
import { motion } from "framer-motion"
import { ProductContext } from "@/utils/context/context"
import ProductCard from "@/components/utility-components/product-card"
import parseTags, { type ProductData } from "@/utils/parsers/product-parser-functions"
import { SignerContext } from "@/components/utility-components/nostr-context-provider"
import Link from "next/link"
import { nip19 } from "nostr-tools"
import type { NostrEvent } from "@/utils/types/types"

export default function Landing() {
  const router = useRouter()
  const productEventContext = useContext(ProductContext)

  const [parsedProducts, setParsedProducts] = useState<ProductData[]>([])

  const signerContext = useContext(SignerContext)
  useEffect(() => {
    if (router.pathname === "/" && signerContext.isLoggedIn) {
      router.push("/marketplace")
    }
  }, [router.pathname, signerContext])

  useEffect(() => {
    const parsedProductsArray: ProductData[] = []
    const products = productEventContext.productEvents
    products.forEach((product: NostrEvent) => {
      const parsedProduct = parseTags(product) as ProductData
      if (parsedProduct.images.length > 0 && parsedProduct.currency && !parsedProduct.contentWarning) {
        parsedProductsArray.push(parsedProduct)
      }
    })
    setParsedProducts(parsedProductsArray)
  }, [productEventContext.productEvents])

  return (
    <div className="min-h-screen w-full bg-light-bg dark:bg-dark-bg">
      {/* Hero Section */}
      <section className="container mx-auto flex flex-col items-center justify-center px-4 pb-16 pt-20 text-center">
        <Image alt="Shopstr logo" height={100} width={100} src="/shopstr-2000x2000.png" className="mb-6" />
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
              repeat: Number.POSITIVE_INFINITY,
              ease: "linear",
              restSpeed: 0.001,
              restDelta: 0.001,
            }}
          >
            <div className="flex gap-4 md:gap-8">
              {parsedProducts.slice(0, 21).map((product, index) => (
                <div key={`${product.id}-${index}`} className="min-w-[250px] md:min-w-[300px]">
                  <ProductCard
                    key={product.id + "-" + index}
                    productData={product}
                    onProductClick={() =>
                      router.push(
                        `/listing/${nip19.naddrEncode({
                          identifier: product.d as string,
                          pubkey: product.pubkey,
                          kind: 30402,
                        })}`,
                      )
                    }
                  />
                </div>
              ))}
            </div>
          </motion.div>
        </div>
      </section>

      <section className="container mx-auto px-4 py-16">
        <h2 className="mb-12 text-center text-2xl font-bold text-light-text dark:text-dark-text md:text-3xl">
          Why Choose Shopstr?
        </h2>
        <div className="grid gap-4 sm:gap-6 md:grid-cols-2 lg:grid-cols-3 lg:gap-8">
          <div className="rounded-lg bg-light-fg p-4 dark:bg-dark-fg md:p-6">
            <h3 className="mb-3 text-lg font-semibold text-shopstr-purple dark:text-shopstr-yellow md:text-xl">
              Permissionless Commerce
            </h3>
            <p className="text-sm text-light-text dark:text-dark-text md:text-base">
              Built on{" "}
              <Link href="https://njump.me" passHref legacyBehavior>
                <a target="_blank" rel="noopener noreferrer" className="underline">
                  Nostr
                </a>
              </Link>{" "}
              to buy and sell without restrictions or central authority. Your keys, your shop.
            </p>
          </div>

          <div className="rounded-lg bg-light-fg p-4 dark:bg-dark-fg md:p-6">
            <h3 className="mb-3 text-lg font-semibold text-shopstr-purple dark:text-shopstr-yellow md:text-xl">
              Bitcoin Native
            </h3>
            <p className="text-sm text-light-text dark:text-dark-text md:text-base">
              Secure transactions using{" "}
              <Link href="https://lightning.network" passHref legacyBehavior>
                <a target="_blank" rel="noopener noreferrer" className="underline">
                  Lightning
                </a>
              </Link>{" "}
              and{" "}
              <Link href="https://cashu.space" passHref legacyBehavior>
                <a target="_blank" rel="noopener noreferrer" className="underline">
                  Cashu
                </a>
              </Link>
              . Fast, low-fee payments.
            </p>
          </div>

          <div className="rounded-lg bg-light-fg p-4 dark:bg-dark-fg md:p-6">
            <h3 className="mb-3 text-lg font-semibold text-shopstr-purple dark:text-shopstr-yellow md:text-xl">
              Privacy First
            </h3>
            <p className="text-sm text-light-text dark:text-dark-text md:text-base">
              No purchases or sales are viewable by any third-party. Your data is encrypted and stored on your selected{" "}
              <Link href="https://nostr.how/en/relays" passHref legacyBehavior>
                <a target="_blank" rel="noopener noreferrer" className="underline">
                  relays
                </a>
              </Link>
              .
            </p>
          </div>
        </div>
      </section>

      <section className="w-full bg-light-fg px-4 py-16 dark:bg-dark-fg">
        <div className="container mx-auto">
          <h2 className="mb-12 text-center text-2xl font-bold text-light-text dark:text-dark-text md:text-3xl">
            How It Works
          </h2>

          <div className="md:hidden">
            <div className="relative mx-auto w-full max-w-md">
              <div className="absolute left-4 top-0 h-full w-1 bg-shopstr-yellow"></div>

              <div className="mb-8 pl-12 relative">
                <div className="absolute left-0 top-0 flex h-8 w-8 items-center justify-center rounded-full bg-shopstr-yellow text-xl font-bold text-dark-bg">
                  1
                </div>
                <p className="mb-4 text-sm text-light-text dark:text-dark-text">
                  Generate new Nostr keys or sign in with an existing pair
                </p>
                <Image
                  alt="Step 1"
                  src="/sign-in-step-dark.png"
                  width={200}
                  height={250}
                  className="hidden rounded-lg dark:block"
                />
                <Image
                  alt="Step 1"
                  src="/sign-in-step-light.png"
                  width={200}
                  height={250}
                  className="block rounded-lg dark:hidden"
                />
              </div>

              <div className="mb-8 pl-12 relative">
                <div className="absolute left-0 top-0 flex h-8 w-8 items-center justify-center rounded-full bg-shopstr-yellow text-xl font-bold text-dark-bg">
                  2
                </div>
                <p className="mb-4 text-sm text-light-text dark:text-dark-text">Set up your profile</p>
                <Image
                  alt="Step 2"
                  src="/profile-step-dark.png"
                  width={200}
                  height={250}
                  className="hidden rounded-lg dark:block"
                />
                <Image
                  alt="Step 2"
                  src="/profile-step-light.png"
                  width={200}
                  height={250}
                  className="block rounded-lg dark:hidden"
                />
              </div>

              <div className="mb-8 pl-12 relative">
                <div className="absolute left-0 top-0 flex h-8 w-8 items-center justify-center rounded-full bg-shopstr-yellow text-xl font-bold text-dark-bg">
                  3
                </div>
                <p className="mb-4 text-sm text-light-text dark:text-dark-text">List your products</p>
                <Image
                  alt="Step 3"
                  src="/listing-step-dark.png"
                  width={200}
                  height={250}
                  className="hidden rounded-lg dark:block"
                />
                <Image
                  alt="Step 3"
                  src="/listing-step-light.png"
                  width={200}
                  height={250}
                  className="block rounded-lg dark:hidden"
                />
              </div>

              <div className="pl-12 relative">
                <div className="absolute left-0 top-0 flex h-8 w-8 items-center justify-center rounded-full bg-shopstr-yellow text-xl font-bold text-dark-bg">
                  4
                </div>
                <p className="mb-4 text-sm text-light-text dark:text-dark-text">Start buying and selling</p>
                <Image
                  alt="Step 4"
                  src="/payment-step-dark.png"
                  width={200}
                  height={250}
                  className="hidden rounded-lg dark:block"
                />
                <Image
                  alt="Step 4"
                  src="/payment-step-light.png"
                  width={200}
                  height={250}
                  className="block rounded-lg dark:hidden"
                />
              </div>
            </div>
          </div>

          <div className="relative hidden md:flex md:flex-col md:items-center">
            <div className="absolute h-full w-1 bg-shopstr-yellow"></div>

            <div className="mb-16 flex w-full items-center">
              <div className="flex w-1/2 justify-end pr-8">
                <div className="flex flex-col items-end text-right">
                  <div className="mb-4 flex items-center justify-center">
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-shopstr-yellow text-xl font-bold text-dark-bg">
                      1
                    </div>
                  </div>
                  <p className="mb-4 max-w-xs text-sm text-light-text dark:text-dark-text md:text-base lg:text-lg">
                    Generate new Nostr keys or sign in with an existing pair
                  </p>
                </div>
              </div>
              <div className="w-1/2 pl-8">
                <Image
                  alt="Step 1"
                  src="/sign-in-step-dark.png"
                  width={300}
                  height={375}
                  className="hidden rounded-lg dark:block"
                />
                <Image
                  alt="Step 1"
                  src="/sign-in-step-light.png"
                  width={300}
                  height={375}
                  className="block rounded-lg dark:hidden"
                />
              </div>
            </div>

            <div className="mb-16 flex w-full items-center">
              <div className="w-1/2 flex justify-end pr-8">
                <Image
                  alt="Step 2"
                  src="/profile-step-dark.png"
                  width={300}
                  height={375}
                  className="hidden rounded-lg dark:block"
                />
                <Image
                  alt="Step 2"
                  src="/profile-step-light.png"
                  width={300}
                  height={375}
                  className="block rounded-lg dark:hidden"
                />
              </div>
              <div className="w-1/2 pl-8">
                <div className="flex flex-col items-start text-left">
                  <div className="mb-4 flex items-center justify-center">
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-shopstr-yellow text-xl font-bold text-dark-bg">
                      2
                    </div>
                  </div>
                  <p className="mb-4 max-w-xs text-sm text-light-text dark:text-dark-text md:text-base lg:text-lg">
                    Set up your profile
                  </p>
                </div>
              </div>
            </div>

            <div className="mb-16 flex w-full items-center">
              <div className="flex w-1/2 justify-end pr-8">
                <div className="flex flex-col items-end text-right">
                  <div className="mb-4 flex items-center justify-center">
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-shopstr-yellow text-xl font-bold text-dark-bg">
                      3
                    </div>
                  </div>
                  <p className="mb-4 max-w-xs text-sm text-light-text dark:text-dark-text md:text-base lg:text-lg">
                    List your products
                  </p>
                </div>
              </div>
              <div className="w-1/2 pl-8">
                <Image
                  alt="Step 3"
                  src="/listing-step-dark.png"
                  width={300}
                  height={375}
                  className="hidden rounded-lg dark:block"
                />
                <Image
                  alt="Step 3"
                  src="/listing-step-light.png"
                  width={300}
                  height={375}
                  className="block rounded-lg dark:hidden"
                />
              </div>
            </div>

            <div className="flex w-full items-center">
              <div className="w-1/2 flex justify-end pr-8">
                <Image
                  alt="Step 4"
                  src="/payment-step-dark.png"
                  width={300}
                  height={375}
                  className="hidden rounded-lg dark:block"
                />
                <Image
                  alt="Step 4"
                  src="/payment-step-light.png"
                  width={300}
                  height={375}
                  className="block rounded-lg dark:hidden"
                />
              </div>
              <div className="w-1/2 pl-8">
                <div className="flex flex-col items-start text-left">
                  <div className="mb-4 flex items-center justify-center">
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-shopstr-yellow text-xl font-bold text-dark-bg">
                      4
                    </div>
                  </div>
                  <p className="mb-4 max-w-xs text-sm text-light-text dark:text-dark-text md:text-base lg:text-lg">
                    Start buying and selling
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

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
      <footer className="w-full bg-light-fg px-4 py-8 dark:bg-dark-fg">
        <div className="container mx-auto">
          <div className="mb-6 flex flex-col items-center justify-between md:flex-row">
            <p className="mb-4 text-light-text dark:text-dark-text md:mb-0">
              © 2023-2025, Shopstr Market Inc. or its affiliates
            </p>
            <div className="flex items-center gap-8">
              <button
                onClick={() => router.push("/faq")}
                className="flex items-center gap-1 text-light-text transition-colors hover:text-shopstr-purple dark:text-dark-text dark:hover:text-shopstr-yellow"
              >
                FAQ
                <ArrowUpRightIcon className="h-3 w-3" />
              </button>
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
                <a
                  href="https://x.com/_shopstr"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="transition-transform hover:scale-110"
                >
                  <Image
                    src="/x-logo-black.png"
                    alt="X"
                    width={24}
                    height={24}
                    className="block dark:hidden"
                  />
                  <Image
                    src="/x-logo-white.png"
                    alt="X"
                    width={24}
                    height={24}
                    className="hidden dark:block"
                  />
                </a>
              </div>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
