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
import { useRouter } from 'next/router';
import { motion } from 'framer-motion';
import { ProductContext } from '../utils/context/context';
import { SignerContext } from '@/utils/context/nostr-context';
import { nip19 } from 'nostr-tools';
import parseTags from '@/components/utility/product-parser-functions';

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
    <div className="min-h-screen bg-gray-50">
      {/* Navigation */}
      <Navbar maxWidth="xl" className="bg-white shadow-sm">
        <NavbarBrand>
          <motion.div whileHover={{ scale: 1.05 }}>
            <NextImage
              src="/shopstr-2000x2000.png"
              alt="Shopstr"
              width={80}
              height={80}
              className="rounded-lg"
            />
          </motion.div>
        </NavbarBrand>

        <NavbarContent justify="end">
          <Button
            auto
            color="primary"
            onClick={() => router.push('/marketplace')}
            className="font-semibold"
          >
            Get Started
          </Button>
        </NavbarContent>
      </Navbar>

      {/* Hero Section */}
      <section className="max-w-7xl mx-auto px-4 py-16 text-center">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
        >
          <h1 className="text-5xl font-bold text-purple-600 mb-6">
            Decentralized Marketplace
          </h1>
          <p className="text-xl text-gray-600 mb-8 max-w-2xl mx-auto">
            Trade freely using Bitcoin and Nostr. No intermediaries, no censorship.
          </p>
          <motion.div whileHover={{ scale: 1.05 }}>
            <Button
              color="primary"
              size="lg"
              onClick={() => router.push('/marketplace')}
              className="px-12 py-6 font-semibold"
            >
              Start Shopping
            </Button>
          </motion.div>
        </motion.div>
      </section>

      {/* Product Carousel */}
      <section className="bg-white py-16">
        <div className="max-w-7xl mx-auto px-4">
          <h2 className="text-3xl font-bold text-center mb-12">
            Latest Listings
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-8">
            {parsedProducts.slice(0, 8).map((product, index) => (
              <motion.div
                key={index}
                whileHover={{ y: -8 }}
                className="h-full"
              >
                <Card isHoverable className="h-full p-4 border border-gray-200">
                  <NextImage
                    src={product.images?.[0] || '/placeholder-product.jpg'}
                    alt={product.title}
                    width={300}
                    height={200}
                    className="w-full h-48 object-cover rounded-lg"
                  />
                  <CardBody className="p-4">
                    <h3 className="font-bold truncate mb-2">
                      {product.title || 'Untitled Product'}
                    </h3>
                    <div className="flex justify-between items-center mt-4">
                      <span className="text-purple-600 font-bold">
                        {product.price} {product.currency}
                      </span>
                      <Button
                        auto
                        color="primary"
                        size="sm"
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

      {/* How It Works Section */}
      <section className="py-16 bg-white">
        <div className="max-w-7xl mx-auto px-4">
          <h2 className="text-4xl font-bold text-center mb-12 text-purple-600">
            How It Works
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-8">
            {[
              {
                icon: '🔑',
                title: 'Create Profile',
                description: 'Generate your Nostr keys or use existing ones'
              },
              {
                icon: '🛍️',
                title: 'List Products',
                description: 'Add items with photos and descriptions'
              },
              {
                icon: '⚡',
                title: 'Accept Payments',
                description: 'Receive Bitcoin via Lightning Network'
              },
              {
                icon: '📦',
                title: 'Manage Orders',
                description: 'Handle shipping and communication'
              }
            ].map((step, index) => (
              <motion.div 
                key={index}
                whileHover={{ scale: 1.05 }}
                className="text-center p-6 bg-white rounded-xl shadow-lg hover:shadow-xl transition-all"
              >
                <div className="text-5xl mb-4">{step.icon}</div>
                <h3 className="text-xl font-bold mb-2 text-gray-800">{step.title}</h3>
                <p className="text-gray-600">{step.description}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-16 bg-purple-50">
        <div className="max-w-7xl mx-auto px-4">
          <h2 className="text-4xl font-bold text-center mb-16">
            Why Choose Shopstr?
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-6">
            {[
              {
                title: 'Bitcoin Payments',
                content: 'Secure transactions using Lightning Network',
                icon: '₿',
              },
              {
                title: 'No Middlemen',
                content: 'Direct peer-to-peer trading',
                icon: '🤝',
              },
              {
                title: 'Global Access',
                content: 'Available anywhere in the world',
                icon: '🌍',
              },
              {
                title: 'Private',
                content: 'No personal data required',
                icon: '🔒',
              },
            ].map((feature, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                className="h-full"
              >
                <Card className="p-6 h-full bg-white shadow-sm">
                  <div className="text-4xl mb-4">{feature.icon}</div>
                  <h3 className="text-xl font-bold mb-2">{feature.title}</h3>
                  <p className="text-gray-600">{feature.content}</p>
                </Card>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="bg-purple-600 text-white py-20">
        <div className="max-w-7xl mx-auto px-4 text-center">
          <h2 className="text-4xl font-bold mb-6">Start Trading Today</h2>
          <p className="text-xl mb-8 opacity-90">
            Join the decentralized marketplace revolution
          </p>
          <Button
            color="primary"
            size="lg"
            className="bg-white text-purple-600 font-bold px-12 py-6"
            onClick={() => router.push('/marketplace')}
          >
            Get Started
          </Button>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-gray-900 text-gray-300 py-12">
        <div className="max-w-7xl mx-auto px-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-8">
            <div>
              <div className="flex items-center mb-4">
                <NextImage
                  src="/shopstr-2000x2000.png"
                  alt="Shopstr"
                  width={48}
                  height={48}
                  className="rounded-lg"
                />
                <span className="ml-3 text-xl font-bold text-white">Shopstr</span>
              </div>
              <p className="text-sm">
                Decentralized marketplace powered by Nostr & Bitcoin
              </p>
            </div>
            
            <div className="space-y-2">
              <h4 className="text-white font-semibold mb-4">Resources</h4>
              <a href="#" className="block text-sm hover:text-purple-400">Documentation</a>
              <a href="#" className="block text-sm hover:text-purple-400">Blog</a>
              <a href="#" className="block text-sm hover:text-purple-400">GitHub</a>
            </div>
            
            <div className="space-y-2">
              <h4 className="text-white font-semibold mb-4">Legal</h4>
              <a href="#" className="block text-sm hover:text-purple-400">Privacy Policy</a>
              <a href="#" className="block text-sm hover:text-purple-400">Terms of Service</a>
            </div>
          </div>
                    
          <div className="text-center text-sm text-gray-500">
            <p>
              © {new Date().getFullYear()} Shopstr. Open source under MIT License
            </p>
            <p className="mt-2">
              Built with ⚡ by the decentralized community
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default Landing;
