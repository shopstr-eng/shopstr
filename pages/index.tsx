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
  CloudIcon
} from "@heroicons/react/24/outline";
import { useRouter } from 'next/router';
import { motion } from 'framer-motion';
import { ProductContext } from '../utils/context/context';
import parseTags, {
  ProductData,
} from "@/utils/parsers/product-parser-functions";
import { SignerContext } from "@/components/utility-components/nostr-context-provider";

const SHOPSTRBUTTONCLASSNAMES = "bg-purple-600 hover:bg-purple-700 text-white font-bold rounded-xl";

const techPills = [
  { label: "Nostr", desc: "A decentralized social protocol", color: "bg-purple-600", text: "text-white", url: "https://njump.me/" },
  { label: "Lightning", desc: "Fast Bitcoin payments", color: "bg-yellow-400", text: "text-black", url: "https://lightning.network/" },
  { label: "Cashu", desc: "Private ecash for Bitcoin", color: "bg-green-600", text: "text-white", url: "https://cashu.space/" },
  { label: "Relays", desc: "Infrastructure for Nostr", color: "bg-blue-500", text: "text-white", url: "https://nostr.how/en/relays" }
];

const howItWorksSteps = [
  { step: 1, description: "Generate new Nostr keys or sign in with an existing pair", img: "/sign-in-step-light.png", alt: "Step 1" },
  { step: 2, description: "Set up your profile", img: "/profile-step-light.png", alt: "Step 2" },
  { step: 3, description: "List your products", img: "/listing-step-light.png", alt: "Step 3" },
  { step: 4, description: "Start buying and selling", img: "/payment-step-light.png", alt: "Step 4" }
];

