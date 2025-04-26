import { useState, useContext, useEffect } from 'react';
import {
  Navbar,
  NavbarBrand,
  NavbarContent,
  Button,
  Card,
  CardBody,
  Image as NextImage
} from '@nextui-org/react';
import {
  ArrowUpRightIcon,
  ShieldCheckIcon,
  BoltIcon,
  UserCircleIcon,
} from "@heroicons/react/24/outline";
import { useRouter } from 'next/router';
import { motion } from 'framer-motion';
import { ProductContext } from '../utils/context/context';
import { SignerContext } from '@/utils/context/nostr-context';
import { nip19 } from 'nostr-tools';
import parseTags from '@/components/utility/product-parser-functions';

const SHOPSTRBUTTONCLASSNAMES = "bg-purple-600 hover:bg-purple-700 text-white font-bold rounded-xl";

const Landing = () => {
  const router = useRouter();
  const productEventContext = useContext(ProductContext);
  const signerContext = useContext(SignerContext);
  const [parsedProducts, setParsedProducts] = useState([]);

  useEffect(() => {
    if (router.pathname === "/" && signerContext.isLoggedIn) {
      router.push("/marketplace");
    }
  }, [router.pathname, signerContext]);

  useEffect(() => {
    const parsedProductsArray = [];
    productEventContext.productEvents.forEach((product) => {
      const parsedProduct = parseTags(product);
      if (parsedProduct.images?.length > 0 && parsedProduct.currency) {
        parsedProductsArray.push(parsedProduct);
      }
    });
    setParsedProducts(parsedProductsArray);
  }, [productEventContext.productEvents]);

  return (
    <div className="min-h-screen bg-gradient-to-b from-purple-50 via-white to-white flex flex-col">
      {/* Navigation */}
      <Navbar maxWidth="xl" className="bg-white/80 shadow-sm backdrop-blur-lg">
        <NavbarBrand>
          <motion.div whileHover={{ scale: 1.05 }}>
            <NextImage
              src="/shopstr-2000x2000.png"
              alt="Shopstr"
              width={80}
              height={80}
              className="rounded-xl"
            />
          </motion.div>
        </NavbarBrand>
        <NavbarContent justify="end">
          <Button
            color="primary"
            onClick={() => router.push('/marketplace')}
            className="font-semibold rounded-xl px-6 py-2"
          >
            Get Started
          </Button>
        </NavbarContent>
      </Navbar>

      {/* Hero Section */}
      <section className="max-w-7xl mx-auto px-4 py-20 text-center">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
        >
          <h1 className="text-5xl md:text-6xl font-extrabold text-purple-700 mb-6 drop-shadow-sm">
            Shop Freely
          </h1>
          <p className="text-xl md:text-2xl text-gray-600 mb-10 max-w-2xl mx-auto">
            A permissionless marketplace, powered by Nostr and Bitcoin.
          </p>
          <motion.div whileHover={{ scale: 1.05 }}>
            <Button
              color="primary"
              size="lg"
              onClick={() => router.push('/marketplace')}
              className="px-12 py-6 font-semibold rounded-xl shadow-lg text-lg"
            >
              Start Shopping
            </Button>
          </motion.div>
        </motion.div>
      </section>

      {/* Product Carousel */}
      <section className="bg-white py-16">
        <div className="max-w-7xl mx-auto px-4">
          <h2 className="text-3xl font-bold text-center mb-12 text-gray-900">
            Latest Products
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-8">
            {parsedProducts.slice(0, 8).map((product, index) => (
              <motion.div
                key={index}
                whileHover={{ y: -8, boxShadow: "0 8px 32px 0 rgba(124,58,237,0.15)" }}
                className="h-full"
              >
                <Card isHoverable className="h-full p-4 border border-gray-200 rounded-2xl shadow-md">
                  <NextImage
                    src={product.images?.[0] || '/placeholder-product.jpg'}
                    alt={product.title}
                    width={300}
                    height={200}
                    className="w-full h-48 object-cover rounded-lg"
                  />
                  <CardBody className="p-4">
                    <h3 className="font-bold truncate mb-2 text-lg text-gray-800">
                      {product.title || 'Untitled Product'}
                    </h3>
                    <div className="flex justify-between items-center mt-4">
                      <span className="text-purple-600 font-bold text-lg">
                        {product.price} {product.currency}
                      </span>
                      <Button
                        color="primary"
                        size="sm"
                        className="rounded-lg"
                        onClick={() =>
                          router.push(
                            `/listing/${nip19.naddrEncode({
                              identifier: product.d,
                              pubkey: product.pubkey,
                              kind: 30402,
                            })}`
                          )
                        }
                      >
                        View
                      </Button>
                    </div>
                  </CardBody>
                </Card>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="container mx-auto px-4 py-24">
        <h2 className="mb-16 text-center text-3xl font-bold md:text-4xl text-gray-900">
          Why Choose{" "}
          <span className="text-purple-600">
            Shopstr
          </span>
          ?
        </h2>
        <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-3">
          <div className="group rounded-2xl border border-transparent bg-white p-8 shadow-lg transition-all hover:border-purple-200 hover:shadow-2xl">
            <div className="mb-5 flex flex-col items-center">
              <div className="rounded-full bg-purple-100 p-3">
                <ShieldCheckIcon className="h-8 w-8 text-purple-600" />
              </div>
              <h3 className="mt-3 text-xl font-semibold text-purple-600 md:text-2xl">
                Permissionless Commerce
              </h3>
            </div>
            <p className="text-center leading-relaxed text-gray-700">
              Built on <a
                href="https://njump.me"
                target="_blank"
                rel="noopener noreferrer"
                className="text-purple-600 underline decoration-dotted hover:decoration-solid"
              >
                Nostr
              </a> to buy and sell without restrictions or central authority. Your keys, your shop.
            </p>
          </div>
          <div className="group rounded-2xl border border-transparent bg-white p-8 shadow-lg transition-all hover:border-purple-200 hover:shadow-2xl">
            <div className="mb-5 flex flex-col items-center">
              <div className="rounded-full bg-purple-100 p-3">
                <BoltIcon className="h-8 w-8 text-purple-600" />
              </div>
              <h3 className="mt-3 text-xl font-semibold text-purple-600 md:text-2xl">
                Bitcoin Native
              </h3>
            </div>
            <p className="text-center leading-relaxed text-gray-700">
              Secure transactions using <a
                href="https://lightning.network"
                target="_blank"
                rel="noopener noreferrer"
                className="text-purple-600 underline decoration-dotted hover:decoration-solid"
              >
                Lightning
              </a> and <a
                href="https://cashu.space"
                target="_blank"
                rel="noopener noreferrer"
                className="text-purple-600 underline decoration-dotted hover:decoration-solid"
              >
                Cashu
              </a>. Fast, low-fee payments.
            </p>
          </div>
          <div className="group rounded-2xl border border-transparent bg-white p-8 shadow-lg transition-all hover:border-purple-200 hover:shadow-2xl">
            <div className="mb-5 flex flex-col items-center">
              <div className="rounded-full bg-purple-100 p-3">
                <UserCircleIcon className="h-8 w-8 text-purple-600" />
              </div>
              <h3 className="mt-3 text-xl font-semibold text-purple-600 md:text-2xl">
                Privacy First
              </h3>
            </div>
            <p className="text-center leading-relaxed text-gray-700">
              No purchases or sales are viewable by any third party. Your data is encrypted and stored on your selected <a
                href="https://nostr.how/en/relays"
                target="_blank"
                rel="noopener noreferrer"
                className="text-purple-600 underline decoration-dotted hover:decoration-solid"
              >
                relays
              </a>.
            </p>
          </div>
        </div>
      </section>

      {/* How It Works Section */}
      <section className="w-full bg-gradient-to-b from-purple-50 via-white to-white px-4 py-24">
        <div className="max-w-7xl mx-auto">
          <h2 className="mb-16 text-center text-3xl font-bold text-gray-900 md:text-4xl">
            How It <span className="text-purple-600">Works</span>
          </h2>
          <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
            {[
              {
                step: 1,
                description: "Generate new Nostr keys or sign in with an existing pair",
                imgLight: "/sign-in-step-light.png",
                imgDark: "/sign-in-step-dark.png",
                alt: "Step 1"
              },
              {
                step: 2,
                description: "Set up your profile",
                imgLight: "/profile-step-light.png",
                imgDark: "/profile-step-dark.png",
                alt: "Step 2"
              },
              {
                step: 3,
                description: "List your products",
                imgLight: "/listing-step-light.png",
                imgDark: "/listing-step-dark.png",
                alt: "Step 3"
              },
              {
                step: 4,
                description: "Start buying and selling",
                imgLight: "/payment-step-light.png",
                imgDark: "/payment-step-dark.png",
                alt: "Step 4"
              }
            ].map((step, idx) => (
              <div className="group text-center" key={idx}>
                <div className="flex flex-col items-center">
                  <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-purple-100 text-2xl font-bold text-purple-600 md:text-3xl group-hover:scale-110 transition-transform duration-300">
                    {step.step}
                  </div>
                  <p className="mb-8 text-gray-700 md:text-lg">{step.description}</p>
                  <div className="relative overflow-hidden rounded-xl shadow-lg hover:shadow-2xl transition-all duration-300">
                    {/* Light mode image */}
                    <NextImage
                      alt={step.alt}
                      src={step.imgLight}
                      width={250}
                      height={180}
                      className="mx-auto rounded-xl block dark:hidden"
                    />
                    {/* Dark mode image */}
                    <NextImage
                      alt={step.alt}
                      src={step.imgDark}
                      width={250}
                      height={180}
                      className="mx-auto rounded-xl hidden dark:block"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/30 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="container mx-auto flex flex-col items-center justify-center px-4 py-24 text-center">
        <div className="max-w-4xl rounded-2xl bg-gradient-to-r from-purple-100 to-purple-50 p-12 shadow-xl">
          <h2 className="mb-8 text-3xl font-bold text-gray-900 md:text-4xl">
            Ready to be a part of the{" "}
            <span className="text-purple-600">
              free market
            </span>
            ?
          </h2>
          <Button
            className={`${SHOPSTRBUTTONCLASSNAMES} px-10 py-7 text-lg shadow-lg hover:shadow-xl md:px-12 md:text-xl`}
            onClick={() => router.push("/marketplace")}
          >
            Join Now
          </Button>
        </div>
      </section>

      {/* Footer */}
      <footer className="w-full bg-gray-900 px-4 py-8">
        <div className="max-w-7xl mx-auto">
          <div className="mb-6 flex flex-col items-center justify-between md:flex-row">
            <div className="mb-4 flex items-center gap-8 md:mb-0">
              <button
                onClick={() => router.push("/faq")}
                className="flex items-center gap-1 text-gray-200 transition-colors hover:text-purple-400"
              >
                FAQ
                <ArrowUpRightIcon className="h-4 w-4" />
              </button>
              <button
                onClick={() => router.push("/terms")}
                className="flex items-center gap-1 text-gray-200 transition-colors hover:text-purple-400"
              >
                Terms
                <ArrowUpRightIcon className="h-4 w-4" />
              </button>
              <button
                onClick={() => router.push("/privacy")}
                className="flex items-center gap-1 text-gray-200 transition-colors hover:text-purple-400"
              >
                Privacy
                <ArrowUpRightIcon className="h-4 w-4" />
              </button>
              <div className="flex items-center gap-6 ml-6">
                <a
                  href="https://github.com/shopstr-eng/shopstr"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="transition-transform hover:scale-110"
                >
                  <NextImage
                    src="/github-mark.png"
                    alt="GitHub"
                    width={24}
                    height={24}
                    className="block dark:hidden"
                  />
                  <NextImage
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
                  <NextImage
                    src="/nostr-icon-black-transparent-256x256.png"
                    alt="Nostr"
                    width={32}
                    height={32}
                    className="block dark:hidden"
                  />
                  <NextImage
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
                  <NextImage
                    src="/x-logo-black.png"
                    alt="X"
                    width={24}
                    height={24}
                    className="block dark:hidden"
                  />
                  <NextImage
                    src="/x-logo-white.png"
                    alt="X"
                    width={24}
                    height={24}
                    className="hidden dark:block"
                  />
                </a>
              </div>
            </div>
            <p className="text-gray-400 text-sm">
              © 2025 Shopstr Market Inc.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default Landing;
