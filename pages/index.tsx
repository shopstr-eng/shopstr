import { Button, Image } from "@nextui-org/react";
import { useRouter } from "next/router";
import { SHOPSTRBUTTONCLASSNAMES } from "@/components/utility/STATIC-VARIABLES";
import { useContext, useEffect, useState } from "react";
import { motion } from "framer-motion";
import { ProductContext } from "../utils/context/context";
import ProductCard from "@/components/utility-components/product-card";
import parseTags, {
  ProductData,
} from "@/components/utility/product-parser-functions";
import { getLocalStorageData } from "@/components/utility/nostr-helper-functions";
import Link from "next/link";

export default function Landing() {
  const router = useRouter();
  const productEventContext = useContext(ProductContext);

  const [parsedProducts, setParsedProducts] = useState<ProductData[]>([]);

  useEffect(() => {
    if (
      router.pathname === "/" &&
      (getLocalStorageData().signInMethod === "amber" ||
        getLocalStorageData().signInMethod === "bunker" ||
        getLocalStorageData().signInMethod === "extension" ||
        getLocalStorageData().signInMethod === "nsec")
    ) {
      router.push("/marketplace");
    }
  }, [router.pathname]);

  useEffect(() => {
    let parsedProductsArray: ProductData[] = [];
    const products = productEventContext.productEvents;
    products.forEach(async (product: any) => {
      const parsedProduct = (await parseTags(product)) as ProductData;
      if (parsedProduct.images.length > 0) {
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
            }}
          >
            <div className="flex gap-4 md:gap-8">
              {[...parsedProducts].map((product, index) => (
                <div
                  key={`${product.id}-${index}`}
                  className="min-w-[250px] md:min-w-[300px]"
                >
                  <ProductCard
                    key={product.id + "-" + index}
                    productData={product}
                    onProductClick={() => router.push(`/listing/${product.d}`)}
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
        © Shopstr 2025
      </footer>
    </div>
  );
}