const Landing = () => {
  const router = useRouter();
  const productEventContext = useContext(ProductContext);
  const signerContext = useContext(SignerContext);
  const [parsedProducts, setParsedProducts] = useState([]);

  useEffect(() => {
    // Prevent error if signerContext is null
    if (router.pathname === "/" && signerContext && signerContext.isLoggedIn) {
      router.push("/marketplace");
    }
  }, [router.pathname, signerContext]);

  useEffect(() => {
    const parsedProductsArray = [];
    if (productEventContext && productEventContext.productEvents) {
      productEventContext.productEvents.forEach((product) => {
        const parsedProduct = parseTags(product);
        if (parsedProduct.images?.length > 0 && parsedProduct.currency) {
          parsedProductsArray.push(parsedProduct);
        }
      });
    }
    setParsedProducts(parsedProductsArray);
  }, [productEventContext?.productEvents]);

  // Helper: get latest 6 products (most recent first)
  const latestProducts = [...parsedProducts].reverse().slice(0, 6);

  return (
    <div className="min-h-screen bg-white flex flex-col">
      {/* Navigation */}
      <Navbar maxWidth="xl" className="bg-white/90 shadow-sm backdrop-blur-lg">
        <NavbarBrand>
          <motion.div whileHover={{ scale: 1.05 }}>
            <NextImage
              src="/shopstr-2000x2000.png"
              alt="Shopstr"
              width={64}
              height={64}
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
      <section className="w-full bg-white py-20 text-center">
        <h1 className="text-6xl font-extrabold text-purple-600 mb-4 drop-shadow-lg">
          Shop Freely.
        </h1>
        <p className="text-xl text-gray-700 mb-10">
          A permissionless marketplace powered by Nostr and Bitcoin.
        </p>
        <Button
          size="lg"
          className="bg-purple-600 hover:bg-purple-700 text-white font-bold rounded-xl px-10 py-4 text-lg shadow-lg"
          onClick={() => router.push('/marketplace')}
        >
          START SHOPPING
          <span className="ml-2">
            <svg width="20" height="20" fill="currentColor" className="inline-block align-middle">
              <path d="M7 17l5-5-5-5v10z" />
            </svg>
          </span>
        </Button>
      </section>

      {/* Latest Products Section */}
      <section className="w-full bg-gray-50 py-16">
        <div className="max-w-6xl mx-auto px-4">
          <h2 className="text-3xl font-bold text-gray-900 mb-8 text-center">
            Latest Products
          </h2>
          {latestProducts.length === 0 ? (
            <p className="text-center text-gray-500">No products listed yet. Be the first to add one!</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-8">
              {latestProducts.map((product, idx) => (
                <Card
                  key={product.id || idx}
                  className="bg-white rounded-xl shadow hover:shadow-lg transition-shadow flex flex-col"
                >
                  <div className="relative h-48 w-full overflow-hidden rounded-t-xl bg-gray-100">
                    <NextImage
                      src={product.images[0]}
                      alt={product.name || "Product image"}
                      width={400}
                      height={192}
                      className="object-cover w-full h-full"
                    />
                  </div>
                  <CardBody className="flex flex-col flex-1 p-5">
                    <h3 className="text-lg font-semibold text-gray-900 mb-2 truncate">
                      {product.name || "Unnamed Product"}
                    </h3>
                    <p className="text-purple-600 font-bold text-xl mb-4">
                      {product.price} {product.currency}
                    </p>
                    <Button
                      className="mt-auto bg-purple-600 hover:bg-purple-700 text-white rounded-lg font-semibold"
                      onClick={() => router.push('/marketplace')}
                    >
                      View
                    </Button>
                  </CardBody>
                </Card>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Why Choose? */}
      <section className="w-full bg-gradient-to-b from-white via-gray-50 to-white px-4 py-24">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-4xl font-extrabold text-purple-600 mb-8 text-center">
            Why Choose Shopstr?
          </h2>
          <p className="text-lg text-gray-700 text-center mb-12 max-w-3xl mx-auto">
            Shopstr is a global, decentralized Nostr marketplace to buy and sell anything, anywhere, anytime, anonymously with Bitcoin.
          </p>
          <div className="flex flex-col md:flex-row gap-8 justify-center">
            {/* Permissionless Commerce Card */}
            <div className="bg-gray-100 rounded-2xl p-8 shadow-lg flex-1">
              <div className="flex items-center mb-4">
                <CloudIcon className="h-8 w-8 text-blue-500 mr-3" />
                <span className="text-xl font-bold text-gray-900">Free Commerce</span>
              </div>
              <p className="text-gray-700 mb-4">
                Built on Nostr to buy and sell without restrictions or central authority. Your keys, your shop.
              </p>
              <ul className="text-sm text-blue-700 space-y-1">
                <li>• Cross-border commerce</li>
                <li>• Language independent</li>
                <li>• Accessible worldwide</li>
              </ul>
            </div>
            {/* Bitcoin Native Card */}
            <div className="bg-gray-100 rounded-2xl p-8 shadow-lg flex-1">
              <div className="flex items-center mb-4">
                <BoltIcon className="h-8 w-8 text-yellow-400 mr-3" />
                <span className="text-xl font-bold text-gray-900">Bitcoin Native</span>
              </div>
              <p className="text-gray-700 mb-4">
                Secure transactions using Lightning and Cashu. Fast, low-fee payments with no intermediaries.
              </p>
              <ul className="text-sm text-yellow-700 space-y-1">
                <li>• Lightning Network fast</li>
                <li>• Minimal fees</li>
                <li>• Self-custodial</li>
              </ul>
            </div>
            {/* Privacy First Card */}
            <div className="bg-gray-100 rounded-2xl p-8 shadow-lg flex-1">
              <div className="flex items-center mb-4">
                <ShieldCheckIcon className="h-8 w-8 text-green-500 mr-3" />
                <span className="text-xl font-bold text-gray-900">Privacy First</span>
              </div>
              <p className="text-gray-700 mb-4">
                No purchases or sales are viewable by any third party. Data is encrypted and stored in selected relays.
              </p>
              <ul className="text-sm text-green-700 space-y-1">
                <li>• End-to-end encrypted transactions</li>
                <li>• No third-party data sharing</li>
                <li>• Full control over personal data</li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* Powered By Open Technologies */}
      <section className="w-full bg-gradient-to-b from-white via-gray-50 to-white py-8 text-center">
        <h2 className="text-2xl font-semibold text-gray-900 mb-6">Powered By Open Technologies</h2>
        <div className="flex flex-wrap justify-center gap-4 mb-2">
          {techPills.map((pill, i) => (
            <a
              key={pill.label}
              href={pill.url}
              target="_blank"
              rel="noopener noreferrer"
              className={`inline-flex items-center px-5 py-2 rounded-full font-medium ${pill.color} ${pill.text} shadow-md text-base transition-transform hover:scale-105 focus:outline-none`}
              style={{ textDecoration: 'none' }}
            >
              {pill.label}
              <span className="ml-2 text-xs font-normal">{pill.desc}</span>
            </a>
          ))}
        </div>
      </section>

      {/* How It Works Section */}
      <section className="w-full bg-white px-4 py-24">
        <div className="max-w-7xl mx-auto">
          <h2 className="mb-16 text-center text-4xl font-extrabold text-gray-900">
            How It Works
          </h2>
          <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
            {howItWorksSteps.map((step, idx) => (
              <div className="text-center" key={idx}>
                <div className="flex flex-col items-center">
                  <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-purple-600 text-3xl font-bold text-white">
                    {step.step}
                  </div>
                  <p className="mb-6 text-gray-700 text-lg">{step.description}</p>
                  <div className="relative overflow-hidden rounded-xl shadow-lg bg-gray-100">
                    <NextImage
                      alt={step.alt}
                      src={step.img}
                      width={220}
                      height={120}
                      className="mx-auto rounded-xl"
                    />
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
      <footer className="w-full bg-gray-100 px-4 py-8">
        <div className="max-w-7xl mx-auto">
          <div className="mb-6 flex flex-col items-center justify-between md:flex-row">
            <div className="mb-4 flex items-center gap-8 md:mb-0">
              <button
                onClick={() => router.push("/faq")}
                className="flex items-center gap-1 text-gray-700 transition-colors hover:text-purple-600"
              >
                FAQ
                <ArrowUpRightIcon className="h-4 w-4" />
              </button>
              <button
                onClick={() => router.push("/terms")}
                className="flex items-center gap-1 text-gray-700 transition-colors hover:text-purple-600"
              >
                Terms
                <ArrowUpRightIcon className="h-4 w-4" />
              </button>
              <button
                onClick={() => router.push("/privacy")}
                className="flex items-center gap-1 text-gray-700 transition-colors hover:text-purple-600"
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
                    className="block"
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
                    className="block"
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
                    className="block"
                  />
                </a>
              </div>
            </div>
            <p className="text-gray-500 text-sm">
              © 2025 Shopstr Market Inc.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default Landing;
